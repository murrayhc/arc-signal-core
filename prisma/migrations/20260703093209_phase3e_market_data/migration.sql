-- CreateTable
CREATE TABLE "MarketSearchQuery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "queryType" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MarketSearchResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queryId" TEXT NOT NULL,
    "resultType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0,
    "refType" TEXT NOT NULL DEFAULT '',
    "refId" TEXT,
    "graphSnapshotId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketSearchResult_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "MarketSearchQuery" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstrumentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "instrumentType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "delayed" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "lastFetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CommodityProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "keySupplyRegionsJson" TEXT NOT NULL DEFAULT '[]',
    "keyDemandSectorsJson" TEXT NOT NULL DEFAULT '[]',
    "delayed" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "lastFetchedAt" DATETIME,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentProfile_provider_symbol_key" ON "InstrumentProfile"("provider", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "CommodityProfile_name_key" ON "CommodityProfile"("name");
