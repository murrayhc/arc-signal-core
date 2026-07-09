-- AlterTable
ALTER TABLE "Document" ADD COLUMN "simhash" TEXT;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN "independenceGroup" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CanonicalClaim" (
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
    "factualityLabel" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CanonicalClaim" ("claimText", "claimType", "contradictionCount", "createdAt", "firstSeenAt", "firstSeenSourceId", "id", "independentSourceCount", "normalisedClaimText", "originCandidateUrl", "reliabilityScore", "repeatCount", "status", "supportScore", "updatedAt") SELECT "claimText", "claimType", "contradictionCount", "createdAt", "firstSeenAt", "firstSeenSourceId", "id", "independentSourceCount", "normalisedClaimText", "originCandidateUrl", "reliabilityScore", "repeatCount", "status", "supportScore", "updatedAt" FROM "CanonicalClaim";
DROP TABLE "CanonicalClaim";
ALTER TABLE "new_CanonicalClaim" RENAME TO "CanonicalClaim";
CREATE INDEX "CanonicalClaim_normalisedClaimText_idx" ON "CanonicalClaim"("normalisedClaimText");
CREATE INDEX "CanonicalClaim_claimType_idx" ON "CanonicalClaim"("claimType");
CREATE TABLE "new_ClaimCluster" (
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
    "manipulationRiskScore" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClaimCluster_canonicalClaimId_fkey" FOREIGN KEY ("canonicalClaimId") REFERENCES "CanonicalClaim" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ClaimCluster" ("canonicalClaimId", "contradictionCount", "copiedSourceCount", "createdAt", "id", "independentSourceCount", "momentumScore", "reliabilityScore", "sourceCount", "summary", "title", "updatedAt") SELECT "canonicalClaimId", "contradictionCount", "copiedSourceCount", "createdAt", "id", "independentSourceCount", "momentumScore", "reliabilityScore", "sourceCount", "summary", "title", "updatedAt" FROM "ClaimCluster";
DROP TABLE "ClaimCluster";
ALTER TABLE "new_ClaimCluster" RENAME TO "ClaimCluster";
CREATE UNIQUE INDEX "ClaimCluster_canonicalClaimId_key" ON "ClaimCluster"("canonicalClaimId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
