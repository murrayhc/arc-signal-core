import type { EventCandidate, GraphEdge, GraphNode } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from '@/server/pipeline/types'
import type { GraphSyncResult } from '@/server/graph/types'
import type { EdgeType, NodeType } from '@/shared/enums'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const RECENT_DAYS = 3
const STALE_DAYS = 30
const RECENT_FRESHNESS = 1
const STALE_FRESHNESS = 0.1
const FLOOR_FRESHNESS = 0.1
const NULL_DATE_FRESHNESS = 0.3

/**
 * Pure freshness scoring: 1 for dates within RECENT_DAYS of `now`, decaying
 * linearly to STALE_FRESHNESS by STALE_DAYS, floored at FLOOR_FRESHNESS beyond
 * that. A null date (unknown recency) scores NULL_DATE_FRESHNESS.
 */
export function freshness(date: Date | null, now: Date): number {
  if (date === null) return NULL_DATE_FRESHNESS

  const ageDays = (now.getTime() - date.getTime()) / MS_PER_DAY
  if (ageDays <= RECENT_DAYS) return RECENT_FRESHNESS
  if (ageDays >= STALE_DAYS) return FLOOR_FRESHNESS

  const span = STALE_DAYS - RECENT_DAYS
  const progress = (ageDays - RECENT_DAYS) / span
  const score = RECENT_FRESHNESS - progress * (RECENT_FRESHNESS - STALE_FRESHNESS)
  return Math.max(FLOOR_FRESHNESS, score)
}

export type UpsertNodeData = {
  nodeType: NodeType | string
  title: string
  summary?: string
  confidence?: number
  riskScore?: number
  opportunityScore?: number
  impactScore?: number
  freshnessScore?: number
  isFixture?: boolean
  metadata?: object
}

/** Upsert a GraphNode keyed on the (refType, refId) composite unique. */
export async function upsertNode(refType: string, refId: string, data: UpsertNodeData): Promise<GraphNode> {
  const summary = data.summary ?? ''
  const confidence = data.confidence ?? 0
  const riskScore = data.riskScore ?? 0
  const opportunityScore = data.opportunityScore ?? 0
  const impactScore = data.impactScore ?? 0
  const freshnessScore = data.freshnessScore ?? 0
  const isFixture = data.isFixture ?? false
  const metadataJson = JSON.stringify(data.metadata ?? {})

  return prisma.graphNode.upsert({
    where: { refType_refId: { refType, refId } },
    create: {
      nodeType: data.nodeType,
      refType,
      refId,
      title: data.title,
      summary,
      confidence,
      riskScore,
      opportunityScore,
      impactScore,
      freshnessScore,
      isFixture,
      metadataJson,
    },
    update: {
      nodeType: data.nodeType,
      title: data.title,
      summary,
      confidence,
      riskScore,
      opportunityScore,
      impactScore,
      freshnessScore,
      isFixture,
      metadataJson,
    },
  })
}

export type UpsertEdgeData = {
  label: string
  weight?: number
  confidence?: number
  evidenceCount?: number
  metadata?: object
}

/** Upsert a GraphEdge keyed on the (sourceNodeId, targetNodeId, edgeType) composite unique. */
export async function upsertEdge(
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: EdgeType | string,
  data: UpsertEdgeData,
): Promise<GraphEdge> {
  const weight = data.weight ?? 0.5
  const confidence = data.confidence ?? 0.5
  const evidenceCount = data.evidenceCount ?? 1
  const metadataJson = JSON.stringify(data.metadata ?? {})

  return prisma.graphEdge.upsert({
    where: { sourceNodeId_targetNodeId_edgeType: { sourceNodeId, targetNodeId, edgeType } },
    create: {
      sourceNodeId,
      targetNodeId,
      edgeType,
      label: data.label,
      weight,
      confidence,
      evidenceCount,
      metadataJson,
    },
    update: {
      label: data.label,
      weight,
      confidence,
      evidenceCount,
      metadataJson,
    },
  })
}

