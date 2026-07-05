-- CreateTable
CREATE TABLE "AtomicClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "canonicalClaimId" TEXT,
    "claimText" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "entitiesJson" TEXT NOT NULL DEFAULT '[]',
    "sectorsJson" TEXT NOT NULL DEFAULT '[]',
    "regionsJson" TEXT NOT NULL DEFAULT '[]',
    "commoditiesJson" TEXT NOT NULL DEFAULT '[]',
    "instrumentsJson" TEXT NOT NULL DEFAULT '[]',
    "eventDate" DATETIME,
    "extractionMethod" TEXT NOT NULL,
    "extractionConfidence" REAL NOT NULL,
    "specificityScore" REAL NOT NULL,
    "factualityLabel" TEXT NOT NULL,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AtomicClaim_canonicalClaimId_fkey" FOREIGN KEY ("canonicalClaimId") REFERENCES "CanonicalClaim" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CanonicalClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimText" TEXT NOT NULL,
    "normalisedClaimText" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "firstSeenAt" DATETIME,
    "firstSeenSourceId" TEXT,
    "originCandidateUrl" TEXT,
    "independentSourceCount" INTEGER NOT NULL DEFAULT 0,
    "repeatCount" INTEGER NOT NULL DEFAULT 0,
    "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    "supportScore" REAL NOT NULL DEFAULT 0,
    "reliabilityScore" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ClaimCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalClaimId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "independentSourceCount" INTEGER NOT NULL DEFAULT 0,
    "copiedSourceCount" INTEGER NOT NULL DEFAULT 0,
    "contradictionCount" INTEGER NOT NULL DEFAULT 0,
    "reliabilityScore" REAL NOT NULL DEFAULT 0,
    "momentumScore" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimCluster_canonicalClaimId_fkey" FOREIGN KEY ("canonicalClaimId") REFERENCES "CanonicalClaim" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimLineage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalClaimId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "firstSeenAt" DATETIME,
    "relationToOrigin" TEXT NOT NULL,
    "isLikelyCopy" BOOLEAN NOT NULL DEFAULT false,
    "originConfidence" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimLineage_canonicalClaimId_fkey" FOREIGN KEY ("canonicalClaimId") REFERENCES "CanonicalClaim" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvestigationQuery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalClaimId" TEXT,
    "eventCandidateId" TEXT,
    "queryText" TEXT NOT NULL,
    "queryClass" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATED',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvestigationQuery_canonicalClaimId_fkey" FOREIGN KEY ("canonicalClaimId") REFERENCES "CanonicalClaim" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ScanRun" ("claimsExtracted", "clustersCreated", "completedAt", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "eventCandidatesUpdated", "graphEdgesUpserted", "graphNodesUpserted", "id", "opportunityCardsCreated", "opportunityCardsUpdated", "positioningExamplesCreated", "scanType", "signalsCreated", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt", "warningsJson") SELECT "claimsExtracted", "clustersCreated", "completedAt", "createdAt", "dashboardFeedItemsCreated", "documentsFetched", "errorsJson", "eventCandidatesCreated", "eventCandidatesUpdated", "graphEdgesUpserted", "graphNodesUpserted", "id", "opportunityCardsCreated", "opportunityCardsUpdated", "positioningExamplesCreated", "scanType", "signalsCreated", "sourcesScanned", "sourcesSkipped", "startedAt", "status", "updatedAt", "warningsJson" FROM "ScanRun";
DROP TABLE "ScanRun";
ALTER TABLE "new_ScanRun" RENAME TO "ScanRun";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AtomicClaim_documentId_idx" ON "AtomicClaim"("documentId");

-- CreateIndex
CREATE INDEX "AtomicClaim_sourceId_idx" ON "AtomicClaim"("sourceId");

-- CreateIndex
CREATE INDEX "AtomicClaim_canonicalClaimId_idx" ON "AtomicClaim"("canonicalClaimId");

-- CreateIndex
CREATE INDEX "CanonicalClaim_normalisedClaimText_idx" ON "CanonicalClaim"("normalisedClaimText");

-- CreateIndex
CREATE INDEX "CanonicalClaim_claimType_idx" ON "CanonicalClaim"("claimType");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimCluster_canonicalClaimId_key" ON "ClaimCluster"("canonicalClaimId");

-- CreateIndex
CREATE INDEX "ClaimLineage_canonicalClaimId_idx" ON "ClaimLineage"("canonicalClaimId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimLineage_canonicalClaimId_documentId_key" ON "ClaimLineage"("canonicalClaimId", "documentId");

-- CreateIndex
CREATE INDEX "InvestigationQuery_canonicalClaimId_idx" ON "InvestigationQuery"("canonicalClaimId");

-- CreateIndex
CREATE INDEX "InvestigationQuery_eventCandidateId_idx" ON "InvestigationQuery"("eventCandidateId");
