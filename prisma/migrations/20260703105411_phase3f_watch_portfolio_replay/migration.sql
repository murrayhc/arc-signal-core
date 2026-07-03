-- CreateTable
CREATE TABLE "WatchMarket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sectorsJson" TEXT NOT NULL DEFAULT '[]',
    "regionsJson" TEXT NOT NULL DEFAULT '[]',
    "themesJson" TEXT NOT NULL DEFAULT '[]',
    "queryTermsJson" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OpportunityPortfolioItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityCardId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "estimatedValue" TEXT,
    "owner" TEXT,
    "nextAction" TEXT,
    "deadline" DATETIME,
    "evidenceStrength" REAL NOT NULL DEFAULT 0,
    "buyerClarity" REAL NOT NULL DEFAULT 0,
    "confidenceMovement" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpportunityPortfolioItem_opportunityCardId_fkey" FOREIGN KEY ("opportunityCardId") REFERENCES "OpportunityCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GraphSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotType" TEXT NOT NULL,
    "rootNodeId" TEXT NOT NULL,
    "nodesJson" TEXT NOT NULL DEFAULT '[]',
    "edgesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GraphEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "graphNodeId" TEXT NOT NULL,
    "eventCandidateId" TEXT,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" TEXT NOT NULL DEFAULT '{}'
);

-- CreateIndex
CREATE UNIQUE INDEX "WatchMarket_name_key" ON "WatchMarket"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityPortfolioItem_opportunityCardId_key" ON "OpportunityPortfolioItem"("opportunityCardId");

-- CreateIndex
CREATE INDEX "GraphEvent_graphNodeId_occurredAt_idx" ON "GraphEvent"("graphNodeId", "occurredAt");
