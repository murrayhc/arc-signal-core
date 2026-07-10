# Outcome-Resolution Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Frozen prediction ledger + auto/review resolution + Brier/calibration/lead-time track record + owner-gated reliability-weight learning, per `docs/superpowers/specs/2026-07-10-outcome-resolution-design.md`.

**Architecture:** New additive layer `src/server/outcome/` (ledger → evidence-window deltas → resolution rules → path classification → track record → weight learning), one new non-fatal orchestrator stage after 15c, review-queue integration via the existing ReviewItem machinery, three new Prisma models, `/track-record` + `/admin/weights` pages.

**Tech Stack:** Next.js App Router, Prisma/SQLite, vitest, existing house patterns (plain-string cross-refs, `isFixture`, `assertNoAdviceLanguage`, non-fatal stages, dedupe keys).

## Global Constraints

- Workspace: `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight New/Archlight` (SPACE in path — always quote; `cd` explicitly in every command; cwd resets to Pygar).
- Never touch `~/Projects/replit-pygar`. No `preview_start` (anchors to Pygar) — verify via tests + `next build`.
- Prisma CLI needs inline `DATABASE_URL="file:./prisma/dev.db"`.
- Additive-only: no relation fields added to existing models; string cross-refs only.
- `isFixture` propagates; fixtures excluded from all aggregates.
- `assertNoAdviceLanguage` before persisting ANY generated prose.
- Deterministic-scan invariant must stay green; with no APPLIED weight suggestion, reliability scoring must be byte-identical to today.
- Reliability penalties stay multiplicative. Independence counts publisher groups.
- All thresholds are named exported constants.
- Commit format: `feat(outcome): …` etc., trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Pre-flight per commit: `npm run typecheck` clean, `npm test` clean.

## Named constants (single source: `src/server/outcome/constants.ts`)

```ts
export const DEFAULT_HORIZON_DAYS = 90        // no timeWindowEnd → firstDetectedAt + 90d
export const DEADLINE_GRACE_DAYS = 7          // timeWindowEnd + 7d
export const REVIEW_EXTENSION_DAYS = 30       // NEEDS_MORE_EVIDENCE pushes deadline out
export const HAPPENED_MIN_NEW_GROUPS = 2      // rule 1b: ≥2 new independent publisher groups
export const PRIMARY_AUTHORITY_AT = 0.85      // rule 1a: primary/official corroboration
export const RELIABILITY_COLLAPSE_BELOW = 0.25
export const WIDENED_MIN_NEW_ENTITIES = 2
export const SUSTAINED_MIN_DISTINCT_DAYS = 2
export const MIN_RESOLVED_FOR_LEARNING = 30
export const MIN_BRIER_IMPROVEMENT = 0.005
export const WEIGHT_FLOOR = 0.05
export const WEIGHT_CEIL = 0.4
export const MAX_WEIGHT_SHIFT = 0.05
export const COIN_FLIP_BRIER = 0.25
export const MAINSTREAM_CATEGORIES = new Set(['NEWS', 'WIRE'])
```

---

### Task 1: Schema, enums, migration, resetDb

**Files:**
- Modify: `prisma/schema.prisma` (append 3 models; add 4 Int columns to ScanRun)
- Modify: `src/shared/enums.ts` (new outcome enums; extend REVIEW_ITEM_TYPES)
- Modify: `src/server/review/service.ts` (ReviewDraft.subjectKind union gains `'prediction'`)
- Modify: `tests/helpers.ts` (resetDb deletes new tables)

**Interfaces:**
- Produces: Prisma models `OutcomePrediction`, `TrackRecordSnapshot`, `ReliabilityWeightSuggestion`; ScanRun columns `predictionsCreated`, `predictionsResolved`, `predictionsPendingReview`, `weightSuggestionsCreated`; enums `PREDICTION_SUBJECT_KINDS/PREDICTION_STATUSES/PREDICTION_OUTCOMES/RESOLUTION_METHODS/OUTCOME_PATHS/WEIGHT_SUGGESTION_STATUSES` (+types), `REVIEW_ITEM_TYPES` including `'PREDICTION_RESOLUTION'`.

- [ ] **Step 1: Append models to `prisma/schema.prisma`** (end of file, with a `── Outcome-Resolution Engine (Stage 11)` banner comment):

```prisma
model OutcomePrediction {
  id                     String    @id @default(cuid())
  subjectKind            String    // 'EVENT' | 'SCENARIO'
  eventCandidateId       String
  scenarioType           String?   // null for EVENT rows; never LOW_CONFIDENCE
  dedupeKey              String    @unique // `${eventCandidateId}:${subjectKind}:${scenarioType ?? '-'}`
  predictionText         String
  predictedProbability   Float     // FROZEN at creation
  finalProbability       Float     // only mutable pre-resolution field
  predictedAt            DateTime  @default(now())
  deadline               DateTime
  evidenceIdsJson        String    @default("[]") // canonical claim ids at freeze
  dimensionsJson         String    @default("{}") // mean reliability dimensions at freeze
  baselineJson           String    @default("{}") // {groups, entityIds, contradictionCount, supportDays}
  confirmingSignalsJson  String    @default("[]")
  weakeningSignalsJson   String    @default("[]")
  status                 String    @default("OPEN") // PREDICTION_STATUSES
  outcome                String?   // PREDICTION_OUTCOMES
  resolvedBy             String?   // RESOLUTION_METHODS
  resolvedAt             DateTime?
  resolutionRationale    String?
  resolutionEvidenceJson String    @default("[]")
  observedPath           String?   // OUTCOME_PATHS
  brierFirst             Float?
  brierFinal             Float?
  leadTimeDays           Float?
  isFixture              Boolean   @default(false)
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  @@index([eventCandidateId])
  @@index([status, deadline])
}

model TrackRecordSnapshot {
  id                    String   @id @default(cuid())
  scanRunId             String
  resolvedCount         Int
  happenedCount         Int
  pendingReviewCount    Int
  openCount             Int
  meanBrierFirst        Float?
  meanBrierFinal        Float?
  baseRate              Float?
  calibrationJson       String   @default("[]")
  meanLeadTimeDays      Float?
  beforeMainstreamCount Int      @default(0)
  byEventTypeJson       String   @default("{}")
  createdAt             DateTime @default(now())

  @@index([createdAt])
}

model ReliabilityWeightSuggestion {
  id                       String    @id @default(cuid())
  scanRunId                String
  basedOnResolvedCount     Int
  currentWeightsJson       String
  suggestedWeightsJson     String
  expectedBrierImprovement Float
  rationaleJson            String    @default("[]")
  status                   String    @default("SUGGESTED") // WEIGHT_SUGGESTION_STATUSES
  appliedAt                DateTime?
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt

  @@index([status])
}
```

