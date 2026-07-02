import { prisma } from '@/server/db'

export type ScanHistoryItem = {
  id: string
  scanType: string
  status: string
  startedAt: string
  completedAt: string | null
  sourcesScanned: number
  sourcesSkipped: number
  documentsFetched: number
  claimsExtracted: number
  signalsCreated: number
  clustersCreated: number
  eventCandidatesCreated: number
  eventCandidatesUpdated: number
  dashboardFeedItemsCreated: number
  errorCount: number
  warningCount: number
}

export async function getScanHistory(limit = 20): Promise<ScanHistoryItem[]> {
  const runs = await prisma.scanRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit })
  return runs.map((r) => ({
    id: r.id,
    scanType: r.scanType,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    sourcesScanned: r.sourcesScanned,
    sourcesSkipped: r.sourcesSkipped,
    documentsFetched: r.documentsFetched,
    claimsExtracted: r.claimsExtracted,
    signalsCreated: r.signalsCreated,
    clustersCreated: r.clustersCreated,
    eventCandidatesCreated: r.eventCandidatesCreated,
    eventCandidatesUpdated: r.eventCandidatesUpdated,
    dashboardFeedItemsCreated: r.dashboardFeedItemsCreated,
    errorCount: (JSON.parse(r.errorsJson) as unknown[]).length,
    warningCount: (JSON.parse(r.warningsJson) as unknown[]).length,
  }))
}