/** Full evidence-chain include shape for a single event: clusters -> signals -> claim -> document -> source. */
const EVENT_INCLUDE = {
  clusters: {
    include: {
      signals: {
        include: {
          signal: {
            include: {
              claim: { include: { document: { include: { source: { include: { health: true } } } } } },
            },
          },
        },
      },
    },
  },
  opportunityCards: true,
  positioningExamples: true,
  dataGaps: true,
  primaryEntity: true,
  entities: { include: { entity: true } },
} as const

type EventWithEvidence = EventCandidate & {
  clusters: Array<{
    signals: Array<{
      signal: {
        id: string
        claimId: string
        documentId: string
        sourceId: string
        signalType: string
        confidence: number
        strength: number
        direction: string
        explanation: string
        isFixture: boolean
        claim: {
          id: string
          claimText: string
          extractionConfidence: number
          claimDate: Date | null
          isFixture: boolean
          documentId: string
          document: {
            id: string
            title: string
            publishedAt: Date | null
            fetchedAt: Date
            isFixture: boolean
            sourceId: string
            source: {
              id: string
              name: string
              isFixture: boolean
              health: { healthScore: number } | null
            }
          }
        }
      }
    }>
  }>
  opportunityCards: Array<{
    id: string
    title: string
    commercialValueScore: number
    confidence: number
    isFixture: boolean
  }>
  positioningExamples: Array<{
    id: string
    title: string
    confidence: number
    isFixture: boolean
    opportunityCardId: string | null
  }>
  dataGaps: Array<{
    id: string
    title: string
    impactOnConfidence: number
  }>
  primaryEntity: { id: string; name: string; entityType: string } | null
  entities: Array<{ entity: { id: string; name: string; entityType: string } }>
}

const ENTITY_TYPE_TO_NODE_TYPE: Record<string, NodeType | string> = {
  ORGANISATION: 'COMPANY',
  COMPANY: 'COMPANY',
  PERSON: 'PERSON',
  REGION: 'REGION',
  SECTOR: 'SECTOR',
}

function entityNodeType(entityType: string): NodeType | string {
  return ENTITY_TYPE_TO_NODE_TYPE[entityType] ?? 'COMPANY'
}

