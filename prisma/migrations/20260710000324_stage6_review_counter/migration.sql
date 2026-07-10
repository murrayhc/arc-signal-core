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
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ScanRun" ("atomicClaimsExtracted", "canonicalClaimsCreated", "canonicalClaimsUpdated", "claimClustersUpserted", "claimsExtracted", "clustersCreated", "companyImpactsCreated", "completedAt", "contextSynthesesCreated", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "eventCandidatesUpdated", "futureScenariosCreated", "graphEdgesUpserted", "graphNodesUpserted", "id", "investigationQueriesGenerated", "lineageRecordsCreated", "opportunityCardsCreated", "opportunityCardsUpdated", "positioningExamplesCreated", "scanType", "signalsCreated", "signalsQuarantined", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt", "warningsJson") SELECT "atomicClaimsExtracted", "canonicalClaimsCreated", "canonicalClaimsUpdated", "claimClustersUpserted", "claimsExtracted", "clustersCreated", "companyImpactsCreated", "completedAt", "contextSynthesesCreated", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "eventCandidatesUpdated", "futureScenariosCreated", "graphEdgesUpserted", "graphNodesUpserted", "id", "investigationQueriesGenerated", "lineageRecordsCreated", "opportunityCardsCreated", "opportunityCardsUpdated", "positioningExamplesCreated", "scanType", "signalsCreated", "signalsQuarantined", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt", "warningsJson" FROM "ScanRun";
DROP TABLE "ScanRun";
ALTER TABLE "new_ScanRun" RENAME TO "ScanRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
