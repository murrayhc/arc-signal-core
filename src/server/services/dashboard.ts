import { prisma } from '@/server/db'
import type { EventCandidate, RiskOpportunity } from '@prisma/client'
import { getOpportunityRadar, type OpportunityCardData } from '@/server/services/opportunities'

export type FeedCardData = {
  eventId: string; title: string; eventType: string; eventClass: string; status: string
  sector: string | null; region: string | null
  severity: number; probability: number; confidence: number
  riskScore: number; opportunityScore: number
  evidenceCount: number; sourceDiversityScore: number
  lastUpdatedAt: string; isFixture: boolean; whyItMatters: string | null
}

export type SourceStatus = {
  id: string; name: string; category: string; accessMethod: string; isActive: boolean
  isFixture: boolean; collectorStatus: string; lastRunStatus: string | null; lastRunAt: string | null
  healthStatus: string; healthScore: number; failureCount: number; lastSuccessfulFetchAt: string | null
}

export type DashboardData = {
  lastScan: {
    id: string; status: string; startedAt: string; completedAt: string | null
    eventCandidatesCreated: number; documentsFetched: number
    errors: { stage: string; message: string }[]
    warnings: { stage: string; message: string }[]
  } | null
  counts: { newEvents: number; rising: number; highConfidence: number; watch: number }
  riskRadar: FeedCardData[]
  opportunitySignals: FeedCardData[]
  opportunityRadar: OpportunityCardData[]
  inbox: FeedCardData[]
  sources: SourceStatus[]
  /** Live source-category coverage: how many distinct categories the radar
   *  actually watches (news, regulator, government, procurement, aggregator…)
   *  — honest breadth, not one lighthouse. */
  sourceCategories: { category: string; count: number; healthy: number }[]
  /** Pending human-review items (Stage 6) — surfaced so the queue is visible
   *  from the command centre, not buried. */
  pendingReviewCount: number
}

type EventWithRO = EventCandidate & { riskOpportunities: RiskOpportunity[] }

function toCard(event: EventWithRO): FeedCardData {
  return {
    eventId: event.id,
    title: event.title,
    eventType: event.eventType,
    eventClass: event.eventClass,
    status: event.status,
    sector: event.affectedSector,
    region: event.affectedRegion,
    severity: event.severity,
    probability: event.probability,
    confidence: event.confidence,
    riskScore: event.riskScore,
    opportunityScore: event.opportunityScore,
    evidenceCount: event.evidenceCount,
    sourceDiversityScore: event.sourceDiversityScore,
    lastUpdatedAt: event.lastUpdatedAt.toISOString(),
    isFixture: event.isFixture,
    whyItMatters: event.riskOpportunities[0]?.opportunityLogic ?? null,
  }
}

async function radar(feedType: string): Promise<FeedCardData[]> {
  const items = await prisma.dashboardFeedItem.findMany({
    where: { feedType, status: { notIn: ['DISMISSED'] } },
    orderBy: { priority: 'desc' },
    take: 12,
    include: { eventCandidate: { include: { riskOpportunities: { take: 1 } } } },
  })
  return items.map((i) => toCard(i.eventCandidate))
}

export async function getSources(): Promise<SourceStatus[]> {
  const sources = await prisma.source.findMany({ orderBy: { name: 'asc' }, include: { health: true } })
  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    accessMethod: s.accessMethod,
    isActive: s.isActive,
    isFixture: s.isFixture,
    collectorStatus: s.collectorStatus,
    lastRunStatus: s.lastRunStatus,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    healthStatus: s.health?.status ?? 'UNKNOWN',
    healthScore: s.health?.healthScore ?? 0,
    failureCount: s.health?.failureCount ?? 0,
    lastSuccessfulFetchAt: s.health?.lastSuccessfulFetchAt?.toISOString() ?? null,
  }))
}

export async function getDashboardData(): Promise<DashboardData> {
  const sources = await getSources()
  const lastScanRow = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } })
  const [newEvents, rising, highConfidence, watch] = await Promise.all([
    prisma.eventCandidate.count({ where: { status: 'NEW' } }),
    prisma.eventCandidate.count({ where: { status: 'RISING' } }),
    prisma.eventCandidate.count({ where: { confidence: { gte: 0.7 }, eventClass: { not: 'WATCH' } } }),
    prisma.eventCandidate.count({ where: { eventClass: 'WATCH' } }),
  ])
  const inboxEvents = await prisma.eventCandidate.findMany({
    orderBy: { lastUpdatedAt: 'desc' },
    take: 50,
    include: { riskOpportunities: { take: 1 } },
  })
  return {
    lastScan: lastScanRow
      ? {
          id: lastScanRow.id,
          status: lastScanRow.status,
          startedAt: lastScanRow.startedAt.toISOString(),
          completedAt: lastScanRow.completedAt?.toISOString() ?? null,
          eventCandidatesCreated: lastScanRow.eventCandidatesCreated,
          documentsFetched: lastScanRow.documentsFetched,
          errors: JSON.parse(lastScanRow.errorsJson),
          warnings: JSON.parse(lastScanRow.warningsJson),
        }
      : null,
    counts: { newEvents, rising, highConfidence, watch },
    riskRadar: await radar('RISK_RADAR'),
    opportunitySignals: await radar('OPPORTUNITY_RADAR'),
    opportunityRadar: await getOpportunityRadar(),
    inbox: inboxEvents.map(toCard),
    sources,
    sourceCategories: summariseCategories(sources),
    pendingReviewCount: await prisma.reviewItem.count({ where: { status: 'PENDING' } }),
  }
}

/** Groups the live (non-fixture) sources by category with a healthy count. */
function summariseCategories(sources: SourceStatus[]): { category: string; count: number; healthy: number }[] {
  const live = sources.filter((s) => !s.isFixture)
  const byCategory = new Map<string, { count: number; healthy: number }>()
  for (const s of live) {
    const entry = byCategory.get(s.category) ?? { count: 0, healthy: 0 }
    entry.count += 1
    if (s.healthStatus === 'HEALTHY') entry.healthy += 1
    byCategory.set(s.category, entry)
  }
  return [...byCategory.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.count - a.count)
}
