import type { EventCandidate, GraphEvent, GraphSnapshot } from '@prisma/client'
import { prisma } from '@/server/db'
import { getNodeNeighbourhood } from '@/server/services/graph'
import { momentumScore, confidenceDecay, POSITIVE } from '@/server/graph/momentum'
import { freshness } from '@/server/graph/builder'
import type { GraphEventType } from '@/shared/enums'
import type { PipelineError } from '@/server/pipeline/types'

/**
 * GraphEventTypes that count as "supporting evidence" for freshness/confidenceDecay purposes:
 * momentum's POSITIVE set plus FIRST_DETECTED (neutral for momentum, but it IS the original
 * supporting detection of the event). CONTRADICTION_DETECTED/CONFIDENCE_FELL/EVENT_COOLED are
 * deliberately excluded — a fresh contradiction must not read as "fresh supporting evidence".
 */
const SUPPORTING_EVENT_TYPES: readonly GraphEventType[] = [...POSITIVE, 'FIRST_DETECTED']

/** Minimum absolute confidence delta to count as a real rise/fall (avoids float-noise rows). */
const CONFIDENCE_EPSILON = 0.01
/** Minimum absolute max-signal-strength delta to count as a real strengthening (avoids float-noise rows). */
const SIGNAL_STRENGTH_EPSILON = 0.01

type CurrentState = {
  confidence: number
  status: string
  sourceCount: number
  contradictionCount: number
  opportunityCount: number
  claimCount: number
  maxSignalStrength: number
}

type EvidenceChainSummary = {
  /** Distinct source ids across the evidence chain. */
  sourceCount: number
  /** Distinct claim ids across the evidence chain (drives CLAIM_REPEATED). */
  claimCount: number
  /** Max Signal.strength across the evidence chain, or 0 if there's no evidence yet
   *  (drives SIGNAL_STRENGTHENED). */
  maxSignalStrength: number
}

/**
 * Summarises the event's evidence chain (clusters -> signals -> claim -> document -> source)
 * in one query: distinct source/claim counts and the max signal strength. SOURCE/CLAIM/SIGNAL
 * are several edges from the EVENT node in the graph, so this reads the evidence chain directly
 * via Prisma relations rather than the 1-degree graph neighbourhood.
 */
async function evidenceChainSummary(eventId: string): Promise<EvidenceChainSummary> {
  const withEvidence = await prisma.eventCandidate.findUnique({
    where: { id: eventId },
    select: {
      clusters: {
        select: {
          signals: {
            select: {
              signal: {
                select: { claimId: true, strength: true, claim: { select: { document: { select: { sourceId: true } } } } },
              },
            },
          },
        },
      },
    },
  })

  const sourceIds = new Set<string>()
  const claimIds = new Set<string>()
  let maxSignalStrength = 0
  for (const cluster of withEvidence?.clusters ?? []) {
    for (const link of cluster.signals) {
      sourceIds.add(link.signal.claim.document.sourceId)
      claimIds.add(link.signal.claimId)
      if (link.signal.strength > maxSignalStrength) maxSignalStrength = link.signal.strength
    }
  }
  return { sourceCount: sourceIds.size, claimCount: claimIds.size, maxSignalStrength }
}

/** Diff-input state for one event, computed from the currently-persisted DB rows (never invented). */
async function computeCurrentState(event: EventCandidate, graphNodeId: string): Promise<CurrentState> {
  const neighbourhood = await getNodeNeighbourhood(graphNodeId)
  // CONTRADICTS edges land directly on the EVENT node (builder.ts projectContradictionEdges),
  // so the 1-degree neighbourhood is the right source for these.
  const contradictionCount = neighbourhood?.edges.filter((e) => e.edgeType === 'CONTRADICTS').length ?? 0
  const { sourceCount, claimCount, maxSignalStrength } = await evidenceChainSummary(event.id)
  const opportunityCount = await prisma.opportunityCard.count({ where: { eventCandidateId: event.id } })

  return {
    confidence: event.confidence,
    status: event.status,
    sourceCount,
    contradictionCount,
    opportunityCount,
    claimCount,
    maxSignalStrength,
  }
}

