# Archlight Radar Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Archlight autonomous public intelligence radar spine: a scan pipeline (collect → parse → claims → signals → clusters → events → risk/opportunity → feed) that a dashboard Run-scan button triggers, producing detected events visible at `/` and interrogable at `/events/[id]` — with an automated end-to-end proof.

**Architecture:** Single Next.js 15 App Router app. The pipeline is plain TypeScript under `src/server/pipeline/` (no Next imports) orchestrated by `runFullScan()`, run inline by `POST /api/scans/run`. Prisma + SQLite for storage. Deterministic rule-based intelligence (no LLM). Two bundled fixture sources guarantee an offline proof; one real RSS source (BBC Business) exercises live collection.

**Tech Stack:** Next.js ^15.5, React ^19, TypeScript ^5, Prisma ^6 (SQLite), Zod ^3, fast-xml-parser ^4, Vitest ^3, Tailwind CSS ^4, tsx.

**Spec:** `docs/superpowers/specs/2026-07-02-archlight-radar-spine-design.md` — read it first.

## Global Constraints

- Working directory for ALL commands: `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight` (already a git repo on `main`).
- Events are first-class: `EventCandidate.primaryEntityId` is nullable BY DESIGN; nothing may require an entity or company selection.
- Fixture/synthetic data must carry `isFixture: true` end-to-end and be visibly badged "FIXTURE" in every UI surface. Never mix unlabelled.
- No arbitrary URL fetching: collectors only read configured Source rows; the fixture collector must refuse paths outside `fixtures/`.
- Every score must be explainable: clusters, signals, and events carry plain-language `explanation`/`summary` strings composed from the actual numbers.
- No financial advice framing anywhere in copy; outputs are "strategic intelligence".
- SQLite has no enums: enum-like fields are `String` validated against const arrays in `src/shared/enums.ts` (Zod at API boundaries).
- JSON payloads in SQLite are stored as `String` columns named `*Json` containing `JSON.stringify` output.
- No external fonts, CDNs, or network assets in the UI. System font stack only.
- Keep every file under 500 lines. Validate input at system boundaries.
- Node 24 / npm 11 are installed. Never commit `.env`, `node_modules`, `.next`, or `*.db`.
- Commit after every task with the message given in the task. Tests must pass before each commit (`npm test`).

---

### Task 1: Project scaffold and toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env`, `.env.example`, `vitest.config.ts`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (placeholder, replaced in Task 14)
- Create: `tests/smoke.test.ts`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test`, `typecheck`, `db:migrate`, `db:seed`; path alias `@/*` → `src/*` (Next AND Vitest); Vitest configured with `tests/global-setup.ts` + `tests/setup.ts` (created in Task 2 — referenced but optional-guarded until then: see vitest config note below).

- [ ] **Step 1: Write config files**

`package.json`:
```json
{
  "name": "archlight",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.10.0",
    "fast-xml-parser": "^4.5.0",
    "next": "^15.5.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.0",
    "@types/node": "^24.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "prisma": "^6.10.0",
    "tailwindcss": "^4.1.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

`postcss.config.mjs`:
```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

`.gitignore`:
```
node_modules/
.next/
*.db
*.db-journal
.env
.DS_Store
*.tsbuildinfo
```

`.env` AND `.env.example` (identical content — local SQLite path, no secrets; `.env` stays untracked):
```
DATABASE_URL="file:./dev.db"
```

`vitest.config.ts`:
```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/setup.ts'],
  },
})
```

NOTE: `tests/global-setup.ts` and `tests/setup.ts` don't exist until Task 2. Create them NOW as minimal stubs so Task 1's smoke test runs:

`tests/global-setup.ts` (stub, replaced in Task 2):
```ts
export default function globalSetup() {
  // Task 2 replaces this with Prisma test-database provisioning.
}
```

`tests/setup.ts` (stub, replaced in Task 2):
```ts
// Task 2 replaces this with DATABASE_URL wiring for the test database.
```

- [ ] **Step 2: Write app shell**

`src/app/globals.css`:
```css
@import 'tailwindcss';
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Archlight — Public Intelligence Radar',
  description:
    'Autonomous public intelligence radar: scans configured public sources and surfaces detected risk and opportunity events.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</body>
    </html>
  )
}
```

`src/app/page.tsx` (placeholder — Task 14 replaces it):
```tsx
export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-2xl font-semibold">Archlight</h1>
      <p className="mt-2 text-slate-400">Live Intelligence Dashboard — under construction (Task 14).</p>
    </main>
  )
}
```

`tests/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 3: Install and verify**

Run: `npm install`
Expected: completes without errors (warnings acceptable).

Run: `npm test`
Expected: `1 passed` (smoke test).

Run: `npm run build`
Expected: `✓ Compiled successfully`, route `/` listed. (This also generates `next-env.d.ts` — commit it.)

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js 15 + TypeScript + Tailwind + Vitest toolchain"
```

---

### Task 2: Shared enums, Prisma schema, migration, test-database plumbing

**Files:**
- Create: `src/shared/enums.ts`, `src/server/db.ts`
- Create: `prisma/schema.prisma` (then `npx prisma migrate dev --name init` generates `prisma/migrations/`)
- Replace: `tests/global-setup.ts`, `tests/setup.ts` (stubs from Task 1)
- Create: `tests/helpers.ts`, `tests/factories.ts`
- Test: `tests/schema.test.ts`

**Interfaces:**
- Produces: `prisma` singleton from `@/server/db`; const arrays + types from `@/shared/enums` (`CLAIM_TYPES`, `SIGNAL_TYPES`, `DIRECTIONS`, `EVENT_CLASSES`, `EVENT_STATUSES`, `FEED_TYPES`, `ACCESS_METHODS`, `COLLECTOR_STATUSES`, `SCAN_STATUSES`, `PARSE_STATUSES` and matching `type X = ...`); `resetDb()` from `tests/helpers`; `makeSource(overrides?)`, `makeDocument(sourceId, overrides?)`, `makeParsedDocument(documentId, overrides?)`, `makeClaim(documentId, overrides?)`, `makeSignal(claimId, documentId, sourceId, overrides?)` from `tests/factories` — each returns the created Prisma row.
- All later tasks consume these. Model/field names below are authoritative.

- [ ] **Step 1: Write shared enums**

`src/shared/enums.ts`:
```ts
export const ACCESS_METHODS = ['RSS', 'FIXTURE', 'UNSUPPORTED'] as const
export type AccessMethod = (typeof ACCESS_METHODS)[number]

export const COLLECTOR_STATUSES = ['FUNCTIONAL', 'PLACEHOLDER', 'UNSUPPORTED'] as const
export type CollectorStatus = (typeof COLLECTOR_STATUSES)[number]

export const SCAN_STATUSES = ['RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'] as const
export type ScanStatus = (typeof SCAN_STATUSES)[number]

export const PARSE_STATUSES = ['PARSED', 'UNSUPPORTED', 'ERROR'] as const
export type ParseStatus = (typeof PARSE_STATUSES)[number]

export const CLAIM_TYPES = [
  'EXECUTIVE_CHANGE',
  'HIRING_CHANGE',
  'FINANCIAL_RESULT',
  'LAYOFF_MENTION',
  'FUNDING_MENTION',
  'PRODUCT_LAUNCH',
  'PRODUCT_FAILURE',
  'LEGAL_EVENT',
  'REGULATORY_EVENT',
  'SUPPLY_CHAIN_EVENT',
  'MACRO_EVENT',
  'SENTIMENT_EVENT',
  'PROCUREMENT_EVENT',
  'MARKET_DEMAND_EVENT',
  'UNKNOWN',
] as const
export type ClaimType = (typeof CLAIM_TYPES)[number]

export const SIGNAL_TYPES = [
  'HIRING_ACCELERATION',
  'HIRING_SLOWDOWN',
  'EXECUTIVE_EXIT',
  'EXECUTIVE_HIRE',
  'LAYOFF_SIGNAL',
  'FUNDING_SIGNAL',
  'CASH_PRESSURE',
  'LEGAL_PRESSURE',
  'CUSTOMER_COMPLAINT_SPIKE',
  'PRODUCT_MOMENTUM',
  'PRODUCT_DECAY',
  'MACRO_PRESSURE',
  'SECTOR_PRESSURE',
  'SUPPLY_CHAIN_PRESSURE',
  'REGULATORY_PRESSURE',
  'PROCUREMENT_INCREASE',
  'DEMAND_SPIKE',
  'TALENT_MARKET_SHIFT',
  'UNKNOWN',
] as const
export type SignalType = (typeof SIGNAL_TYPES)[number]

export const DIRECTIONS = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED', 'UNKNOWN'] as const
export type Direction = (typeof DIRECTIONS)[number]

export const EVENT_CLASSES = ['RISK', 'OPPORTUNITY', 'MIXED', 'WATCH', 'UNKNOWN'] as const
export type EventClass = (typeof EVENT_CLASSES)[number]

export const EVENT_STATUSES = [
  'NEW',
  'RISING',
  'STABLE',
  'DECLINING',
  'CONFIRMED',
  'DISMISSED',
  'ESCALATED',
  'NEEDS_REVIEW',
] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const FEED_TYPES = ['RISK_RADAR', 'OPPORTUNITY_RADAR', 'INBOX', 'WATCHLIST'] as const
export type FeedType = (typeof FEED_TYPES)[number]
```

- [ ] **Step 2: Write the Prisma schema**

`prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Source {
  id              String     @id @default(cuid())
  name            String     @unique
  category        String
  accessMethod    String
  url             String?
  isActive        Boolean    @default(true)
  isFixture       Boolean    @default(false)
  collectorStatus String     @default("UNSUPPORTED")
  lastRunStatus   String?
  lastRunAt       DateTime?
  notes           String?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  documents       Document[]
  signals         Signal[]
}

model Entity {
  id           String                 @id @default(cuid())
  name         String                 @unique
  entityType   String                 @default("ORGANISATION")
  sector       String?
  region       String?
  createdAt    DateTime               @default(now())
  updatedAt    DateTime               @updatedAt
  claims       Claim[]
  signals      Signal[]
  clusterLinks SignalClusterEntity[]
  eventLinks   EventCandidateEntity[]
  primaryFor   EventCandidate[]       @relation("PrimaryEntity")
}

model Document {
  id                    String          @id @default(cuid())
  sourceId              String
  source                Source          @relation(fields: [sourceId], references: [id])
  url                   String
  title                 String
  rawContent            String
  rawContentHash        String
  normalisedContentHash String
  fetchedAt             DateTime        @default(now())
  publishedAt           DateTime?
  documentType          String
  language              String          @default("en")
  isFixture             Boolean         @default(false)
  metadataJson          String          @default("{}")
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt
  parsedDocument        ParsedDocument?
  claims                Claim[]
  signals               Signal[]

  @@unique([sourceId, rawContentHash])
}

model ParsedDocument {
  id                     String    @id @default(cuid())
  documentId             String    @unique
  document               Document  @relation(fields: [documentId], references: [id])
  title                  String
  bodyText               String
  publishedAt            DateTime?
  authorsJson            String    @default("[]")
  language               String    @default("en")
  linksJson              String    @default("[]")
  entitiesMentionedJson  String    @default("[]")
  parserName             String
  parserConfidence       Float
  status                 String    @default("PARSED")
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
}

model Claim {
  id                   String    @id @default(cuid())
  documentId           String
  document             Document  @relation(fields: [documentId], references: [id])
  entityId             String?
  entity               Entity?   @relation(fields: [entityId], references: [id])
  claimType            String
  claimText            String
  claimDate            DateTime?
  extractedValue       String?
  unit                 String?
  sector               String?
  region               String?
  extractionMethod     String
  extractionConfidence Float
  credibilityScore     Float
  needsReview          Boolean   @default(false)
  isFixture            Boolean   @default(false)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  signal               Signal?
}

model Signal {
  id           String                @id @default(cuid())
  claimId      String                @unique
  claim        Claim                 @relation(fields: [claimId], references: [id])
  documentId   String
  document     Document              @relation(fields: [documentId], references: [id])
  sourceId     String
  source       Source                @relation(fields: [sourceId], references: [id])
  entityId     String?
  entity       Entity?               @relation(fields: [entityId], references: [id])
  signalType   String
  signalValue  String?
  signalDate   DateTime
  confidence   Float
  strength     Float
  direction    String
  timeWindow   String?
  explanation  String
  sector       String?
  region       String?
  isFixture    Boolean               @default(false)
  createdAt    DateTime              @default(now())
  updatedAt    DateTime              @updatedAt
  clusterLinks SignalClusterSignal[]
}

model SignalCluster {
  id               String                @id @default(cuid())
  title            String
  clusterType      String
  sector           String?
  region           String?
  strength         Float
  confidence       Float
  novelty          Float
  explanation      String
  isFixture        Boolean               @default(false)
  eventCandidateId String?
  eventCandidate   EventCandidate?       @relation(fields: [eventCandidateId], references: [id])
  createdAt        DateTime              @default(now())
  updatedAt        DateTime              @updatedAt
  signals          SignalClusterSignal[]
  entities         SignalClusterEntity[]
}

model SignalClusterSignal {
  id        String        @id @default(cuid())
  clusterId String
  cluster   SignalCluster @relation(fields: [clusterId], references: [id])
  signalId  String
  signal    Signal        @relation(fields: [signalId], references: [id])

  @@unique([clusterId, signalId])
}

model SignalClusterEntity {
  id        String        @id @default(cuid())
  clusterId String
  cluster   SignalCluster @relation(fields: [clusterId], references: [id])
  entityId  String
  entity    Entity        @relation(fields: [entityId], references: [id])

  @@unique([clusterId, entityId])
}

model EventCandidate {
  id                   String                 @id @default(cuid())
  title                String
  eventType            String
  eventClass           String
  summary              String
  status               String                 @default("NEW")
  severity             Float
  probability          Float
  confidence           Float
  timeWindowStart      DateTime?
  timeWindowEnd        DateTime?
  firstDetectedAt      DateTime               @default(now())
  lastUpdatedAt        DateTime               @updatedAt
  primaryEntityId      String?
  primaryEntity        Entity?                @relation("PrimaryEntity", fields: [primaryEntityId], references: [id])
  affectedSector       String?
  affectedRegion       String?
  evidenceCount        Int
  sourceDiversityScore Float
  signalStrength       Float
  noveltyScore         Float
  opportunityScore     Float
  riskScore            Float
  createdFromScanRunId String
  createdFromScanRun   ScanRun                @relation(fields: [createdFromScanRunId], references: [id])
  isFixture            Boolean                @default(false)
  createdAt            DateTime               @default(now())
  clusters             SignalCluster[]
  riskOpportunities    RiskOpportunity[]
  feedItems            DashboardFeedItem[]
  dataGaps             DataGap[]
  triggerConditions    TriggerCondition[]
  entities             EventCandidateEntity[]
}

model EventCandidateEntity {
  id               String         @id @default(cuid())
  eventCandidateId String
  eventCandidate   EventCandidate @relation(fields: [eventCandidateId], references: [id])
  entityId         String
  entity           Entity         @relation(fields: [entityId], references: [id])

  @@unique([eventCandidateId, entityId])
}

model RiskOpportunity {
  id               String         @id @default(cuid())
  eventCandidateId String
  eventCandidate   EventCandidate @relation(fields: [eventCandidateId], references: [id])
  type             String
  title            String
  explanation      String
  riskLogic        String
  opportunityLogic String
  questionsJson    String         @default("[]")
  confidence       Float
  createdAt        DateTime       @default(now())
}

model DashboardFeedItem {
  id               String         @id @default(cuid())
  eventCandidateId String
  eventCandidate   EventCandidate @relation(fields: [eventCandidateId], references: [id])
  feedType         String
  priority         Int
  title            String
  summary          String
  status           String         @default("NEW")
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
}

model ScanRun {
  id                        String           @id @default(cuid())
  scanType                  String           @default("FULL")
  status                    String           @default("RUNNING")
  startedAt                 DateTime         @default(now())
  completedAt               DateTime?
  sourcesScanned            Int              @default(0)
  sourcesSkipped            Int              @default(0)
  documentsFetched          Int              @default(0)
  claimsExtracted           Int              @default(0)
  signalsCreated            Int              @default(0)
  clustersCreated           Int              @default(0)
  eventCandidatesCreated    Int              @default(0)
  dashboardFeedItemsCreated Int              @default(0)
  errorsJson                String           @default("[]")
  createdAt                 DateTime         @default(now())
  updatedAt                 DateTime         @updatedAt
  events                    EventCandidate[]
}

model DataGap {
  id                      String         @id @default(cuid())
  eventCandidateId        String
  eventCandidate          EventCandidate @relation(fields: [eventCandidateId], references: [id])
  title                   String
  description             String
  impactOnConfidence      Float
  suggestedSourceCategory String
  severity                String
  createdAt               DateTime       @default(now())
}

model TriggerCondition {
  id                String         @id @default(cuid())
  eventCandidateId  String
  eventCandidate    EventCandidate @relation(fields: [eventCandidateId], references: [id])
  signalType        String
  conditionText     String
  direction         String
  probabilityImpact Float
  priority          Int
  resolvedAt        DateTime?
  createdAt         DateTime       @default(now())
}
```

- [ ] **Step 3: Apply the migration and generate the client**

Run: `npx prisma migrate dev --name init`
Expected: `Your database is now in sync with your schema`, migration folder `prisma/migrations/<timestamp>_init/` created, client generated. Creates `prisma/dev.db` (gitignored).

Verify tables exist:
Run: `sqlite3 prisma/dev.db ".tables"`
Expected output includes: `Claim`, `DashboardFeedItem`, `DataGap`, `Document`, `Entity`, `EventCandidate`, `EventCandidateEntity`, `ParsedDocument`, `RiskOpportunity`, `ScanRun`, `Signal`, `SignalCluster`, `SignalClusterEntity`, `SignalClusterSignal`, `Source`, `TriggerCondition`.

- [ ] **Step 4: Write db client and test plumbing**

`src/server/db.ts`:
```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

`tests/global-setup.ts` (replaces stub):
```ts
import { execSync } from 'node:child_process'
import path from 'node:path'

export default function globalSetup() {
  const url = 'file:' + path.resolve(process.cwd(), 'prisma', 'test.db')
  execSync('npx prisma db push --force-reset --skip-generate', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}
```

`tests/setup.ts` (replaces stub):
```ts
import path from 'node:path'

process.env.DATABASE_URL = 'file:' + path.resolve(process.cwd(), 'prisma', 'test.db')
```

`tests/helpers.ts`:
```ts
import { prisma } from '@/server/db'

/** Delete all rows in FK-safe order. Call in beforeEach of DB-touching suites. */
export async function resetDb() {
  await prisma.$transaction([
    prisma.dashboardFeedItem.deleteMany(),
    prisma.triggerCondition.deleteMany(),
    prisma.dataGap.deleteMany(),
    prisma.riskOpportunity.deleteMany(),
    prisma.signalClusterSignal.deleteMany(),
    prisma.signalClusterEntity.deleteMany(),
    prisma.eventCandidateEntity.deleteMany(),
    prisma.signalCluster.deleteMany(),
    prisma.eventCandidate.deleteMany(),
    prisma.signal.deleteMany(),
    prisma.claim.deleteMany(),
    prisma.parsedDocument.deleteMany(),
    prisma.document.deleteMany(),
    prisma.scanRun.deleteMany(),
    prisma.entity.deleteMany(),
    prisma.source.deleteMany(),
  ])
}
```

`tests/factories.ts`:
```ts
import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'
import type { Prisma } from '@prisma/client'

export async function makeSource(overrides: Partial<Prisma.SourceUncheckedCreateInput> = {}) {
  return prisma.source.create({
    data: {
      name: `Test Source ${randomUUID()}`,
      category: 'NEWS',
      accessMethod: 'FIXTURE',
      url: 'fixtures/fixture-feed-a.json',
      isFixture: true,
      collectorStatus: 'FUNCTIONAL',
      ...overrides,
    },
  })
}

