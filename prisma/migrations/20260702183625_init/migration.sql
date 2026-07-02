-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accessMethod" TEXT NOT NULL,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "collectorStatus" TEXT NOT NULL DEFAULT 'UNSUPPORTED',
    "lastRunStatus" TEXT,
    "lastRunAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'ORGANISATION',
    "sector" TEXT,
    "region" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rawContent" TEXT NOT NULL,
    "rawContentHash" TEXT NOT NULL,
    "normalisedContentHash" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    "documentType" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ParsedDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "authorsJson" TEXT NOT NULL DEFAULT '[]',
    "language" TEXT NOT NULL DEFAULT 'en',
    "linksJson" TEXT NOT NULL DEFAULT '[]',
    "entitiesMentionedJson" TEXT NOT NULL DEFAULT '[]',
    "parserName" TEXT NOT NULL,
    "parserConfidence" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PARSED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ParsedDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "entityId" TEXT,
    "claimType" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "claimDate" DATETIME,
    "extractedValue" TEXT,
    "unit" TEXT,
    "sector" TEXT,
    "region" TEXT,
    "extractionMethod" TEXT NOT NULL,
    "extractionConfidence" REAL NOT NULL,
    "credibilityScore" REAL NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Claim_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Claim_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entityId" TEXT,
    "signalType" TEXT NOT NULL,
    "signalValue" TEXT,
    "signalDate" DATETIME NOT NULL,
    "confidence" REAL NOT NULL,
    "strength" REAL NOT NULL,
    "direction" TEXT NOT NULL,
    "timeWindow" TEXT,
    "explanation" TEXT NOT NULL,
    "sector" TEXT,
    "region" TEXT,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Signal_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Signal_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Signal_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Signal_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "clusterType" TEXT NOT NULL,
    "sector" TEXT,
    "region" TEXT,
    "strength" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "novelty" REAL NOT NULL,
    "explanation" TEXT NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "eventCandidateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SignalCluster_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "EventCandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalClusterSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clusterId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    CONSTRAINT "SignalClusterSignal_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "SignalCluster" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SignalClusterSignal_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalClusterEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clusterId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    CONSTRAINT "SignalClusterEntity_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "SignalCluster" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SignalClusterEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventClass" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "severity" REAL NOT NULL,
    "probability" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "timeWindowStart" DATETIME,
    "timeWindowEnd" DATETIME,
    "firstDetectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL,
    "primaryEntityId" TEXT,
    "affectedSector" TEXT,
    "affectedRegion" TEXT,
    "evidenceCount" INTEGER NOT NULL,
    "sourceDiversityScore" REAL NOT NULL,
    "signalStrength" REAL NOT NULL,
    "noveltyScore" REAL NOT NULL,
    "opportunityScore" REAL NOT NULL,
    "riskScore" REAL NOT NULL,
    "createdFromScanRunId" TEXT NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventCandidate_primaryEntityId_fkey" FOREIGN KEY ("primaryEntityId") REFERENCES "Entity" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EventCandidate_createdFromScanRunId_fkey" FOREIGN KEY ("createdFromScanRunId") REFERENCES "ScanRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventCandidateEntity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    CONSTRAINT "EventCandidateEntity_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "EventCandidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventCandidateEntity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RiskOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "riskLogic" TEXT NOT NULL,
    "opportunityLogic" TEXT NOT NULL,
    "questionsJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiskOpportunity_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "EventCandidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardFeedItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT NOT NULL,
    "feedType" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DashboardFeedItem_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "EventCandidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanRun" (
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
    "dashboardFeedItemsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DataGap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "impactOnConfidence" REAL NOT NULL,
    "suggestedSourceCategory" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DataGap_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "EventCandidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TriggerCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "conditionText" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "probabilityImpact" REAL NOT NULL,
    "priority" INTEGER NOT NULL,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TriggerCondition_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "EventCandidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_name_key" ON "Source"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_name_key" ON "Entity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Document_sourceId_rawContentHash_key" ON "Document"("sourceId", "rawContentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ParsedDocument_documentId_key" ON "ParsedDocument"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "Signal_claimId_key" ON "Signal"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "SignalClusterSignal_clusterId_signalId_key" ON "SignalClusterSignal"("clusterId", "signalId");

-- CreateIndex
CREATE UNIQUE INDEX "SignalClusterEntity_clusterId_entityId_key" ON "SignalClusterEntity"("clusterId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EventCandidateEntity_eventCandidateId_entityId_key" ON "EventCandidateEntity"("eventCandidateId", "entityId");
