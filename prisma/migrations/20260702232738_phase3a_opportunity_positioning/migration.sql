-- CreateTable
CREATE TABLE "RevenueLens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userType" TEXT NOT NULL DEFAULT 'GENERAL',
    "targetSectorsJson" TEXT NOT NULL DEFAULT '[]',
    "targetRegionsJson" TEXT NOT NULL DEFAULT '[]',
    "offerTypesJson" TEXT NOT NULL DEFAULT '[]',
    "buyerPersonasJson" TEXT NOT NULL DEFAULT '[]',
    "averageDealSize" TEXT,
    "salesCycle" TEXT,
    "excludedSectorsJson" TEXT NOT NULL DEFAULT '[]',
    "riskAppetite" TEXT NOT NULL DEFAULT 'MEDIUM',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OpportunityCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT NOT NULL,
    "revenueLensId" TEXT,
    "title" TEXT NOT NULL,
    "opportunityType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "buyerPain" TEXT NOT NULL,
    "likelyBuyersJson" TEXT NOT NULL DEFAULT '[]',
    "affectedSectorsJson" TEXT NOT NULL DEFAULT '[]',
    "affectedRegionsJson" TEXT NOT NULL DEFAULT '[]',
    "suggestedOffer" TEXT NOT NULL,
    "urgencyScore" REAL NOT NULL,
    "commercialValueScore" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "evidenceScore" REAL NOT NULL,
    "actionabilityScore" REAL NOT NULL,
    "opportunityLogic" TEXT NOT NULL,
    "riskLogic" TEXT NOT NULL,
    "nextBestAction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpportunityCard_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "EventCandidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OpportunityCard_revenueLensId_fkey" FOREIGN KEY ("revenueLensId") REFERENCES "RevenueLens" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StrategicPositioningExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventCandidateId" TEXT NOT NULL,
    "opportunityCardId" TEXT,
    "evidenceArcId" TEXT,
    "revenueLensId" TEXT,
    "title" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "positioningAngle" TEXT NOT NULL,
    "howItCouldBeUsed" TEXT NOT NULL,
    "whyItMayMatter" TEXT NOT NULL,
    "evidenceSummary" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "constraints" TEXT NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StrategicPositioningExample_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "EventCandidate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StrategicPositioningExample_opportunityCardId_fkey" FOREIGN KEY ("opportunityCardId") REFERENCES "OpportunityCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StrategicPositioningExample_revenueLensId_fkey" FOREIGN KEY ("revenueLensId") REFERENCES "RevenueLens" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RevenueLens_name_key" ON "RevenueLens"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityCard_eventCandidateId_revenueLensId_key" ON "OpportunityCard"("eventCandidateId", "revenueLensId");