const ESCALATED_STATUSES: readonly string[] = ['ESCALATED']
const COOLED_STATUSES: readonly string[] = ['DECLINING', 'DISMISSED']

/** Diffs `current` against `prior`, returning the ordered list of real GraphEventTypes that changed. */
function diffState(prior: CurrentState | null, current: CurrentState): GraphEventType[] {
  if (!prior) return ['FIRST_DETECTED']

  const changes: GraphEventType[] = []

  const confidenceDelta = current.confidence - prior.confidence
  if (confidenceDelta > CONFIDENCE_EPSILON) changes.push('CONFIDENCE_ROSE')
  else if (confidenceDelta < -CONFIDENCE_EPSILON) changes.push('CONFIDENCE_FELL')

  if (current.sourceCount > prior.sourceCount) changes.push('NEW_SOURCE')
  if (current.contradictionCount > prior.contradictionCount) changes.push('CONTRADICTION_DETECTED')
  if (current.opportunityCount > prior.opportunityCount) changes.push('OPPORTUNITY_GENERATED')
  if (current.claimCount > prior.claimCount) changes.push('CLAIM_REPEATED')
  if (current.maxSignalStrength - prior.maxSignalStrength > SIGNAL_STRENGTH_EPSILON) changes.push('SIGNAL_STRENGTHENED')

  const statusChanged = current.status !== prior.status
  if (statusChanged && ESCALATED_STATUSES.includes(current.status)) changes.push('EVENT_ESCALATED')
  else if (statusChanged && COOLED_STATUSES.includes(current.status)) changes.push('EVENT_COOLED')

  return changes
}

function describeChange(eventType: GraphEventType, event: EventCandidate, state: CurrentState): string {
  switch (eventType) {
    case 'FIRST_DETECTED':
      return `"${event.title}" first detected.`
    case 'NEW_SOURCE':
      return `"${event.title}" gained a new independent source (now ${state.sourceCount}).`
    case 'CONFIDENCE_ROSE':
      return `"${event.title}" confidence rose to ${state.confidence.toFixed(2)}.`
    case 'CONFIDENCE_FELL':
      return `"${event.title}" confidence fell to ${state.confidence.toFixed(2)}.`
    case 'CONTRADICTION_DETECTED':
      return `"${event.title}" gained a new contradiction (now ${state.contradictionCount}).`
    case 'OPPORTUNITY_GENERATED':
      return `"${event.title}" generated a new opportunity card (now ${state.opportunityCount}).`
    case 'CLAIM_REPEATED':
      return `"${event.title}" gained a repeated/corroborating claim (now ${state.claimCount} distinct claims).`
    case 'SIGNAL_STRENGTHENED':
      return `"${event.title}" signal strength increased (now ${state.maxSignalStrength.toFixed(2)}).`
    case 'EVENT_ESCALATED':
      return `"${event.title}" escalated to ${state.status}.`
    case 'EVENT_COOLED':
      return `"${event.title}" cooled to ${state.status}.`
    default:
      return `"${event.title}" changed.`
  }
}

/** Captures a bounded (1-degree neighbourhood) snapshot of the event node, keyed on the given snapshotType. */
async function captureSnapshot(
  graphNodeId: string,
  snapshotType: 'EVENT_FORMATION' | 'CURRENT_STATE',
): Promise<GraphSnapshot | null> {
  const neighbourhood = await getNodeNeighbourhood(graphNodeId)
  if (!neighbourhood) return null

  return prisma.graphSnapshot.create({
    data: {
      snapshotType,
      rootNodeId: graphNodeId,
      nodesJson: JSON.stringify([neighbourhood.node, ...neighbourhood.neighbours]),
      edgesJson: JSON.stringify(neighbourhood.edges),
    },
  })
}

/**
 * Records real GraphEvent diffs for a batch of events (called after `syncGraphForEvents` in the
 * scan orchestrator). For each event: resolves its EVENT GraphNode, loads the last recorded
 * GraphEvent's metadataJson as the prior diff baseline, computes the current persisted state,
 * and writes exactly one row per real change (never a synthetic/speculative row; nothing changed
 * -> nothing written). Snapshots the event neighbourhood on FIRST_DETECTED (EVENT_FORMATION) and
 * EVENT_ESCALATED (CURRENT_STATE). Never throws — per-event failures are collected as
 * PipelineErrors so a timeline failure never fails the scan.
 */