export async function makeDocument(
  sourceId: string,
  overrides: Partial<Prisma.DocumentUncheckedCreateInput> = {},
) {
  const content = (overrides.rawContent as string) ?? `Test document body ${randomUUID()}`
  return prisma.document.create({
    data: {
      sourceId,
      url: `https://fixture.archlight.local/${randomUUID()}`,
      title: 'Test document',
      rawContent: content,
      rawContentHash: createHash('sha256').update(content).digest('hex'),
      normalisedContentHash: createHash('sha256')
        .update(content.toLowerCase().replace(/\s+/g, ' ').trim())
        .digest('hex'),
      documentType: 'FIXTURE_ITEM',
      isFixture: true,
      ...overrides,
    },
  })
}

export async function makeParsedDocument(
  documentId: string,
  overrides: Partial<Prisma.ParsedDocumentUncheckedCreateInput> = {},
) {
  return prisma.parsedDocument.create({
    data: {
      documentId,
      title: 'Test document',
      bodyText: 'Test body text.',
      parserName: 'test',
      parserConfidence: 0.9,
      ...overrides,
    },
  })
}

export async function makeClaim(
  documentId: string,
  overrides: Partial<Prisma.ClaimUncheckedCreateInput> = {},
) {
  return prisma.claim.create({
    data: {
      documentId,
      claimType: 'LAYOFF_MENTION',
      claimText: 'Test claim: the company is cutting 100 jobs.',
      claimDate: new Date('2026-06-28T09:00:00Z'),
      extractionMethod: 'rule:v1:LAYOFF_MENTION',
      extractionConfidence: 0.8,
      credibilityScore: 0.7,
      isFixture: true,
      ...overrides,
    },
  })
}

export async function makeSignal(
  claimId: string,
  documentId: string,
  sourceId: string,
  overrides: Partial<Prisma.SignalUncheckedCreateInput> = {},
) {
  return prisma.signal.create({
    data: {
      claimId,
      documentId,
      sourceId,
      signalType: 'LAYOFF_SIGNAL',
      signalDate: new Date('2026-06-28T09:00:00Z'),
      confidence: 0.8,
      strength: 0.7,
      direction: 'NEGATIVE',
      explanation: 'Test signal from LAYOFF_MENTION claim.',
      isFixture: true,
      ...overrides,
    },
  })
}
```

- [ ] **Step 5: Write the failing schema/relationship test**

`tests/schema.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from './helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from './factories'

describe('event discovery data layer', () => {
  beforeEach(resetDb)

  it('creates the full evidence chain: source → document → claim → signal → cluster → event', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    const signal = await makeSignal(claim.id, doc.id, source.id)

    const scanRun = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)',
        eventType: 'LAYOFF_SIGNAL',
        eventClass: 'RISK',
        summary: 'Test event',
        severity: 0.8,
        probability: 0.7,
        confidence: 0.8,
        evidenceCount: 1,
        sourceDiversityScore: 1,
        signalStrength: 0.7,
        noveltyScore: 0.9,
        opportunityScore: 0.2,
        riskScore: 0.7,
        createdFromScanRunId: scanRun.id,
        isFixture: true,
      },
    })
    const cluster = await prisma.signalCluster.create({
      data: {
        title: 'Layoff signals — technology (UK)',
        clusterType: 'LAYOFF_SIGNAL',
        strength: 0.7,
        confidence: 0.8,
        novelty: 0.9,
        explanation: 'Test cluster',
        isFixture: true,
        eventCandidateId: event.id,
        signals: { create: [{ signalId: signal.id }] },
      },
    })

    const loaded = await prisma.eventCandidate.findUniqueOrThrow({
      where: { id: event.id },
      include: {
        clusters: { include: { signals: { include: { signal: { include: { claim: true, document: { include: { source: true } } } } } } } },
      },
    })
    expect(loaded.primaryEntityId).toBeNull()
    expect(loaded.clusters).toHaveLength(1)
    expect(loaded.clusters[0].id).toBe(cluster.id)
    const chainSignal = loaded.clusters[0].signals[0].signal
    expect(chainSignal.claim.id).toBe(claim.id)
    expect(chainSignal.document.source.id).toBe(source.id)
  })

  it('enforces document dedupe on (sourceId, rawContentHash)', async () => {
    const source = await makeSource()
    await makeDocument(source.id, { rawContent: 'same content', rawContentHash: 'HASH1' })
    await expect(
      makeDocument(source.id, { rawContent: 'same content', rawContentHash: 'HASH1' }),
    ).rejects.toThrow()
  })

  it('enforces one signal per claim', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    await makeSignal(claim.id, doc.id, source.id)
    await expect(makeSignal(claim.id, doc.id, source.id)).rejects.toThrow()
  })
})
```

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: global setup pushes schema to `prisma/test.db`; all tests pass (smoke + 3 schema tests).

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: event discovery data layer — Prisma schema, migration, enums, test plumbing"
```

---

### Task 3: Fixture corpora and source seeding

**Files:**
- Create: `fixtures/fixture-feed-a.json`, `fixtures/fixture-feed-b.json`
- Create: `src/server/seed.ts`, `prisma/seed.ts`
- Test: `tests/seed.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/server/db`.
- Produces: `runSeed(options?: { includeLive?: boolean }): Promise<{ sourcesSeeded: number }>` from `@/server/seed` — upserts sources idempotently. Fixture corpus JSON shape: `{ "items": [{ "id": string, "url": string, "title": string, "content": string, "publishedAt": string }] }` (consumed by Task 4's fixture collector).

The corpora are engineered so a full scan deterministically produces: a 2-source LAYOFF risk cluster, a 2-source PROCUREMENT opportunity cluster, a 2-source REGULATORY risk cluster, a 1-source DEMAND watch item, and one no-claim document. All content is fictional (fictional companies) and flows through `isFixture: true`.

- [ ] **Step 1: Write fixture corpora**

`fixtures/fixture-feed-a.json`:
```json
{
  "items": [
    {
      "id": "a-1",
      "url": "https://fixture.archlight.local/a/1",
      "title": "Meridian Grid Systems announces 400 job cuts at Manchester plant",
      "content": "Meridian Grid Systems, a UK technology manufacturer, confirmed it is cutting 400 jobs at its Manchester site. The redundancies follow a slowdown in equipment orders. Union representatives said the layoffs would begin in August.",
      "publishedAt": "2026-06-28T09:00:00Z"
    },
    {
      "id": "a-2",
      "url": "https://fixture.archlight.local/a/2",
      "title": "Northern council opens £45m road maintenance tender",
      "content": "A northern UK council has launched a £45m procurement exercise for a four-year road maintenance framework agreement. The tender is open to regional contractors until September. Officials described the public contract as the largest highways award this cycle.",
      "publishedAt": "2026-06-29T08:30:00Z"
    },
    {
      "id": "a-3",
      "url": "https://fixture.archlight.local/a/3",
      "title": "Regulator opens investigation into retail payment fees",
      "content": "The UK payments watchdog has opened an investigation into card processing fees charged to retail merchants. The regulator said new rules could follow if the investigation finds harm to retail businesses.",
      "publishedAt": "2026-06-30T11:15:00Z"
    },
    {
      "id": "a-4",
      "url": "https://fixture.archlight.local/a/4",
      "title": "Solar component demand surge continues across Europe",
      "content": "Distributors report a demand surge for solar inverters and storage components across the EU energy market, with record orders logged in June for the third consecutive month.",
      "publishedAt": "2026-06-30T14:00:00Z"
    },
    {
      "id": "a-5",
      "url": "https://fixture.archlight.local/a/5",
      "title": "Coastal towns prepare for summer festival season",
      "content": "Seaside communities are preparing decorations and street events ahead of the summer festival season, with organisers hoping for fine weather.",
      "publishedAt": "2026-07-01T07:45:00Z"
    }
  ]
}
```

`fixtures/fixture-feed-b.json`:
```json
{
  "items": [
    {
      "id": "b-1",
      "url": "https://fixture.archlight.local/b/1",
      "title": "Meridian Grid Systems to shed hundreds of roles as orders slow",
      "content": "Technology supplier Meridian Grid Systems will reduce its UK workforce by around 400 roles, citing weaker demand. The job cuts affect the Manchester operation and mark the sector's largest workforce reduction this quarter.",
      "publishedAt": "2026-06-28T13:20:00Z"
    },
    {
      "id": "b-2",
      "url": "https://fixture.archlight.local/b/2",
      "title": "Second UK council launches £30m highways tender",
      "content": "Another UK local authority has issued a £30m tender for highways maintenance, the second major public contract in the region this week. Procurement advisers say framework agreement activity is accelerating.",
      "publishedAt": "2026-06-29T16:05:00Z"
    },
    {
      "id": "b-3",
      "url": "https://fixture.archlight.local/b/3",
      "title": "Retail payments probe widens to online checkout providers",
      "content": "The UK regulator investigating retail payment fees has widened its inquiry to online checkout providers, and signalled that compliance obligations for the UK retail payments sector may tighten.",
      "publishedAt": "2026-07-01T09:40:00Z"
    }
  ]
}
```

- [ ] **Step 2: Write the failing seed test**

`tests/seed.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { resetDb } from './helpers'

describe('runSeed', () => {
  beforeEach(resetDb)

  it('seeds fixture sources, an unsupported source, and (optionally) the live RSS source', async () => {
    const result = await runSeed({ includeLive: false })
    expect(result.sourcesSeeded).toBe(3)

    const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } })
    expect(sources.map((s) => s.name)).toEqual([
      'Companies House Filings',
      'Fixture Wire A',
      'Fixture Wire B',
    ])
    const fixtureA = sources.find((s) => s.name === 'Fixture Wire A')!
    expect(fixtureA.isFixture).toBe(true)
    expect(fixtureA.accessMethod).toBe('FIXTURE')
    expect(fixtureA.collectorStatus).toBe('FUNCTIONAL')

    const unsupported = sources.find((s) => s.name === 'Companies House Filings')!
    expect(unsupported.accessMethod).toBe('UNSUPPORTED')
    expect(unsupported.collectorStatus).toBe('UNSUPPORTED')
    expect(unsupported.isActive).toBe(true)
  })

  it('includes the live BBC RSS source when includeLive is true and is idempotent', async () => {
    await runSeed({ includeLive: true })
    await runSeed({ includeLive: true })
    const sources = await prisma.source.findMany()
    expect(sources).toHaveLength(4)
    const bbc = sources.find((s) => s.name === 'BBC News Business')!
    expect(bbc.accessMethod).toBe('RSS')
    expect(bbc.isFixture).toBe(false)
    expect(bbc.url).toBe('https://feeds.bbci.co.uk/news/business/rss.xml')
  })
})
```

Run: `npm test`
Expected: FAIL — `Cannot find module '@/server/seed'`.

- [ ] **Step 3: Implement the seed**

`src/server/seed.ts`:
```ts
import { prisma } from '@/server/db'

type SeedSource = {
  name: string
  category: string
  accessMethod: string
  url: string | null
  isFixture: boolean
  collectorStatus: string
  notes: string | null
}

const FIXTURE_SOURCES: SeedSource[] = [
  {
    name: 'Fixture Wire A',
    category: 'NEWS',
    accessMethod: 'FIXTURE',
    url: 'fixtures/fixture-feed-a.json',
    isFixture: true,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Bundled synthetic corpus — clearly labelled fixture data, never live evidence.',
  },
  {
    name: 'Fixture Wire B',
    category: 'NEWS',
    accessMethod: 'FIXTURE',
    url: 'fixtures/fixture-feed-b.json',
    isFixture: true,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Second bundled synthetic corpus for source-diversity testing.',
  },
  {
    name: 'Companies House Filings',
    category: 'OFFICIAL',
    accessMethod: 'UNSUPPORTED',
    url: null,
    isFixture: false,
    collectorStatus: 'UNSUPPORTED',
    notes: 'No compatible collector yet — scans must skip this source and record the reason.',
  },
]

const LIVE_SOURCES: SeedSource[] = [
  {
    name: 'BBC News Business',
    category: 'NEWS',
    accessMethod: 'RSS',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Live public RSS feed. Failures are recorded on the ScanRun, never fatal.',
  },
]

export async function runSeed(options: { includeLive?: boolean } = {}) {
  const includeLive = options.includeLive ?? true
  const sources = includeLive ? [...FIXTURE_SOURCES, ...LIVE_SOURCES] : FIXTURE_SOURCES
  for (const s of sources) {
    await prisma.source.upsert({
      where: { name: s.name },
      create: s,
      update: {
        category: s.category,
        accessMethod: s.accessMethod,
        url: s.url,
        isFixture: s.isFixture,
        collectorStatus: s.collectorStatus,
        notes: s.notes,
      },
    })
  }
  return { sourcesSeeded: sources.length }
}
```

`prisma/seed.ts`:
```ts
import { prisma } from '../src/server/db'
import { runSeed } from '../src/server/seed'

runSeed()
  .then((r) => {
    console.log(`Seeded ${r.sourcesSeeded} sources.`)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

- [ ] **Step 4: Run tests, then seed the dev database**

Run: `npm test`
Expected: PASS (all suites).

Run: `npm run db:seed`
Expected: `Seeded 4 sources.`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: fixture corpora and idempotent source seeding (2 fixture wires, 1 unsupported, BBC RSS)"
```

---

### Task 4: Collectors and the collection stage

**Files:**
- Create: `src/server/pipeline/types.ts`, `src/server/pipeline/collectors/fixture.ts`, `src/server/pipeline/collectors/rss.ts`, `src/server/pipeline/collectors/registry.ts`, `src/server/pipeline/collect.ts`
- Test: `tests/pipeline/collect.test.ts`, `tests/pipeline/rss-parser.test.ts`

**Interfaces:**
- Consumes: `prisma`, factories, `runSeed`.
- Produces:
  - `type RawItem = { url: string; title: string; content: string; publishedAt: Date | null }` and `type PipelineError = { stage: string; sourceId?: string; message: string }` from `@/server/pipeline/types`.
  - `getCollector(accessMethod: string): ((source: Source) => Promise<RawItem[]>) | null` from `.../collectors/registry` (FIXTURE and RSS supported, everything else `null`).
  - `parseRssXml(xml: string): RawItem[]` from `.../collectors/rss` (pure, unit-testable).
  - `collectFromSources(sources: Source[]): Promise<{ documents: Document[]; skipped: { sourceId: string; reason: string }[]; errors: PipelineError[] }>` from `@/server/pipeline/collect` — creates deduped Document rows, updates `Source.lastRunStatus/lastRunAt`, never throws for a single source failure.

- [ ] **Step 1: Write failing tests**

`tests/pipeline/rss-parser.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseRssXml } from '@/server/pipeline/collectors/rss'

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Sample Feed</title>
  <item>
    <title>First headline</title>
    <link>https://example.org/1</link>
    <description>Body &lt;b&gt;one&lt;/b&gt; text.</description>
    <pubDate>Mon, 29 Jun 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Second headline</title>
    <link>https://example.org/2</link>
    <description>Body two.</description>
  </item>
</channel></rss>`

describe('parseRssXml', () => {
  it('maps RSS items to RawItems', () => {
    const items = parseRssXml(SAMPLE_RSS)
    expect(items).toHaveLength(2)
    expect(items[0].url).toBe('https://example.org/1')
    expect(items[0].title).toBe('First headline')
    expect(items[0].content).toContain('First headline')
    expect(items[0].content).toContain('Body')
    expect(items[0].publishedAt?.toISOString()).toBe('2026-06-29T10:00:00.000Z')
    expect(items[1].publishedAt).toBeNull()
  })

  it('returns [] for malformed or non-RSS input', () => {
    expect(parseRssXml('not xml at all')).toEqual([])
    expect(parseRssXml('<html><body>nope</body></html>')).toEqual([])
  })

  it('handles a single-item channel (object, not array)', () => {
    const single = SAMPLE_RSS.replace(/<item>[\s\S]*?<\/item>\s*(?=<item>)/, '')
    expect(parseRssXml(single)).toHaveLength(1)
  })
})
```

`tests/pipeline/collect.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { collectFromSources } from '@/server/pipeline/collect'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { makeSource } from '../factories'

describe('collectFromSources', () => {
  beforeEach(resetDb)

  it('creates documents from a supported fixture source', async () => {
    await runSeed({ includeLive: false })
    const sources = await prisma.source.findMany({ where: { isActive: true } })
    const result = await collectFromSources(sources)

    expect(result.documents.length).toBe(8) // 5 items in feed A + 3 in feed B
    const doc = result.documents[0]
    expect(doc.isFixture).toBe(true)
    expect(doc.rawContentHash).toHaveLength(64)
    const updated = await prisma.source.findFirstOrThrow({ where: { name: 'Fixture Wire A' } })
    expect(updated.lastRunStatus).toBe('SUCCESS')
    expect(updated.lastRunAt).not.toBeNull()
  })

  it('skips duplicate documents on a second collection', async () => {
    await runSeed({ includeLive: false })
    const sources = await prisma.source.findMany({ where: { isActive: true } })
    await collectFromSources(sources)
    const second = await collectFromSources(sources)
    expect(second.documents).toHaveLength(0)
    expect(await prisma.document.count()).toBe(8)
  })

  it('skips unsupported sources with a recorded reason', async () => {
    await runSeed({ includeLive: false })
    const sources = await prisma.source.findMany({ where: { isActive: true } })
    const result = await collectFromSources(sources)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toContain('UNSUPPORTED')
    const skippedSource = await prisma.source.findFirstOrThrow({ where: { name: 'Companies House Filings' } })
    expect(skippedSource.lastRunStatus).toBe('SKIPPED_UNSUPPORTED')
  })

  it('records an error for a failing source without throwing, and continues', async () => {
    await runSeed({ includeLive: false })
    // Unroutable local port → fast deterministic connection failure, no external network.
    await makeSource({
      name: 'Broken RSS',
      accessMethod: 'RSS',
      url: 'http://127.0.0.1:9/nope.xml',
      isFixture: false,
    })
    const sources = await prisma.source.findMany({ where: { isActive: true } })
    const result = await collectFromSources(sources)
    expect(result.documents.length).toBe(8) // fixture docs still collected
    expect(result.errors.some((e) => e.stage === 'collect' && e.message.length > 0)).toBe(true)
    const broken = await prisma.source.findFirstOrThrow({ where: { name: 'Broken RSS' } })
    expect(broken.lastRunStatus).toBe('FAILED')
  })

  it('refuses fixture paths outside fixtures/', async () => {
    const evil = await makeSource({ name: 'Evil Fixture', url: '../.env' })
    const result = await collectFromSources([evil])
    expect(result.documents).toHaveLength(0)
    expect(result.errors[0].message).toContain('outside fixtures')
  })
})
```

Run: `npm test`
Expected: FAIL — modules under `@/server/pipeline/` not found.

- [ ] **Step 2: Implement**

`src/server/pipeline/types.ts`:
```ts
export type RawItem = {
  url: string
  title: string
  content: string
  publishedAt: Date | null
}

export type PipelineError = {
  stage: string
  sourceId?: string
  message: string
}
```

`src/server/pipeline/collectors/fixture.ts`:
```ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Source } from '@prisma/client'
import type { RawItem } from '../types'

type FixtureFile = {
  items: { id: string; url: string; title: string; content: string; publishedAt: string }[]
}

/** Reads a bundled fixture corpus. Refuses any path outside the fixtures/ directory. */
export async function collectFixture(source: Source): Promise<RawItem[]> {
  if (!source.url) throw new Error(`Fixture source ${source.name} has no url`)
  const fixturesRoot = path.resolve(process.cwd(), 'fixtures')
  const resolved = path.resolve(process.cwd(), source.url)
  if (!resolved.startsWith(fixturesRoot + path.sep)) {
    throw new Error(`Fixture path resolves outside fixtures/: ${source.url}`)
  }
  const parsed = JSON.parse(await readFile(resolved, 'utf8')) as FixtureFile
  return parsed.items.map((item) => ({
    url: item.url,
    title: item.title,
    content: `${item.title}\n\n${item.content}`,
    publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
  }))
}
```

`src/server/pipeline/collectors/rss.ts`:
```ts
import { XMLParser } from 'fast-xml-parser'
import type { Source } from '@prisma/client'
import type { RawItem } from '../types'

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text'])
  }
  return ''
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pure RSS-XML → RawItem[] mapping. Returns [] for anything that is not an RSS channel. */
export function parseRssXml(xml: string): RawItem[] {
  let doc: unknown
  try {
    doc = new XMLParser({ ignoreAttributes: false }).parse(xml)
  } catch {
    return []
  }
  const channel = (doc as { rss?: { channel?: { item?: unknown } } })?.rss?.channel
  if (!channel) return []
  const rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : []
  const items: RawItem[] = []
  for (const raw of rawItems as Record<string, unknown>[]) {
    const title = stripHtml(text(raw.title))
    const link = text(raw.link).trim()
    const description = stripHtml(text(raw.description))
    if (!title || !link) continue
    const pubDate = text(raw.pubDate)
    const publishedAt = pubDate ? new Date(pubDate) : null
    items.push({
      url: link,
      title,
      content: `${title}\n\n${description}`,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    })
  }
  return items
}