And in `model ScanRun` after `futureScenariosCreated`:

```prisma
  predictionsCreated            Int              @default(0)
  predictionsResolved           Int              @default(0)
  predictionsPendingReview      Int              @default(0)
  weightSuggestionsCreated      Int              @default(0)
```

- [ ] **Step 2: Add enums to `src/shared/enums.ts`** (new Stage-11 section at the end) and `'PREDICTION_RESOLUTION'` to `REVIEW_ITEM_TYPES`:

```ts
// ── Outcome-Resolution Engine (Stage 11) ───────────────────────────────────

export const PREDICTION_SUBJECT_KINDS = ['EVENT', 'SCENARIO'] as const
export type PredictionSubjectKind = (typeof PREDICTION_SUBJECT_KINDS)[number]

export const PREDICTION_STATUSES = ['OPEN', 'PENDING_REVIEW', 'RESOLVED'] as const
export type PredictionStatus = (typeof PREDICTION_STATUSES)[number]

export const PREDICTION_OUTCOMES = ['HAPPENED', 'DID_NOT_HAPPEN', 'UNRESOLVABLE'] as const
export type PredictionOutcome = (typeof PREDICTION_OUTCOMES)[number]

export const RESOLUTION_METHODS = ['AUTO_EVIDENCE', 'AUTO_DEADLINE', 'REVIEW'] as const
export type ResolutionMethod = (typeof RESOLUTION_METHODS)[number]

export const OUTCOME_PATHS = ['REVERSED', 'CONTAINED', 'SUSTAINED', 'WIDENED', 'NONE'] as const
export type OutcomePath = (typeof OUTCOME_PATHS)[number]

export const WEIGHT_SUGGESTION_STATUSES = ['SUGGESTED', 'APPLIED', 'DISMISSED'] as const
export type WeightSuggestionStatus = (typeof WEIGHT_SUGGESTION_STATUSES)[number]
```

In `REVIEW_ITEM_TYPES`, append `'PREDICTION_RESOLUTION',  // a prediction whose outcome needs a human verdict`.

- [ ] **Step 3:** `ReviewDraft.subjectKind` union in `src/server/review/service.ts` gains `'prediction'`.

- [ ] **Step 4: Migrate:**

```bash
cd "/Users/murrayhewitt-coleman/Desktop/Websites/Archlight New/Archlight" && DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --name outcome_resolution_engine
```
Expected: migration created + applied, client regenerated.

- [ ] **Step 5:** `tests/helpers.ts` resetDb: add at the TOP of the transaction array (no FK relations):

```ts
    // Outcome-Resolution Engine (Stage 11) — no FK relations, delete anytime.
    prisma.outcomePrediction.deleteMany(),
    prisma.trackRecordSnapshot.deleteMany(),
    prisma.reliabilityWeightSuggestion.deleteMany(),
```

- [ ] **Step 6: Verify + commit:** `npm run typecheck && npm test` (all existing green), then commit `feat(outcome): stage 11 schema — prediction ledger, track-record snapshot, weight suggestions`.

---

### Task 2: Active-weights seam + read-only reliability assessment

**Files:**
- Create: `src/server/evidence/weights.ts`
- Modify: `src/server/evidence/reliability.ts` (extract `assessReliability`; weights injectable)
- Test: `tests/stage11-weights-seam.test.ts`

**Interfaces:**
- Produces:
  - `export type ReliabilityWeights = { authority: number; independence: number; support: number; specificity: number; freshness: number; originTrace: number }`
  - `export const DEFAULT_WEIGHTS: ReliabilityWeights` (exact current values 0.26/0.28/0.12/0.14/0.12/0.08)
  - `getActiveWeights(): Promise<ReliabilityWeights>` — latest APPLIED ReliabilityWeightSuggestion's `suggestedWeightsJson`, else DEFAULT_WEIGHTS; 30s in-memory cache
  - `clearWeightsCache(): void`
  - `assessReliability(canonicalClaimId, opts?) → Promise<{ result: ReliabilityResult; errors: EvidenceError[] }>` — pure read, NO writes
  - `scoreReliability` unchanged signature; now = assess + persist.

- [ ] **Step 1: Write failing test** `tests/stage11-weights-seam.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { DEFAULT_WEIGHTS, clearWeightsCache, getActiveWeights } from '@/server/evidence/weights'
import { assessReliability, scoreReliability } from '@/server/evidence/reliability'
import { resetDb } from './helpers'
import { makeAtomicClaim, makeCanonicalClaim, makeDocument, makeLineage, makeSource } from './factories'

describe('active-weights seam (Stage 11)', () => {
  beforeEach(async () => {
    await resetDb()
    clearWeightsCache()
  })

  it('returns defaults with no applied suggestion (deterministic invariant)', async () => {
    expect(await getActiveWeights()).toEqual(DEFAULT_WEIGHTS)
    expect(DEFAULT_WEIGHTS).toEqual({ authority: 0.26, independence: 0.28, support: 0.12, specificity: 0.14, freshness: 0.12, originTrace: 0.08 })
  })

  it('a SUGGESTED (unapplied) suggestion changes nothing; APPLIED takes effect', async () => {
    const weights = { ...DEFAULT_WEIGHTS, authority: 0.31, independence: 0.23 }
    const s = await prisma.reliabilityWeightSuggestion.create({
      data: { scanRunId: 'x', basedOnResolvedCount: 30, currentWeightsJson: JSON.stringify(DEFAULT_WEIGHTS), suggestedWeightsJson: JSON.stringify(weights), expectedBrierImprovement: 0.01 },
    })
    clearWeightsCache()
    expect(await getActiveWeights()).toEqual(DEFAULT_WEIGHTS) // owner-gated
    await prisma.reliabilityWeightSuggestion.update({ where: { id: s.id }, data: { status: 'APPLIED', appliedAt: new Date() } })
    clearWeightsCache()
    expect(await getActiveWeights()).toEqual(weights)
  })

  it('assessReliability computes without persisting; scoreReliability persists the same result', async () => {
    const source = await makeSource({ category: 'REGULATOR' })
    const doc = await makeDocument(source.id)
    const canonical = await makeCanonicalClaim()
    await makeAtomicClaim({ documentId: doc.id, sourceId: source.id, canonicalClaimId: canonical.id })
    await makeLineage(canonical.id, source.id, doc.id, { relationToOrigin: 'ORIGIN_CANDIDATE', publishedAt: new Date() })

    const before = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: canonical.id } })
    const assessed = await assessReliability(canonical.id)
    const after = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: canonical.id } })
    expect(after.reliabilityScore).toBe(before.reliabilityScore) // no write
    const scored = await scoreReliability(canonical.id)
    expect(scored.result.reliabilityScore).toBeCloseTo(assessed.result.reliabilityScore, 10)
    const persisted = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: canonical.id } })
    expect(persisted.reliabilityScore).toBeCloseTo(assessed.result.reliabilityScore, 10)
  })
})
```

