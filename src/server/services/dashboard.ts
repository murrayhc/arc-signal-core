import { prisma } from '@/server/db'
import type { EventCandidate, RiskOpportunity } from '@prisma/client'

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
  opportunityRadar: FeedCardData[]
  inbox: FeedCardData[]
  sources: SourceStatus[]
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

export async function getDashboardData(): Promise<DashboardData> {
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
  const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } })
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
    opportunityRadar: await radar('OPPORTUNITY_RADAR'),
    inbox: inboxEvents.map(toCard),
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      accessMethod: s.accessMethod,
      isActive: s.isActive,
      isFixture: s.isFixture,
      collectorStatus: s.collectorStatus,
      lastRunStatus: s.lastRunStatus,
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
    })),
  }
}
