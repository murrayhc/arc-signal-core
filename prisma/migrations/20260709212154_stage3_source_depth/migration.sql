-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Source" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "accessMethod" TEXT NOT NULL,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "collectorStatus" TEXT NOT NULL DEFAULT 'UNSUPPORTED',
    "independenceGroup" TEXT,
    "scanIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "nextScanAt" DATETIME,
    "httpEtag" TEXT,
    "httpLastModified" TEXT,
    "lastRunStatus" TEXT,
    "lastRunAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Source" ("accessMethod", "category", "collectorStatus", "createdAt", "id", "independenceGroup", "isActive", "isFixture", "lastRunAt", "lastRunStatus", "name", "notes", "updatedAt", "url") SELECT "accessMethod", "category", "collectorStatus", "createdAt", "id", "independenceGroup", "isActive", "isFixture", "lastRunAt", "lastRunStatus", "name", "notes", "updatedAt", "url" FROM "Source";
DROP TABLE "Source";
ALTER TABLE "new_Source" RENAME TO "Source";
CREATE UNIQUE INDEX "Source_name_key" ON "Source"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