(If `makeCanonicalClaim`/`makeLineage` don't exist in `tests/factories.ts`, add them following `makeAtomicClaim`'s style: canonicalClaim with `claimText/normalisedClaimText/claimType`, lineage with `canonicalClaimId/sourceId/documentId/url/relationToOrigin` + overrides.)

- [ ] **Step 2:** Run `cd "<archlight>" && npx vitest run tests/stage11-weights-seam.test.ts` — expect FAIL (module not found).

- [ ] **Step 3: Implement.** `src/server/evidence/weights.ts`:

```ts
import { prisma } from '@/server/db'

export type ReliabilityWeights = {
  authority: number
  independence: number
  support: number
  specificity: number
  freshness: number
  originTrace: number
}

/** Today's hardcoded reliability weights — the deterministic default. An
 *  APPLIED ReliabilityWeightSuggestion (owner action, Stage 11) overrides them;
 *  with none applied, scoring is byte-identical to the pre-Stage-11 engine. */
export const DEFAULT_WEIGHTS: ReliabilityWeights = {
  authority: 0.26,
  independence: 0.28,
  support: 0.12,
  specificity: 0.14,
  freshness: 0.12,
  originTrace: 0.08,
}

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof ReliabilityWeights)[]
const CACHE_TTL_MS = 30_000
let cache: { weights: ReliabilityWeights; at: number } | null = null

export function clearWeightsCache(): void {
  cache = null
}

function parseWeights(json: string): ReliabilityWeights | null {
  try {
    const w = JSON.parse(json)
    if (WEIGHT_KEYS.every((k) => typeof w?.[k] === 'number' && Number.isFinite(w[k]))) {
      return WEIGHT_KEYS.reduce((acc, k) => ({ ...acc, [k]: w[k] }), {} as ReliabilityWeights)
    }
  } catch {
    /* fall through to null */
  }
  return null
}

/** Active reliability weights: the most recently APPLIED suggestion, else the
 *  defaults. Cached briefly; apply/dismiss clears the cache. */
export async function getActiveWeights(): Promise<ReliabilityWeights> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.weights
  const applied = await prisma.reliabilityWeightSuggestion.findFirst({
    where: { status: 'APPLIED' },
    orderBy: { appliedAt: 'desc' },
  })
  const weights = (applied && parseWeights(applied.suggestedWeightsJson)) ?? DEFAULT_WEIGHTS
  cache = { weights, at: Date.now() }
  return weights
}
```

`reliability.ts` refactor (behaviour-preserving):
- Delete the local `WEIGHTS` const; import `{ DEFAULT_WEIGHTS, getActiveWeights, type ReliabilityWeights }` from `./weights`.
- `ReliabilityOptions` gains `weights?: ReliabilityWeights`.
- New exported `assessReliability(canonicalClaimId, opts)` = the current body of `scoreReliability` MINUS the three `prisma.*.update/updateMany` persistence calls, with `const weights = opts.weights ?? (await getActiveWeights())` and the `positive` sum using `weights.*`.
- `scoreReliability` calls `assessReliability`, then performs exactly the three persistence writes it does today, returns the same shape.

- [ ] **Step 4:** Run the new test file → PASS. Run full `npm test` → all green (behaviour-preserving refactor; the deterministic invariant + stage tests prove it).

- [ ] **Step 5: Commit** `feat(outcome): active-weights seam + read-only reliability assessment`.

---

### Task 3: Prediction ledger (freeze + final-probability updates)

**Files:**
- Create: `src/server/outcome/constants.ts` (block above)
- Create: `src/server/outcome/types.ts`
- Create: `src/server/outcome/ledger.ts`
- Test: `tests/stage11-outcome-ledger.test.ts`

**Interfaces:**
- Consumes: `assessReliability`, `canonicalIdsForEvent` (from `@/server/evidence/investigation-loop`), FutureScenario rows, `groupOf` semantics (`source.independenceGroup ?? source.id`).
- Produces:
  - `types.ts`: `OutcomeError = { stage: string; message: string; eventCandidateId?: string; predictionId?: string }`; `OutcomeCounts = { predictionsCreated: number; predictionsResolved: number; predictionsPendingReview: number; weightSuggestionsCreated: number }`; `PredictionBaseline = { groups: string[]; entityIds: string[]; contradictionCount: number; supportDays: string[] }`
  - `ledger.ts`: `freezePredictions(events: {id:string}[], now: Date) → Promise<{created:number; errors:OutcomeError[]}>`; `updateOpenFinalProbabilities() → Promise<{errors:OutcomeError[]}>`; `dedupeKeyFor(eventId, subjectKind, scenarioType?) → string`

- [ ] **Step 1: Failing test** `tests/stage11-outcome-ledger.test.ts` — core cases:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { freezePredictions, updateOpenFinalProbabilities } from '@/server/outcome/ledger'
import { synthesiseContext } from '@/server/consequence/context'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const NOW = new Date('2026-07-10T12:00:00Z')

async function eventWithScenarios() {
  const { event } = await makeEventGraph('The company is cutting 500 jobs in Manchester.')
  await synthesiseContext(event.id)
  return event
}

