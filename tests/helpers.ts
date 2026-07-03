import { prisma } from '@/server/db'

/** Delete all rows in FK-safe order. Call in beforeEach of DB-touching suites. */
export async function resetDb() {
  await prisma.$transaction([
    prisma.evidenceArcStep.deleteMany(),
    prisma.evidenceArc.deleteMany(),
    prisma.graphEdge.deleteMany(),
    prisma.graphNode.deleteMany(),
    prisma.strategicPositioningExample.deleteMany(),
    prisma.opportunityCard.deleteMany(),
    prisma.dashboardFeedItem.deleteMany(),
    prisma.triggerCondition.deleteMany(),
    prisma.dataGap.deleteMany(),
    prisma.riskOpportunity.deleteMany(),
    prisma.signalClusterSignal.deleteMany(),
    prisma.signalClusterEntity.deleteMany(),
    prisma.eventCandidateEntity.deleteMany(),
    prisma.signalCluster.deleteMany(),
    prisma.eventCandidate.deleteMany(),
    prisma.signal.deleteMany(),
    prisma.claim.deleteMany(),
    prisma.parsedDocument.deleteMany(),
    prisma.document.deleteMany(),
    prisma.scanRun.deleteMany(),
    prisma.sourceHealth.deleteMany(),
    prisma.entity.deleteMany(),
    prisma.revenueLens.deleteMany(),
    prisma.source.deleteMany(),
  ])
}
