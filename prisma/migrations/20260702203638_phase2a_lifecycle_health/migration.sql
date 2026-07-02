-- CreateTable
CREATE TABLE "SourceHealth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "lastSuccessfulFetchAt" DATETIME,
    "lastFailedFetchAt" DATETIME,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "documentsStoredLastRun" INTEGER NOT NULL DEFAULT 0,
    "healthScore" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceHealth_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ScanRun" ("claimsExtracted", "clustersCreated", "completedAt", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "id", "scanType", "signalsCreated", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt") SELECT "claimsExtracted", "clustersCreated", "completedAt", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "id", "scanType", "signalsCreated", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt" FROM "ScanRun";
DROP TABLE "ScanRun";
ALTER TABLE "new_ScanRun" RENAME TO "ScanRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "SourceHealth_sourceId_key" ON "SourceHealth"("sourceId");