export async function collectRss(source: Source): Promise<RawItem[]> {
  if (!source.url) throw new Error(`RSS source ${source.name} has no url`)
  const res = await fetch(source.url, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'user-agent': 'ArchlightRadar/0.1 (public intelligence radar)' },
  })
  if (!res.ok) throw new Error(`RSS fetch failed with HTTP ${res.status}`)
  return parseRssXml(await res.text())
}
```

`src/server/pipeline/collectors/registry.ts`:
```ts
import type { Source } from '@prisma/client'
import type { RawItem } from '../types'
import { collectFixture } from './fixture'
import { collectRss } from './rss'

export type Collector = (source: Source) => Promise<RawItem[]>

const COLLECTORS: Record<string, Collector> = {
  FIXTURE: collectFixture,
  RSS: collectRss,
}

/** Returns the collector for an access method, or null when unsupported. */
export function getCollector(accessMethod: string): Collector | null {
  return COLLECTORS[accessMethod] ?? null
}
```

`src/server/pipeline/collect.ts`:
```ts
import { createHash } from 'node:crypto'
import type { Document, Source } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { getCollector } from './collectors/registry'
import type { PipelineError } from './types'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function collectFromSources(sources: Source[]): Promise<{
  documents: Document[]
  skipped: { sourceId: string; reason: string }[]
  errors: PipelineError[]
}> {
  const documents: Document[] = []
  const skipped: { sourceId: string; reason: string }[] = []
  const errors: PipelineError[] = []

  for (const source of sources) {
    const collector = getCollector(source.accessMethod)
    if (!collector) {
      const reason = `No compatible collector for access method ${source.accessMethod} (UNSUPPORTED)`
      skipped.push({ sourceId: source.id, reason })
      await prisma.source.update({
        where: { id: source.id },
        data: { lastRunStatus: 'SKIPPED_UNSUPPORTED', lastRunAt: new Date() },
      })
      continue
    }
    try {
      const items = await collector(source)
      for (const item of items) {
        try {
          const doc = await prisma.document.create({
            data: {
              sourceId: source.id,
              url: item.url,
              title: item.title,
              rawContent: item.content,
              rawContentHash: sha256(item.content),
              normalisedContentHash: sha256(normalise(item.content)),
              publishedAt: item.publishedAt,
              documentType: source.accessMethod === 'FIXTURE' ? 'FIXTURE_ITEM' : 'RSS_ITEM',
              isFixture: source.isFixture,
            },
          })
          documents.push(doc)
        } catch (err) {
          // P2002 = unique violation on (sourceId, rawContentHash): duplicate, skip silently.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue
          throw err
        }
      }
      await prisma.source.update({
        where: { id: source.id },
        data: { lastRunStatus: 'SUCCESS', lastRunAt: new Date() },
      })
    } catch (err) {
      errors.push({
        stage: 'collect',
        sourceId: source.id,
        message: err instanceof Error ? err.message : String(err),
      })
      await prisma.source.update({
        where: { id: source.id },
        data: { lastRunStatus: 'FAILED', lastRunAt: new Date() },
      })
    }
  }
  return { documents, skipped, errors }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS — all suites including 5 collect tests and 3 RSS parser tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: source collectors (fixture + RSS) and deduplicating collection stage"
```

---

### Task 5: Parser stage

**Files:**
- Create: `src/server/pipeline/parse.ts`
- Test: `tests/pipeline/parse.test.ts`

**Interfaces:**
- Consumes: `Document` rows, `PipelineError`.
- Produces: `parseDocuments(documents: Document[]): Promise<{ parsed: ParsedDocument[]; errors: PipelineError[] }>` from `@/server/pipeline/parse`. Supported documentTypes: `FIXTURE_ITEM`, `RSS_ITEM` → status `PARSED`; anything else → a ParsedDocument row with status `UNSUPPORTED` and empty bodyText (recorded, not silently ignored). Entity mentions extracted naively (capitalised multi-word sequences) into `entitiesMentionedJson` for display only.

- [ ] **Step 1: Write failing tests**

`tests/pipeline/parse.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { parseDocuments } from '@/server/pipeline/parse'
import { resetDb } from '../helpers'
import { makeDocument, makeSource } from '../factories'

describe('parseDocuments', () => {
  beforeEach(resetDb)

  it('parses a supported document into normalised body text', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id, {
      rawContent:
        'Meridian Grid Systems cuts jobs\n\nMeridian Grid Systems said it is <b>cutting 400 jobs</b> in Manchester.',
      publishedAt: new Date('2026-06-28T09:00:00Z'),
    })
    const { parsed, errors } = await parseDocuments([doc])
    expect(errors).toHaveLength(0)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].status).toBe('PARSED')
    expect(parsed[0].bodyText).toContain('cutting 400 jobs')
    expect(parsed[0].bodyText).not.toContain('<b>')
    expect(parsed[0].publishedAt?.toISOString()).toBe('2026-06-28T09:00:00.000Z')
    const mentions = JSON.parse(parsed[0].entitiesMentionedJson) as string[]
    expect(mentions).toContain('Meridian Grid Systems')
  })

  it('marks unsupported document types as UNSUPPORTED instead of ignoring them', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id, { documentType: 'PDF' })
    const { parsed, errors } = await parseDocuments([doc])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].status).toBe('UNSUPPORTED')
    expect(errors.some((e) => e.stage === 'parse' && e.message.includes('PDF'))).toBe(true)
  })

  it('does not create a second ParsedDocument for an already-parsed document', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    await parseDocuments([doc])
    const second = await parseDocuments([doc])
    expect(second.parsed).toHaveLength(0)
    expect(await prisma.parsedDocument.count()).toBe(1)
  })
})
```

Run: `npm test`
Expected: FAIL — `Cannot find module '@/server/pipeline/parse'`.

- [ ] **Step 2: Implement**

`src/server/pipeline/parse.ts`:
```ts
import type { Document, ParsedDocument } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from './types'

const SUPPORTED_TYPES = new Set(['FIXTURE_ITEM', 'RSS_ITEM'])

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** Naive display-only mention extraction: capitalised multi-word sequences, top 10 unique. */
function extractMentions(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b/g) ?? []
  return [...new Set(matches)].slice(0, 10)
}

export async function parseDocuments(documents: Document[]): Promise<{
  parsed: ParsedDocument[]
  errors: PipelineError[]
}> {
  const parsed: ParsedDocument[] = []
  const errors: PipelineError[] = []

  for (const doc of documents) {
    try {
      const existing = await prisma.parsedDocument.findUnique({ where: { documentId: doc.id } })
      if (existing) continue

      if (!SUPPORTED_TYPES.has(doc.documentType)) {
        const row = await prisma.parsedDocument.create({
          data: {
            documentId: doc.id,
            title: doc.title,
            bodyText: '',
            parserName: 'none',
            parserConfidence: 0,
            status: 'UNSUPPORTED',
          },
        })
        parsed.push(row)
        errors.push({
          stage: 'parse',
          sourceId: doc.sourceId,
          message: `Document ${doc.id} has unsupported type ${doc.documentType}; marked UNSUPPORTED`,
        })
        continue
      }

      const bodyText = cleanText(doc.rawContent)
      const row = await prisma.parsedDocument.create({
        data: {
          documentId: doc.id,
          title: doc.title,
          bodyText,
          publishedAt: doc.publishedAt,
          entitiesMentionedJson: JSON.stringify(extractMentions(bodyText)),
          parserName: doc.documentType === 'FIXTURE_ITEM' ? 'fixture-text:v1' : 'rss-item:v1',
          parserConfidence: doc.documentType === 'FIXTURE_ITEM' ? 0.9 : 0.8,
          status: 'PARSED',
        },
      })
      parsed.push(row)
    } catch (err) {
      errors.push({
        stage: 'parse',
        sourceId: doc.sourceId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { parsed, errors }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: parser stage — normalised text, mention extraction, unsupported-type recording"
```

---

### Task 6: Claim extraction stage

**Files:**
- Create: `src/server/pipeline/claims.ts`
- Test: `tests/pipeline/claims.test.ts`

**Interfaces:**
- Consumes: `ParsedDocument` rows plus a `Map<string, Document>` (`docsById`) for provenance.
- Produces:
  - `extractClaimsFromText(bodyText: string): ExtractedClaim[]` (pure rule matcher, exported for unit tests) where `type ExtractedClaim = { claimType: ClaimType; claimText: string; extractionConfidence: number; sector: string | null; region: string | null }`.
  - `extractClaims(parsedDocs: ParsedDocument[], docsById: Map<string, Document>): Promise<{ claims: Claim[]; errors: PipelineError[] }>` from `@/server/pipeline/claims`.
  - `detectSector(text: string): string | null`, `detectRegion(text: string): string | null` (exported — Task 8 reuses the vocabulary).
- Rules: sentence-level matching; `extractionConfidence = baseConfidence + 0.1 if the sentence contains a digit (capped 0.9)`; `credibilityScore = 0.7` (constant, rule v1); `needsReview = extractionConfidence < 0.5`; empty bodyText produces zero claims; `claimDate = parsedDoc.publishedAt ?? document.fetchedAt`; `extractionMethod = 'rule:v1:<claimType>'`; `isFixture` copied from the document.

- [ ] **Step 1: Write failing tests**

`tests/pipeline/claims.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { extractClaims, extractClaimsFromText } from '@/server/pipeline/claims'
import { resetDb } from '../helpers'
import { makeDocument, makeParsedDocument, makeSource } from '../factories'

describe('extractClaimsFromText (pure rules)', () => {
  it('detects layoff mentions with sector and region', () => {
    const claims = extractClaimsFromText(
      'Meridian Grid Systems, a UK technology manufacturer, is cutting 400 jobs in Manchester.',
    )
    const layoff = claims.find((c) => c.claimType === 'LAYOFF_MENTION')
    expect(layoff).toBeDefined()
    expect(layoff!.extractionConfidence).toBeCloseTo(0.85, 5) // 0.75 base + 0.1 digit bonus
    expect(layoff!.sector).toBe('technology')
    expect(layoff!.region).toBe('UK')
  })

  it('detects procurement, regulatory and demand claims', () => {
    expect(
      extractClaimsFromText('The council launched a £45m tender for a framework agreement.').some(
        (c) => c.claimType === 'PROCUREMENT_EVENT',
      ),
    ).toBe(true)
    expect(
      extractClaimsFromText('The regulator opened an investigation into payment fees.').some(
        (c) => c.claimType === 'REGULATORY_EVENT',
      ),
    ).toBe(true)
    expect(
      extractClaimsFromText('Distributors report a demand surge with record orders in June.').some(
        (c) => c.claimType === 'MARKET_DEMAND_EVENT',
      ),
    ).toBe(true)
  })

  it('returns no claims for empty or non-matching text', () => {
    expect(extractClaimsFromText('')).toEqual([])
    expect(extractClaimsFromText('Seaside towns prepare decorations for the festival.')).toEqual([])
  })
})

describe('extractClaims (persistence)', () => {
  beforeEach(resetDb)

  it('creates claims linked to their source document with provenance fields', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id, { publishedAt: new Date('2026-06-28T09:00:00Z') })
    const parsed = await makeParsedDocument(doc.id, {
      bodyText: 'The technology firm is cutting 400 jobs in the UK.',
      publishedAt: new Date('2026-06-28T09:00:00Z'),
    })
    const { claims, errors } = await extractClaims([parsed], new Map([[doc.id, doc]]))
    expect(errors).toHaveLength(0)
    expect(claims.length).toBeGreaterThanOrEqual(1)
    expect(claims[0].documentId).toBe(doc.id)
    expect(claims[0].isFixture).toBe(true)
    expect(claims[0].extractionMethod).toMatch(/^rule:v1:/)
    expect(claims[0].claimDate?.toISOString()).toBe('2026-06-28T09:00:00.000Z')
  })

  it('flags low-confidence claims for review', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    // "headcount" alone matches HIRING_CHANGE at base 0.45, no digit bonus → 0.45 < 0.5 → needsReview
    const parsed = await makeParsedDocument(doc.id, {
      bodyText: 'Analysts discussed headcount at the meeting.',
    })
    const { claims } = await extractClaims([parsed], new Map([[doc.id, doc]]))
    expect(claims).toHaveLength(1)
    expect(claims[0].needsReview).toBe(true)
  })

  it('creates no claims from empty parser output', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, { bodyText: '' })
    const { claims } = await extractClaims([parsed], new Map([[doc.id, doc]]))
    expect(claims).toHaveLength(0)
    expect(await prisma.claim.count()).toBe(0)
  })
})
```

Run: `npm test`
Expected: FAIL — `Cannot find module '@/server/pipeline/claims'`.

- [ ] **Step 2: Implement**

`src/server/pipeline/claims.ts`:
```ts
import type { Claim, Document, ParsedDocument } from '@prisma/client'
import { prisma } from '@/server/db'
import type { ClaimType } from '@/shared/enums'
import type { PipelineError } from './types'

type Matcher = { claimType: ClaimType; pattern: RegExp; baseConfidence: number }

/** Rule table v1. Order matters only for readability; every matcher runs per sentence. */
const MATCHERS: Matcher[] = [
  { claimType: 'LAYOFF_MENTION', pattern: /\b(lay[- ]?offs?|redundanc(?:y|ies)|job cuts?|cutting \d+ (?:jobs|roles)|shed(?:ding)? hundreds of roles|workforce reduction|reduce (?:its|the) .{0,20}workforce)\b/i, baseConfidence: 0.75 },
  { claimType: 'FUNDING_MENTION', pattern: /\b(funding round|series [a-d]\b|raise[sd]? [£$€]?\d+|venture capital|investment round)\b/i, baseConfidence: 0.7 },
  { claimType: 'EXECUTIVE_CHANGE', pattern: /\b(chief executive|ceo|cfo|coo|chair(?:man|woman)?)\b.{0,60}\b(resign|step(?:s|ped)? down|depart|appoint|join|exit)/i, baseConfidence: 0.7 },
  { claimType: 'HIRING_CHANGE', pattern: /\b(hiring (?:surge|freeze|spree)|recruitment (?:drive|freeze)|headcount)\b/i, baseConfidence: 0.45 },
  { claimType: 'REGULATORY_EVENT', pattern: /\b(regulator|watchdog|fine[ds]?\b|investigation|inquiry|compliance obligations?|new rules|legislation)\b/i, baseConfidence: 0.6 },
  { claimType: 'PROCUREMENT_EVENT', pattern: /\b(procurement|tender|public contract|framework agreement|contract award|highways? (?:tender|award))\b/i, baseConfidence: 0.7 },
  { claimType: 'SUPPLY_CHAIN_EVENT', pattern: /\b(supply chain|component shortage|port delays|shipping disruption|freight backlog)\b/i, baseConfidence: 0.65 },
  { claimType: 'MARKET_DEMAND_EVENT', pattern: /\b(demand (?:surge|spike|growth)|record orders|sales (?:jump|surge))\b/i, baseConfidence: 0.65 },
  { claimType: 'FINANCIAL_RESULT', pattern: /\b(profit warning|quarterly (?:results|earnings)|revenue (?:fell|rose|grew)|losses widened)\b/i, baseConfidence: 0.65 },
  { claimType: 'LEGAL_EVENT', pattern: /\b(lawsuit|court ruling|sued|legal action|litigation)\b/i, baseConfidence: 0.6 },
]

const SECTORS: Record<string, RegExp> = {
  technology: /\b(tech(?:nology)? (?:firm|manufacturer|supplier|company)|software|semiconductor|grid systems)\b/i,
  retail: /\b(retail|high street|supermarket|merchants?|checkout)\b/i,
  energy: /\b(energy|solar|oil|gas|renewables|inverters|grid storage)\b/i,
  healthcare: /\b(health(?:care)?|hospital|pharma)\b/i,
  logistics: /\b(logistics|shipping|freight|supply chain)\b/i,
  'public-sector': /\b(council|local authority|public contract|procurement|tender|government)\b/i,
}

const REGIONS: Record<string, RegExp> = {
  UK: /\b(UK|United Kingdom|Britain|Manchester|London)\b/,
  EU: /\b(EU|Europe|European)\b/,
  US: /\b(US|United States|America)\b/,
}

export function detectSector(text: string): string | null {
  for (const [sector, pattern] of Object.entries(SECTORS)) if (pattern.test(text)) return sector
  return null
}

export function detectRegion(text: string): string | null {
  for (const [region, pattern] of Object.entries(REGIONS)) if (pattern.test(text)) return region
  return null
}

export type ExtractedClaim = {
  claimType: ClaimType
  claimText: string
  extractionConfidence: number
  sector: string | null
  region: string | null
}

/** Pure sentence-level rule matching. One claim per (sentence, claimType) match. */
export function extractClaimsFromText(bodyText: string): ExtractedClaim[] {
  const text = bodyText.trim()
  if (!text) return []
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 0)
  const claims: ExtractedClaim[] = []
  for (const sentence of sentences) {
    for (const matcher of MATCHERS) {
      if (!matcher.pattern.test(sentence)) continue
      const digitBonus = /\d/.test(sentence) ? 0.1 : 0
      claims.push({
        claimType: matcher.claimType,
        claimText: sentence.trim().slice(0, 300),
        extractionConfidence: Math.min(0.9, matcher.baseConfidence + digitBonus),
        sector: detectSector(sentence) ?? detectSector(text),
        region: detectRegion(sentence) ?? detectRegion(text),
      })
    }
  }
  return claims
}

