import type { DashboardFeedItem, EventCandidate, Signal } from '@prisma/client'
import { prisma } from '@/server/db'
import type { ClusterWithSignals } from './cluster'
import { scoreCluster } from './cluster'
import type { PipelineError } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

const STICKY_STATUSES = ['ESCALATED', 'NEEDS_REVIEW', 'CONFIRMED']

export function computeEventMetrics(members: Signal[], noveltyScore: number) {
  const { strength, confidence, distinctSources } = scoreCluster(members)
  const n = members.length
  const severity = strength
  const probability = Math.min(0.9, round2(0.25 + 0.5 * confidence + 0.15 * severity))
  const negFrac = members.filter((m) => m.direction === 'NEGATIVE').length / n
  const posFrac = members.filter((m) => m.direction === 'POSITIVE').length / n
  const riskScore = round2(Math.min(1, severity * probability * (negFrac + 0.2)))
  const opportunityScore = round2(Math.min(1, severity * probability * (posFrac + 0.2)))
  let eventClass: string
  let status = 'NEW'
  if (confidence < 0.45) {
    eventClass = 'WATCH'
    if (severity >= 0.6) status = 'NEEDS_REVIEW'
  } else if (negFrac >= 0.35 && posFrac >= 0.35) {
    eventClass = 'MIXED'
  } else if (negFrac > posFrac) {
    eventClass = 'RISK'
  } else if (posFrac > negFrac) {
    eventClass = 'OPPORTUNITY'
  } else {
    eventClass = 'UNKNOWN'
  }
  const dates = members.map((m) => m.signalDate.getTime())
  return {
    severity,
    probability,
    confidence,
    riskScore,
    opportunityScore,
    eventClass,
    status,
    evidenceCount: new Set(members.map((m) => m.documentId)).size,
    sourceDiversityScore: round2(distinctSources / n),
    signalStrength: severity,
    noveltyScore,
    negFrac,
    posFrac,
    distinctSources,
    memberCount: n,
    timeWindowStart: new Date(Math.min(...dates)),
    timeWindowEnd: new Date(Math.max(...dates)),
    // Conservative provenance: one fixture member taints the whole event's label.
    isFixture: members.some((m) => m.isFixture),
  }
}

type Metrics = ReturnType<typeof computeEventMetrics>

function buildSummary(title: string, m: Metrics, clusterExplanation: string): string {
  return (
    `${title}: ${m.memberCount} corroborating signal(s) across ${m.distinctSources} independent source(s). ` +
    `Class ${m.eventClass} — confidence ${m.confidence.toFixed(2)}, severity ${m.severity.toFixed(2)}, ` +
    `probability ${m.probability.toFixed(2)} (0.25 + 0.5×confidence + 0.15×severity). ` +
    `Risk ${m.riskScore.toFixed(2)} / opportunity ${m.opportunityScore.toFixed(2)} ` +
    `(severity × probability weighted by direction mix: ${Math.round(m.negFrac * 100)}% negative, ` +
    `${Math.round(m.posFrac * 100)}% positive). ${clusterExplanation}`
  )
}

async function createFeedItems(
  event: EventCandidate,
  m: Metrics,
  clusterExplanation: string,
): Promise<DashboardFeedItem[]> {
  const priority = Math.round(100 * Math.max(m.riskScore, m.opportunityScore))
  const feedTypes = ['INBOX']
  if (event.eventClass === 'RISK' || event.eventClass === 'MIXED') feedTypes.push('RISK_RADAR')
  if (event.eventClass === 'OPPORTUNITY' || event.eventClass === 'MIXED') feedTypes.push('OPPORTUNITY_RADAR')
  if (event.eventClass === 'WATCH') feedTypes.push('WATCHLIST')
  const items: DashboardFeedItem[] = []
  for (const feedType of feedTypes) {
    items.push(
      await prisma.dashboardFeedItem.create({
        data: {
          eventCandidateId: event.id,
          feedType,
          priority,
          title: event.title,
          summary: `${event.eventClass}: ${clusterExplanation.slice(0, 200)}`,
          status: event.status,
        },
      }),
    )
  }
  return items
}

