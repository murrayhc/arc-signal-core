import { prisma } from '@/server/db'

/**
 * Read-only aggregates for the homepage command centre. Everything here is
 * derived from real rows — no synthetic trends, no invented figures. Follows
 * the services/* convention: plain serialisable shapes, no raw *Json leak.
 */

export type TrendSignalData = {
  id: string
  title: string
  clusterType: string
  sector: string | null
  region: string | null
  strength: number
  confidence: number
  novelty: number
  isFixture: boolean
}

/** Top signal clusters by strength — the real "what is moving" feed. */
export async function getTrendSignals(limit = 8): Promise<TrendSignalData[]> {
  const clusters = await prisma.signalCluster.findMany({
    orderBy: [{ strength: 'desc' }, { novelty: 'desc' }],
    take: limit,
  })
  return clusters.map((c) => ({
    id: c.id,
    title: c.title,
    clusterType: c.clusterType,
    sector: c.sector,
    region: c.region,
    strength: c.strength,
    confidence: c.confidence,
    novelty: c.novelty,
    isFixture: c.isFixture,
  }))
}

export type RegionalPressureData = {
  region: string
  eventCount: number
  avgRisk: number
  avgOpportunity: number
  avgConfidence: number
}

/**
 * Non-dismissed events grouped by affectedRegion (null → 'Unattributed'),
 * ordered by event count desc. Averages are plain means over the group.
 */
export async function getRegionalPressure(): Promise<RegionalPressureData[]> {
  const events = await prisma.eventCandidate.findMany({
    where: { status: { notIn: ['DISMISSED'] } },
    select: { affectedRegion: true, riskScore: true, opportunityScore: true, confidence: true },
  })

  const groups = new Map<string, { count: number; risk: number; opportunity: number; confidence: number }>()
  for (const event of events) {
    const region = event.affectedRegion ?? 'Unattributed'
    const group = groups.get(region) ?? { count: 0, risk: 0, opportunity: 0, confidence: 0 }
    group.count += 1
    group.risk += event.riskScore
    group.opportunity += event.opportunityScore
    group.confidence += event.confidence
    groups.set(region, group)
  }

  return [...groups.entries()]
    .map(([region, g]) => ({
      region,
      eventCount: g.count,
      avgRisk: g.risk / g.count,
      avgOpportunity: g.opportunity / g.count,
      avgConfidence: g.confidence / g.count,
    }))
    .sort((a, b) => b.eventCount - a.eventCount)
}

export type ScanCounters = {
  sourcesScanned: number
  sourcesSkipped: number
  documentsFetched: number
  claimsExtracted: number
  signalsCreated: number
  clustersCreated: number
  eventCandidatesCreated: number
  eventCandidatesUpdated: number
  opportunityCardsCreated: number
  graphNodesUpserted: number
  graphEdgesUpserted: number
}

/**
 * The latest scan's per-stage pipeline counters — the real numbers behind the
 * live scanning bars. The dashboard service intentionally exposes only a
 * summary; this widens the read without touching that shared contract.
 */
export async function getLastScanCounters(): Promise<ScanCounters | null> {
  const scan = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } })
  if (!scan) return null
  return {
    sourcesScanned: scan.sourcesScanned,
    sourcesSkipped: scan.sourcesSkipped,
    documentsFetched: scan.documentsFetched,
    claimsExtracted: scan.claimsExtracted,
    signalsCreated: scan.signalsCreated,
    clustersCreated: scan.clustersCreated,
    eventCandidatesCreated: scan.eventCandidatesCreated,
    eventCandidatesUpdated: scan.eventCandidatesUpdated,
    opportunityCardsCreated: scan.opportunityCardsCreated,
    graphNodesUpserted: scan.graphNodesUpserted,
    graphEdgesUpserted: scan.graphEdgesUpserted,
  }
}

export type EventConfidenceSummary = {
  /** Mean confidence across non-dismissed events; null when there are none. */
  avgConfidence: number | null
  /** Share of non-dismissed events with confidence >= 0.7; null when none. */
  highConfidenceShare: number | null
  eventCount: number
}

/** The honest "system confidence" readout: a mean over real event scores. */
export async function getEventConfidenceSummary(): Promise<EventConfidenceSummary> {
  const events = await prisma.eventCandidate.findMany({
    where: { status: { notIn: ['DISMISSED'] } },
    select: { confidence: true },
  })
  if (events.length === 0) {
    return { avgConfidence: null, highConfidenceShare: null, eventCount: 0 }
  }
  const total = events.reduce((sum, e) => sum + e.confidence, 0)
  const high = events.filter((e) => e.confidence >= 0.7).length
  return {
    avgConfidence: total / events.length,
    highConfidenceShare: high / events.length,
    eventCount: events.length,
  }
}