describe('prediction ledger (Stage 11)', () => {
  beforeEach(resetDb)

  it('freezes 1 EVENT + 4 SCENARIO predictions per event; LOW_CONFIDENCE never graded', async () => {
    const event = await eventWithScenarios()
    const res = await freezePredictions([event], NOW)
    expect(res.errors).toEqual([])
    expect(res.created).toBe(5)
    const rows = await prisma.outcomePrediction.findMany({ where: { eventCandidateId: event.id } })
    expect(rows.filter((r) => r.subjectKind === 'EVENT')).toHaveLength(1)
    expect(rows.filter((r) => r.subjectKind === 'SCENARIO').map((r) => r.scenarioType).sort())
      .toEqual(['ACCELERATED', 'BASE_CASE', 'CONSERVATIVE', 'REVERSAL'])
    expect(rows.every((r) => r.status === 'OPEN')).toBe(true)
    // deadline default: firstDetectedAt + 90d (no timeWindowEnd on the factory event)
    const ev = rows.find((r) => r.subjectKind === 'EVENT')!
    const expected = new Date(event.firstDetectedAt.getTime() + 90 * 86_400_000)
    expect(Math.abs(ev.deadline.getTime() - expected.getTime())).toBeLessThan(1000)
  })

  it('is idempotent and immutable across re-freezes; scenario wipe cannot lose receipts', async () => {
    const event = await eventWithScenarios()
    await freezePredictions([event], NOW)
    const first = await prisma.outcomePrediction.findMany({ orderBy: { dedupeKey: 'asc' } })
    // scenarios get wiped + rebuilt by a later scan (context.ts deleteMany) —
    // then predictions are frozen again with different scenario confidences.
    await prisma.eventCandidate.update({ where: { id: event.id }, data: { probability: 0.9 } })
    await synthesiseContext(event.id)
    const again = await freezePredictions([event], new Date(NOW.getTime() + 86_400_000))
    expect(again.created).toBe(0) // no duplicates
    const second = await prisma.outcomePrediction.findMany({ orderBy: { dedupeKey: 'asc' } })
    expect(second.map((r) => r.predictedProbability)).toEqual(first.map((r) => r.predictedProbability)) // FROZEN
    expect(second.map((r) => r.predictedAt.getTime())).toEqual(first.map((r) => r.predictedAt.getTime()))
  })

  it('updateOpenFinalProbabilities tracks drift without touching the frozen value', async () => {
    const event = await eventWithScenarios()
    await freezePredictions([event], NOW)
    await prisma.eventCandidate.update({ where: { id: event.id }, data: { probability: 0.85 } })
    await synthesiseContext(event.id) // scenario confidences recomputed
    const res = await updateOpenFinalProbabilities()
    expect(res.errors).toEqual([])
    const ev = await prisma.outcomePrediction.findFirstOrThrow({ where: { eventCandidateId: event.id, subjectKind: 'EVENT' } })
    expect(ev.finalProbability).toBe(0.85)
    expect(ev.predictedProbability).not.toBe(0.85)
  })

  it('propagates isFixture and freezes a baseline + dimensions snapshot', async () => {
    const event = await eventWithScenarios()
    await prisma.eventCandidate.update({ where: { id: event.id }, data: { isFixture: true } })
    await freezePredictions([{ id: event.id }], NOW)
    const ev = await prisma.outcomePrediction.findFirstOrThrow({ where: { subjectKind: 'EVENT' } })
    expect(ev.isFixture).toBe(true)
    const baseline = JSON.parse(ev.baselineJson)
    expect(Array.isArray(baseline.groups)).toBe(true)
    expect(Array.isArray(baseline.entityIds)).toBe(true)
    expect(typeof baseline.contradictionCount).toBe('number')
    const dims = JSON.parse(ev.dimensionsJson)
    expect(typeof dims.authority).toBe('number')
  })
})
```

- [ ] **Step 2:** Run → FAIL (module not found).

- [ ] **Step 3: Implement** `types.ts` (interfaces above) and `ledger.ts`:

```ts
import { prisma } from '@/server/db'
import { assessReliability } from '@/server/evidence/reliability'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import { SCENARIO_TYPES } from '@/shared/enums'
import { DEADLINE_GRACE_DAYS, DEFAULT_HORIZON_DAYS } from './constants'
import type { OutcomeError, PredictionBaseline } from './types'

const DAY_MS = 86_400_000
const GRADEABLE_SCENARIOS = SCENARIO_TYPES.filter((t) => t !== 'LOW_CONFIDENCE')

export function dedupeKeyFor(eventId: string, subjectKind: 'EVENT' | 'SCENARIO', scenarioType?: string | null): string {
  return `${eventId}:${subjectKind}:${scenarioType ?? '-'}`
}

export function deadlineFor(event: { firstDetectedAt: Date; timeWindowEnd: Date | null }): Date {
  if (event.timeWindowEnd) return new Date(event.timeWindowEnd.getTime() + DEADLINE_GRACE_DAYS * DAY_MS)
  return new Date(event.firstDetectedAt.getTime() + DEFAULT_HORIZON_DAYS * DAY_MS)
}

const utcDay = (d: Date) => d.toISOString().slice(0, 10)

/** Snapshot of the evidence state at freeze time — the reference point every
 *  later scan diffs against to detect NEW corroboration/contradiction/spread. */
async function buildBaseline(eventId: string, canonicalIds: string[]): Promise<PredictionBaseline> {
  const lineage = canonicalIds.length
    ? await prisma.claimLineage.findMany({ where: { canonicalClaimId: { in: canonicalIds } } })
    : []
  const sourceIds = [...new Set(lineage.map((l) => l.sourceId))]
  const sources = sourceIds.length ? await prisma.source.findMany({ where: { id: { in: sourceIds } } }) : []
  const groupOf = new Map(sources.map((s) => [s.id, s.independenceGroup ?? s.id]))
  const support = lineage.filter((l) => l.relationToOrigin === 'ORIGIN_CANDIDATE' || l.relationToOrigin === 'INDEPENDENT_SUPPORT')
  const canonicals = canonicalIds.length
    ? await prisma.canonicalClaim.findMany({ where: { id: { in: canonicalIds } } })
    : []
  const entities = await prisma.eventCandidateEntity.findMany({ where: { eventCandidateId: eventId } })
  return {
    groups: [...new Set(support.map((l) => groupOf.get(l.sourceId) ?? l.sourceId))],
    entityIds: entities.map((e) => e.entityId),
    contradictionCount: canonicals.reduce((n, c) => n + c.contradictionCount, 0),
    supportDays: [...new Set(support.map((l) => utcDay(l.publishedAt ?? l.createdAt)))],
  }
}

/** Mean reliability dimensions across the event's canonical claims at freeze
 *  time — the frozen input the weight learner backtests against. Read-only. */
