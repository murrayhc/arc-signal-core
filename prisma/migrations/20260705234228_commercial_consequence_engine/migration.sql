-- AlterTable
ALTER TABLE "LLMRun" ADD COLUMN "outputHash" TEXT;

-- AlterTable
ALTER TABLE "StrategicPositioningExample" ADD COLUMN "companyImpactId" TEXT;

-- CreateTable
CREATE TABLE "CompanyImpact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT,
    "claimClusterId" TEXT,
    "entityId" TEXT,
    "companyName" TEXT NOT NULL,
    "impactType" TEXT NOT NULL,
    "impactPathway" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "evidenceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "riskScore" REAL NOT NULL DEFAULT 0,
    "opportunityScore" REAL NOT NULL DEFAULT 0,
    "watchSignalsJson" TEXT NOT NULL DEFAULT '[]',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EventContextSynthesis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT NOT NULL,
    "historicContext" TEXT NOT NULL,
    "presentContext" TEXT NOT NULL,
    "futureContext" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "evidenceIdsJson" TEXT NOT NULL DEFAULT '[]',
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FutureScenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT NOT NULL,
    "scenarioType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "confirmingSignalsJson" TEXT NOT NULL DEFAULT '[]',
    "weakeningSignalsJson" TEXT NOT NULL DEFAULT '[]',
    "likelyBeneficiariesJson" TEXT NOT NULL DEFAULT '[]',
    "likelyHarmedPartiesJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" REAL NOT NULL,
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
    "futureScenariosCreated" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ScanRun" ("atomicClaimsExtracted", "canonicalClaimsCreated", "canonicalClaimsUpdated", "claimClustersUpserted", "claimsExtracted", "clustersCreated", "completedAt", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "eventCandidatesUpdated", "graphEdgesUpserted", "graphNodesUpserted", "id", "investigationQueriesGenerated", "lineageRecordsCreated", "opportunityCardsCreated", "opportunityCardsUpdated", "positioningExamplesCreated", "scanType", "signalsCreated", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt", "warningsJson") SELECT "atomicClaimsExtracted", "canonicalClaimsCreated", "canonicalClaimsUpdated", "claimClustersUpserted", "claimsExtracted", "clustersCreated", "completedAt", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "eventCandidatesUpdated", "graphEdgesUpserted", "graphNodesUpserted", "id", "investigationQueriesGenerated", "lineageRecordsCreated", "opportunityCardsCreated", "opportunityCardsUpdated", "positioningExamplesCreated", "scanType", "signalsCreated", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt", "warningsJson" FROM "ScanRun";
DROP TABLE "ScanRun";
ALTER TABLE "new_ScanRun" RENAME TO "ScanRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CompanyImpact_eventCandidateId_idx" ON "CompanyImpact"("eventCandidateId");

-- CreateIndex
CREATE INDEX "CompanyImpact_entityId_idx" ON "CompanyImpact"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EventContextSynthesis_eventCandidateId_key" ON "EventContextSynthesis"("eventCandidateId");

-- CreateIndex
CREATE INDEX "FutureScenario_eventCandidateId_idx" ON "FutureScenario"("eventCandidateId");
