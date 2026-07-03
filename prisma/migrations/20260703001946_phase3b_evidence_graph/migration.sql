-- CreateTable
CREATE TABLE "GraphNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeType" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "confidence" REAL NOT NULL DEFAULT 0,
    "riskScore" REAL NOT NULL DEFAULT 0,
    "opportunityScore" REAL NOT NULL DEFAULT 0,
    "impactScore" REAL NOT NULL DEFAULT 0,
    "freshnessScore" REAL NOT NULL DEFAULT 0,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GraphEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,
    "edgeType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 0.5,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "evidenceCount" INTEGER NOT NULL DEFAULT 1,
    "metadataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GraphEdge_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GraphEdge_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceArc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rootNodeId" TEXT NOT NULL,
    "rootEventCandidateId" TEXT,
    "rootClaimId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "maxDegrees" INTEGER NOT NULL DEFAULT 6,
    "truePotentialScore" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "originStrength" REAL NOT NULL,
    "sourceDiversity" REAL NOT NULL,
    "contradictionScore" REAL NOT NULL,
    "momentumScore" REAL NOT NULL,
    "chainClass" TEXT NOT NULL,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EvidenceArcStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "evidenceArcId" TEXT NOT NULL,
    "degree" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "relationshipType" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "pathWeight" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceArcStep_evidenceArcId_fkey" FOREIGN KEY ("evidenceArcId") REFERENCES "EvidenceArc" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EvidenceArcStep_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GraphNode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GraphNode_refType_refId_key" ON "GraphNode"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphEdge_sourceNodeId_targetNodeId_edgeType_key" ON "GraphEdge"("sourceNodeId", "targetNodeId", "edgeType");