export async function extractClaims(
  parsedDocs: ParsedDocument[],
  docsById: Map<string, Document>,
): Promise<{ claims: Claim[]; errors: PipelineError[] }> {
  const claims: Claim[] = []
  const errors: PipelineError[] = []
  for (const parsed of parsedDocs) {
    if (parsed.status !== 'PARSED') continue
    const doc = docsById.get(parsed.documentId)
    if (!doc) {
      errors.push({ stage: 'claims', message: `No document loaded for parsed doc ${parsed.id}` })
      continue
    }
    try {
      for (const extracted of extractClaimsFromText(parsed.bodyText)) {
        claims.push(
          await prisma.claim.create({
            data: {
              documentId: doc.id,
              claimType: extracted.claimType,
              claimText: extracted.claimText,
              claimDate: parsed.publishedAt ?? doc.fetchedAt,
              sector: extracted.sector,
              region: extracted.region,
              extractionMethod: `rule:v1:${extracted.claimType}`,
              extractionConfidence: extracted.extractionConfidence,
              credibilityScore: 0.7,
              needsReview: extracted.extractionConfidence < 0.5,
              isFixture: doc.isFixture,
            },
          }),
        )
      }
    } catch (err) {
      errors.push({
        stage: 'claims',
        sourceId: doc.sourceId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { claims, errors }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: rule-based claim extraction with sector/region detection and review flagging"
```

---

### Task 7: Signal creation stage

**Files:**
- Create: `src/server/pipeline/signals.ts`
- Test: `tests/pipeline/signals.test.ts`

**Interfaces:**
- Consumes: `Claim` rows + `docsById: Map<string, Document>`.
- Produces: `createSignals(claims: Claim[], docsById: Map<string, Document>): Promise<{ signals: Signal[]; errors: PipelineError[] }>` from `@/server/pipeline/signals`. Also exports `mapClaimToSignal(claim: Claim): { signalType: SignalType; direction: Direction; strength: number } | null` (pure, for unit tests).
- Rules: only claims with `extractionConfidence >= 0.4` and a known mapping produce signals; `signal.confidence = claim.extractionConfidence`; `signalDate = claim.claimDate ?? document.fetchedAt`; sector/region copied from claim; the `claimId` unique constraint guarantees dedupe (claims that already have a signal are skipped); explanation composed from the mapping rule; signals never require an entity.

- [ ] **Step 1: Write failing tests**

`tests/pipeline/signals.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { createSignals, mapClaimToSignal } from '@/server/pipeline/signals'
import { resetDb } from '../helpers'
import { makeClaim, makeDocument, makeSource } from '../factories'
import type { Claim } from '@prisma/client'

function fakeClaim(partial: Partial<Claim>): Claim {
  return { claimText: '', ...partial } as Claim
}

describe('mapClaimToSignal (pure)', () => {
  it('maps claim types to signal types with direction', () => {
    expect(mapClaimToSignal(fakeClaim({ claimType: 'LAYOFF_MENTION' }))).toEqual({
      signalType: 'LAYOFF_SIGNAL',
      direction: 'NEGATIVE',
      strength: 0.7,
    })
    expect(mapClaimToSignal(fakeClaim({ claimType: 'PROCUREMENT_EVENT' }))).toEqual({
      signalType: 'PROCUREMENT_INCREASE',
      direction: 'POSITIVE',
      strength: 0.7,
    })
    expect(
      mapClaimToSignal(fakeClaim({ claimType: 'HIRING_CHANGE', claimText: 'a hiring freeze was announced' })),
    ).toEqual({ signalType: 'HIRING_SLOWDOWN', direction: 'NEGATIVE', strength: 0.6 })
    expect(
      mapClaimToSignal(fakeClaim({ claimType: 'HIRING_CHANGE', claimText: 'a hiring surge was announced' })),
    ).toEqual({ signalType: 'HIRING_ACCELERATION', direction: 'POSITIVE', strength: 0.6 })
    expect(mapClaimToSignal(fakeClaim({ claimType: 'UNKNOWN' }))).toBeNull()
  })
})

describe('createSignals (persistence)', () => {
  beforeEach(resetDb)

  it('creates a signal linked back to claim, document and source — without any entity', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id, { sector: 'technology', region: 'UK' })
    const { signals, errors } = await createSignals([claim], new Map([[doc.id, doc]]))
    expect(errors).toHaveLength(0)
    expect(signals).toHaveLength(1)
    expect(signals[0].claimId).toBe(claim.id)
    expect(signals[0].documentId).toBe(doc.id)
    expect(signals[0].sourceId).toBe(source.id)
    expect(signals[0].entityId).toBeNull()
    expect(signals[0].sector).toBe('technology')
    expect(signals[0].explanation).toContain('LAYOFF_MENTION')
  })

  it('does not create duplicate signals for the same claim', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    await createSignals([claim], new Map([[doc.id, doc]]))
    const second = await createSignals([claim], new Map([[doc.id, doc]]))
    expect(second.signals).toHaveLength(0)
    expect(await prisma.signal.count()).toBe(1)
  })

  it('skips claims below the 0.4 confidence floor', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const weak = await makeClaim(doc.id, { extractionConfidence: 0.3 })
    const { signals } = await createSignals([weak], new Map([[doc.id, doc]]))
    expect(signals).toHaveLength(0)
  })
})
```

Run: `npm test`
Expected: FAIL — `Cannot find module '@/server/pipeline/signals'`.

- [ ] **Step 2: Implement**

`src/server/pipeline/signals.ts`:
```ts
import type { Claim, Document, Signal } from '@prisma/client'
import { prisma } from '@/server/db'
import type { Direction, SignalType } from '@/shared/enums'
import type { PipelineError } from './types'

const CONFIDENCE_FLOOR = 0.4

type SignalMapping = { signalType: SignalType; direction: Direction; strength: number }

/** Rule table v1: claimType → signal. Text-dependent claim types branch on claim text. */
export function mapClaimToSignal(claim: Claim): SignalMapping | null {
  switch (claim.claimType) {
    case 'LAYOFF_MENTION':
      return { signalType: 'LAYOFF_SIGNAL', direction: 'NEGATIVE', strength: 0.7 }
    case 'FUNDING_MENTION':
      return { signalType: 'FUNDING_SIGNAL', direction: 'POSITIVE', strength: 0.65 }
    case 'EXECUTIVE_CHANGE':
      return /\b(resign|step(?:s|ped)? down|depart|exit)/i.test(claim.claimText)
        ? { signalType: 'EXECUTIVE_EXIT', direction: 'NEGATIVE', strength: 0.6 }
        : { signalType: 'EXECUTIVE_HIRE', direction: 'POSITIVE', strength: 0.6 }
    case 'HIRING_CHANGE':
      return /\b(freeze|slowdown)\b/i.test(claim.claimText)
        ? { signalType: 'HIRING_SLOWDOWN', direction: 'NEGATIVE', strength: 0.6 }
        : { signalType: 'HIRING_ACCELERATION', direction: 'POSITIVE', strength: 0.6 }
    case 'REGULATORY_EVENT':
      return { signalType: 'REGULATORY_PRESSURE', direction: 'NEGATIVE', strength: 0.6 }
    case 'PROCUREMENT_EVENT':
      return { signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE', strength: 0.7 }
    case 'SUPPLY_CHAIN_EVENT':
      return { signalType: 'SUPPLY_CHAIN_PRESSURE', direction: 'NEGATIVE', strength: 0.65 }
    case 'MARKET_DEMAND_EVENT':
      return { signalType: 'DEMAND_SPIKE', direction: 'POSITIVE', strength: 0.65 }
    case 'FINANCIAL_RESULT':
      return /\b(warning|fell|losses)\b/i.test(claim.claimText)
        ? { signalType: 'CASH_PRESSURE', direction: 'NEGATIVE', strength: 0.6 }
        : { signalType: 'PRODUCT_MOMENTUM', direction: 'POSITIVE', strength: 0.6 }
    case 'LEGAL_EVENT':
      return { signalType: 'LEGAL_PRESSURE', direction: 'NEGATIVE', strength: 0.6 }
    default:
      return null
  }
}

export async function createSignals(
  claims: Claim[],
  docsById: Map<string, Document>,
): Promise<{ signals: Signal[]; errors: PipelineError[] }> {
  const signals: Signal[] = []
  const errors: PipelineError[] = []
  for (const claim of claims) {
    if (claim.extractionConfidence < CONFIDENCE_FLOOR) continue
    const mapping = mapClaimToSignal(claim)
    if (!mapping) continue
    const doc = docsById.get(claim.documentId)
    if (!doc) {
      errors.push({ stage: 'signals', message: `No document loaded for claim ${claim.id}` })
      continue
    }
    const existing = await prisma.signal.findUnique({ where: { claimId: claim.id } })
    if (existing) continue
    try {
      signals.push(
        await prisma.signal.create({
          data: {
            claimId: claim.id,
            documentId: doc.id,
            sourceId: doc.sourceId,
            entityId: claim.entityId,
            signalType: mapping.signalType,
            signalDate: claim.claimDate ?? doc.fetchedAt,
            confidence: claim.extractionConfidence,
            strength: mapping.strength,
            direction: mapping.direction,
            explanation: `Derived from ${claim.claimType} claim (rule v1): "${claim.claimText.slice(0, 120)}" → ${mapping.signalType} (${mapping.direction}), strength ${mapping.strength}, confidence ${claim.extractionConfidence.toFixed(2)}.`,
            sector: claim.sector,
            region: claim.region,
            isFixture: claim.isFixture,
          },
        }),
      )
    } catch (err) {
      errors.push({
        stage: 'signals',
        sourceId: doc.sourceId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { signals, errors }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: claim→signal mapping stage with confidence floor and dedupe guarantee"
```

---

### Task 8: Signal clustering stage

**Files:**
- Create: `src/server/pipeline/cluster.ts`
- Test: `tests/pipeline/cluster.test.ts`

**Interfaces:**
- Consumes: `Signal[]` (this scan's new signals, passed by the orchestrator).
- Produces: `clusterSignals(signals: Signal[]): Promise<{ clusters: ClusterWithSignals[]; errors: PipelineError[] }>` from `@/server/pipeline/cluster`, where `type ClusterWithSignals = SignalCluster & { memberSignals: Signal[] }`. Also exports the pure scoring helper `scoreCluster(members: Signal[]): { strength: number; confidence: number; diversityRatio: number; distinctSources: number }`.
- Clustering rules (deterministic, explainable):
  - Group key = `${signalType}|${sector ?? 'any'}|${region ?? 'any'}`.
  - `distinctSources s` = unique `sourceId` count; `n` = member count.
  - `strength = min(1, avg(member.strength) + 0.1 × (n − 1))`.
  - `diversityRatio = n > 1 ? (s − 1) / (n − 1) : 0` (repeated copies of one source add NO independent support).
  - `confidence = min(0.95, avg(member.confidence) × (0.75 + 0.25 × diversityRatio) + 0.05 × (s − 1))`, then `× 0.6` when `n === 1` (single-signal penalty).
  - Groups form a cluster only when `n >= 2` OR the single signal has `strength >= 0.5` (weak singles surface later as WATCH, never confident events).
  - `novelty = 0.9` if no prior cluster exists with the same `clusterType+sector+region`, else `0.4`.
  - `explanation` states members, sources, diversity, and formula results in plain language. `title` = human label like `Layoff pressure — technology (UK)`.

- [ ] **Step 1: Write failing tests**

`tests/pipeline/cluster.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { clusterSignals, scoreCluster } from '@/server/pipeline/cluster'
import { resetDb } from '../helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from '../factories'
import type { Signal } from '@prisma/client'

async function signalFrom(
  sourceOverrides: Parameters<typeof makeSource>[0],
  signalOverrides: Partial<Parameters<typeof makeSignal>[3]> = {},
): Promise<Signal> {
  const source = await makeSource(sourceOverrides)
  const doc = await makeDocument(source.id)
  const claim = await makeClaim(doc.id)
  return makeSignal(claim.id, doc.id, source.id, signalOverrides)
}

describe('scoreCluster (pure)', () => {
  it('gives higher confidence to multi-source clusters than single-source clusters', () => {
    const base = { strength: 0.7, confidence: 0.85 }
    const twoSources = scoreCluster([
      { ...base, sourceId: 's1' } as Signal,
      { ...base, sourceId: 's2' } as Signal,
    ])
    const oneSourceTwice = scoreCluster([
      { ...base, sourceId: 's1' } as Signal,
      { ...base, sourceId: 's1' } as Signal,
    ])
    expect(twoSources.confidence).toBeGreaterThan(oneSourceTwice.confidence)
    expect(twoSources.distinctSources).toBe(2)
    expect(oneSourceTwice.diversityRatio).toBe(0)
  })
})

describe('clusterSignals', () => {
  beforeEach(resetDb)

  it('clusters related signals (same type/sector/region) across sources', async () => {
    const a = await signalFrom({ name: 'Wire A' }, { sector: 'technology', region: 'UK' })
    const b = await signalFrom({ name: 'Wire B' }, { sector: 'technology', region: 'UK' })
    const { clusters } = await clusterSignals([a, b])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].memberSignals).toHaveLength(2)
    expect(clusters[0].clusterType).toBe('LAYOFF_SIGNAL')
    expect(clusters[0].sector).toBe('technology')
    expect(clusters[0].explanation).toContain('2 independent source')
    expect(await prisma.signalClusterSignal.count()).toBe(2)
  })

  it('does not cluster unrelated signals together', async () => {
    const layoff = await signalFrom({ name: 'Wire A' }, { sector: 'technology', region: 'UK' })
    const procurement = await signalFrom(
      { name: 'Wire B' },
      { signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE', sector: 'public-sector', region: 'UK' },
    )
    const { clusters } = await clusterSignals([layoff, procurement])
    expect(clusters).toHaveLength(2)
  })

  it('creates sector-level clusters with no entity attached', async () => {
    const a = await signalFrom({ name: 'Wire A' }, { sector: 'public-sector', region: 'UK', signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE' })
    const b = await signalFrom({ name: 'Wire B' }, { sector: 'public-sector', region: 'UK', signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE' })
    const { clusters } = await clusterSignals([a, b])
    expect(clusters).toHaveLength(1)
    expect(await prisma.signalClusterEntity.count()).toBe(0)
  })

  it('drops single weak signals but keeps single decent signals', async () => {
    const weak = await signalFrom({ name: 'Wire A' }, { strength: 0.3 })
    const decent = await signalFrom(
      { name: 'Wire B' },
      { signalType: 'DEMAND_SPIKE', direction: 'POSITIVE', strength: 0.65, sector: 'energy', region: 'EU' },
    )
    const { clusters } = await clusterSignals([weak, decent])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].clusterType).toBe('DEMAND_SPIKE')
    // single-signal penalty applied
    expect(clusters[0].confidence).toBeLessThan(0.45)
  })
})
```

Run: `npm test`
Expected: FAIL — `Cannot find module '@/server/pipeline/cluster'`.

- [ ] **Step 2: Implement**

`src/server/pipeline/cluster.ts`:
```ts
import type { Signal, SignalCluster } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from './types'

export type ClusterWithSignals = SignalCluster & { memberSignals: Signal[] }

const SIGNAL_LABELS: Record<string, string> = {
  LAYOFF_SIGNAL: 'Layoff pressure',
  FUNDING_SIGNAL: 'Funding activity',
  EXECUTIVE_EXIT: 'Executive departures',
  EXECUTIVE_HIRE: 'Executive appointments',
  HIRING_ACCELERATION: 'Hiring acceleration',
  HIRING_SLOWDOWN: 'Hiring slowdown',
  CASH_PRESSURE: 'Cash pressure',
  LEGAL_PRESSURE: 'Legal pressure',
  REGULATORY_PRESSURE: 'Regulatory pressure',
  PROCUREMENT_INCREASE: 'Procurement growth',
  SUPPLY_CHAIN_PRESSURE: 'Supply chain pressure',
  DEMAND_SPIKE: 'Demand growth',
  PRODUCT_MOMENTUM: 'Product momentum',
}

export function clusterLabel(clusterType: string, sector: string | null, region: string | null): string {
  const base = SIGNAL_LABELS[clusterType] ?? clusterType
  const scope = sector ?? 'cross-sector'
  return region ? `${base} — ${scope} (${region})` : `${base} — ${scope}`
}

export function scoreCluster(members: Signal[]): {
  strength: number
  confidence: number
  diversityRatio: number
  distinctSources: number
} {
  const n = members.length
  const distinctSources = new Set(members.map((m) => m.sourceId)).size
  const avgStrength = members.reduce((sum, m) => sum + m.strength, 0) / n
  const avgConfidence = members.reduce((sum, m) => sum + m.confidence, 0) / n
  const diversityRatio = n > 1 ? (distinctSources - 1) / (n - 1) : 0
  const strength = Math.min(1, avgStrength + 0.1 * (n - 1))
  let confidence = Math.min(
    0.95,
    avgConfidence * (0.75 + 0.25 * diversityRatio) + 0.05 * (distinctSources - 1),
  )
  if (n === 1) confidence *= 0.6 // single-signal penalty: one report is not corroboration
  return { strength, confidence: Math.round(confidence * 100) / 100, diversityRatio, distinctSources }
}

export async function clusterSignals(signals: Signal[]): Promise<{
  clusters: ClusterWithSignals[]
  errors: PipelineError[]
}> {
  const clusters: ClusterWithSignals[] = []
  const errors: PipelineError[] = []

  const groups = new Map<string, Signal[]>()
  for (const signal of signals) {
    const key = `${signal.signalType}|${signal.sector ?? 'any'}|${signal.region ?? 'any'}`
    groups.set(key, [...(groups.get(key) ?? []), signal])
  }

  for (const [key, members] of groups) {
    try {
      if (members.length === 1 && members[0].strength < 0.5) continue // single weak signal: no cluster
      const [clusterType, sectorKey, regionKey] = key.split('|')
      const sector = sectorKey === 'any' ? null : sectorKey
      const region = regionKey === 'any' ? null : regionKey
      const { strength, confidence, diversityRatio, distinctSources } = scoreCluster(members)
      const prior = await prisma.signalCluster.findFirst({
        where: { clusterType, sector, region, id: { notIn: clusters.map((c) => c.id) } },
      })
      const novelty = prior ? 0.4 : 0.9
      const explanation =
        `${members.length} ${clusterType} signal(s) across ${distinctSources} independent source(s) ` +
        `sharing sector=${sector ?? 'unspecified'}, region=${region ?? 'unspecified'}. ` +
        `Strength ${strength.toFixed(2)} (avg member strength + size bonus). ` +
        `Confidence ${confidence.toFixed(2)} (avg member confidence weighted by source diversity ` +
        `${diversityRatio.toFixed(2)}${members.length === 1 ? ', single-signal penalty applied' : ''}). ` +
        `Novelty ${novelty} (${prior ? 'similar cluster seen before' : 'first cluster of this shape'}).`
      const created = await prisma.signalCluster.create({
        data: {
          title: clusterLabel(clusterType, sector, region),
          clusterType,
          sector,
          region,
          strength,
          confidence,
          novelty,
          explanation,
          isFixture: members.every((m) => m.isFixture),
          signals: { create: members.map((m) => ({ signalId: m.id })) },
        },
      })
      clusters.push({ ...created, memberSignals: members })
    } catch (err) {
      errors.push({ stage: 'cluster', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { clusters, errors }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: deterministic signal clustering with source-diversity-weighted confidence"
```

---

### Task 9: Event candidate creation and dashboard feed items

**Files:**
- Create: `src/server/pipeline/events.ts`
- Test: `tests/pipeline/events.test.ts`

**Interfaces:**
- Consumes: `ClusterWithSignals[]` from Task 8, `scanRunId: string`.
- Produces: `createEventCandidates(clusters: ClusterWithSignals[], scanRunId: string): Promise<{ events: EventCandidate[]; feedItems: DashboardFeedItem[]; errors: PipelineError[] }>` from `@/server/pipeline/events`.
- Scoring rules (explainable, embedded into `summary`):
  - `confidence = cluster.confidence`; `severity = cluster.strength`; `noveltyScore = cluster.novelty`.
  - `probability = min(0.9, 0.25 + 0.5 × confidence + 0.15 × severity)`.
  - Direction fractions over members: `negFrac`, `posFrac`.
  - `riskScore = min(1, severity × probability × (negFrac + 0.2))`; `opportunityScore = min(1, severity × probability × (posFrac + 0.2))` (each rounded to 2 dp).
  - `eventClass`: `confidence < 0.45` → `WATCH` (status `NEEDS_REVIEW` if `severity >= 0.6`, else `NEW`); otherwise dominant direction → `RISK` (NEGATIVE), `OPPORTUNITY` (POSITIVE), `MIXED` (both fractions ≥ 0.35), else `UNKNOWN`. Status defaults to `NEW`.
  - `evidenceCount` = distinct documentIds; `sourceDiversityScore` = distinct sources ÷ member count (2 dp); `signalStrength = cluster.strength`.
  - `primaryEntityId`: the shared entityId if ALL members carry the same non-null entityId, else `null`.
  - `timeWindowStart/End` = min/max member `signalDate`. Cluster gets `eventCandidateId` set (evidence trail).
  - Feed items: every event → `INBOX`; RISK & MIXED → `RISK_RADAR`; OPPORTUNITY & MIXED → `OPPORTUNITY_RADAR`; WATCH → `WATCHLIST`. `priority = round(100 × max(riskScore, opportunityScore))`.

- [ ] **Step 1: Write failing tests**

`tests/pipeline/events.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { clusterSignals } from '@/server/pipeline/cluster'
import { createEventCandidates } from '@/server/pipeline/events'
import { resetDb } from '../helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from '../factories'
import type { Signal } from '@prisma/client'

async function seededSignal(
  name: string,
  overrides: Partial<Parameters<typeof makeSignal>[3]> = {},
): Promise<Signal> {
  const source = await makeSource({ name })
  const doc = await makeDocument(source.id)
  const claim = await makeClaim(doc.id)
  return makeSignal(claim.id, doc.id, source.id, overrides)
}

describe('createEventCandidates', () => {
  beforeEach(resetDb)

  it('creates a RISK event from a strong multi-source negative cluster, with feed items', async () => {
    const a = await seededSignal('Wire A', { sector: 'technology', region: 'UK', confidence: 0.85 })
    const b = await seededSignal('Wire B', { sector: 'technology', region: 'UK', confidence: 0.85 })
    const scanRun = await prisma.scanRun.create({ data: {} })
    const { clusters } = await clusterSignals([a, b])
    const { events, feedItems, errors } = await createEventCandidates(clusters, scanRun.id)

    expect(errors).toHaveLength(0)
    expect(events).toHaveLength(1)
    const event = events[0]
    expect(event.eventClass).toBe('RISK')
    expect(event.status).toBe('NEW')
    expect(event.primaryEntityId).toBeNull()
    expect(event.evidenceCount).toBe(2)
    expect(event.sourceDiversityScore).toBe(1)
    expect(event.riskScore).toBeGreaterThan(event.opportunityScore)
    expect(event.summary).toContain('source')
    expect(event.createdFromScanRunId).toBe(scanRun.id)

    const linkedCluster = await prisma.signalCluster.findUniqueOrThrow({ where: { id: clusters[0].id } })
    expect(linkedCluster.eventCandidateId).toBe(event.id)

    const types = feedItems.map((f) => f.feedType).sort()
    expect(types).toEqual(['INBOX', 'RISK_RADAR'])
  })

  it('creates an OPPORTUNITY event from a positive cluster', async () => {
    const a = await seededSignal('Wire A', {
      signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE', sector: 'public-sector', region: 'UK', confidence: 0.8,
    })
    const b = await seededSignal('Wire B', {
      signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE', sector: 'public-sector', region: 'UK', confidence: 0.8,
    })
    const scanRun = await prisma.scanRun.create({ data: {} })
    const { clusters } = await clusterSignals([a, b])
    const { events, feedItems } = await createEventCandidates(clusters, scanRun.id)
    expect(events[0].eventClass).toBe('OPPORTUNITY')
    expect(events[0].opportunityScore).toBeGreaterThan(events[0].riskScore)
    expect(feedItems.map((f) => f.feedType).sort()).toEqual(['INBOX', 'OPPORTUNITY_RADAR'])
  })

  it('creates a WATCH item (not a confident event) from a weak single-source cluster', async () => {
    const single = await seededSignal('Wire A', {
      signalType: 'DEMAND_SPIKE', direction: 'POSITIVE', strength: 0.65, confidence: 0.75, sector: 'energy', region: 'EU',
    })
    const scanRun = await prisma.scanRun.create({ data: {} })
    const { clusters } = await clusterSignals([single])
    const { events, feedItems } = await createEventCandidates(clusters, scanRun.id)
    expect(events).toHaveLength(1)
    expect(events[0].eventClass).toBe('WATCH')
    expect(feedItems.some((f) => f.feedType === 'WATCHLIST')).toBe(true)
  })

  it('creates a sector-level event without any company selected', async () => {
    const a = await seededSignal('Wire A', { sector: 'public-sector', region: 'UK', signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE' })
    const b = await seededSignal('Wire B', { sector: 'public-sector', region: 'UK', signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE' })
    const scanRun = await prisma.scanRun.create({ data: {} })
    const { clusters } = await clusterSignals([a, b])
    const { events } = await createEventCandidates(clusters, scanRun.id)
    expect(events[0].primaryEntityId).toBeNull()
    expect(events[0].affectedSector).toBe('public-sector')
  })
})
```

Run: `npm test`
Expected: FAIL — `Cannot find module '@/server/pipeline/events'`.

- [ ] **Step 2: Implement**

`src/server/pipeline/events.ts`:
```ts
import type { DashboardFeedItem, EventCandidate } from '@prisma/client'
import { prisma } from '@/server/db'
import type { ClusterWithSignals } from './cluster'
import type { PipelineError } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

export async function createEventCandidates(
  clusters: ClusterWithSignals[],
  scanRunId: string,
): Promise<{ events: EventCandidate[]; feedItems: DashboardFeedItem[]; errors: PipelineError[] }> {
  const events: EventCandidate[] = []
  const feedItems: DashboardFeedItem[] = []
  const errors: PipelineError[] = []

  for (const cluster of clusters) {
    try {
      const members = cluster.memberSignals
      const n = members.length
      const confidence = cluster.confidence
      const severity = cluster.strength
      const probability = Math.min(0.9, round2(0.25 + 0.5 * confidence + 0.15 * severity))
      const negFrac = members.filter((m) => m.direction === 'NEGATIVE').length / n
      const posFrac = members.filter((m) => m.direction === 'POSITIVE').length / n
      const riskScore = round2(Math.min(1, severity * probability * (negFrac + 0.2)))
      const opportunityScore = round2(Math.min(1, severity * probability * (posFrac + 0.2)))

      let eventClass: string
      let status = 'NEW'
      if (confidence < 0.45) {
        eventClass = 'WATCH'
        if (severity >= 0.6) status = 'NEEDS_REVIEW'
      } else if (negFrac >= 0.35 && posFrac >= 0.35) {
        eventClass = 'MIXED'
      } else if (negFrac > posFrac) {
        eventClass = 'RISK'
      } else if (posFrac > negFrac) {
        eventClass = 'OPPORTUNITY'
      } else {
        eventClass = 'UNKNOWN'
      }

      const distinctDocs = new Set(members.map((m) => m.documentId)).size
      const distinctSources = new Set(members.map((m) => m.sourceId)).size
      const sourceDiversityScore = round2(distinctSources / n)
      const entityIds = new Set(members.map((m) => m.entityId ?? 'none'))
      const primaryEntityId =
        entityIds.size === 1 && !entityIds.has('none') ? members[0].entityId : null
      const dates = members.map((m) => m.signalDate.getTime())

      const summary =
        `${cluster.title}: ${n} corroborating signal(s) across ${distinctSources} independent source(s). ` +
        `Class ${eventClass} — confidence ${confidence.toFixed(2)}, severity ${severity.toFixed(2)}, ` +
        `probability ${probability.toFixed(2)} (0.25 + 0.5×confidence + 0.15×severity). ` +
        `Risk ${riskScore.toFixed(2)} / opportunity ${opportunityScore.toFixed(2)} ` +
        `(severity × probability weighted by direction mix: ${Math.round(negFrac * 100)}% negative, ` +
        `${Math.round(posFrac * 100)}% positive). ${cluster.explanation}`

      const event = await prisma.eventCandidate.create({
        data: {
          title: cluster.title,
          eventType: cluster.clusterType,
          eventClass,
          summary,
          status,
          severity,
          probability,
          confidence,
          timeWindowStart: new Date(Math.min(...dates)),
          timeWindowEnd: new Date(Math.max(...dates)),
          primaryEntityId,
          affectedSector: cluster.sector,
          affectedRegion: cluster.region,
          evidenceCount: distinctDocs,
          sourceDiversityScore,
          signalStrength: severity,
          noveltyScore: cluster.novelty,
          opportunityScore,
          riskScore,
          createdFromScanRunId: scanRunId,
          isFixture: cluster.isFixture,
        },
      })
      await prisma.signalCluster.update({
        where: { id: cluster.id },
        data: { eventCandidateId: event.id },
      })
      events.push(event)

      const priority = Math.round(100 * Math.max(riskScore, opportunityScore))
      const feedTypes = ['INBOX']
      if (eventClass === 'RISK' || eventClass === 'MIXED') feedTypes.push('RISK_RADAR')
      if (eventClass === 'OPPORTUNITY' || eventClass === 'MIXED') feedTypes.push('OPPORTUNITY_RADAR')
      if (eventClass === 'WATCH') feedTypes.push('WATCHLIST')
      for (const feedType of feedTypes) {
        feedItems.push(
          await prisma.dashboardFeedItem.create({
            data: {
              eventCandidateId: event.id,
              feedType,
              priority,
              title: event.title,
              summary: `${eventClass}: ${cluster.explanation.slice(0, 200)}`,
              status,
            },
          }),
        )
      }
    } catch (err) {
      errors.push({ stage: 'events', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { events, feedItems, errors }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: event candidate creation with explainable scoring and dashboard feed items"
```

---

### Task 10: Risk and opportunity classification

**Files:**
- Create: `src/server/pipeline/classify.ts`
- Test: `tests/pipeline/classify.test.ts`

**Interfaces:**
- Consumes: `EventCandidate[]` from Task 9.
- Produces: `classifyEvents(events: EventCandidate[]): Promise<{ riskOpportunities: RiskOpportunity[]; errors: PipelineError[] }>` from `@/server/pipeline/classify`. One `RiskOpportunity` row per event: `type` = the event's `eventClass`, `confidence` = the event's `confidence`, plus rule-table `riskLogic`, `opportunityLogic`, and `questionsJson` (rule questions + the standard interrogation set). No financial advice language anywhere — strategic intelligence framing only.

- [ ] **Step 1: Write failing tests**

`tests/pipeline/classify.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { classifyEvents } from '@/server/pipeline/classify'
import { resetDb } from '../helpers'

async function makeEvent(overrides: Record<string, unknown> = {}) {
  const scanRun = await prisma.scanRun.create({ data: {} })
  return prisma.eventCandidate.create({
    data: {
      title: 'Layoff pressure — technology (UK)',
      eventType: 'LAYOFF_SIGNAL',
      eventClass: 'RISK',
      summary: 'test',
      severity: 0.8,
      probability: 0.8,
      confidence: 0.85,
      evidenceCount: 2,
      sourceDiversityScore: 1,
      signalStrength: 0.8,
      noveltyScore: 0.9,
      opportunityScore: 0.2,
      riskScore: 0.75,
      createdFromScanRunId: scanRun.id,
      isFixture: true,
      ...overrides,
    },
  })
}

describe('classifyEvents', () => {
  beforeEach(resetDb)

  it('classifies a layoff risk event with dual risk/opportunity logic', async () => {
    const event = await makeEvent()
    const { riskOpportunities, errors } = await classifyEvents([event])
    expect(errors).toHaveLength(0)
    expect(riskOpportunities).toHaveLength(1)
    const ro = riskOpportunities[0]
    expect(ro.eventCandidateId).toBe(event.id)
    expect(ro.type).toBe('RISK')
    expect(ro.riskLogic).toContain('stress')
    expect(ro.opportunityLogic.toLowerCase()).toContain('talent')
    const questions = JSON.parse(ro.questionsJson) as string[]
    expect(questions.length).toBeGreaterThanOrEqual(7)
    expect(questions).toContain('What changed in the last seven days?')
  })

  it('classifies opportunity events', async () => {
    const event = await makeEvent({
      eventType: 'PROCUREMENT_INCREASE',
      eventClass: 'OPPORTUNITY',
      riskScore: 0.2,
      opportunityScore: 0.75,
    })
    const { riskOpportunities } = await classifyEvents([event])
    expect(riskOpportunities[0].type).toBe('OPPORTUNITY')
    expect(riskOpportunities[0].opportunityLogic.toLowerCase()).toContain('demand')
  })

  it('uses generic logic for event types without a specific rule, and keeps WATCH type', async () => {
    const event = await makeEvent({ eventType: 'MACRO_PRESSURE', eventClass: 'WATCH', confidence: 0.4 })
    const { riskOpportunities } = await classifyEvents([event])
    expect(riskOpportunities[0].type).toBe('WATCH')
    expect(riskOpportunities[0].riskLogic.length).toBeGreaterThan(20)
    expect(riskOpportunities[0].opportunityLogic.length).toBeGreaterThan(20)
  })
})
```

Run: `npm test`
Expected: FAIL — `Cannot find module '@/server/pipeline/classify'`.

- [ ] **Step 2: Implement**

`src/server/pipeline/classify.ts`:
```ts
import type { EventCandidate, RiskOpportunity } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from './types'

type ClassifyRule = { riskLogic: string; opportunityLogic: string; questions: string[] }

/** Strategic-intelligence framing only. Never investment or financial advice. */
const CLASSIFY_RULES: Record<string, ClassifyRule> = {
  LAYOFF_SIGNAL: {
    riskLogic:
      'Workforce reductions indicate operational or financial stress in the affected organisations and may signal wider sector pressure.',
    opportunityLogic:
      'A talent acquisition window: experienced staff entering the market, and potential openings for suppliers serving restructuring organisations.',
    questions: ['Which organisations in this sector are hiring the released skill sets?', 'Is this an isolated restructuring or a sector-wide pattern?'],
  },
  PROCUREMENT_INCREASE: {
    riskLogic:
      'Rising public spend can indicate urgency or cost pressure in the buying organisations and increased competition for delivery capacity.',
    opportunityLogic:
      'Growing addressable public-sector demand: an expanding bid pipeline for suppliers able to meet framework requirements.',
    questions: ['Which frameworks are open and what are their deadlines?', 'What delivery capacity do incumbent suppliers have?'],
  },
  REGULATORY_PRESSURE: {
    riskLogic:
      'Regulatory scrutiny raises compliance risk and potential cost or restriction for organisations in the affected market.',
    opportunityLogic:
      'A compliance and advisory opportunity: affected organisations will need help adapting; compliant challengers may gain ground.',
    questions: ['Which obligations are likely to change and when?', 'Who is best positioned if the rules tighten?'],
  },
  DEMAND_SPIKE: {
    riskLogic:
      'Rapid demand growth can strain supply, pricing and delivery for incumbents, and may prove temporary.',
    opportunityLogic:
      'A market demand opportunity: sustained order growth suggests expanding demand for products and services in this category.',
    questions: ['Is the demand growth corroborated across regions and months?', 'What supply constraints could cap it?'],
  },
  SUPPLY_CHAIN_PRESSURE: {
    riskLogic:
      'Supply disruption threatens delivery schedules and input costs for dependent organisations.',
    opportunityLogic:
      'A vendor replacement opportunity: buyers under disruption actively seek alternative suppliers and routes.',
    questions: ['Which inputs are constrained and for how long?', 'Which alternative suppliers can absorb displaced demand?'],
  },
  CASH_PRESSURE: {
    riskLogic:
      'Financial strain signals raise the likelihood of restructuring, delayed payments or reduced investment in affected organisations.',
    opportunityLogic:
      'Partners and competitors may find openings as strained organisations retrench from markets or renegotiate commitments.',
    questions: ['Is the pressure isolated or shared across the sector?', 'What would fresh funding change?'],
  },
}

const GENERIC_RULE: ClassifyRule = {
  riskLogic:
    'The clustered signals indicate pressure in the affected area; if the pattern strengthens it may disrupt organisations exposed to it.',
  opportunityLogic:
    'Changing conditions create openings for organisations positioned to respond faster than incumbents.',
  questions: [],
}

const STANDARD_QUESTIONS = [
  'What changed in the last seven days?',
  'Which sources disagree?',
  'What evidence would raise confidence?',
  'What evidence would lower confidence?',
  'Which entities are most exposed?',
  'Is this event a risk, opportunity or both?',
  'What should be watched next?',
]

export async function classifyEvents(events: EventCandidate[]): Promise<{
  riskOpportunities: RiskOpportunity[]
  errors: PipelineError[]
}> {
  const riskOpportunities: RiskOpportunity[] = []
  const errors: PipelineError[] = []
  for (const event of events) {
    try {
      const rule = CLASSIFY_RULES[event.eventType] ?? GENERIC_RULE
      riskOpportunities.push(
        await prisma.riskOpportunity.create({
          data: {
            eventCandidateId: event.id,
            type: event.eventClass,
            title: `${event.eventClass} assessment: ${event.title}`,
            explanation:
              `Classified ${event.eventClass} from direction mix and scores ` +
              `(risk ${event.riskScore.toFixed(2)}, opportunity ${event.opportunityScore.toFixed(2)}, ` +
              `confidence ${event.confidence.toFixed(2)}).`,
            riskLogic: rule.riskLogic,
            opportunityLogic: rule.opportunityLogic,
            questionsJson: JSON.stringify([...rule.questions, ...STANDARD_QUESTIONS]),
            confidence: event.confidence,
          },
        }),
      )
    } catch (err) {
      errors.push({ stage: 'classify', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { riskOpportunities, errors }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: risk/opportunity classification with rule table and interrogation questions"
```

---

### Task 11: Data gaps and trigger conditions

**Files:**
- Create: `src/server/pipeline/gaps.ts`
- Test: `tests/pipeline/gaps.test.ts`

**Interfaces:**
- Consumes: `EventCandidate[]` (reads each event's clusters + member signals via Prisma).
- Produces: `generateGapsAndTriggers(events: EventCandidate[], now?: Date): Promise<{ dataGaps: DataGap[]; triggerConditions: TriggerCondition[]; errors: PipelineError[] }>` from `@/server/pipeline/gaps`. `now` parameter (default `new Date()`) keeps staleness testable.
- Gap rules (each names its confidence impact; gaps never invent data):
  - distinct sources == 1 → gap "Single-source support", impactOnConfidence −0.15, severity HIGH, suggestedSourceCategory NEWS.
  - all member signals share one direction → gap "No countervailing evidence", impact −0.1, severity MEDIUM, category NEWS.
  - newest signalDate older than 14 days before `now` → gap "Evidence may be stale", impact −0.1, severity MEDIUM, category NEWS.
  - no `affectedSector` → gap "Sector unresolved", impact −0.05, severity LOW, category OFFICIAL.
- Trigger templates keyed by eventType (fallback template for unknown types), e.g. LAYOFF_SIGNAL → "If hiring resumes at the affected organisations, layoff risk should fall" (LOWERS, −0.2) and "If further independent layoff reports appear, confidence should rise" (RAISES, +0.2).

- [ ] **Step 1: Write failing tests**

`tests/pipeline/gaps.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { clusterSignals } from '@/server/pipeline/cluster'
import { createEventCandidates } from '@/server/pipeline/events'
import { generateGapsAndTriggers } from '@/server/pipeline/gaps'
import { resetDb } from '../helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from '../factories'

async function eventFromSignals(signalSpecs: { sourceName: string; overrides?: Record<string, unknown> }[]) {
  const signals = []
  for (const spec of signalSpecs) {
    const source = await makeSource({ name: spec.sourceName })
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    signals.push(await makeSignal(claim.id, doc.id, source.id, spec.overrides ?? {}))
  }
  const scanRun = await prisma.scanRun.create({ data: {} })
  const { clusters } = await clusterSignals(signals)
  const { events } = await createEventCandidates(clusters, scanRun.id)
  return events[0]
}

describe('generateGapsAndTriggers', () => {
  beforeEach(resetDb)

  it('creates a single-source gap when all evidence comes from one source', async () => {
    const event = await eventFromSignals([{ sourceName: 'Only Wire', overrides: { strength: 0.7 } }])
    const { dataGaps } = await generateGapsAndTriggers([event])
    expect(dataGaps.some((g) => g.title === 'Single-source support')).toBe(true)
    const gap = dataGaps.find((g) => g.title === 'Single-source support')!
    expect(gap.impactOnConfidence).toBe(-0.15)
    expect(gap.severity).toBe('HIGH')
  })

  it('creates a staleness gap for old evidence', async () => {
    const event = await eventFromSignals([
      { sourceName: 'Wire A', overrides: { signalDate: new Date('2026-05-01T00:00:00Z') } },
      { sourceName: 'Wire B', overrides: { signalDate: new Date('2026-05-02T00:00:00Z') } },
    ])
    const { dataGaps } = await generateGapsAndTriggers([event], new Date('2026-07-02T00:00:00Z'))
    expect(dataGaps.some((g) => g.title === 'Evidence may be stale')).toBe(true)
  })

  it('creates trigger conditions from the event type template', async () => {
    const event = await eventFromSignals([
      { sourceName: 'Wire A' },
      { sourceName: 'Wire B' },
    ])
    const { triggerConditions } = await generateGapsAndTriggers([event])
    expect(triggerConditions.length).toBeGreaterThanOrEqual(2)
    expect(triggerConditions.some((t) => t.direction === 'RAISES')).toBe(true)
    expect(triggerConditions.some((t) => t.direction === 'LOWERS')).toBe(true)
    expect(triggerConditions.every((t) => t.eventCandidateId === event.id)).toBe(true)
  })
})
```

Run: `npm test`
Expected: FAIL — `Cannot find module '@/server/pipeline/gaps'`.

- [ ] **Step 2: Implement**

`src/server/pipeline/gaps.ts`:
```ts
import type { DataGap, EventCandidate, TriggerCondition } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from './types'

const STALE_DAYS = 14

type TriggerTemplate = {
  signalType: string
  conditionText: string
  direction: 'RAISES' | 'LOWERS'
  probabilityImpact: number
  priority: number
}

const TRIGGER_TEMPLATES: Record<string, TriggerTemplate[]> = {
  LAYOFF_SIGNAL: [
    { signalType: 'HIRING_ACCELERATION', conditionText: 'If hiring resumes at the affected organisations, layoff risk should fall.', direction: 'LOWERS', probabilityImpact: -0.2, priority: 1 },
    { signalType: 'LAYOFF_SIGNAL', conditionText: 'If further independent layoff reports appear, confidence should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
  ],
  PROCUREMENT_INCREASE: [
    { signalType: 'PROCUREMENT_INCREASE', conditionText: 'If procurement notices continue rising, the opportunity score should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
    { signalType: 'MACRO_PRESSURE', conditionText: 'If budget cuts are announced for the buying bodies, the opportunity score should fall.', direction: 'LOWERS', probabilityImpact: -0.15, priority: 2 },
  ],
  REGULATORY_PRESSURE: [
    { signalType: 'REGULATORY_PRESSURE', conditionText: 'If formal rules or fines are announced, severity and confidence should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
    { signalType: 'REGULATORY_PRESSURE', conditionText: 'If the inquiry closes without action, risk should fall.', direction: 'LOWERS', probabilityImpact: -0.2, priority: 1 },
  ],
  DEMAND_SPIKE: [
    { signalType: 'DEMAND_SPIKE', conditionText: 'If demand growth is corroborated by additional independent sources, confidence should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
    { signalType: 'SUPPLY_CHAIN_PRESSURE', conditionText: 'If supply constraints emerge, realised opportunity should fall.', direction: 'LOWERS', probabilityImpact: -0.1, priority: 2 },
  ],
  CASH_PRESSURE: [
    { signalType: 'FUNDING_SIGNAL', conditionText: 'If fresh funding is announced, cash pressure should fall.', direction: 'LOWERS', probabilityImpact: -0.2, priority: 1 },
    { signalType: 'CASH_PRESSURE', conditionText: 'If further financial-strain reports appear, risk should rise.', direction: 'RAISES', probabilityImpact: 0.2, priority: 1 },
  ],
}

const FALLBACK_TEMPLATES: TriggerTemplate[] = [
  { signalType: 'UNKNOWN', conditionText: 'If additional independent sources report the same pattern, confidence should rise.', direction: 'RAISES', probabilityImpact: 0.15, priority: 2 },
  { signalType: 'UNKNOWN', conditionText: 'If no corroborating evidence appears within two weeks, confidence should fall.', direction: 'LOWERS', probabilityImpact: -0.15, priority: 2 },
]

export async function generateGapsAndTriggers(
  events: EventCandidate[],
  now: Date = new Date(),
): Promise<{ dataGaps: DataGap[]; triggerConditions: TriggerCondition[]; errors: PipelineError[] }> {
  const dataGaps: DataGap[] = []
  const triggerConditions: TriggerCondition[] = []
  const errors: PipelineError[] = []

  for (const event of events) {
    try {
      const clusters = await prisma.signalCluster.findMany({
        where: { eventCandidateId: event.id },
        include: { signals: { include: { signal: true } } },
      })
      const members = clusters.flatMap((c) => c.signals.map((link) => link.signal))
      const distinctSources = new Set(members.map((m) => m.sourceId)).size
      const directions = new Set(members.map((m) => m.direction))
      const newest = Math.max(...members.map((m) => m.signalDate.getTime()))

      const gapSpecs: Omit<DataGap, 'id' | 'createdAt' | 'eventCandidateId'>[] = []
      if (distinctSources <= 1) {
        gapSpecs.push({ title: 'Single-source support', description: 'Only one source supports this event. Independent corroboration is missing, which materially limits confidence.', impactOnConfidence: -0.15, suggestedSourceCategory: 'NEWS', severity: 'HIGH' })
      }
      if (directions.size === 1) {
        gapSpecs.push({ title: 'No countervailing evidence', description: 'All supporting signals point the same way; no evidence against this event has been collected yet.', impactOnConfidence: -0.1, suggestedSourceCategory: 'NEWS', severity: 'MEDIUM' })
      }
      if (now.getTime() - newest > STALE_DAYS * 24 * 60 * 60 * 1000) {
        gapSpecs.push({ title: 'Evidence may be stale', description: `The newest supporting signal is older than ${STALE_DAYS} days. Conditions may have changed.`, impactOnConfidence: -0.1, suggestedSourceCategory: 'NEWS', severity: 'MEDIUM' })
      }
      if (!event.affectedSector) {
        gapSpecs.push({ title: 'Sector unresolved', description: 'No sector could be attributed from the evidence; scope of impact is unclear.', impactOnConfidence: -0.05, suggestedSourceCategory: 'OFFICIAL', severity: 'LOW' })
      }
      for (const spec of gapSpecs) {
        dataGaps.push(await prisma.dataGap.create({ data: { eventCandidateId: event.id, ...spec } }))
      }

      const templates = TRIGGER_TEMPLATES[event.eventType] ?? FALLBACK_TEMPLATES
      for (const t of templates) {
        triggerConditions.push(
          await prisma.triggerCondition.create({ data: { eventCandidateId: event.id, ...t } }),
        )
      }
    } catch (err) {
      errors.push({ stage: 'gaps', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { dataGaps, triggerConditions, errors }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: data gap detection and trigger condition templates per event"
```

---

### Task 12: Full scan orchestrator

**Files:**
- Create: `src/server/pipeline/orchestrator.ts`
- Test: `tests/pipeline/orchestrator.test.ts`

**Interfaces:**
- Consumes: every stage function from Tasks 4–11.
- Produces: `runFullScan(options?: { scanType?: string }): Promise<ScanSummary>` from `@/server/pipeline/orchestrator`, where:
```ts
export type ScanSummary = {
  scanRunId: string
  status: string
  startedAt: string      // ISO
  completedAt: string | null
  message: string
  counts: {
    sourcesScanned: number
    sourcesSkipped: number
    documentsFetched: number
    claimsExtracted: number
    signalsCreated: number
    clustersCreated: number
    eventCandidatesCreated: number
    dashboardFeedItemsCreated: number
  }
  errors: { stage: string; sourceId?: string; message: string }[]
}
```
- Behaviour: creates a RUNNING ScanRun; loads active sources; collect → parse → claims → signals → cluster → events+feed → classify → gaps/triggers; aggregates stage errors (skipped sources recorded as stage `collect:skip` entries); finalises ScanRun with counts, `errorsJson`, `completedAt`, and status `COMPLETED` (no errors) / `COMPLETED_WITH_ERRORS` (some errors) / `FAILED` (orchestrator-level throw). Task 13's API calls this directly.

- [ ] **Step 1: Write failing tests**

`tests/pipeline/orchestrator.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { makeSource } from '../factories'

describe('runFullScan', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
  })

  it('runs the full pipeline from fixture sources to dashboard feed items', async () => {
    const summary = await runFullScan()

    expect(summary.status).toBe('COMPLETED_WITH_ERRORS') // unsupported source is skipped+recorded
    expect(summary.counts.sourcesScanned).toBe(2)
    expect(summary.counts.sourcesSkipped).toBe(1)
    expect(summary.counts.documentsFetched).toBe(8)
    expect(summary.counts.claimsExtracted).toBeGreaterThan(0)
    expect(summary.counts.signalsCreated).toBeGreaterThan(0)
    expect(summary.counts.clustersCreated).toBeGreaterThan(0)
    expect(summary.counts.eventCandidatesCreated).toBeGreaterThan(0)
    expect(summary.counts.dashboardFeedItemsCreated).toBeGreaterThan(0)

    // ScanRun row matches reality
    const scanRun = await prisma.scanRun.findUniqueOrThrow({ where: { id: summary.scanRunId } })
    expect(scanRun.documentsFetched).toBe(await prisma.document.count())
    expect(scanRun.eventCandidatesCreated).toBe(await prisma.eventCandidate.count())
    expect(scanRun.completedAt).not.toBeNull()

    // The fixture corpora must produce both risk and opportunity events, all fixture-labelled
    const events = await prisma.eventCandidate.findMany()
    expect(events.some((e) => e.eventClass === 'RISK')).toBe(true)
    expect(events.some((e) => e.eventClass === 'OPPORTUNITY')).toBe(true)
    expect(events.every((e) => e.isFixture)).toBe(true)
    // No event required a company: entity resolution is deferred, so all are entity-free
    expect(events.every((e) => e.primaryEntityId === null)).toBe(true)

    // Evidence trail: every event has at least one cluster with signals→claims→documents
    const withTrail = await prisma.eventCandidate.findFirstOrThrow({
      include: { clusters: { include: { signals: { include: { signal: { include: { claim: true } } } } } }, riskOpportunities: true, dataGaps: true, triggerConditions: true },
    })
    expect(withTrail.clusters.length).toBeGreaterThan(0)
    expect(withTrail.clusters[0].signals.length).toBeGreaterThan(0)
    expect(withTrail.riskOpportunities.length).toBe(1)
    expect(withTrail.triggerConditions.length).toBeGreaterThan(0)
  })

  it('completes even when one source fails, recording the error', async () => {
    await makeSource({ name: 'Broken RSS', accessMethod: 'RSS', url: 'http://127.0.0.1:9/nope.xml', isFixture: false })
    const summary = await runFullScan()
    expect(summary.status).toBe('COMPLETED_WITH_ERRORS')
    expect(summary.errors.some((e) => e.stage === 'collect')).toBe(true)
    expect(summary.counts.documentsFetched).toBe(8) // fixture docs still flowed through
    expect(summary.counts.eventCandidatesCreated).toBeGreaterThan(0)
  })

  it('is idempotent: a second scan creates no duplicate documents or signals', async () => {
    await runFullScan()
    const second = await runFullScan()
    expect(second.counts.documentsFetched).toBe(0)
    expect(second.counts.signalsCreated).toBe(0)
    expect(await prisma.document.count()).toBe(8)
  })
})
```

Run: `npm test`
Expected: FAIL — `Cannot find module '@/server/pipeline/orchestrator'`.

- [ ] **Step 2: Implement**

`src/server/pipeline/orchestrator.ts`:
```ts
import { prisma } from '@/server/db'
import { collectFromSources } from './collect'
import { parseDocuments } from './parse'
import { extractClaims } from './claims'
import { createSignals } from './signals'
import { clusterSignals } from './cluster'
import { createEventCandidates } from './events'
import { classifyEvents } from './classify'
import { generateGapsAndTriggers } from './gaps'
import type { PipelineError } from './types'

export type ScanSummary = {
  scanRunId: string
  status: string
  startedAt: string
  completedAt: string | null
  message: string
  counts: {
    sourcesScanned: number
    sourcesSkipped: number
    documentsFetched: number
    claimsExtracted: number
    signalsCreated: number
    clustersCreated: number
    eventCandidatesCreated: number
    dashboardFeedItemsCreated: number
  }
  errors: PipelineError[]
}

export async function runFullScan(options: { scanType?: string } = {}): Promise<ScanSummary> {
  const scanRun = await prisma.scanRun.create({
    data: { scanType: options.scanType ?? 'FULL', status: 'RUNNING' },
  })
  const errors: PipelineError[] = []
  const counts = {
    sourcesScanned: 0,
    sourcesSkipped: 0,
    documentsFetched: 0,
    claimsExtracted: 0,
    signalsCreated: 0,
    clustersCreated: 0,
    eventCandidatesCreated: 0,
    dashboardFeedItemsCreated: 0,
  }

  try {
    // 1–4. Load active sources, collect, store raw evidence, dedupe.
    const sources = await prisma.source.findMany({ where: { isActive: true } })
    const collected = await collectFromSources(sources)
    errors.push(...collected.errors)
    for (const skip of collected.skipped) {
      errors.push({ stage: 'collect:skip', sourceId: skip.sourceId, message: skip.reason })
    }
    counts.sourcesSkipped = collected.skipped.length
    counts.sourcesScanned = sources.length - collected.skipped.length
    counts.documentsFetched = collected.documents.length
    const docsById = new Map(collected.documents.map((d) => [d.id, d]))

    // 5. Parse.
    const parsed = await parseDocuments(collected.documents)
    errors.push(...parsed.errors)

    // 6. Extract claims.
    const claims = await extractClaims(parsed.parsed, docsById)
    errors.push(...claims.errors)
    counts.claimsExtracted = claims.claims.length

    // 7. Create signals.
    const signals = await createSignals(claims.claims, docsById)
    errors.push(...signals.errors)
    counts.signalsCreated = signals.signals.length

    // 8. Cluster signals.
    const clusters = await clusterSignals(signals.signals)
    errors.push(...clusters.errors)
    counts.clustersCreated = clusters.clusters.length

    // 9–10. Event candidates + dashboard feed items.
    const events = await createEventCandidates(clusters.clusters, scanRun.id)
    errors.push(...events.errors)
    counts.eventCandidatesCreated = events.events.length
    counts.dashboardFeedItemsCreated = events.feedItems.length

    // 11. Risk/opportunity classification.
    const classified = await classifyEvents(events.events)
    errors.push(...classified.errors)

    // 12. Data gaps + trigger conditions.
    const gaps = await generateGapsAndTriggers(events.events)
    errors.push(...gaps.errors)

    const status = errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'
    const completed = await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: { status, completedAt: new Date(), errorsJson: JSON.stringify(errors), ...counts },
    })
    return {
      scanRunId: completed.id,
      status,
      startedAt: completed.startedAt.toISOString(),
      completedAt: completed.completedAt?.toISOString() ?? null,
      message: `Scan ${status.toLowerCase().replace(/_/g, ' ')}: ${counts.eventCandidatesCreated} event candidate(s) detected.`,
      counts,
      errors,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push({ stage: 'orchestrator', message })
    const failed = await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: { status: 'FAILED', completedAt: new Date(), errorsJson: JSON.stringify(errors), ...counts },
    })
    return {
      scanRunId: failed.id,
      status: 'FAILED',
      startedAt: failed.startedAt.toISOString(),
      completedAt: failed.completedAt?.toISOString() ?? null,
      message: `Scan failed: ${message}`,
      counts,
      errors,
    }
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: PASS — including all three orchestrator tests.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: full autonomous scan orchestrator wiring collect→parse→claims→signals→clusters→events→classify→gaps"
```

---

### Task 13: Services and API routes

**Files:**
- Create: `src/server/services/dashboard.ts`, `src/server/services/events.ts`
- Create: `src/app/api/scans/run/route.ts`, `src/app/api/scans/[id]/route.ts`, `src/app/api/dashboard/route.ts`, `src/app/api/events/[id]/route.ts`, `src/app/api/sources/route.ts`
- Test: `tests/api/api.test.ts`

**Interfaces:**
- Consumes: `runFullScan` (Task 12), Prisma models.
- Produces (services return fully serialized objects — dates as ISO strings — safe to pass to client components):

```ts
// @/server/services/dashboard
export type FeedCardData = {
  eventId: string; title: string; eventType: string; eventClass: string; status: string
  sector: string | null; region: string | null
  severity: number; probability: number; confidence: number
  riskScore: number; opportunityScore: number
  evidenceCount: number; sourceDiversityScore: number
  lastUpdatedAt: string; isFixture: boolean; whyItMatters: string | null
}
export type SourceStatus = {
  id: string; name: string; category: string; accessMethod: string; isActive: boolean
  isFixture: boolean; collectorStatus: string; lastRunStatus: string | null; lastRunAt: string | null
}
export type DashboardData = {
  lastScan: { id: string; status: string; startedAt: string; completedAt: string | null
    eventCandidatesCreated: number; documentsFetched: number; errors: { stage: string; message: string }[] } | null
  counts: { newEvents: number; rising: number; highConfidence: number; watch: number }
  riskRadar: FeedCardData[]; opportunityRadar: FeedCardData[]; inbox: FeedCardData[]
  sources: SourceStatus[]
}
export function getDashboardData(): Promise<DashboardData>

// @/server/services/events
export type EvidenceItem = {
  claimId: string; claimText: string; claimType: string; confidence: number; needsReview: boolean
  date: string | null; direction: string; documentTitle: string; documentUrl: string
  sourceName: string; isFixture: boolean
}
export type EventDetail = {
  event: {
    id: string; title: string; eventType: string; eventClass: string; status: string; summary: string
    severity: number; probability: number; confidence: number; riskScore: number; opportunityScore: number
    noveltyScore: number; evidenceCount: number; sourceDiversityScore: number
    affectedSector: string | null; affectedRegion: string | null
    firstDetectedAt: string; lastUpdatedAt: string
    timeWindowStart: string | null; timeWindowEnd: string | null
    isFixture: boolean; primaryEntity: { id: string; name: string } | null
  }
  riskOpportunities: { type: string; title: string; explanation: string; riskLogic: string; opportunityLogic: string; confidence: number }[]
  suggestedQuestions: string[]
  clusters: { id: string; title: string; explanation: string; strength: number; confidence: number; novelty: number }[]
  evidence: EvidenceItem[]        // full timeline, date ascending
  evidenceAgainst: EvidenceItem[] // subset opposing the event's dominant direction
  dataGaps: { title: string; description: string; impactOnConfidence: number; suggestedSourceCategory: string; severity: string }[]
  triggerConditions: { signalType: string; conditionText: string; direction: string; probabilityImpact: number; priority: number }[]
  relatedEntities: { id: string; name: string }[]
}
export function getEventDetail(id: string): Promise<EventDetail | null>
export type EventAction = 'ESCALATE' | 'DISMISS' | 'NEEDS_REVIEW'
export function updateEventStatus(id: string, action: EventAction): Promise<{ id: string; status: string } | null>
```

- API contract: `POST /api/scans/run` → 201 with `ScanSummary`, 409 `{ error, scanRunId }` if a scan is RUNNING. `GET /api/scans/[id]` → 200 ScanRun JSON or 404. `GET /api/dashboard` → 200 `DashboardData`. `GET /api/events/[id]` → 200 `EventDetail` or 404. `PATCH /api/events/[id]` body `{ action: EventAction }` (Zod-validated) → 200 `{ id, status }`, 400 invalid, 404 unknown. `GET /api/sources` → 200 `SourceStatus[]`. All handlers return standard `Response.json(...)` (no `next/server` import → directly unit-testable).

- [ ] **Step 1: Write failing tests**

`tests/api/api.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { POST as runScan } from '@/app/api/scans/run/route'
import { GET as getScan } from '@/app/api/scans/[id]/route'
import { GET as getDashboard } from '@/app/api/dashboard/route'
import { GET as getEvent, PATCH as patchEvent } from '@/app/api/events/[id]/route'
import { GET as getSources } from '@/app/api/sources/route'

const req = (method: string, body?: unknown) =>
  new Request('http://test.local/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('scan API', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
  })

  it('POST /api/scans/run executes a full scan and returns the summary', async () => {
    const res = await runScan()
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.scanRunId).toBeTruthy()
    expect(body.counts.eventCandidatesCreated).toBeGreaterThan(0)
    expect(await prisma.scanRun.count()).toBe(1)
  })

  it('POST /api/scans/run returns 409 while a scan is running', async () => {
    await prisma.scanRun.create({ data: { status: 'RUNNING' } })
    const res = await runScan()
    expect(res.status).toBe(409)
  })

  it('GET /api/scans/[id] returns counts and errors; 404 for unknown', async () => {
    const summary = await runFullScan()
    const res = await getScan(req('GET'), { params: Promise.resolve({ id: summary.scanRunId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe(summary.status)
    expect(body.eventCandidatesCreated).toBe(summary.counts.eventCandidatesCreated)
    expect(Array.isArray(body.errors)).toBe(true)
    const missing = await getScan(req('GET'), { params: Promise.resolve({ id: 'nope' }) })
    expect(missing.status).toBe(404)
  })
})

describe('dashboard + events + sources API', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    await runFullScan()
  })

  it('GET /api/dashboard returns detected events in radar and inbox', async () => {
    const res = await getDashboard()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lastScan).not.toBeNull()
    expect(body.riskRadar.length).toBeGreaterThan(0)
    expect(body.opportunityRadar.length).toBeGreaterThan(0)
    expect(body.inbox.length).toBeGreaterThan(0)
    expect(body.inbox.every((c: { isFixture: boolean }) => c.isFixture)).toBe(true)
  })

  it('GET /api/events/[id] returns full interrogation payload for an entity-free event', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow({ where: { primaryEntityId: null } })
    const res = await getEvent(req('GET'), { params: Promise.resolve({ id: event.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event.primaryEntity).toBeNull()
    expect(body.evidence.length).toBeGreaterThan(0)
    expect(body.riskOpportunities.length).toBe(1)
    expect(body.triggerConditions.length).toBeGreaterThan(0)
    expect(body.suggestedQuestions).toContain('What changed in the last seven days?')
  })

  it('PATCH /api/events/[id] updates status and rejects invalid actions', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow()
    const ok = await patchEvent(req('PATCH', { action: 'ESCALATE' }), { params: Promise.resolve({ id: event.id }) })
    expect(ok.status).toBe(200)
    expect((await ok.json()).status).toBe('ESCALATED')
    const updated = await prisma.eventCandidate.findUniqueOrThrow({ where: { id: event.id } })
    expect(updated.status).toBe('ESCALATED')

    const bad = await patchEvent(req('PATCH', { action: 'DELETE_EVERYTHING' }), { params: Promise.resolve({ id: event.id }) })
    expect(bad.status).toBe(400)
    const missing = await patchEvent(req('PATCH', { action: 'DISMISS' }), { params: Promise.resolve({ id: 'nope' }) })
    expect(missing.status).toBe(404)
  })

  it('GET /api/sources lists sources with collector support status', async () => {
    const res = await getSources()
    const body = await res.json()
    expect(body.length).toBe(3)
    expect(body.some((s: { collectorStatus: string }) => s.collectorStatus === 'UNSUPPORTED')).toBe(true)
  })
})
```

Run: `npm test`
Expected: FAIL — service/route modules not found.

- [ ] **Step 2: Implement services**

`src/server/services/dashboard.ts`:
```ts
import { prisma } from '@/server/db'
import type { EventCandidate, RiskOpportunity } from '@prisma/client'

export type FeedCardData = {
  eventId: string; title: string; eventType: string; eventClass: string; status: string
  sector: string | null; region: string | null
  severity: number; probability: number; confidence: number
  riskScore: number; opportunityScore: number
  evidenceCount: number; sourceDiversityScore: number
  lastUpdatedAt: string; isFixture: boolean; whyItMatters: string | null
}

export type SourceStatus = {
  id: string; name: string; category: string; accessMethod: string; isActive: boolean
  isFixture: boolean; collectorStatus: string; lastRunStatus: string | null; lastRunAt: string | null
}

export type DashboardData = {
  lastScan: {
    id: string; status: string; startedAt: string; completedAt: string | null
    eventCandidatesCreated: number; documentsFetched: number
    errors: { stage: string; message: string }[]
  } | null
  counts: { newEvents: number; rising: number; highConfidence: number; watch: number }
  riskRadar: FeedCardData[]
  opportunityRadar: FeedCardData[]
  inbox: FeedCardData[]
  sources: SourceStatus[]
}

type EventWithRO = EventCandidate & { riskOpportunities: RiskOpportunity[] }

function toCard(event: EventWithRO): FeedCardData {
  return {
    eventId: event.id,
    title: event.title,
    eventType: event.eventType,
    eventClass: event.eventClass,
    status: event.status,
    sector: event.affectedSector,
    region: event.affectedRegion,
    severity: event.severity,
    probability: event.probability,
    confidence: event.confidence,
    riskScore: event.riskScore,
    opportunityScore: event.opportunityScore,
    evidenceCount: event.evidenceCount,
    sourceDiversityScore: event.sourceDiversityScore,
    lastUpdatedAt: event.lastUpdatedAt.toISOString(),
    isFixture: event.isFixture,
    whyItMatters: event.riskOpportunities[0]?.opportunityLogic ?? null,
  }
}

async function radar(feedType: string): Promise<FeedCardData[]> {
  const items = await prisma.dashboardFeedItem.findMany({
    where: { feedType, status: { notIn: ['DISMISSED'] } },
    orderBy: { priority: 'desc' },
    take: 12,
    include: { eventCandidate: { include: { riskOpportunities: { take: 1 } } } },
  })
  return items.map((i) => toCard(i.eventCandidate))
}

export async function getDashboardData(): Promise<DashboardData> {
  const lastScanRow = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } })
  const [newEvents, rising, highConfidence, watch] = await Promise.all([
    prisma.eventCandidate.count({ where: { status: 'NEW' } }),
    prisma.eventCandidate.count({ where: { status: 'RISING' } }),
    prisma.eventCandidate.count({ where: { confidence: { gte: 0.7 }, eventClass: { not: 'WATCH' } } }),
    prisma.eventCandidate.count({ where: { eventClass: 'WATCH' } }),
  ])
  const inboxEvents = await prisma.eventCandidate.findMany({
    orderBy: { lastUpdatedAt: 'desc' },
    take: 50,
    include: { riskOpportunities: { take: 1 } },
  })
  const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } })
  return {
    lastScan: lastScanRow
      ? {
          id: lastScanRow.id,
          status: lastScanRow.status,
          startedAt: lastScanRow.startedAt.toISOString(),
          completedAt: lastScanRow.completedAt?.toISOString() ?? null,
          eventCandidatesCreated: lastScanRow.eventCandidatesCreated,
          documentsFetched: lastScanRow.documentsFetched,
          errors: JSON.parse(lastScanRow.errorsJson),
        }
      : null,
    counts: { newEvents, rising, highConfidence, watch },
    riskRadar: await radar('RISK_RADAR'),
    opportunityRadar: await radar('OPPORTUNITY_RADAR'),
    inbox: inboxEvents.map(toCard),
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      accessMethod: s.accessMethod,
      isActive: s.isActive,
      isFixture: s.isFixture,
      collectorStatus: s.collectorStatus,
      lastRunStatus: s.lastRunStatus,
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
    })),
  }
}
```

`src/server/services/events.ts`:
```ts
import { prisma } from '@/server/db'

export type EvidenceItem = {
  claimId: string; claimText: string; claimType: string; confidence: number; needsReview: boolean
  date: string | null; direction: string; documentTitle: string; documentUrl: string
  sourceName: string; isFixture: boolean
}

export type EventDetail = {
  event: {
    id: string; title: string; eventType: string; eventClass: string; status: string; summary: string
    severity: number; probability: number; confidence: number; riskScore: number; opportunityScore: number
    noveltyScore: number; evidenceCount: number; sourceDiversityScore: number
    affectedSector: string | null; affectedRegion: string | null
    firstDetectedAt: string; lastUpdatedAt: string
    timeWindowStart: string | null; timeWindowEnd: string | null
    isFixture: boolean; primaryEntity: { id: string; name: string } | null
  }
  riskOpportunities: { type: string; title: string; explanation: string; riskLogic: string; opportunityLogic: string; confidence: number }[]
  suggestedQuestions: string[]
  clusters: { id: string; title: string; explanation: string; strength: number; confidence: number; novelty: number }[]
  evidence: EvidenceItem[]
  evidenceAgainst: EvidenceItem[]
  dataGaps: { title: string; description: string; impactOnConfidence: number; suggestedSourceCategory: string; severity: string }[]
  triggerConditions: { signalType: string; conditionText: string; direction: string; probabilityImpact: number; priority: number }[]
  relatedEntities: { id: string; name: string }[]
}

export async function getEventDetail(id: string): Promise<EventDetail | null> {
  const event = await prisma.eventCandidate.findUnique({
    where: { id },
    include: {
      primaryEntity: true,
      riskOpportunities: true,
      dataGaps: true,
      triggerConditions: { orderBy: { priority: 'asc' } },
      entities: { include: { entity: true } },
      clusters: {
        include: {
          signals: {
            include: {
              signal: {
                include: { claim: true, document: { include: { source: true } } },
              },
            },
          },
        },
      },
    },
  })
  if (!event) return null

  const evidence: EvidenceItem[] = event.clusters
    .flatMap((c) => c.signals.map((link) => link.signal))
    .map((s) => ({
      claimId: s.claim.id,
      claimText: s.claim.claimText,
      claimType: s.claim.claimType,
      confidence: s.claim.extractionConfidence,
      needsReview: s.claim.needsReview,
      date: (s.claim.claimDate ?? s.document.publishedAt)?.toISOString() ?? null,
      direction: s.direction,
      documentTitle: s.document.title,
      documentUrl: s.document.url,
      sourceName: s.document.source.name,
      isFixture: s.isFixture,
    }))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const opposing =
    event.eventClass === 'RISK' ? 'POSITIVE' : event.eventClass === 'OPPORTUNITY' ? 'NEGATIVE' : null
  const evidenceAgainst = opposing ? evidence.filter((e) => e.direction === opposing) : []

  const suggestedQuestions = [
    ...new Set(event.riskOpportunities.flatMap((ro) => JSON.parse(ro.questionsJson) as string[])),
  ]

  return {
    event: {
      id: event.id,
      title: event.title,
      eventType: event.eventType,
      eventClass: event.eventClass,
      status: event.status,
      summary: event.summary,
      severity: event.severity,
      probability: event.probability,
      confidence: event.confidence,
      riskScore: event.riskScore,
      opportunityScore: event.opportunityScore,
      noveltyScore: event.noveltyScore,
      evidenceCount: event.evidenceCount,
      sourceDiversityScore: event.sourceDiversityScore,
      affectedSector: event.affectedSector,
      affectedRegion: event.affectedRegion,
      firstDetectedAt: event.firstDetectedAt.toISOString(),
      lastUpdatedAt: event.lastUpdatedAt.toISOString(),
      timeWindowStart: event.timeWindowStart?.toISOString() ?? null,
      timeWindowEnd: event.timeWindowEnd?.toISOString() ?? null,
      isFixture: event.isFixture,
      primaryEntity: event.primaryEntity ? { id: event.primaryEntity.id, name: event.primaryEntity.name } : null,
    },
    riskOpportunities: event.riskOpportunities.map((ro) => ({
      type: ro.type,
      title: ro.title,
      explanation: ro.explanation,
      riskLogic: ro.riskLogic,
      opportunityLogic: ro.opportunityLogic,
      confidence: ro.confidence,
    })),
    suggestedQuestions,
    clusters: event.clusters.map((c) => ({
      id: c.id,
      title: c.title,
      explanation: c.explanation,
      strength: c.strength,
      confidence: c.confidence,
      novelty: c.novelty,
    })),
    evidence,
    evidenceAgainst,
    dataGaps: event.dataGaps.map((g) => ({
      title: g.title,
      description: g.description,
      impactOnConfidence: g.impactOnConfidence,
      suggestedSourceCategory: g.suggestedSourceCategory,
      severity: g.severity,
    })),
    triggerConditions: event.triggerConditions.map((t) => ({
      signalType: t.signalType,
      conditionText: t.conditionText,
      direction: t.direction,
      probabilityImpact: t.probabilityImpact,
      priority: t.priority,
    })),
    relatedEntities: event.entities.map((link) => ({ id: link.entity.id, name: link.entity.name })),
  }
}

export type EventAction = 'ESCALATE' | 'DISMISS' | 'NEEDS_REVIEW'

const ACTION_TO_STATUS: Record<EventAction, string> = {
  ESCALATE: 'ESCALATED',
  DISMISS: 'DISMISSED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
}

export async function updateEventStatus(
  id: string,
  action: EventAction,
): Promise<{ id: string; status: string } | null> {
  const event = await prisma.eventCandidate.findUnique({ where: { id } })
  if (!event) return null
  const status = ACTION_TO_STATUS[action]
  await prisma.$transaction([
    prisma.eventCandidate.update({ where: { id }, data: { status } }),
    prisma.dashboardFeedItem.updateMany({ where: { eventCandidateId: id }, data: { status } }),
  ])
  return { id, status }
}
```

- [ ] **Step 3: Implement routes**

`src/app/api/scans/run/route.ts`:
```ts
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'

export async function POST() {
  const running = await prisma.scanRun.findFirst({ where: { status: 'RUNNING' } })
  if (running) {
    return Response.json(
      { error: 'A scan is already running', scanRunId: running.id },
      { status: 409 },
    )
  }
  const summary = await runFullScan()
  return Response.json(summary, { status: 201 })
}
```

`src/app/api/scans/[id]/route.ts`:
```ts
import { prisma } from '@/server/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scanRun = await prisma.scanRun.findUnique({ where: { id } })
  if (!scanRun) return Response.json({ error: 'Scan run not found' }, { status: 404 })
  const { errorsJson, ...rest } = scanRun
  return Response.json({ ...rest, errors: JSON.parse(errorsJson) })
}
```

`src/app/api/dashboard/route.ts`:
```ts
import { getDashboardData } from '@/server/services/dashboard'

export async function GET() {
  return Response.json(await getDashboardData())
}
```

`src/app/api/events/[id]/route.ts`:
```ts
import { z } from 'zod'
import { getEventDetail, updateEventStatus } from '@/server/services/events'

const PatchSchema = z.object({ action: z.enum(['ESCALATE', 'DISMISS', 'NEEDS_REVIEW']) })

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getEventDetail(id)
  if (!detail) return Response.json({ error: 'Event not found' }, { status: 404 })
  return Response.json(detail)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid action', issues: parsed.error.issues }, { status: 400 })
  }
  const result = await updateEventStatus(id, parsed.data.action)
  if (!result) return Response.json({ error: 'Event not found' }, { status: 404 })
  return Response.json(result)
}
```

`src/app/api/sources/route.ts`:
```ts
import { getDashboardData } from '@/server/services/dashboard'

export async function GET() {
  const { sources } = await getDashboardData()
  return Response.json(sources)
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS — all suites including 7 API tests.

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scan/dashboard/event/source APIs with Zod validation and serialized services"
```

---

### Task 14: Live Intelligence Dashboard, Event Interrogation view, admin sources page

**Files:**
- Replace: `src/app/page.tsx` (placeholder from Task 1)
- Create: `src/app/events/[id]/page.tsx`, `src/app/admin/sources/page.tsx`
- Create: `src/components/RunScanButton.tsx`, `src/components/EventCard.tsx`, `src/components/InboxList.tsx`, `src/components/EventActions.tsx`, `src/components/badges.tsx`

**Interfaces:**
- Consumes: `getDashboardData`/`FeedCardData`/`DashboardData` and `getEventDetail`/`EventDetail` from Task 13 services; `POST /api/scans/run` and `PATCH /api/events/[id]` endpoints.
- Produces: the user-facing radar. No new server logic. UI rules: dark radar-room aesthetic (slate palette; rose = risk, emerald = opportunity, amber = watch/fixture); FIXTURE badge on every fixture-derived card and evidence row; honest empty states; no external assets; every event card links to `/events/[id]`.

- [ ] **Step 1: Shared badge components**

`src/components/badges.tsx`:
```tsx
export function FixtureBadge() {
  return (
    <span className="rounded border border-amber-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
      Fixture
    </span>
  )
}

const CLASS_STYLES: Record<string, string> = {
  RISK: 'border-rose-500/60 text-rose-400',
  OPPORTUNITY: 'border-emerald-500/60 text-emerald-400',
  MIXED: 'border-sky-500/60 text-sky-400',
  WATCH: 'border-amber-500/60 text-amber-400',
  UNKNOWN: 'border-slate-500/60 text-slate-400',
}

export function ClassBadge({ eventClass }: { eventClass: string }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CLASS_STYLES[eventClass] ?? CLASS_STYLES.UNKNOWN}`}
    >
      {eventClass}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-300">
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export const pct = (n: number) => `${Math.round(n * 100)}%`
```

- [ ] **Step 2: Run scan button (client)**

`src/components/RunScanButton.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RunScanButton() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runScan() {
    setRunning(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/scans/run', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `Scan failed (HTTP ${res.status})`)
      } else {
        setMessage(body.message)
        router.refresh()
      }
    } catch {
      setError('Could not reach the scan API. Is the server running?')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={runScan}
        disabled={running}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? 'Scanning…' : 'Run scan'}
      </button>
      {message && <p className="text-xs text-emerald-400">{message}</p>}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Event card + inbox (client filter)**

`src/components/EventCard.tsx`:
```tsx
import Link from 'next/link'
import type { FeedCardData } from '@/server/services/dashboard'
import { ClassBadge, FixtureBadge, StatusBadge, pct } from './badges'

export function EventCard({ card }: { card: FeedCardData }) {
  return (
    <Link
      href={`/events/${card.eventId}`}
      className="block rounded-lg border border-slate-800 bg-slate-900 p-4 transition hover:border-slate-600"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">{card.title}</h3>
        <div className="flex shrink-0 gap-1">
          <ClassBadge eventClass={card.eventClass} />
          {card.isFixture && <FixtureBadge />}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {card.eventType.replace(/_/g, ' ')} · {card.sector ?? 'cross-sector'}
        {card.region ? ` · ${card.region}` : ''}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-slate-500">Confidence</dt><dd className="font-mono text-slate-200">{pct(card.confidence)}</dd></div>
        <div><dt className="text-slate-500">Severity</dt><dd className="font-mono text-slate-200">{pct(card.severity)}</dd></div>
        <div><dt className="text-slate-500">Probability</dt><dd className="font-mono text-slate-200">{pct(card.probability)}</dd></div>
        <div><dt className="text-slate-500">Risk</dt><dd className="font-mono text-rose-300">{pct(card.riskScore)}</dd></div>
        <div><dt className="text-slate-500">Opportunity</dt><dd className="font-mono text-emerald-300">{pct(card.opportunityScore)}</dd></div>
        <div><dt className="text-slate-500">Evidence</dt><dd className="font-mono text-slate-200">{card.evidenceCount} · div {pct(card.sourceDiversityScore)}</dd></div>
      </dl>
      {card.whyItMatters && card.eventClass === 'OPPORTUNITY' && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-400">
          <span className="text-slate-500">Why this matters: </span>
          {card.whyItMatters}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <StatusBadge status={card.status} />
        <span className="text-[10px] text-slate-500">
          updated {new Date(card.lastUpdatedAt).toLocaleString('en-GB')}
        </span>
      </div>
    </Link>
  )
}
```

`src/components/InboxList.tsx`:
```tsx
'use client'

import { useState } from 'react'
import type { FeedCardData } from '@/server/services/dashboard'
import { EventCard } from './EventCard'

const FILTERS = ['ALL', 'RISK', 'OPPORTUNITY', 'MIXED', 'WATCH', 'NEW', 'RISING', 'NEEDS_REVIEW', 'CONFIRMED'] as const

export function InboxList({ items }: { items: FeedCardData[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const visible = items.filter(
    (item) => filter === 'ALL' || item.eventClass === filter || item.status === filter,
  )
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              filter === f
                ? 'border-slate-300 bg-slate-200 text-slate-900'
                : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No events match this filter.</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <EventCard key={item.eventId} card={item} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Dashboard page**

`src/app/page.tsx` (replaces placeholder):
```tsx
import Link from 'next/link'
import { getDashboardData } from '@/server/services/dashboard'
import { EventCard } from '@/components/EventCard'
import { InboxList } from '@/components/InboxList'
import { RunScanButton } from '@/components/RunScanButton'
import { FixtureBadge } from '@/components/badges'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const data = await getDashboardData()
  const hasEvents = data.inbox.length > 0

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Archlight — Live Intelligence Dashboard</h1>
          {data.lastScan ? (
            <p className="mt-1 text-sm text-slate-400">
              Last scan {new Date(data.lastScan.startedAt).toLocaleString('en-GB')} ·{' '}
              {data.lastScan.status.replace(/_/g, ' ')} · {data.lastScan.documentsFetched} documents ·{' '}
              {data.lastScan.eventCandidatesCreated} new events
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">No scans yet.</p>
          )}
        </div>
        <RunScanButton />
      </header>

      {data.lastScan && data.lastScan.errors.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-600/50 bg-amber-950/40 p-3 text-xs text-amber-300">
          <p className="font-semibold">Last scan recorded {data.lastScan.errors.length} issue(s):</p>
          <ul className="mt-1 list-inside list-disc">
            {data.lastScan.errors.slice(0, 5).map((e, i) => (
              <li key={i}>[{e.stage}] {e.message}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'New events', value: data.counts.newEvents },
          { label: 'Rising', value: data.counts.rising },
          { label: 'High confidence', value: data.counts.highConfidence },
          { label: 'Watch items', value: data.counts.watch },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">{stat.label}</p>
          </div>
        ))}
      </section>

      {!hasEvents ? (
        <section className="mt-10 rounded-lg border border-dashed border-slate-700 p-10 text-center">
          <h2 className="text-lg font-semibold">No scan data yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            The radar has not detected any events because no scan has produced data. Click{' '}
            <span className="font-semibold text-slate-200">Run scan</span> to collect from the
            configured sources and detect emerging risk and opportunity events.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-rose-300">Live Risk Radar</h2>
            {data.riskRadar.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No risk events detected.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.riskRadar.map((card) => <EventCard key={card.eventId} card={card} />)}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-emerald-300">Opportunity Radar</h2>
            {data.opportunityRadar.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No opportunity events detected.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.opportunityRadar.map((card) => <EventCard key={card.eventId} card={card} />)}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">Emerging Event Inbox</h2>
            <div className="mt-3">
              <InboxList items={data.inbox} />
            </div>
          </section>
        </>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Source Coverage</h2>
          <Link href="/admin/sources" className="text-xs text-slate-400 underline hover:text-slate-200">
            Source admin
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  s.collectorStatus !== 'FUNCTIONAL'
                    ? 'bg-slate-600'
                    : s.lastRunStatus === 'SUCCESS'
                      ? 'bg-emerald-500'
                      : s.lastRunStatus === 'FAILED'
                        ? 'bg-rose-500'
                        : 'bg-amber-500'
                }`}
              />
              <span className="text-slate-300">{s.name}</span>
              {s.isFixture && <FixtureBadge />}
              {s.collectorStatus !== 'FUNCTIONAL' && (
                <span className="text-slate-500">unsupported</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 5: Event interrogation page + actions**

`src/components/EventActions.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ACTIONS = [
  { action: 'ESCALATE', label: 'Escalate', style: 'bg-rose-700 hover:bg-rose-600' },
  { action: 'NEEDS_REVIEW', label: 'Needs review', style: 'bg-amber-700 hover:bg-amber-600' },
  { action: 'DISMISS', label: 'Dismiss', style: 'bg-slate-700 hover:bg-slate-600' },
] as const

export function EventActions({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply(action: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) setError(`Action failed (HTTP ${res.status})`)
      else router.refresh()
    } catch {
      setError('Could not reach the API.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.action}
            disabled={busy}
            onClick={() => apply(a.action)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${a.style}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}
```

`src/app/events/[id]/page.tsx`:
```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getEventDetail } from '@/server/services/events'
import type { EvidenceItem } from '@/server/services/events'
import { EventActions } from '@/components/EventActions'
import { ClassBadge, FixtureBadge, StatusBadge, pct } from '@/components/badges'

export const dynamic = 'force-dynamic'

function EvidenceRow({ item }: { item: EvidenceItem }) {
  return (
    <li className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
      <p className="text-slate-200">“{item.claimText}”</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{item.claimType.replace(/_/g, ' ')}</span>
        <span>· confidence {pct(item.confidence)}</span>
        {item.needsReview && <span className="text-amber-400">· flagged for review</span>}
        <span>· {item.date ? new Date(item.date).toLocaleDateString('en-GB') : 'undated'}</span>
        <span>
          · <a className="underline hover:text-slate-300" href={item.documentUrl}>{item.documentTitle}</a>{' '}
          ({item.sourceName})
        </span>
        {item.isFixture && <FixtureBadge />}
      </p>
    </li>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-slate-200">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getEventDetail(id)
  if (!detail) notFound()
  const { event } = detail

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{event.title}</h1>
            <ClassBadge eventClass={event.eventClass} />
            <StatusBadge status={event.status} />
            {event.isFixture && <FixtureBadge />}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {event.eventType.replace(/_/g, ' ')} · {event.affectedSector ?? 'cross-sector'}
            {event.affectedRegion ? ` · ${event.affectedRegion}` : ''} ·{' '}
            {event.primaryEntity ? event.primaryEntity.name : 'no primary entity — pattern-level event'}
          </p>
        </div>
        <EventActions eventId={event.id} />
      </header>

      <section className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { label: 'Probability', value: pct(event.probability) },
          { label: 'Confidence', value: pct(event.confidence) },
          { label: 'Severity', value: pct(event.severity) },
          { label: 'Risk', value: pct(event.riskScore) },
          { label: 'Opportunity', value: pct(event.opportunityScore) },
          { label: 'Src diversity', value: pct(event.sourceDiversityScore) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
            <p className="font-mono text-lg font-bold">{stat.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{stat.label}</p>
          </div>
        ))}
      </section>

      <Section title="Summary">
        <p className="text-sm leading-relaxed text-slate-300">{event.summary}</p>
      </Section>

      {detail.riskOpportunities.map((ro, i) => (
        <div key={i} className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-4">
            <h3 className="text-sm font-semibold text-rose-300">Risk logic</h3>
            <p className="mt-1 text-sm text-slate-300">{ro.riskLogic}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
            <h3 className="text-sm font-semibold text-emerald-300">Opportunity logic</h3>
            <p className="mt-1 text-sm text-slate-300">{ro.opportunityLogic}</p>
          </div>
        </div>
      ))}

      <Section title={`Evidence timeline (${detail.evidence.length})`}>
        {detail.evidence.length === 0 ? (
          <p className="text-sm text-slate-500">No evidence collected for this event.</p>
        ) : (
          <ul className="space-y-2">{detail.evidence.map((e) => <EvidenceRow key={e.claimId} item={e} />)}</ul>
        )}
      </Section>

      <Section title="Evidence against">
        {detail.evidenceAgainst.length === 0 ? (
          <p className="text-sm text-slate-500">
            No countervailing evidence collected yet — see data gaps below.
          </p>
        ) : (
          <ul className="space-y-2">{detail.evidenceAgainst.map((e) => <EvidenceRow key={e.claimId} item={e} />)}</ul>
        )}
      </Section>

      <Section title="Signal clusters">
        <ul className="space-y-2">
          {detail.clusters.map((c) => (
            <li key={c.id} className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
              <p className="font-semibold text-slate-200">{c.title}</p>
              <p className="mt-1 text-xs text-slate-400">{c.explanation}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Related entities">
        {detail.relatedEntities.length === 0 && !event.primaryEntity ? (
          <p className="text-sm text-slate-500">
            No entities resolved — this event is tracked at {event.affectedSector ?? 'pattern'} level.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {event.primaryEntity && (
              <li className="rounded-md bg-slate-800 px-2 py-1">{event.primaryEntity.name} (primary)</li>
            )}
            {detail.relatedEntities.map((e) => (
              <li key={e.id} className="rounded-md bg-slate-800 px-2 py-1">{e.name}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Data gaps (${detail.dataGaps.length})`}>
        {detail.dataGaps.length === 0 ? (
          <p className="text-sm text-slate-500">No data gaps recorded.</p>
        ) : (
          <ul className="space-y-2">
            {detail.dataGaps.map((g, i) => (
              <li key={i} className="rounded-md border border-amber-900/50 bg-amber-950/20 p-3 text-sm">
                <p className="font-semibold text-amber-300">
                  {g.title} <span className="font-normal text-amber-500">({g.severity}, {g.impactOnConfidence} confidence)</span>
                </p>
                <p className="mt-1 text-xs text-slate-400">{g.description} Suggested source category: {g.suggestedSourceCategory}.</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Trigger conditions">
        <ul className="space-y-2">
          {detail.triggerConditions.map((t, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
              <span className={`mt-0.5 font-mono text-xs ${t.direction === 'RAISES' ? 'text-rose-400' : 'text-emerald-400'}`}>
                {t.direction === 'RAISES' ? '▲' : '▼'} {t.probabilityImpact > 0 ? '+' : ''}{t.probabilityImpact}
              </span>
              <span className="text-slate-300">{t.conditionText}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Suggested interrogation questions">
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
          {detail.suggestedQuestions.map((q, i) => <li key={i}>{q}</li>)}
        </ul>
      </Section>
    </main>
  )
}
```

- [ ] **Step 6: Admin sources page**

`src/app/admin/sources/page.tsx`:
```tsx
import Link from 'next/link'
import { getDashboardData } from '@/server/services/dashboard'
import { FixtureBadge } from '@/components/badges'

export const dynamic = 'force-dynamic'

export default async function SourcesAdminPage() {
  const { sources } = await getDashboardData()
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">Source Registry (read-only)</h1>
      <p className="mt-1 text-sm text-slate-400">
        Support layer only — event discovery is the product surface. A source is only scannable
        when a compatible collector exists.
      </p>
      <table className="mt-6 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
            <th className="py-2 pr-4">Source</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Access</th>
            <th className="py-2 pr-4">Collector</th>
            <th className="py-2 pr-4">Last run</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id} className="border-b border-slate-800">
              <td className="py-2 pr-4">
                <span className="flex items-center gap-2 text-slate-200">
                  {s.name} {s.isFixture && <FixtureBadge />}
                </span>
              </td>
              <td className="py-2 pr-4 text-slate-400">{s.category}</td>
              <td className="py-2 pr-4 font-mono text-xs text-slate-400">{s.accessMethod}</td>
              <td className="py-2 pr-4">
                <span className={s.collectorStatus === 'FUNCTIONAL' ? 'text-emerald-400' : 'text-amber-400'}>
                  {s.collectorStatus}
                </span>
              </td>
              <td className="py-2 pr-4 text-xs text-slate-400">
                {s.lastRunStatus ?? 'never run'}
                {s.lastRunAt ? ` · ${new Date(s.lastRunAt).toLocaleString('en-GB')}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: PASS (no regressions).

Run: `npm run typecheck`
Expected: exits 0.

Run: `npm run build`
Expected: `✓ Compiled successfully`; routes `/`, `/events/[id]`, `/admin/sources`, and the five API routes listed.

Manual smoke (executor with a browser/preview): `npm run dev`, open `/` → empty state offers Run scan; click Run scan → risk + opportunity cards appear with FIXTURE badges; click a card → interrogation page renders all sections; `/admin/sources` lists 4 sources with the unsupported one labelled.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: live intelligence dashboard, event interrogation view, admin sources page"
```

---

### Task 15: End-to-end autonomous radar proof, README, proof report

**Files:**
- Test: `tests/e2e-proof.test.ts`
- Create: `README.md`, `docs/autonomous-radar-proof.md`

**Interfaces:**
- Consumes: everything.
- Produces: the spec's acceptance proof — automated (the test) and documented (the report). **The report must contain REAL command output — never invented numbers.** If any step fails, stop and report the blocker instead of writing the report.

- [ ] **Step 1: Write the end-to-end proof test**

`tests/e2e-proof.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import type { ScanSummary } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { getDashboardData } from '@/server/services/dashboard'
import { getEventDetail } from '@/server/services/events'
import { resetDb } from './helpers'

describe('AUTONOMOUS RADAR PROOF: scan → rows at every stage → dashboard → interrogation', () => {
  let summary: ScanSummary

  beforeAll(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    summary = await runFullScan()
  })

  it('creates rows at every pipeline stage', async () => {
    expect(await prisma.document.count()).toBeGreaterThan(0)
    expect(await prisma.parsedDocument.count()).toBeGreaterThan(0)
    expect(await prisma.claim.count()).toBeGreaterThan(0)
    expect(await prisma.signal.count()).toBeGreaterThan(0)
    expect(await prisma.signalCluster.count()).toBeGreaterThan(0)
    expect(await prisma.eventCandidate.count()).toBeGreaterThan(0)
    expect(await prisma.riskOpportunity.count()).toBeGreaterThan(0)
    expect(await prisma.dashboardFeedItem.count()).toBeGreaterThan(0)
    expect(await prisma.dataGap.count()).toBeGreaterThan(0)
    expect(await prisma.triggerCondition.count()).toBeGreaterThan(0)
  })

  it('records accurate counters on the ScanRun', async () => {
    const scanRun = await prisma.scanRun.findUniqueOrThrow({ where: { id: summary.scanRunId } })
    expect(scanRun.documentsFetched).toBe(await prisma.document.count())
    expect(scanRun.claimsExtracted).toBe(await prisma.claim.count())
    expect(scanRun.signalsCreated).toBe(await prisma.signal.count())
    expect(scanRun.clustersCreated).toBe(await prisma.signalCluster.count())
    expect(scanRun.eventCandidatesCreated).toBe(await prisma.eventCandidate.count())
    expect(scanRun.dashboardFeedItemsCreated).toBe(await prisma.dashboardFeedItem.count())
    expect(scanRun.sourcesSkipped).toBe(1) // the seeded UNSUPPORTED source
    expect(scanRun.completedAt).not.toBeNull()
  })

  it('surfaces scan-created events on the dashboard feed — risk AND opportunity', async () => {
    const dashboard = await getDashboardData()
    expect(dashboard.riskRadar.length).toBeGreaterThan(0)
    expect(dashboard.opportunityRadar.length).toBeGreaterThan(0)
    expect(dashboard.inbox.length).toBe(await prisma.eventCandidate.count())
    // every card is honestly labelled as fixture-derived
    expect([...dashboard.riskRadar, ...dashboard.opportunityRadar].every((c) => c.isFixture)).toBe(true)
  })

  it('opens an event with no manually selected company and shows the full interrogation payload', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow({ where: { primaryEntityId: null } })
    const detail = await getEventDetail(event.id)
    expect(detail).not.toBeNull()
    expect(detail!.event.primaryEntity).toBeNull()
    expect(detail!.evidence.length).toBeGreaterThan(0)           // evidence
    expect(detail!.event.confidence).toBeGreaterThan(0)          // confidence
    expect(detail!.event.sourceDiversityScore).toBeGreaterThan(0) // source diversity
    expect(detail!.dataGaps.length).toBeGreaterThan(0)           // data gaps
    expect(detail!.riskOpportunities[0].riskLogic.length).toBeGreaterThan(0)        // risk logic
    expect(detail!.riskOpportunities[0].opportunityLogic.length).toBeGreaterThan(0) // opportunity logic
  })

  it('preserves the full evidence trail from event back to source', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow({
      include: {
        clusters: {
          include: {
            signals: {
              include: {
                signal: { include: { claim: true, document: { include: { source: true } } } },
              },
            },
          },
        },
      },
    })
    const signal = event.clusters[0].signals[0].signal
    expect(signal.claim.documentId).toBe(signal.document.id)
    expect(signal.document.source.name).toContain('Fixture Wire')
  })
})
```

Run: `npm test`
Expected: PASS — the proof suite plus all previous suites.

- [ ] **Step 2: Write the README**

`README.md`:
```markdown
# Archlight — Autonomous Public Intelligence Radar

Archlight scans configured public data sources, converts evidence into signals,
clusters signals into emerging events, scores them for risk and opportunity,
and surfaces them on a live dashboard for deeper interrogation. No company
upload or selection is ever required — event discovery is the product.

Outputs are strategic intelligence, not financial advice.

## Stack

Next.js 15 (App Router) · TypeScript · Prisma + SQLite · Zod · Vitest · Tailwind CSS.
The intelligence pipeline is deterministic and rule-based (v1) — every score is
explainable and reproducible offline.

## Setup

```bash
npm install
cp .env.example .env        # local SQLite path, no secrets
npm run db:migrate          # apply migrations (creates prisma/dev.db)
npm run db:seed             # seed sources: 2 fixture wires, 1 unsupported, BBC RSS
```

## Run

```bash
npm run dev                 # http://localhost:3000
```

Open the dashboard and click **Run scan**. The scan collects from all active
supported sources (the bundled fixture wires always work offline; BBC RSS is
used when the network allows), then detection results appear as risk and
opportunity cards. Click any card for the interrogation view: evidence trail,
confidence, source diversity, data gaps, trigger conditions and actions.

Fixture-derived records are badged **FIXTURE** everywhere. They are never
presented as live evidence.

## Test

```bash
npm test                    # includes tests/e2e-proof.test.ts — the full
                            # scan→dashboard acceptance proof on fixture sources
npm run typecheck
```

## Scan pipeline

```
Sources → collect (dedupe, raw evidence preserved) → parse → claims →
signals → clusters → event candidates → risk/opportunity classification →
dashboard feed + data gaps + trigger conditions
```

One failed source never fails a scan; every error is recorded on the ScanRun
and shown on the dashboard. See `docs/autonomous-radar-proof.md` for the
recorded end-to-end proof and `docs/superpowers/specs/` for the design spec.

## Deferred (post-spine)

Human review queue · watchlist & alerts · backtesting loop · source-health
tables · security-hardening pass · deployment runbook · LLM enrichment ·
entity resolution.
```

- [ ] **Step 3: Produce the proof report with REAL output**

Run each command and capture actual output:

```bash
rm -f prisma/dev.db && npx prisma migrate deploy
npm run db:seed
npx tsx -e "import('./src/server/pipeline/orchestrator').then(async (m) => { const s = await m.runFullScan(); console.log(JSON.stringify(s, null, 2)); process.exit(0) })"
sqlite3 prisma/dev.db "SELECT 'documents', COUNT(*) FROM Document UNION ALL SELECT 'parsed', COUNT(*) FROM ParsedDocument UNION ALL SELECT 'claims', COUNT(*) FROM Claim UNION ALL SELECT 'signals', COUNT(*) FROM Signal UNION ALL SELECT 'clusters', COUNT(*) FROM SignalCluster UNION ALL SELECT 'events', COUNT(*) FROM EventCandidate UNION ALL SELECT 'riskopps', COUNT(*) FROM RiskOpportunity UNION ALL SELECT 'feeditems', COUNT(*) FROM DashboardFeedItem;"
npm test
```

Then write `docs/autonomous-radar-proof.md` containing: the exact commands run; the ScanRun id and JSON summary from the tsx invocation; the before/after row counts from sqlite3 (before is all zeros on a fresh db — state that); sources skipped and why; any errors recorded; confirmation that `/` and `/events/[id]` render the scan-created events (from the Task 14 manual smoke or a fresh `npm run dev` check); and a verdict line. Verdict rules (copy exactly):

- `PASS: autonomous event discovery works from scan to dashboard.` — only if the dashboard displays an event created by the scan pipeline.
- `PARTIAL: some steps still require manual invocation.`
- `FAIL: dashboard cannot display newly detected events from scan output.`

Never claim PASS without the dashboard actually displaying a scan-created event. Do not fabricate any number in this report.

- [ ] **Step 4: Final verification and commit**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

```bash
git add -A
git commit -m "feat: end-to-end autonomous radar proof test, README, recorded proof report"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Spec §2 in-scope list ↔ Tasks: scaffold (1), data layer + migrations (2), sources + fixtures (3), collection (4), parsing (5), claims (6), signals (7), clustering (8), events + feed (9), classification (10), gaps/triggers (11), orchestrator (12), scan API + services (13), dashboard + interrogation + admin (14), e2e proof + runbook docs (15). Deferred items match spec §2 exactly.
- **Entity resolution** is schema-ready but pipeline-deferred (spec §5 "support layer only"); all spine events are entity-free, which the spec requires to work anyway. Recorded in README deferred list.
- **Type consistency spot-checks:** `ClusterWithSignals.memberSignals` (Tasks 8→9), `ScanSummary` (Tasks 12→13), `FeedCardData`/`EventDetail` (Tasks 13→14), factory signatures (Task 2 → Tasks 4–11), `runSeed({ includeLive })` (Task 3 → 4, 12, 13, 15).
- **Known judgment calls baked in:** inline scan execution (spec D1), rule-based scoring formulas (spec D3) with exact constants stated in Tasks 8–9 so tests are deterministic.