function truncate(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/**
 * Project one event and its evidence chain into GraphNodes. Returns the count
 * of nodes upserted (create or update both count — idempotency is the caller's
 * concern via node totals, not this per-event count).
 */
async function projectEventNodes(event: EventWithEvidence, now: Date, errors: PipelineError[]): Promise<number> {
  let count = 0

  // EVENT node.
  await upsertNode('event', event.id, {
    nodeType: 'EVENT',
    title: event.title,
    summary: event.summary,
    confidence: event.confidence,
    riskScore: event.riskScore,
    opportunityScore: event.opportunityScore,
    impactScore: event.severity,
    freshnessScore: freshness(event.lastUpdatedAt, now),
    isFixture: event.isFixture,
    metadata: { eventCandidateId: event.id },
  })
  count++

  // SECTOR / REGION string nodes.
  if (event.affectedSector) {
    await upsertNode('sector', event.affectedSector.toLowerCase(), {
      nodeType: 'SECTOR',
      title: event.affectedSector,
      isFixture: event.isFixture,
      // A sector node is shared by many events; metadata records only the most recent to touch it.
      metadata: { lastEventCandidateId: event.id },
    })
    count++
  }
  if (event.affectedRegion) {
    await upsertNode('region', event.affectedRegion.toLowerCase(), {
      nodeType: 'REGION',
      title: event.affectedRegion,
      isFixture: event.isFixture,
      // A region node is shared by many events; metadata records only the most recent to touch it.
      metadata: { lastEventCandidateId: event.id },
    })
    count++
  }

  // Entities (primary + linked). Only created for entities that actually exist.
  const entityMap = new Map<string, { id: string; name: string; entityType: string }>()
  if (event.primaryEntity) entityMap.set(event.primaryEntity.id, event.primaryEntity)
  for (const link of event.entities) entityMap.set(link.entity.id, link.entity)
  for (const entity of entityMap.values()) {
    await upsertNode('entity', entity.id, {
      nodeType: entityNodeType(entity.entityType),
      title: entity.name,
      isFixture: event.isFixture,
      metadata: { entityId: entity.id },
    })
    count++
  }

  // Evidence chain: clusters -> signals -> claim -> document -> source.
  const seenSignals = new Set<string>()
  const seenClaims = new Set<string>()
  const seenDocuments = new Set<string>()
  const seenSources = new Set<string>()

  for (const clusterLink of event.clusters) {
    for (const link of clusterLink.signals) {
      const signal = link.signal
      const claim = signal.claim
      const document = claim.document
      const source = document.source

      if (!seenSignals.has(signal.id)) {
        seenSignals.add(signal.id)
        await upsertNode('signal', signal.id, {
          nodeType: 'SIGNAL',
          title: truncate(signal.explanation),
          summary: signal.explanation,
          confidence: signal.confidence,
          impactScore: signal.strength,
          isFixture: signal.isFixture,
          metadata: { signalId: signal.id, claimId: signal.claimId },
        })
        count++
      }

      if (!seenClaims.has(claim.id)) {
        seenClaims.add(claim.id)
        await upsertNode('claim', claim.id, {
          nodeType: 'CLAIM',
          title: truncate(claim.claimText),
          summary: claim.claimText,
          confidence: claim.extractionConfidence,
          freshnessScore: freshness(claim.claimDate, now),
          isFixture: claim.isFixture,
          metadata: { claimId: claim.id, documentId: claim.documentId },
        })
        count++
      }

      if (!seenDocuments.has(document.id)) {
        seenDocuments.add(document.id)
        await upsertNode('document', document.id, {
          nodeType: 'DOCUMENT',
          title: document.title,
          confidence: 0.6,
          freshnessScore: freshness(document.publishedAt ?? document.fetchedAt, now),
          isFixture: document.isFixture,
          metadata: { documentId: document.id, sourceId: document.sourceId },
        })
        count++
      }

      if (!seenSources.has(source.id)) {
        seenSources.add(source.id)
        await upsertNode('source', source.id, {
          nodeType: 'SOURCE',
          title: source.name,
          confidence: source.health?.healthScore ?? 0.5,
          isFixture: source.isFixture,
          metadata: { sourceId: source.id },
        })
        count++
      }
    }
  }

  // OpportunityCard nodes.
  for (const card of event.opportunityCards) {
    await upsertNode('opportunity_card', card.id, {
      nodeType: 'OPPORTUNITY',
      title: card.title,
      opportunityScore: card.commercialValueScore,
      confidence: card.confidence,
      isFixture: card.isFixture,
      metadata: { opportunityCardId: card.id, eventCandidateId: event.id },
    })
    count++
  }

  // StrategicPositioningExample nodes.
  for (const example of event.positioningExamples) {
    await upsertNode('positioning_example', example.id, {
      nodeType: 'POSITIONING',
      title: example.title,
      confidence: example.confidence,
      isFixture: example.isFixture,
      metadata: { positioningExampleId: example.id, eventCandidateId: event.id },
    })
    count++
  }

  // DataGap nodes. DataGap carries no isFixture of its own; the underlying
  // record is the event, so its isFixture flag is used.
  for (const gap of event.dataGaps) {
    await upsertNode('data_gap', gap.id, {
      nodeType: 'DATA_GAP',
      title: gap.title,
      confidence: Math.max(0, 1 - Math.abs(gap.impactOnConfidence)),
      isFixture: event.isFixture,
      metadata: { dataGapId: gap.id, eventCandidateId: event.id },
    })
    count++
  }

  return count
}

/** Look up a previously-upserted GraphNode id by its (refType, refId) unique. Returns null if missing. */
async function findNodeId(refType: string, refId: string): Promise<string | null> {
  const node = await prisma.graphNode.findUnique({ where: { refType_refId: { refType, refId } } })
  return node?.id ?? null
}

/** Upsert an edge, guarding against self-edges and missing endpoints. Returns 1 if an edge was written, 0 otherwise. */
async function safeUpsertEdge(
  sourceNodeId: string | null,
  targetNodeId: string | null,
  edgeType: EdgeType | string,
  data: UpsertEdgeData,
): Promise<number> {
  if (!sourceNodeId || !targetNodeId) return 0
  if (sourceNodeId === targetNodeId) return 0
  await upsertEdge(sourceNodeId, targetNodeId, edgeType, data)
  return 1
}

/** A dominant direction for contradiction detection, derived from the event's precomputed eventClass. */
function dominantDirection(eventClass: string): 'RISK' | 'OPPORTUNITY' | null {
  if (eventClass === 'RISK') return 'RISK'
  if (eventClass === 'OPPORTUNITY') return 'OPPORTUNITY'
  return null
}

/**
 * Project one event's evidence chain + relationships into GraphEdges per spec §4.
 * Resolves endpoints via the refType_refId unique (nodes are upserted in the node pass
 * before this runs). Returns the count of edges upserted (create or update both count).
 */
async function projectEventEdges(event: EventWithEvidence, errors: PipelineError[]): Promise<number> {
  let count = 0
  const eventNodeId = await findNodeId('event', event.id)

  const sectorNodeId = event.affectedSector ? await findNodeId('sector', event.affectedSector.toLowerCase()) : null
  const regionNodeId = event.affectedRegion ? await findNodeId('region', event.affectedRegion.toLowerCase()) : null

  // Event -> Sector / Region AFFECTS.
  if (sectorNodeId) {
    count += await safeUpsertEdge(eventNodeId, sectorNodeId, 'AFFECTS', {
      label: `${event.title} affects ${event.affectedSector}`,
      weight: event.severity,
      confidence: event.confidence,
      evidenceCount: event.evidenceCount,
    })
  }
  if (regionNodeId) {
    count += await safeUpsertEdge(eventNodeId, regionNodeId, 'AFFECTS', {
      label: `${event.title} affects ${event.affectedRegion}`,
      weight: event.severity,
      confidence: event.confidence,
      evidenceCount: event.evidenceCount,
    })
  }

  // Evidence chain: Signal-DERIVED_FROM->Claim-DERIVED_FROM->Document-REPORTED_BY->Source; Event-SUPPORTS->Signal.
  const seenSignalToClaim = new Set<string>()
  const seenClaimToDocument = new Set<string>()
  const seenDocumentToSource = new Set<string>()
  const seenEventToSignal = new Set<string>()
  const seenSignalToSector = new Set<string>()

  for (const clusterLink of event.clusters) {
    for (const link of clusterLink.signals) {
      const signal = link.signal
      const claim = signal.claim
      const document = claim.document
      const source = document.source

      const signalNodeId = await findNodeId('signal', signal.id)
      const claimNodeId = await findNodeId('claim', claim.id)
      const documentNodeId = await findNodeId('document', document.id)
      const sourceNodeId = await findNodeId('source', source.id)

      if (signalNodeId && claimNodeId && !seenSignalToClaim.has(signal.id)) {
        seenSignalToClaim.add(signal.id)
        count += await safeUpsertEdge(signalNodeId, claimNodeId, 'DERIVED_FROM', {
          label: `Signal derived from claim: ${truncate(claim.claimText, 80)}`,
          confidence: claim.extractionConfidence,
        })
      }

      if (claimNodeId && documentNodeId && !seenClaimToDocument.has(claim.id)) {
        seenClaimToDocument.add(claim.id)
        count += await safeUpsertEdge(claimNodeId, documentNodeId, 'DERIVED_FROM', {
          label: `Claim derived from document: ${document.title}`,
          confidence: claim.extractionConfidence,
        })
      }

      if (documentNodeId && sourceNodeId && !seenDocumentToSource.has(document.id)) {
        seenDocumentToSource.add(document.id)
        count += await safeUpsertEdge(documentNodeId, sourceNodeId, 'REPORTED_BY', {
          label: `${document.title} reported by ${source.name}`,
          confidence: source.health?.healthScore ?? 0.5,
        })
      }

      if (eventNodeId && signalNodeId && !seenEventToSignal.has(signal.id)) {
        seenEventToSignal.add(signal.id)
        count += await safeUpsertEdge(eventNodeId, signalNodeId, 'SUPPORTS', {
          label: `${event.title} supported by signal: ${truncate(signal.explanation, 80)}`,
          weight: signal.strength,
          confidence: signal.confidence,
        })
      }

      // Signal -> Sector: NEGATIVE => CAUSES_PRESSURE_ON, POSITIVE => CREATES_OPPORTUNITY_FOR.
      if (sectorNodeId && signalNodeId && !seenSignalToSector.has(signal.id)) {
        seenSignalToSector.add(signal.id)
        if (signal.direction === 'NEGATIVE') {
          count += await safeUpsertEdge(signalNodeId, sectorNodeId, 'CAUSES_PRESSURE_ON', {
            label: `Signal creates pressure on ${event.affectedSector}`,
            weight: signal.strength,
            confidence: signal.confidence,
          })
        } else if (signal.direction === 'POSITIVE') {
          count += await safeUpsertEdge(signalNodeId, sectorNodeId, 'CREATES_OPPORTUNITY_FOR', {
            label: `Signal creates opportunity for ${event.affectedSector}`,
            weight: signal.strength,
            confidence: signal.confidence,
          })
        }
      }
    }
  }

  // OpportunityCard -> Event CREATES_OPPORTUNITY_FOR.
  for (const card of event.opportunityCards) {
    const cardNodeId = await findNodeId('opportunity_card', card.id)
    count += await safeUpsertEdge(cardNodeId, eventNodeId, 'CREATES_OPPORTUNITY_FOR', {
      label: `${card.title} creates opportunity for ${event.title}`,
      weight: card.commercialValueScore,
      confidence: card.confidence,
    })
  }

  // Positioning -> OpportunityCard (else -> Event) LINKED_TO.
  for (const example of event.positioningExamples) {
    const positioningNodeId = await findNodeId('positioning_example', example.id)
    const linkedCardId = example.opportunityCardId
    const targetNodeId = linkedCardId ? await findNodeId('opportunity_card', linkedCardId) : eventNodeId
    const targetLabel = linkedCardId ? 'its opportunity card' : event.title
    count += await safeUpsertEdge(positioningNodeId, targetNodeId, 'LINKED_TO', {
      label: `${example.title} linked to ${targetLabel}`,
      confidence: example.confidence,
    })
  }

  // DataGap -> Event WEAKENS.
  for (const gap of event.dataGaps) {
    const gapNodeId = await findNodeId('data_gap', gap.id)
    count += await safeUpsertEdge(gapNodeId, eventNodeId, 'WEAKENS', {
      label: `${gap.title} weakens confidence in ${event.title}`,
      weight: Math.abs(gap.impactOnConfidence),
      confidence: Math.max(0, 1 - Math.abs(gap.impactOnConfidence)),
    })
  }

  return count
}

/**
 * Contradiction pass: for pairs of events sharing sector+region with opposing dominant
 * direction (RISK vs OPPORTUNITY per eventClass), add a canonical-direction CONTRADICTS
 * edge between their EVENT nodes. Only creates an edge when a real opposing pair exists —
 * never fabricated. Runs only over the events passed in; an opposing pair split
 * across separate scans is detected on the next `rebuildGraph`, not incrementally.
 */
async function projectContradictionEdges(events: EventWithEvidence[], errors: PipelineError[]): Promise<number> {
  let count = 0

  const grouped = new Map<string, EventWithEvidence[]>()
  for (const event of events) {
    if (!event.affectedSector || !event.affectedRegion) continue
    const direction = dominantDirection(event.eventClass)
    if (!direction) continue
    const key = `${event.affectedSector.toLowerCase()}::${event.affectedRegion.toLowerCase()}`
    const bucket = grouped.get(key) ?? []
    bucket.push(event)
    grouped.set(key, bucket)
  }

  for (const bucket of grouped.values()) {
    const risks = bucket.filter((e) => dominantDirection(e.eventClass) === 'RISK')
    const opportunities = bucket.filter((e) => dominantDirection(e.eventClass) === 'OPPORTUNITY')

    for (const risk of risks) {
      for (const opportunity of opportunities) {
        try {
          const riskNodeId = await findNodeId('event', risk.id)
          const opportunityNodeId = await findNodeId('event', opportunity.id)
          count += await safeUpsertEdge(riskNodeId, opportunityNodeId, 'CONTRADICTS', {
            label: `"${risk.title}" contradicts "${opportunity.title}"`,
            confidence: Math.min(risk.confidence, opportunity.confidence),
          })
        } catch (err) {
          errors.push({
            stage: 'graph:edges',
            sourceId: `${risk.id}:${opportunity.id}`,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }
  }

  return count
}

/** Project GraphNodes for a set of events + their full evidence chains. Idempotent (upsert). */
export async function projectNodesForEvents(
  events: EventCandidate[],
  now: Date,
): Promise<{ nodeCount: number; errors: PipelineError[] }> {
  const errors: PipelineError[] = []
  let nodeCount = 0

  for (const event of events) {
    try {
      const withEvidence = await prisma.eventCandidate.findUniqueOrThrow({
        where: { id: event.id },
        include: EVENT_INCLUDE,
      })
      nodeCount += await projectEventNodes(withEvidence as unknown as EventWithEvidence, now, errors)
    } catch (err) {
      errors.push({ stage: 'graph:nodes', sourceId: event.id, message: err instanceof Error ? err.message : String(err) })
    }
  }

  return { nodeCount, errors }
}

/** Project nodes for every EventCandidate in the database (full rebuild). */
export async function rebuildNodes(now: Date): Promise<{ nodeCount: number; errors: PipelineError[] }> {
  const events = await prisma.eventCandidate.findMany()
  return projectNodesForEvents(events, now)
}

/** Project GraphEdges for a set of events + their evidence chains (per-event edges), then the cross-event contradiction pass. */
async function projectEdgesForEvents(
  events: EventCandidate[],
  errors: PipelineError[],
): Promise<number> {
  let edgeCount = 0
  const withEvidenceList: EventWithEvidence[] = []

  for (const event of events) {
    try {
      const withEvidence = await prisma.eventCandidate.findUniqueOrThrow({
        where: { id: event.id },
        include: EVENT_INCLUDE,
      })
      const typed = withEvidence as unknown as EventWithEvidence
      withEvidenceList.push(typed)
      edgeCount += await projectEventEdges(typed, errors)
    } catch (err) {
      errors.push({ stage: 'graph', sourceId: event.id, message: err instanceof Error ? err.message : String(err) })
    }
  }

  edgeCount += await projectContradictionEdges(withEvidenceList, errors)

  return edgeCount
}

/**
 * Node pass then edge pass for the given events' neighbourhoods. Idempotent: safe to
 * re-run without duplicating nodes or edges (both are upserts keyed on stable unique
 * constraints). Per-event failures are captured as PipelineErrors rather than aborting
 * the whole sync.
 */
export async function syncGraphForEvents(events: EventCandidate[], now: Date = new Date()): Promise<GraphSyncResult> {
  const errors: PipelineError[] = []

  const { nodeCount, errors: nodeErrors } = await projectNodesForEvents(events, now)
  errors.push(...nodeErrors)

  const edgeCount = await projectEdgesForEvents(events, errors)

  return { nodesUpserted: nodeCount, edgesUpserted: edgeCount, errors }
}

/** Full node + edge projection over every EventCandidate in the database. */
export async function rebuildGraph(now: Date = new Date()): Promise<GraphSyncResult> {
  const events = await prisma.eventCandidate.findMany()
  return syncGraphForEvents(events, now)
}
