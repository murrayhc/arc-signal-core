-- CreateTable
CREATE TABLE "LLMProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerName" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "taskTypesJson" TEXT NOT NULL DEFAULT '[]',
    "maxContextTokens" INTEGER NOT NULL DEFAULT 0,
    "costTier" TEXT NOT NULL DEFAULT 'MEDIUM',
    "latencyTier" TEXT NOT NULL DEFAULT 'MEDIUM',
    "strengthsJson" TEXT NOT NULL DEFAULT '[]',
    "weaknessesJson" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "fallbackProviderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LLMRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL DEFAULT '',
    "outputSummary" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "tokenCountInput" INTEGER NOT NULL DEFAULT 0,
    "tokenCountOutput" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" REAL NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LLMOutputValidation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "llmRunId" TEXT NOT NULL,
    "validationStatus" TEXT NOT NULL,
    "schemaValid" BOOLEAN NOT NULL DEFAULT false,
    "evidenceGrounded" BOOLEAN NOT NULL DEFAULT false,
    "prohibitedLanguageDetected" BOOLEAN NOT NULL DEFAULT false,
    "unsupportedClaimsDetected" BOOLEAN NOT NULL DEFAULT false,
    "reviewNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LLMOutputValidation_llmRunId_fkey" FOREIGN KEY ("llmRunId") REFERENCES "LLMRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpportunityPlaybook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "opportunityCardId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetBuyer" TEXT NOT NULL,
    "commercialHypothesis" TEXT NOT NULL,
    "painStatement" TEXT NOT NULL,
    "offerAngle" TEXT NOT NULL,
    "discoveryQuestionsJson" TEXT NOT NULL DEFAULT '[]',
    "outreachAngle" TEXT NOT NULL,
    "likelyObjectionsJson" TEXT NOT NULL DEFAULT '[]',
    "proofPointsJson" TEXT NOT NULL DEFAULT '[]',
    "firstAction" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "generatedBy" TEXT NOT NULL DEFAULT 'DETERMINISTIC',
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpportunityPlaybook_opportunityCardId_fkey" FOREIGN KEY ("opportunityCardId") REFERENCES "OpportunityCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LLMProviderConfig_modelName_key" ON "LLMProviderConfig"("modelName");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityPlaybook_opportunityCardId_key" ON "OpportunityPlaybook"("opportunityCardId");
