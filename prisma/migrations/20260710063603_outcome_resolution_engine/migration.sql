-- CreateTable
CREATE TABLE "OutcomePrediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectKind" TEXT NOT NULL,
    "eventCandidateId" TEXT NOT NULL,
    "scenarioType" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "predictionText" TEXT NOT NULL,
    "predictedProbability" REAL NOT NULL,
    "finalProbability" REAL NOT NULL,
    "predictedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" DATETIME NOT NULL,
    "evidenceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "dimensionsJson" TEXT NOT NULL DEFAULT '{}',
    "baselineJson" TEXT NOT NULL DEFAULT '{}',
    "confirmingSignalsJson" TEXT NOT NULL DEFAULT '[]',
    "weakeningSignalsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" DATETIME,
    "resolutionRationale" TEXT,
    "resolutionEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "observedPath" TEXT,
    "brierFirst" REAL,
    "brierFinal" REAL,
    "leadTimeDays" REAL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrackRecordSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanRunId" TEXT NOT NULL,
    "resolvedCount" INTEGER NOT NULL,
    "happenedCount" INTEGER NOT NULL,
    "pendingReviewCount" INTEGER NOT NULL,
    "openCount" INTEGER NOT NULL,
    "meanBrierFirst" REAL,
    "meanBrierFinal" REAL,
    "baseRate" REAL,
    "calibrationJson" TEXT NOT NULL DEFAULT '[]',
    "meanLeadTimeDays" REAL,
    "beforeMainstreamCount" INTEGER NOT NULL DEFAULT 0,
    "byEventTypeJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReliabilityWeightSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanRunId" TEXT NOT NULL,
    "basedOnResolvedCount" INTEGER NOT NULL,
    "currentWeightsJson" TEXT NOT NULL,
    "suggestedWeightsJson" TEXT NOT NULL,
    "expectedBrierImprovement" REAL NOT NULL,
    "rationaleJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanType" TEXT NOT NULL DEFAULT 'FULL',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "sourcesScanned" INTEGER NOT NULL DEFAULT 0,
    "sourcesSkipped" INTEGER NOT NULL DEFAULT 0,
    "documentsFetched" INTEGER NOT NULL DEFAULT 0,
    "claimsExtracted" INTEGER NOT NULL DEFAULT 0,
    "signalsCreated" INTEGER NOT NULL DEFAULT 0,
    "clustersCreated" INTEGER NOT NULL DEFAULT 0,
    "eventCandidatesCreated" INTEGER NOT NULL DEFAULT 0,
    "eventCandidatesUpdated" INTEGER NOT NULL DEFAULT 0,
    "dashboardFeedItemsCreated" INTEGER NOT NULL DEFAULT 0,
    "opportunityCardsCreated" INTEGER NOT NULL DEFAULT 0,
    "opportunityCardsUpdated" INTEGER NOT NULL DEFAULT 0,
    "positioningExamplesCreated" INTEGER NOT NULL DEFAULT 0,
    "graphNodesUpserted" INTEGER NOT NULL DEFAULT 0,
    "graphEdgesUpserted" INTEGER NOT NULL DEFAULT 0,
    "atomicClaimsExtracted" INTEGER NOT NULL DEFAULT 0,
    "canonicalClaimsCreated" INTEGER NOT NULL DEFAULT 0,
    "canonicalClaimsUpdated" INTEGER NOT NULL DEFAULT 0,
    "claimClustersUpserted" INTEGER NOT NULL DEFAULT 0,
    "lineageRecordsCreated" INTEGER NOT NULL DEFAULT 0,
    "investigationQueriesGenerated" INTEGER NOT NULL DEFAULT 0,
    "companyImpactsCreated" INTEGER NOT NULL DEFAULT 0,
    "contextSynthesesCreated" INTEGER NOT NULL DEFAULT 0,
    "signalsQuarantined" INTEGER NOT NULL DEFAULT 0,
    "reviewItemsCreated" INTEGER NOT NULL DEFAULT 0,
    "futureScenariosCreated" INTEGER NOT NULL DEFAULT 0,
    "predictionsCreated" INTEGER NOT NULL DEFAULT 0,
    "predictionsResolved" INTEGER NOT NULL DEFAULT 0,
    "predictionsPendingReview" INTEGER NOT NULL DEFAULT 0,
    "weightSuggestionsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ScanRun" ("atomicClaimsExtracted", "canonicalClaimsCreated", "canonicalClaimsUpdated", "claimClustersUpserted", "claimsExtracted", "clustersCreated", "companyImpactsCreated", "completedAt", "contextSynthesesCreated", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "eventCandidatesUpdated", "futureScenariosCreated", "graphEdgesUpserted", "graphNodesUpserted", "id", "investigationQueriesGenerated", "lineageRecordsCreated", "opportunityCardsCreated", "opportunityCardsUpdated", "positioningExamplesCreated", "reviewItemsCreated", "scanType", "signalsCreated", "signalsQuarantined", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt", "warningsJson") SELECT "atomicClaimsExtracted", "canonicalClaimsCreated", "canonicalClaimsUpdated", "claimClustersUpserted", "claimsExtracted", "clustersCreated", "companyImpactsCreated", "completedAt", "contextSynthesesCreated", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "eventCandidatesUpdated", "futureScenariosCreated", "graphEdgesUpserted", "graphNodesUpserted", "id", "investigationQueriesGenerated", "lineageRecordsCreated", "opportunityCardsCreated", "opportunityCardsUpdated", "positioningExamplesCreated", "reviewItemsCreated", "scanType", "signalsCreated", "signalsQuarantined", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt", "warningsJson" FROM "ScanRun";
DROP TABLE "ScanRun";
ALTER TABLE "new_ScanRun" RENAME TO "ScanRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OutcomePrediction_dedupeKey_key" ON "OutcomePrediction"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutcomePrediction_eventCandidateId_idx" ON "OutcomePrediction"("eventCandidateId");

-- CreateIndex
CREATE INDEX "OutcomePrediction_status_deadline_idx" ON "OutcomePrediction"("status", "deadline");

-- CreateIndex
CREATE INDEX "TrackRecordSnapshot_createdAt_idx" ON "TrackRecordSnapshot"("createdAt");

-- CreateIndex
CREATE INDEX "ReliabilityWeightSuggestion_status_idx" ON "ReliabilityWeightSuggestion"("status");