async function buildDimensionsSnapshot(canonicalIds: string[], now: Date): Promise<Record<string, number>> {
  const sums: Record<string, number> = {}
  let n = 0
  for (const id of canonicalIds) {
    try {
      const { result } = await assessReliability(id, { now })
      for (const [k, v] of Object.entries(result.dimensions)) sums[k] = (sums[k] ?? 0) + v
      n++
    } catch {
      // claim disappeared mid-scan — skip; the snapshot is a best-effort mean
    }
  }
  if (n === 0) return {}
  return Object.fromEntries(Object.entries(sums).map(([k, v]) => [k, v / n]))
}

/** Freezes the immutable prediction receipts for events that don't have them
 *  yet: 1 EVENT-level + 4 gradeable SCENARIO-level rows. Idempotent on
 *  dedupeKey; existing rows are NEVER updated here (immutability). */
export async function freezePredictions(
  events: { id: string }[],
  now: Date,
): Promise<{ created: number; errors: OutcomeError[] }> {
  const errors: OutcomeError[] = []
  let created = 0
  for (const { id } of events) {
    try {
      const event = await prisma.eventCandidate.findUnique({ where: { id } })
      if (!event) continue
      const existing = await prisma.outcomePrediction.findUnique({ where: { dedupeKey: dedupeKeyFor(id, 'EVENT') } })
      if (existing) continue // receipts already frozen for this event

      const canonicalIds = await canonicalIdsForEvent(id)
      const baseline = await buildBaseline(id, canonicalIds)
      const dimensions = await buildDimensionsSnapshot(canonicalIds, now)
      const deadline = deadlineFor(event)
      const deadlineDay = utcDay(deadline)

      const confirming: string[] = []
      const weakening: string[] = []
      const triggers = await prisma.triggerCondition.findMany({ where: { eventCandidateId: id } })
      for (const t of triggers) (t.direction === 'RAISES' ? confirming : weakening).push(t.conditionText)

      await prisma.outcomePrediction.create({
        data: {
          subjectKind: 'EVENT',
          eventCandidateId: id,
          dedupeKey: dedupeKeyFor(id, 'EVENT'),
          predictionText: `Event "${event.title}" (${event.eventType}) materialises by ${deadlineDay}`,
          predictedProbability: event.probability,
          finalProbability: event.probability,
          predictedAt: now,
          deadline,
          evidenceIdsJson: JSON.stringify(canonicalIds),
          dimensionsJson: JSON.stringify(dimensions),
          baselineJson: JSON.stringify(baseline),
          confirmingSignalsJson: JSON.stringify(confirming),
          weakeningSignalsJson: JSON.stringify(weakening),
          isFixture: event.isFixture,
        },
      })
      created++

      const scenarios = await prisma.futureScenario.findMany({ where: { eventCandidateId: id } })
      for (const scenarioType of GRADEABLE_SCENARIOS) {
        const s = scenarios.find((x) => x.scenarioType === scenarioType)
        if (!s) continue // consequence stage failed for this event — event row still stands
        await prisma.outcomePrediction.create({
          data: {
            subjectKind: 'SCENARIO',
            eventCandidateId: id,
            scenarioType,
            dedupeKey: dedupeKeyFor(id, 'SCENARIO', scenarioType),
            predictionText: `${event.title}: ${s.title} is the path taken by ${deadlineDay}`,
            predictedProbability: s.confidence,
            finalProbability: s.confidence,
            predictedAt: now,
            deadline,
            evidenceIdsJson: JSON.stringify(canonicalIds),
            dimensionsJson: JSON.stringify(dimensions),
            baselineJson: JSON.stringify(baseline),
            confirmingSignalsJson: s.confirmingSignalsJson,
            weakeningSignalsJson: s.weakeningSignalsJson,
            isFixture: event.isFixture,
          },
        })
        created++
      }
    } catch (err) {
      errors.push({ stage: 'outcome:freeze', message: err instanceof Error ? err.message : String(err), eventCandidateId: id })
    }
  }
  return { created, errors }
}

/** Refreshes finalProbability on every OPEN prediction from the live event /
 *  scenario numbers. The frozen predictedProbability is never touched. */
