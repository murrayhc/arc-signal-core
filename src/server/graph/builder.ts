import type { EventCandidate, GraphNode } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from '@/server/pipeline/types'
import type { NodeType } from '@/shared/enums'

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

/** Full evidence-chain include shape for a single event: clusters -> signals -> claim -> document -> source. */
const EVENT_INCLUDE = {
  clusters: {
    include: {
      signals: {
        include: {
          signal: {
            include: {
              claim: { include: { document: { include: { source: true } } } },
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
      metadata: { eventCandidateIds: [event.id] },
    })
    count++
  }
  if (event.affectedRegion) {
    await upsertNode('region', event.affectedRegion.toLowerCase(), {
      nodeType: 'REGION',
      title: event.affectedRegion,
      isFixture: event.isFixture,
      metadata: { eventCandidateIds: [event.id] },
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