export async function createEventCandidates(
  clusters: ClusterWithSignals[],
  scanRunId: string,
): Promise<{
  events: EventCandidate[]
  updatedEvents: EventCandidate[]
  feedItems: DashboardFeedItem[]
  errors: PipelineError[]
}> {
  const events: EventCandidate[] = []
  const updatedEvents: EventCandidate[] = []
  const feedItems: DashboardFeedItem[] = []
  const errors: PipelineError[] = []

  for (const cluster of clusters) {
    try {
      const existing = await prisma.eventCandidate.findFirst({
        where: {
          eventType: cluster.clusterType,
          affectedSector: cluster.sector,
          affectedRegion: cluster.region,
          status: { not: 'DISMISSED' },
        },
        orderBy: { lastUpdatedAt: 'desc' },
      })

      if (existing) {
        // MERGE: attach cluster, recompute over the union of all member signals.
        await prisma.signalCluster.update({
          where: { id: cluster.id },
          data: { eventCandidateId: existing.id },
        })
        const links = await prisma.signalClusterSignal.findMany({
          where: { cluster: { eventCandidateId: existing.id } },
          include: { signal: true },
        })
        const union = links.map((l) => l.signal)
        const m = computeEventMetrics(union, existing.noveltyScore)
        const rising =
          m.confidence > existing.confidence ||
          Math.max(m.riskScore, m.opportunityScore) > Math.max(existing.riskScore, existing.opportunityScore)
        const status = STICKY_STATUSES.includes(existing.status)
          ? existing.status
          : rising
            ? 'RISING'
            : existing.status
        // Dependents must reflect current evidence: clear them; classify/gaps regenerate downstream.
        // The event update rides the same transaction so a mid-merge crash can never leave
        // stale scores alongside deleted dependents (missing feed items alone self-heal).
        const [, , , , updated] = await prisma.$transaction([
          prisma.riskOpportunity.deleteMany({ where: { eventCandidateId: existing.id } }),
          prisma.dataGap.deleteMany({ where: { eventCandidateId: existing.id } }),
          prisma.triggerCondition.deleteMany({ where: { eventCandidateId: existing.id } }),
          prisma.dashboardFeedItem.deleteMany({ where: { eventCandidateId: existing.id } }),
          prisma.eventCandidate.update({
            where: { id: existing.id },
            data: {
            eventClass: m.eventClass,
            summary: buildSummary(existing.title, m, cluster.explanation),
            status,
            severity: m.severity,
            probability: m.probability,
            confidence: m.confidence,
            timeWindowStart: m.timeWindowStart,
            timeWindowEnd: m.timeWindowEnd,
            evidenceCount: m.evidenceCount,
            sourceDiversityScore: m.sourceDiversityScore,
            signalStrength: m.signalStrength,
            opportunityScore: m.opportunityScore,
            riskScore: m.riskScore,
            isFixture: m.isFixture,
            },
          }),
        ])
        updatedEvents.push(updated)
        feedItems.push(...(await createFeedItems(updated, m, cluster.explanation)))
        continue
      }

      // CREATE (unchanged spine behaviour, via the shared metrics function)
      const m = computeEventMetrics(cluster.memberSignals, cluster.novelty)
      const entityIds = new Set(cluster.memberSignals.map((s) => s.entityId ?? 'none'))
      const primaryEntityId =
        entityIds.size === 1 && !entityIds.has('none') ? cluster.memberSignals[0].entityId : null
      const event = await prisma.eventCandidate.create({
        data: {
          title: cluster.title,
          eventType: cluster.clusterType,
          eventClass: m.eventClass,
          summary: buildSummary(cluster.title, m, cluster.explanation),
          status: m.status,
          severity: m.severity,
          probability: m.probability,
          confidence: m.confidence,
          timeWindowStart: m.timeWindowStart,
          timeWindowEnd: m.timeWindowEnd,
          primaryEntityId,
          affectedSector: cluster.sector,
          affectedRegion: cluster.region,
          evidenceCount: m.evidenceCount,
          sourceDiversityScore: m.sourceDiversityScore,
          signalStrength: m.signalStrength,
          noveltyScore: m.noveltyScore,
          opportunityScore: m.opportunityScore,
          riskScore: m.riskScore,
          createdFromScanRunId: scanRunId,
          isFixture: m.isFixture,
        },
      })
      await prisma.signalCluster.update({
        where: { id: cluster.id },
        data: { eventCandidateId: event.id },
      })
      events.push(event)
      feedItems.push(...(await createFeedItems(event, m, cluster.explanation)))
    } catch (err) {
      errors.push({ stage: 'events', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { events, updatedEvents, feedItems, errors }
}