export async function updateOpenFinalProbabilities(): Promise<{ errors: OutcomeError[] }> {
  const errors: OutcomeError[] = []
  const open = await prisma.outcomePrediction.findMany({ where: { status: 'OPEN' } })
  for (const p of open) {
    try {
      if (p.subjectKind === 'EVENT') {
        const event = await prisma.eventCandidate.findUnique({ where: { id: p.eventCandidateId } })
        if (event && event.probability !== p.finalProbability) {
          await prisma.outcomePrediction.update({ where: { id: p.id }, data: { finalProbability: event.probability } })
        }
      } else {
        const s = await prisma.futureScenario.findFirst({
          where: { eventCandidateId: p.eventCandidateId, scenarioType: p.scenarioType ?? undefined },
        })
        if (s && s.confidence !== p.finalProbability) {
          await prisma.outcomePrediction.update({ where: { id: p.id }, data: { finalProbability: s.confidence } })
        }
      }
    } catch (err) {
      errors.push({ stage: 'outcome:final-probability', message: err instanceof Error ? err.message : String(err), predictionId: p.id })
    }
  }
  return { errors }
}
```

- [ ] **Step 4:** Run test file → PASS. Full suite → green.
- [ ] **Step 5: Commit** `feat(outcome): prediction ledger — frozen receipts + final-probability drift`.

---

### Task 4: Evidence-window deltas, resolution rules, path classifier, review wiring

**Files:**
- Create: `src/server/outcome/evidence-window.ts`
- Create: `src/server/outcome/path-classifier.ts`
- Create: `src/server/outcome/resolution.ts`
- Modify: `src/app/api/review/[id]/route.ts` (verdict passthrough)
- Modify: `src/components/ReviewQueue.tsx` (verdict buttons + label)
- Test: `tests/stage11-outcome-resolution.test.ts`

**Interfaces:**
- Produces:
  - `evidence-window.ts`: `type EvidenceDelta = { newSupportGroups: string[]; newSupportDays: number; primaryCorroboration: boolean; newContradictions: number; anyCanonicalContradicted: boolean; minReliability: number; newEntityCount: number; newEvidenceIds: string[] }`; `computeEvidenceDelta(prediction: OutcomePrediction) → Promise<EvidenceDelta>`
  - `path-classifier.ts`: `classifyPath(outcome: PredictionOutcome, resolvedBy: ResolutionMethod, delta: EvidenceDelta) → OutcomePath | null`
  - `resolution.ts`: `evaluateOpenPredictions(now: Date) → Promise<{resolved:number; pendingReview:number; errors:OutcomeError[]}>`; `applyReviewVerdict(predictionId: string, verdict: PredictionOutcome | 'NEEDS_MORE_EVIDENCE', note?: string) → Promise<void>`; `computeLeadTimeDays(eventCandidateId: string, firstDetectedAt: Date) → Promise<number | null>`
- Consumes: Task 3's ledger fields, `upsertReviewItem`, `deriveAuthority`, `assertNoAdviceLanguage`, constants.

**Resolution rules (event-level, exact order):**
1. `delta.primaryCorroboration || (delta.newSupportGroups.length >= HAPPENED_MIN_NEW_GROUPS && delta.newContradictions === 0 && !delta.anyCanonicalContradicted)` → HAPPENED / AUTO_EVIDENCE (+ lead time).
2. `delta.anyCanonicalContradicted || (delta.minReliability < RELIABILITY_COLLAPSE_BELOW && delta.newContradictions > 0)` → DID_NOT_HAPPEN / AUTO_EVIDENCE.
3. `event.status === 'DISMISSED'` → PENDING_REVIEW (immediately, any time).
4. past deadline, `newSupportGroups.length === 0 && newContradictions === 0` → DID_NOT_HAPPEN / AUTO_DEADLINE.
5. past deadline otherwise (mixed) → PENDING_REVIEW.
Pre-deadline with mixed/partial evidence → stays OPEN (wait).

**Scenario timing:** SCENARIO rows resolve only when (a) their event resolved DID_NOT_HAPPEN via AUTO_EVIDENCE → immediately (path REVERSED), or (b) their event is RESOLVED and `now >= deadline` → grade at deadline with the full-window delta; UNRESOLVABLE events → scenarios UNRESOLVABLE (no Brier). Event row's `observedPath` is stamped when scenarios grade.

**Lead time:** over the event's canonical lineage: `earliestAny = min(publishedAt)` across all rows; `earliestMainstream = min(publishedAt)` across rows whose source category ∈ MAINSTREAM_CATEGORIES. No mainstream rows → null. `earliestMainstream <= earliestAny` → 0 (we learned it FROM mainstream). Else `(earliestMainstream − firstDetectedAt) / DAY_MS` (signed).

**Review wiring:** on PENDING_REVIEW, `upsertReviewItem({ itemType:'PREDICTION_RESOLUTION', subjectKind:'prediction', subjectId: prediction.id, dedupeKey: \`prediction:${prediction.id}:${deadlineISO}\`, eventCandidateId, detail:{ predictionId } , severity: 0.6, title/reason: plain-English, advice-guarded })`. PATCH route: `PatchSchema` gains `verdict: z.enum(['HAPPENED','DID_NOT_HAPPEN','UNRESOLVABLE']).optional()`; after `decideReviewItem`, if `updated.itemType === 'PREDICTION_RESOLUTION'`: status `NEEDS_MORE_EVIDENCE` → `applyReviewVerdict(predictionId,'NEEDS_MORE_EVIDENCE')` (prediction back to OPEN, deadline += REVIEW_EXTENSION_DAYS); else verdict required-or-derived (`APPROVED`→HAPPENED, `REJECTED`→DID_NOT_HAPPEN, explicit verdict wins) → `applyReviewVerdict` resolves the EVENT prediction (resolvedBy REVIEW, Briers, lead time if HAPPENED) and grades its scenarios per the path classifier. `ReviewQueue.tsx`: add `PREDICTION_RESOLUTION: 'Prediction verdict'` label; for that type render buttons Happened / Didn't happen / Unresolvable / Needs more posting `{status, verdict}` accordingly.

- [ ] **Step 1: Failing tests** `tests/stage11-outcome-resolution.test.ts` covering: rule 1a (new primary-source lineage row post-freeze → HAPPENED + rationale mentions evidence + brierFirst = (1−p)²), rule 1b (2 new NEWS groups), rule 2 (CONTRADICTED canonical → DID_NOT_HAPPEN + REVERSED scenarios immediately: REVERSAL row outcome HAPPENED-matching i.e. graded TRUE), rule 4 (quiet deadline → DID_NOT_HAPPEN, path NONE, all four scenarios false), rule 5 (mixed at deadline → PENDING_REVIEW + ReviewItem created + prediction status PENDING_REVIEW), scenario timing (event HAPPENED early → scenarios still OPEN; after deadline evaluation → CONTAINED/SUSTAINED/WIDENED by fixture), `applyReviewVerdict` (HAPPENED / DID_NOT_HAPPEN / UNRESOLVABLE / NEEDS_MORE_EVIDENCE reopens + extends deadline), lead-time (mainstream-later fixture → positive days; mainstream-origin → 0; no mainstream → null), advice-language guard (rationales pass `assertNoAdviceLanguage` — implicitly, by resolution not throwing). Build fixtures with the factories + direct prisma writes for lineage/sources (categories 'REGULATOR' for primary, 'NEWS' for mainstream) and `publishedAt` timestamps around a fixed `predictedAt`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** the three modules per the interfaces + rules above. Key implementation notes:
  - `computeEvidenceDelta` re-derives the current lineage/groups/entities/contradictions exactly like `buildBaseline`, then diffs against the frozen `baselineJson` (new groups = current − baseline.groups; `newSupportDays` = count of support days not in baseline.supportDays; `primaryCorroboration` = any NEW support row (group not in baseline.groups) with `deriveAuthority(source.category) >= PRIMARY_AUTHORITY_AT`; `minReliability` = min current reliabilityScore across linked canonicals (1 if none); `anyCanonicalContradicted` = any linked canonical `factualityLabel === 'CONTRADICTED'`; `newEntityCount` = eventCandidateEntity rows whose entityId ∉ baseline.entityIds; `newEvidenceIds` = lineage documentIds of new support/contradiction rows, capped 20).
  - `classifyPath`: DID_NOT_HAPPEN+AUTO_EVIDENCE → 'REVERSED'; DID_NOT_HAPPEN otherwise → delta.newContradictions>0 ? 'REVERSED' : 'NONE'; HAPPENED → newEntityCount ≥ WIDENED_MIN_NEW_ENTITIES ? 'WIDENED' : newSupportDays ≥ SUSTAINED_MIN_DISTINCT_DAYS ? 'SUSTAINED' : 'CONTAINED'; UNRESOLVABLE → null.
  - `resolvePrediction(p, outcome, resolvedBy, rationale, evidenceIds, now, path?)` private helper: Briers only for non-UNRESOLVABLE (`y = outcome === 'HAPPENED' ? 1 : 0`), `assertNoAdviceLanguage(rationale, 'OutcomePrediction.resolutionRationale')`, lead time only for EVENT+HAPPENED.
  - Rationales: compose from facts, e.g. `` `Resolved happened: corroborated after prediction by ${detail} (${n} new independent publisher group(s)). Predicted ${pct}; outcome recorded ${day}.` `` — factual register, no advice.
- [ ] **Step 4:** Wire the PATCH route + ReviewQueue buttons (exact edits per Interfaces block).
- [ ] **Step 5:** Run test file → PASS; full suite → green.
- [ ] **Step 6: Commit** `feat(outcome): auto + review resolution, path classification, lead time`.

---

### Task 5: Outcome pipeline stage + orchestrator wiring + e2e

**Files:**
- Create: `src/server/outcome/outcome-pipeline.ts`
- Modify: `src/server/pipeline/orchestrator.ts` (stage 15d + 4 counts in ScanSummary/counts object/update)
- Test: `tests/stage11-outcome-e2e.test.ts`

**Interfaces:**
- Produces: `runOutcomeResolution(events: {id:string}[], scanRunId: string, now?: Date) → Promise<{ counts: OutcomeCounts; errors: OutcomeError[] }>` — sequence: freeze(events) → updateOpenFinalProbabilities → evaluateOpenPredictions → writeTrackRecordSnapshot(scanRunId) *(stub returning null until Task 6 — create `track-record.ts` with `writeTrackRecordSnapshot` returning `{snapshot: null, errors: []}` placeholder is NOT allowed; instead Task 5 calls only the first three and Task 6 adds the snapshot+learning calls)* → each step try/caught.
- Orchestrator: after 15c review block, add:

```ts
    // 15d. Outcome-resolution engine (Stage 11, non-fatal): freeze prediction
    // receipts for this scan's events, drift final probabilities, and resolve
    // any open prediction the new evidence (or a passed deadline) settles.
    try {
      const outcome = await runOutcomeResolution(allEvents, scanRun.id)
      errors.push(...outcome.errors)
      counts.predictionsCreated = outcome.counts.predictionsCreated
      counts.predictionsResolved = outcome.counts.predictionsResolved
      counts.predictionsPendingReview = outcome.counts.predictionsPendingReview
      counts.weightSuggestionsCreated = outcome.counts.weightSuggestionsCreated
    } catch (err) {
      errors.push({ stage: 'outcome', message: err instanceof Error ? err.message : String(err) })
    }
```

plus the 4 keys in the `counts` initialiser and `ScanSummary['counts']` type.

- [ ] **Step 1: Failing e2e test** `tests/stage11-outcome-e2e.test.ts`: `runSeed({includeLive:false})` + `runFullScan()` → every non-dismissed event has an EVENT prediction; counts.predictionsCreated > 0; second `runFullScan()` → predictionsCreated does not double (idempotent); frozen probabilities unchanged between scans. Follow `scan-deterministic-invariant.test.ts` style.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement pipeline + wiring. **Step 4:** Run e2e + FULL suite (incl. `scan-deterministic-invariant.test.ts`) → green. **Step 5: Commit** `feat(outcome): orchestrator stage 15d — predictions freeze/resolve every scan`.

---

### Task 6: Track-record maths, snapshot, API, pages

**Files:**
- Create: `src/server/outcome/track-record.ts`
- Modify: `src/server/outcome/outcome-pipeline.ts` (call `writeTrackRecordSnapshot` after evaluate)
- Create: `src/app/api/track-record/route.ts`
- Create: `src/app/track-record/page.tsx`
- Create: `src/server/services/outcome.ts` (page-facing summaries: `getTrackRecord()`, `getEventPredictions(eventId)`)
- Modify: `src/app/events/[id]/page.tsx` (Prediction ledger section)
- Modify: `src/app/page.tsx` (nav link `Track record` beside `Review queue`)
- Test: `tests/stage11-outcome-track-record.test.ts`

**Interfaces:**
- `track-record.ts`:
  - `type CalibrationBucket = { lo: number; hi: number; n: number; meanPredicted: number; observedRate: number }`
  - `type TrackRecord = { counts: { open: number; pendingReview: number; resolved: number; happened: number; unresolvable: number }; meanBrierFirst: number | null; meanBrierFinal: number | null; baseRate: number | null; coinFlipBrier: number; calibration: CalibrationBucket[]; leadTime: { meanDays: number | null; n: number; beforeMainstreamCount: number }; byEventType: Record<string, { n: number; happened: number; meanBrierFirst: number }>; scenario: { n: number; meanBrierFirst: number | null } }`
  - `computeTrackRecord() → Promise<TrackRecord>` — EVENT-level, non-fixture, outcome ≠ UNRESOLVABLE for maths; scenario block separate; 10 calibration deciles `[0,0.1)…[0.9,1]`.
  - `writeTrackRecordSnapshot(scanRunId) → Promise<{errors: OutcomeError[]}>`
- Brier maths: mean over `brierFirst`/`brierFinal`; `baseRate` = happened / resolved-graded; `beforeMainstreamCount` = resolved HAPPENED with `leadTimeDays === null` **plus** those with `leadTimeDays > 0` is WRONG — definition: `leadTimeDays === null` (mainstream never covered) → count; mean over non-null leadTimeDays.
- API: GET returns `computeTrackRecord()` + latest 20 resolved predictions (id, subjectKind, scenarioType, predictionText, predictedProbability, outcome, resolvedBy, resolvedAt, resolutionRationale, brierFirst, leadTimeDays, eventCandidateId) + last 30 snapshots (createdAt, meanBrierFirst, resolvedCount).
- Page `/track-record` (server component, `force-dynamic`, house style — slate dark, max-w-5xl): headline tile row (Resolved, Happened %, Mean Brier (first) vs 0.25 coin-flip, Mean lead-time days, Called before mainstream N), calibration table (bucket | n | stated | observed), recent resolutions list (rationale + link to event), snapshots mini-table. Honest empty state: "No resolved predictions yet — the ledger settles as deadlines arrive."
- Event page: after the ScenariosPanel section, a "Prediction ledger" section listing that event's predictions via `getEventPredictions` (predictionText, frozen %, final %, deadline, status/outcome badge, rationale when resolved).

- [ ] **Step 1: Failing tests** `tests/stage11-outcome-track-record.test.ts`: hand-computed fixtures — create resolved predictions directly via prisma (e.g. p=0.8 HAPPENED → brierFirst 0.04; p=0.3 DID_NOT_HAPPEN → 0.09; mean 0.065), calibration bucket counts, fixture exclusion (isFixture row ignored), UNRESOLVABLE excluded, leadTime mean + beforeMainstreamCount, snapshot row written with matching numbers.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement module + service + API + pages; wire snapshot call into pipeline. **Step 4:** Tests + typecheck + `DATABASE_URL="file:./prisma/dev.db" npm run build` (page compiles). **Step 5: Commit** `feat(outcome): track record — Brier, calibration, lead time + /track-record`.

---

### Task 7: Owner-gated weight learning + admin panel

**Files:**
- Create: `src/server/outcome/weight-learning.ts`
- Modify: `src/server/outcome/outcome-pipeline.ts` (call `maybeSuggestWeights` last)
- Create: `src/app/api/weights/route.ts` (GET: suggestions + active weights)
- Create: `src/app/api/weights/[id]/route.ts` (POST `{action:'APPLY'|'DISMISS'}`)
- Create: `src/app/admin/weights/page.tsx` + `src/components/WeightSuggestionActions.tsx` (client buttons)
- Test: `tests/stage11-weight-learning.test.ts`

**Interfaces:**
- `weight-learning.ts`:
  - `scoreFromDimensions(dims: Record<string, number>, weights: ReliabilityWeights) → number` — `clamp01((w.authority*d.authority + … + w.originTrace*d.originTrace) * (1 − 0.5*d.contradiction) * (1 − 0.4*d.copyLoopRisk) * (1 − 0.3*d.manipulationRisk))` (missing dims default: positive dims 0.5, penalty dims 0).
  - `meanBrier(rows: {dims: Record<string,number>; y: number}[], weights) → number`
  - `searchWeights(rows, start: ReliabilityWeights) → { weights: ReliabilityWeights; brier: number }` — deterministic coordinate descent: fixed dimension order (authority, independence, support, specificity, freshness, originTrace), step ±0.01, respect WEIGHT_FLOOR/WEIGHT_CEIL, |w−start| ≤ MAX_WEIGHT_SHIFT per dim, renormalise to sum 1 after each candidate (reject if renormalisation breaks a bound/shift-cap), accept only strict improvement, ≤ 200 sweeps, stop when a full sweep makes no change.
  - `maybeSuggestWeights(scanRunId) → Promise<{created: boolean; errors: OutcomeError[]}>` — gates: an existing `status:'SUGGESTED'` row → skip (one live suggestion at a time); eligible rows = EVENT-level, RESOLVED, non-fixture, outcome ≠ UNRESOLVABLE, valid dimensionsJson; `< MIN_RESOLVED_FOR_LEARNING` → skip; improvement `< MIN_BRIER_IMPROVEMENT` → skip; else create suggestion with per-dimension rationale strings for every changed dim (`"authority: 0.26 → 0.29 (+0.03) — backtest Brier improves 0.0071 on 34 resolved outcomes"`).
  - `applyWeightSuggestion(id)` → status APPLIED + appliedAt + `clearWeightsCache()`; any previously APPLIED row → status DISMISSED (single active). `dismissWeightSuggestion(id)` → DISMISSED.
- Admin page: current active weights table (six rows, DEFAULT vs active), suggestion cards (current→suggested per dim, improvement, rationale, Apply/Dismiss buttons → POST). Copy states plainly: "Suggestions never apply themselves. Applying changes future scans' reliability scoring; the default weights are restored by dismissing the applied row."

- [ ] **Step 1: Failing tests** `tests/stage11-weight-learning.test.ts`: below threshold (29 rows) → no suggestion; 30+ synthetic rows engineered so authority-heavy dims correlate with y=1 → suggestion created, bounds + shift-cap + sum≈1 respected, expectedBrierImprovement ≥ MIN_BRIER_IMPROVEMENT, deterministic (run twice → identical suggestedWeightsJson; second run skipped because one SUGGESTED exists); owner-gate: suggestion alone leaves `getActiveWeights()` at defaults; apply → active changes + cache cleared; dismiss-previous-applied on new apply. Include a `scoreFromDimensions` hand-computed unit case.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement + wire `maybeSuggestWeights` into the pipeline + build API/admin UI. **Step 4:** New tests + FULL suite green — explicitly re-run `tests/scan-deterministic-invariant.test.ts` and `tests/stage11-weights-seam.test.ts` (owner-gate = determinism). Typecheck + build. **Step 5: Commit** `feat(outcome): owner-gated reliability-weight learning + admin panel`.

---

### Task 8: Docs, pre-flight, push

- [ ] **Step 1:** Update `docs/` — add `docs/outcome-resolution.md` (plain-English: what the ledger is, how outcomes settle, how to read /track-record, how to apply/dismiss weight suggestions, all constants) and a pointer line in the handoff conventions if a README index exists.
- [ ] **Step 2:** Full pre-flight: `npm run typecheck && npm test && DATABASE_URL="file:./prisma/dev.db" npm run build` — all clean.
- [ ] **Step 3:** Commit docs `docs(outcome): owner guide for the outcome-resolution engine`, then `git push origin main` and verify `git rev-parse HEAD origin/main` match.

## Plan self-review notes

- Spec coverage: ledger (T3), deadlines (T3), resolution rules 1–4 + review (T4), scenario timing + path (T4), lead time (T4), orchestrator + counts (T5), Brier/calibration/lead-time + snapshot + surfaces (T6), weight learning + owner gate + seam (T2/T7), invariants/testing (each task + T5/T7 re-runs). Event-page strip + nav (T6). Docs (T8).
- Type consistency: `OutcomeError/OutcomeCounts` defined T3, consumed T5; `EvidenceDelta` defined T4 signature used by path classifier; `ReliabilityWeights` defined T2, consumed T7.
- No placeholders: every step names exact files, code or exact edits, and expected test outcomes.