export async function recordGraphEvents(
  events: EventCandidate[],
  now: Date,
): Promise<{ recorded: number; errors: PipelineError[] }> {
  const errors: PipelineError[] = []
  let recorded = 0

  for (const event of events) {
    try {
      const graphNode = await prisma.graphNode.findUnique({
        where: { refType_refId: { refType: 'event', refId: event.id } },
      })
      if (!graphNode) {
        errors.push({ stage: 'graph:timeline', sourceId: event.id, message: 'No EVENT GraphNode found for event (not yet graph-synced).' })
        continue
      }

      const lastEvent = await prisma.graphEvent.findFirst({
        where: { graphNodeId: graphNode.id },
        orderBy: { occurredAt: 'desc' },
      })
      const prior: CurrentState | null = lastEvent ? JSON.parse(lastEvent.metadataJson) : null

      const current = await computeCurrentState(event, graphNode.id)
      const changes = diffState(prior, current)

      for (const eventType of changes) {
        await prisma.graphEvent.create({
          data: {
            graphNodeId: graphNode.id,
            eventCandidateId: event.id,
            eventType,
            description: describeChange(eventType, event, current),
            occurredAt: now,
            metadataJson: JSON.stringify(current),
          },
        })
        recorded++

        if (eventType === 'FIRST_DETECTED') {
          await captureSnapshot(graphNode.id, 'EVENT_FORMATION')
        } else if (eventType === 'EVENT_ESCALATED') {
          await captureSnapshot(graphNode.id, 'CURRENT_STATE')
        }
      }
    } catch (err) {
      errors.push({ stage: 'graph:timeline', sourceId: event.id, message: err instanceof Error ? err.message : String(err) })
    }
  }

  return { recorded, errors }
}

export type EventReplay = {
  timeline: GraphEvent[]
  snapshots: GraphSnapshot[]
  momentum: number
  confidenceDecay: number
  freshness: number
}

/**
 * The full replay for an event: its ordered GraphEvent timeline, any captured GraphSnapshots,
 * and the computed momentum/confidenceDecay/freshness scores (as of now). confidenceDecay and
 * freshness are computed from the time since the last SUPPORTING GraphEvent (SUPPORTING_EVENT_TYPES),
 * not the last event of any polarity — so a fresh contradiction never resets freshness. Returns
 * null if the event has no EVENT GraphNode (never synced) or no recorded timeline yet.
 */
export async function getEventReplay(eventCandidateId: string, now: Date = new Date()): Promise<EventReplay | null> {
  const graphNode = await prisma.graphNode.findUnique({
    where: { refType_refId: { refType: 'event', refId: eventCandidateId } },
  })
  if (!graphNode) return null

  const timeline = await prisma.graphEvent.findMany({
    where: { graphNodeId: graphNode.id },
    orderBy: { occurredAt: 'asc' },
  })
  if (timeline.length === 0) return null

  const snapshots = await prisma.graphSnapshot.findMany({
    where: { rootNodeId: graphNode.id },
    orderBy: { createdAt: 'asc' },
  })

  const momentum = momentumScore(
    timeline.map((e) => ({ eventType: e.eventType, occurredAt: e.occurredAt })),
    now,
  )

  // confidenceDecay/freshness must reflect time since the last SUPPORTING evidence, not the
  // last GraphEvent of any polarity — otherwise a fresh CONTRADICTION_DETECTED would wrongly
  // reset freshness to "fresh". Falls back to null (-> momentum's NULL_DATE_FRESHNESS default)
  // in the unexpected case a timeline has no supporting row at all.
  const supportingEvents = timeline.filter((e) => SUPPORTING_EVENT_TYPES.includes(e.eventType as GraphEventType))
  const lastSupportingEvent = supportingEvents[supportingEvents.length - 1]
  const lastSupportingAt = lastSupportingEvent ? lastSupportingEvent.occurredAt : null

  const decay = confidenceDecay(lastSupportingAt, now)
  const fresh = freshness(lastSupportingAt, now)

  return { timeline, snapshots, momentum, confidenceDecay: decay, freshness: fresh }
}
