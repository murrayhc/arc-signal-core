import { prisma } from '@/server/db'

/** Delete all rows in FK-safe order. Call in beforeEach of DB-touching suites. */
export async function resetDb() {
  await prisma.$transaction([
    // Outcome-Resolution Engine (Stage 11) — no FK relations, delete anytime.
    prisma.outcomePrediction.deleteMany(),
    prisma.trackRecordSnapshot.deleteMany(),
    prisma.reliabilityWeightSuggestion.deleteMany(),
    // Review queue (Stage 6) — no FK relations, delete anytime.
    prisma.reviewItem.deleteMany(),
    // Commercial Consequence Engine.
    prisma.futureScenario.deleteMany(),
    prisma.eventContextSynthesis.deleteMany(),
    prisma.companyImpact.deleteMany(),
    // Evidence Depth Engine (children before CanonicalClaim parent).
    prisma.investigationQuery.deleteMany(),
    prisma.claimLineage.deleteMany(),
    prisma.claimCluster.deleteMany(),
    prisma.atomicClaim.deleteMany(),
    prisma.canonicalClaim.deleteMany(),
    prisma.lLMOutputValidation.deleteMany(),
    prisma.lLMRun.deleteMany(),
    prisma.lLMProviderConfig.deleteMany(),
    prisma.opportunityPlaybook.deleteMany(),
    prisma.opportunityPortfolioItem.deleteMany(),
    prisma.evidenceArcStep.deleteMany(),
    prisma.evidenceArc.deleteMany(),
    prisma.graphEdge.deleteMany(),
    prisma.graphNode.deleteMany(),
    prisma.graphEvent.deleteMany(),
    prisma.graphSnapshot.deleteMany(),
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
    prisma.marketSearchResult.deleteMany(),
    prisma.marketSearchQuery.deleteMany(),
    prisma.sourceHealth.deleteMany(),
    prisma.entity.deleteMany(),
    prisma.revenueLens.deleteMany(),
    prisma.source.deleteMany(),
    prisma.instrumentProfile.deleteMany(),
    prisma.commodityProfile.deleteMany(),
    prisma.watchMarket.deleteMany(),
  ])
}
