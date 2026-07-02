# Archlight Phase 2a — Living Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repeated scans UPDATE existing events (RISING lifecycle), separate expected skips (warnings) from real errors, add per-source health + a scan-history page, and land the final review's follow-up fixes.

**Architecture:** Same spine, no new services processes. One migration (2 ScanRun columns + SourceHealth table). Event merge keyed on `eventType+sector+region` with scores recomputed over the union of member signals via a new pure `computeEventMetrics`. Health derived from each scan's per-source outcomes.

**Tech Stack:** unchanged (Next 15, Prisma 6/SQLite, Vitest 3, Zod 3, Tailwind 4).

**Spec:** `docs/superpowers/specs/2026-07-02-phase-2a-living-radar-design.md` — read it first. Spine constraints all still bind (fixture labelling via `some()`, explainable scores, no arbitrary fetching, string enums, `*Json` columns, files < 500 lines, GBP-irrelevant, no entity requirement).

## Global Constraints

- Working directory: `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight` (repo on `main`, baseline: 60/60 tests green at commit 6f3d930).
- Do not break existing exports/signatures except where a task explicitly changes them; every task ends with the FULL suite green (`npm test`), `npm run typecheck` clean.
- Sticky statuses: `ESCALATED`, `NEEDS_REVIEW`, `CONFIRMED` are analyst decisions — a merge may update scores/evidence but must NOT overwrite these statuses with RISING. `DISMISSED` events are never merged into (fresh event instead).
- Scan status semantics after this phase: `COMPLETED` = zero errors (warnings allowed); `COMPLETED_WITH_ERRORS` = ≥1 genuine error; `FAILED` = orchestrator-level throw.
- All new UI text is strategic-intelligence framing; en-GB dates; no external assets.
- Commit after each task with the exact message given.

---

### Task 1: Migration — warnings, updated-counter, SourceHealth

**Files:**
- Modify: `prisma/schema.prisma`, `src/shared/enums.ts`, `tests/helpers.ts`
- Test: `tests/schema.test.ts` (add one test)

**Interfaces:**
- Produces: `ScanRun.warningsJson String @default("[]")`, `ScanRun.eventCandidatesUpdated Int @default(0)`; new `SourceHealth` model (1:1 Source, relation field `health` on Source); `SOURCE_HEALTH_STATUSES` const in enums. Later tasks depend on these exact names.

- [ ] **Step 1: Schema edits**

In `prisma/schema.prisma`, inside `model ScanRun`, after the `eventCandidatesCreated` line add:
```prisma
  eventCandidatesUpdated    Int              @default(0)
```
and after the `errorsJson` line add:
```prisma
  warningsJson              String           @default("[]")
```

Inside `model Source`, after `signals Signal[]` add:
```prisma
  health          SourceHealth?
```

Append new model at the end of the file:
```prisma
model SourceHealth {
  id                     String    @id @default(cuid())
  sourceId               String    @unique
  source                 Source    @relation(fields: [sourceId], references: [id])
  status                 String    @default("UNKNOWN")
  lastSuccessfulFetchAt  DateTime?
  lastFailedFetchAt      DateTime?
  failureCount           Int       @default(0)
  documentsStoredLastRun Int       @default(0)
  healthScore            Float     @default(0)
  notes                  String?
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt
}
```

In `src/shared/enums.ts` append:
```ts
export const SOURCE_HEALTH_STATUSES = ['HEALTHY', 'DEGRADED', 'FAILING', 'UNSUPPORTED', 'UNKNOWN'] as const
export type SourceHealthStatus = (typeof SOURCE_HEALTH_STATUSES)[number]
```

- [ ] **Step 2: Apply migration**

Run: `npx prisma migrate dev --name phase2a_lifecycle_health`
Expected: migration created + applied, client regenerated. (The seed step may run and print "Seeded 4 sources." — fine.)

- [ ] **Step 3: Test plumbing + failing test**

In `tests/helpers.ts` `resetDb()`, add BEFORE the `prisma.entity.deleteMany(),` line:
```ts
    prisma.sourceHealth.deleteMany(),
```

Append to `tests/schema.test.ts` inside the existing describe:
```ts
  it('supports SourceHealth rows and the new ScanRun columns', async () => {
    const source = await makeSource()
    const health = await prisma.sourceHealth.create({
      data: { sourceId: source.id, status: 'HEALTHY', healthScore: 1, documentsStoredLastRun: 5 },
    })
    expect(health.failureCount).toBe(0)
    const run = await prisma.scanRun.create({ data: {} })
    expect(run.warningsJson).toBe('[]')
    expect(run.eventCandidatesUpdated).toBe(0)
  })
```

- [ ] **Step 4: Verify + commit**

Run: `npm test` → all pass (61). `npm run typecheck` → clean.
```bash
git add -A && git commit -m "feat(2a): migration — ScanRun warnings/updated counters and SourceHealth table"
```

---

### Task 2: Warnings vs errors + FAILED-branch test

**Files:**
- Modify: `src/server/pipeline/orchestrator.ts`, `src/app/api/scans/[id]/route.ts`, `src/server/services/dashboard.ts`, `src/app/page.tsx`
- Test: modify `tests/pipeline/orchestrator.test.ts`, `tests/api/api.test.ts`, (verify `tests/e2e-proof.test.ts` untouched assertions still hold)

**Interfaces:**
- `ScanSummary` gains `warnings: PipelineError[]` (same shape as errors). `counts` unchanged. Status semantics per Global Constraints.
- `DashboardData.lastScan` gains `warnings: { stage: string; message: string }[]`.
- Scan detail API returns `errors` AND `warnings` arrays; neither raw `*Json` column leaks.

- [ ] **Step 1: Update tests first (RED)**

In `tests/pipeline/orchestrator.test.ts`:
- First test: change `expect(summary.status).toBe('COMPLETED_WITH_ERRORS')` (comment `// unsupported source is skipped+recorded`) to:
```ts
    expect(summary.status).toBe('COMPLETED') // skips are warnings, not errors
    expect(summary.errors).toHaveLength(0)
    expect(summary.warnings).toHaveLength(1)
    expect(summary.warnings[0].stage).toBe('collect:skip')
```
- Idempotency test: append assertion `expect(second.counts.eventCandidatesCreated).toBe(0)`.
- Add new test at the end of the describe:
```ts
  it('marks the ScanRun FAILED and still returns a summary when the orchestrator itself throws', async () => {
    const spy = vi.spyOn(prisma.source, 'findMany').mockRejectedValueOnce(new Error('db exploded'))
    const summary = await runFullScan()
    spy.mockRestore()
    expect(summary.status).toBe('FAILED')
    expect(summary.message).toContain('db exploded')
    const run = await prisma.scanRun.findUniqueOrThrow({ where: { id: summary.scanRunId } })
    expect(run.status).toBe('FAILED')
    expect(run.completedAt).not.toBeNull()
    expect(run.errorsJson).toContain('db exploded')
  })
```
Add `vi` to the vitest import of that file.

In `tests/api/api.test.ts`, in the `GET /api/scans/[id]` test add after the errors assertion:
```ts
    expect(Array.isArray(body.warnings)).toBe(true)
    expect(body.errorsJson).toBeUndefined()
    expect(body.warningsJson).toBeUndefined()
```

Run: `npm test` → the changed/new tests FAIL (status COMPLETED_WITH_ERRORS vs COMPLETED; `summary.warnings` undefined; `body.warnings` undefined).

- [ ] **Step 2: Implement**

`src/server/pipeline/orchestrator.ts`:
- Add to `ScanSummary`: `warnings: PipelineError[]` (after `errors`).
- In `runFullScan`, add `const warnings: PipelineError[] = []` beside `errors`.
- Replace the skip-recording loop body to push into `warnings` (same object shape, stage `'collect:skip'`).
- Status line: unchanged logic but now only `errors` feeds it (skips no longer inflate it).
- Both `prisma.scanRun.update` calls add `warningsJson: JSON.stringify(warnings)`.
- Both returned summaries add `warnings`.
- Message: append warnings/errors visibility:
```ts
      message: `Scan ${status.toLowerCase().replace(/_/g, ' ')}: ${counts.eventCandidatesCreated} event candidate(s) detected (${errors.length} error(s), ${warnings.length} warning(s)).`,
```
(FAILED-path message unchanged.)
- Above the counts declaration add the comment:
```ts
  // documentsFetched counts newly STORED documents; re-scans of unchanged feeds report 0 (dedupe).
```

`src/app/api/scans/[id]/route.ts`: change the destructure/return to:
```ts
  const { errorsJson, warningsJson, ...rest } = scanRun
  return Response.json({ ...rest, errors: JSON.parse(errorsJson), warnings: JSON.parse(warningsJson) })
```

`src/server/services/dashboard.ts`: in the `lastScan` object add `warnings: JSON.parse(lastScanRow.warningsJson),` after `errors: ...`; extend the `DashboardData` type's lastScan with `warnings: { stage: string; message: string }[]`.

`src/app/page.tsx`: after the existing amber errors banner block, add a calm note for warnings:
```tsx
      {data.lastScan && data.lastScan.warnings.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {data.lastScan.warnings.length} expected skip(s):{' '}
          {data.lastScan.warnings.slice(0, 3).map((w) => w.message).join(' · ')}
        </p>
      )}
```

- [ ] **Step 3: Verify + commit**

Run: `npm test` → all pass (62). `npm run typecheck` → clean.
NOTE: `tests/e2e-proof.test.ts` asserts `sourcesSkipped = 1` (a counter, unchanged) — must still pass untouched. If it fails, you changed something out of scope.
```bash
git add -A && git commit -m "feat(2a): separate scan warnings from errors; FAILED-branch coverage"
```

---

### Task 3: Small-gaps batch (final-review triage)

**Files:**
- Modify: `src/server/pipeline/collectors/registry.ts`, `src/server/pipeline/collect.ts`, `src/server/pipeline/collectors/fixture.ts`, `src/server/pipeline/claims.ts`, `src/server/services/events.ts`, `src/server/services/dashboard.ts`, `src/app/api/sources/route.ts`, `src/app/admin/sources/page.tsx`, `src/app/events/[id]/page.tsx`
- Create: `fixtures/malformed-fixture.json`
- Test: modify `tests/pipeline/collect.test.ts`, `tests/pipeline/claims.test.ts`

**Interfaces:**
- `getCollector(accessMethod)` now returns `CollectorEntry | null` where `type CollectorEntry = { collect: Collector; documentType: string }`.
- New export `getSources(): Promise<SourceStatus[]>` from `@/server/services/dashboard` (Task 5 extends it with health fields).
- `EventDetail.triggerConditions[].direction` narrows to `'RAISES' | 'LOWERS'`.

- [ ] **Step 1: New tests first (RED)**

`fixtures/malformed-fixture.json` (new file):
```json
{ "not_items": true }
```

Append to the describe in `tests/pipeline/collect.test.ts`:
```ts
  it('reports a clear error for a malformed fixture file', async () => {
    const bad = await makeSource({ name: 'Bad Fixture', url: 'fixtures/malformed-fixture.json' })
    const result = await collectFromSources([bad])
    expect(result.documents).toHaveLength(0)
    expect(result.errors[0].message).toContain('Malformed fixture file')
  })
```

Append to the persistence describe in `tests/pipeline/claims.test.ts`:
```ts
  it('skips parsed documents whose status is not PARSED', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, { status: 'UNSUPPORTED', bodyText: 'The firm is cutting 400 jobs.' })
    const { claims, errors } = await extractClaims([parsed], new Map([[doc.id, doc]]))
    expect(claims).toHaveLength(0)
    expect(errors).toHaveLength(0)
  })

  it('records an error when the document is missing from docsById', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, { bodyText: 'The firm is cutting 400 jobs.' })
    const { claims, errors } = await extractClaims([parsed], new Map())
    expect(claims).toHaveLength(0)
    expect(errors[0].message).toContain('No document loaded')
  })
```

Run: `npm test` → malformed-fixture test FAILS (generic TypeError message, not "Malformed fixture file"); the two claims tests PASS already (they pin existing behaviour — that is fine, they are regression pins).

- [ ] **Step 2: Implement all eight items**

1. `src/server/pipeline/collectors/registry.ts` — replace the map/getter:
```ts
export type CollectorEntry = { collect: Collector; documentType: string }

const COLLECTORS: Record<string, CollectorEntry> = {
  FIXTURE: { collect: collectFixture, documentType: 'FIXTURE_ITEM' },
  RSS: { collect: collectRss, documentType: 'RSS_ITEM' },
}

/** Returns the collector entry for an access method, or null when unsupported. */
export function getCollector(accessMethod: string): CollectorEntry | null {
  return COLLECTORS[accessMethod] ?? null
}
```
(Keep the `Collector` type export.)

2. `src/server/pipeline/collect.ts` — `const collector = getCollector(...)` becomes `const entry = getCollector(...)`; `if (!entry)` for the skip branch; `const items = await entry.collect(source)`; the document create uses `documentType: entry.documentType` (delete the accessMethod ternary).

3. `src/server/pipeline/collectors/fixture.ts` — after `JSON.parse`, validate:
```ts
  const parsed = JSON.parse(await readFile(resolved, 'utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as FixtureFile).items)) {
    throw new Error(`Malformed fixture file (missing items array): ${source.url}`)
  }
  return (parsed as FixtureFile).items.map((item) => ({
```
(adjust the following lines to keep compiling).

4. `src/server/pipeline/claims.ts` — in `SECTORS.technology`, remove `|grid systems` from the regex (fixture text still matches via "technology manufacturer/supplier").

5. `src/server/services/events.ts` — `EventDetail` type: `direction: 'RAISES' | 'LOWERS'` in triggerConditions; mapping becomes `direction: t.direction as 'RAISES' | 'LOWERS',`.

6. `src/server/services/dashboard.ts` — extract the existing sources query+map into:
```ts
export async function getSources(): Promise<SourceStatus[]> {
  const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } })
  return sources.map((s) => ({ /* the existing mapping object, moved verbatim */ }))
}
```
and have `getDashboardData` call `sources: await getSources(),`.

7. `src/app/api/sources/route.ts`:
```ts
import { getSources } from '@/server/services/dashboard'

export async function GET() {
  return Response.json(await getSources())
}
```
`src/app/admin/sources/page.tsx`: replace `const { sources } = await getDashboardData()` with `const sources = await getSources()` (adjust import).

8. `src/app/events/[id]/page.tsx` — timeline heading becomes:
```tsx
      <Section title={`Evidence timeline (${detail.evidence.length} claims)`}>
```

- [ ] **Step 3: Verify + commit**

Run: `npm test` → all pass (65: 62 + 3 new). `npm run typecheck` → clean. `npm run build` → clean (UI touched).
```bash
git add -A && git commit -m "fix(2a): follow-up batch — collector-owned documentType, malformed-fixture error, claims skip-path pins, direction union, getSources extraction, evidence label, sector-rule cleanup"
```

---

### Task 4: Event lifecycle across scans

**Files:**
- Modify: `src/server/pipeline/events.ts`, `src/server/pipeline/orchestrator.ts`
- Test: modify `tests/pipeline/events.test.ts`, `tests/pipeline/orchestrator.test.ts`

**Interfaces:**
- `createEventCandidates(clusters, scanRunId)` now returns `{ events, updatedEvents, feedItems, errors }` — `events` = newly created only; `updatedEvents` = merged existing events (both `EventCandidate[]`). Orchestrator passes `[...events, ...updatedEvents]` to classify + gaps and sets `eventCandidatesCreated` / `eventCandidatesUpdated` counters. `ScanSummary.counts` gains `eventCandidatesUpdated: number`.
- New pure export `computeEventMetrics(members: Signal[], noveltyScore: number)` returning `{ severity, probability, confidence, riskScore, opportunityScore, eventClass, status, evidenceCount, sourceDiversityScore, signalStrength, noveltyScore, negFrac, posFrac, distinctSources, memberCount, timeWindowStart, timeWindowEnd, isFixture }` — formulas identical to the spine (reuses `scoreCluster` from `./cluster` on the member union; `isFixture = members.some(...)`).
- Merge rules (binding): identity key = `eventType + affectedSector + affectedRegion`; merge target = most recently updated event with that key whose status ≠ `DISMISSED`; sticky statuses `ESCALATED | NEEDS_REVIEW | CONFIRMED` are never overwritten; otherwise status → `RISING` iff `confidence` OR `max(riskScore, opportunityScore)` strictly increased, else status unchanged; `noveltyScore`/`createdFromScanRunId`/`firstDetectedAt` keep original values; RiskOpportunity, DataGap, TriggerCondition, DashboardFeedItem rows for the event are deleted (classify/gaps regenerate RO+gaps downstream; feed items are recreated in this stage).

- [ ] **Step 1: Update/extend tests first (RED)**

In `tests/pipeline/events.test.ts` append to the describe:
```ts
  it('merges a same-key cluster into the existing open event and marks it RISING', async () => {
    const a = await seededSignal('Wire A', { sector: 'technology', region: 'UK', confidence: 0.85 })
    const b = await seededSignal('Wire B', { sector: 'technology', region: 'UK', confidence: 0.85 })
    const scan1 = await prisma.scanRun.create({ data: {} })
    const first = await createEventCandidates((await clusterSignals([a, b])).clusters, scan1.id)
    const event = first.events[0]

    const c = await seededSignal('Wire C', { sector: 'technology', region: 'UK', confidence: 0.9 })
    const scan2 = await prisma.scanRun.create({ data: {} })
    const second = await createEventCandidates((await clusterSignals([c])).clusters, scan2.id)

    expect(second.events).toHaveLength(0)
    expect(second.updatedEvents).toHaveLength(1)
    expect(second.updatedEvents[0].id).toBe(event.id)
    expect(second.updatedEvents[0].status).toBe('RISING')
    expect(second.updatedEvents[0].evidenceCount).toBe(3)
    expect(second.updatedEvents[0].createdFromScanRunId).toBe(scan1.id)
    expect(await prisma.eventCandidate.count()).toBe(1)
    // dependents were regenerated: feed items exist fresh; RO/gaps cleared for downstream stages
    expect(await prisma.dashboardFeedItem.count({ where: { eventCandidateId: event.id } })).toBeGreaterThan(0)
    expect(await prisma.riskOpportunity.count({ where: { eventCandidateId: event.id } })).toBe(0)
  })

  it('does not resurrect dismissed events — creates a fresh one instead', async () => {
    const a = await seededSignal('Wire A', { sector: 'retail', region: 'UK' })
    const b = await seededSignal('Wire B', { sector: 'retail', region: 'UK' })
    const scan1 = await prisma.scanRun.create({ data: {} })
    const first = await createEventCandidates((await clusterSignals([a, b])).clusters, scan1.id)
    await prisma.eventCandidate.update({ where: { id: first.events[0].id }, data: { status: 'DISMISSED' } })

    const c = await seededSignal('Wire C', { sector: 'retail', region: 'UK' })
    const scan2 = await prisma.scanRun.create({ data: {} })
    const second = await createEventCandidates((await clusterSignals([c])).clusters, scan2.id)
    expect(second.events).toHaveLength(1)
    expect(second.updatedEvents).toHaveLength(0)
    expect(await prisma.eventCandidate.count()).toBe(2)
  })

  it('does not merge clusters with a different identity key', async () => {
    const a = await seededSignal('Wire A', { sector: 'energy', region: 'EU' })
    const b = await seededSignal('Wire B', { sector: 'energy', region: 'EU' })
    const scan1 = await prisma.scanRun.create({ data: {} })
    await createEventCandidates((await clusterSignals([a, b])).clusters, scan1.id)

    const c = await seededSignal('Wire C', { sector: 'energy', region: 'UK' })
    const d = await seededSignal('Wire D', { sector: 'energy', region: 'UK' })
    const scan2 = await prisma.scanRun.create({ data: {} })
    const second = await createEventCandidates((await clusterSignals([c, d])).clusters, scan2.id)
    expect(second.events).toHaveLength(1)
    expect(await prisma.eventCandidate.count()).toBe(2)
  })

  it('never overwrites sticky analyst statuses on merge', async () => {
    const a = await seededSignal('Wire A', { sector: 'logistics', region: 'UK' })
    const b = await seededSignal('Wire B', { sector: 'logistics', region: 'UK' })
    const scan1 = await prisma.scanRun.create({ data: {} })
    const first = await createEventCandidates((await clusterSignals([a, b])).clusters, scan1.id)
    await prisma.eventCandidate.update({ where: { id: first.events[0].id }, data: { status: 'ESCALATED' } })

    const c = await seededSignal('Wire C', { sector: 'logistics', region: 'UK', confidence: 0.9 })
    const scan2 = await prisma.scanRun.create({ data: {} })
    const second = await createEventCandidates((await clusterSignals([c])).clusters, scan2.id)
    expect(second.updatedEvents[0].status).toBe('ESCALATED')
  })
```

In `tests/pipeline/orchestrator.test.ts`, idempotency test: append `expect(second.counts.eventCandidatesUpdated).toBe(0)`.

Run: `npm test` → new tests FAIL (`updatedEvents` undefined; duplicate events created).

- [ ] **Step 2: Implement**

Rewrite `src/server/pipeline/events.ts` as follows (keep `round2`; import `scoreCluster` from `./cluster` and `Signal` from `@prisma/client`):

```ts
import type { DashboardFeedItem, EventCandidate, Signal } from '@prisma/client'
import { prisma } from '@/server/db'
import type { ClusterWithSignals } from './cluster'
import { scoreCluster } from './cluster'
import type { PipelineError } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

const STICKY_STATUSES = ['ESCALATED', 'NEEDS_REVIEW', 'CONFIRMED']

export function computeEventMetrics(members: Signal[], noveltyScore: number) {
  const { strength, confidence, distinctSources } = scoreCluster(members)
  const n = members.length
  const severity = strength
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
  const dates = members.map((m) => m.signalDate.getTime())
  return {
    severity,
    probability,
    confidence,
    riskScore,
    opportunityScore,
    eventClass,
    status,
    evidenceCount: new Set(members.map((m) => m.documentId)).size,
    sourceDiversityScore: round2(distinctSources / n),
    signalStrength: severity,
    noveltyScore,
    negFrac,
    posFrac,
    distinctSources,
    memberCount: n,
    timeWindowStart: new Date(Math.min(...dates)),
    timeWindowEnd: new Date(Math.max(...dates)),
    // Conservative provenance: one fixture member taints the whole event's label.
    isFixture: members.some((m) => m.isFixture),
  }
}

type Metrics = ReturnType<typeof computeEventMetrics>

function buildSummary(title: string, m: Metrics, clusterExplanation: string): string {
  return (
    `${title}: ${m.memberCount} corroborating signal(s) across ${m.distinctSources} independent source(s). ` +
    `Class ${m.eventClass} — confidence ${m.confidence.toFixed(2)}, severity ${m.severity.toFixed(2)}, ` +
    `probability ${m.probability.toFixed(2)} (0.25 + 0.5×confidence + 0.15×severity). ` +
    `Risk ${m.riskScore.toFixed(2)} / opportunity ${m.opportunityScore.toFixed(2)} ` +
    `(severity × probability weighted by direction mix: ${Math.round(m.negFrac * 100)}% negative, ` +
    `${Math.round(m.posFrac * 100)}% positive). ${clusterExplanation}`
  )
}

async function createFeedItems(
  event: EventCandidate,
  m: Metrics,
  clusterExplanation: string,
): Promise<DashboardFeedItem[]> {
  const priority = Math.round(100 * Math.max(m.riskScore, m.opportunityScore))
  const feedTypes = ['INBOX']
  if (event.eventClass === 'RISK' || event.eventClass === 'MIXED') feedTypes.push('RISK_RADAR')
  if (event.eventClass === 'OPPORTUNITY' || event.eventClass === 'MIXED') feedTypes.push('OPPORTUNITY_RADAR')
  if (event.eventClass === 'WATCH') feedTypes.push('WATCHLIST')
  const items: DashboardFeedItem[] = []
  for (const feedType of feedTypes) {
    items.push(
      await prisma.dashboardFeedItem.create({
        data: {
          eventCandidateId: event.id,
          feedType,
          priority,
          title: event.title,
          summary: `${event.eventClass}: ${clusterExplanation.slice(0, 200)}`,
          status: event.status,
        },
      }),
    )
  }
  return items
}

export async function createEventCandidates(
  clusters: ClusterWithSignals[],
  scanRunId: string,
): Promise<{
  events: EventCandidate[]
  updatedEvents: EventCandidate[]
  feedItems: DashboardFeedItem[]
  errors: PipelineError[]
}> {
  const events: EventCandidate[] = []
  const updatedEvents: EventCandidate[] = []
  const feedItems: DashboardFeedItem[] = []
  const errors: PipelineError[] = []

  for (const cluster of clusters) {
    try {
      const existing = await prisma.eventCandidate.findFirst({
        where: {
          eventType: cluster.clusterType,
          affectedSector: cluster.sector,
          affectedRegion: cluster.region,
          status: { not: 'DISMISSED' },
        },
        orderBy: { lastUpdatedAt: 'desc' },
      })

      if (existing) {
        // MERGE: attach cluster, recompute over the union of all member signals.
        await prisma.signalCluster.update({
          where: { id: cluster.id },
          data: { eventCandidateId: existing.id },
        })
        const links = await prisma.signalClusterSignal.findMany({
          where: { cluster: { eventCandidateId: existing.id } },
          include: { signal: true },
        })
        const union = links.map((l) => l.signal)
        const m = computeEventMetrics(union, existing.noveltyScore)
        const rising =
          m.confidence > existing.confidence ||
          Math.max(m.riskScore, m.opportunityScore) > Math.max(existing.riskScore, existing.opportunityScore)
        const status = STICKY_STATUSES.includes(existing.status)
          ? existing.status
          : rising
            ? 'RISING'
            : existing.status
        // Dependents must reflect current evidence: clear them; classify/gaps regenerate downstream.
        await prisma.$transaction([
          prisma.riskOpportunity.deleteMany({ where: { eventCandidateId: existing.id } }),
          prisma.dataGap.deleteMany({ where: { eventCandidateId: existing.id } }),
          prisma.triggerCondition.deleteMany({ where: { eventCandidateId: existing.id } }),
          prisma.dashboardFeedItem.deleteMany({ where: { eventCandidateId: existing.id } }),
        ])
        const updated = await prisma.eventCandidate.update({
          where: { id: existing.id },
          data: {
            eventClass: m.eventClass,
            summary: buildSummary(existing.title, m, cluster.explanation),
            status,
            severity: m.severity,
            probability: m.probability,
            confidence: m.confidence,
            timeWindowStart: m.timeWindowStart,
            timeWindowEnd: m.timeWindowEnd,
            evidenceCount: m.evidenceCount,
            sourceDiversityScore: m.sourceDiversityScore,
            signalStrength: m.signalStrength,
            opportunityScore: m.opportunityScore,
            riskScore: m.riskScore,
            isFixture: m.isFixture,
          },
        })
        updatedEvents.push(updated)
        feedItems.push(...(await createFeedItems(updated, m, cluster.explanation)))
        continue
      }

      // CREATE (unchanged spine behaviour, via the shared metrics function)
      const m = computeEventMetrics(cluster.memberSignals, cluster.novelty)
      const entityIds = new Set(cluster.memberSignals.map((s) => s.entityId ?? 'none'))
      const primaryEntityId =
        entityIds.size === 1 && !entityIds.has('none') ? cluster.memberSignals[0].entityId : null
      const event = await prisma.eventCandidate.create({
        data: {
          title: cluster.title,
          eventType: cluster.clusterType,
          eventClass: m.eventClass,
          summary: buildSummary(cluster.title, m, cluster.explanation),
          status: m.status,
          severity: m.severity,
          probability: m.probability,
          confidence: m.confidence,
          timeWindowStart: m.timeWindowStart,
          timeWindowEnd: m.timeWindowEnd,
          primaryEntityId,
          affectedSector: cluster.sector,
          affectedRegion: cluster.region,
          evidenceCount: m.evidenceCount,
          sourceDiversityScore: m.sourceDiversityScore,
          signalStrength: m.signalStrength,
          noveltyScore: m.noveltyScore,
          opportunityScore: m.opportunityScore,
          riskScore: m.riskScore,
          createdFromScanRunId: scanRunId,
          isFixture: m.isFixture,
        },
      })
      await prisma.signalCluster.update({
        where: { id: cluster.id },
        data: { eventCandidateId: event.id },
      })
      events.push(event)
      feedItems.push(...(await createFeedItems(event, m, cluster.explanation)))
    } catch (err) {
      errors.push({ stage: 'events', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { events, updatedEvents, feedItems, errors }
}
```

`src/server/pipeline/orchestrator.ts`:
- `counts` gains `eventCandidatesUpdated: 0` (ScanSummary counts type too).
- After the events stage:
```ts
    counts.eventCandidatesCreated = events.events.length
    counts.eventCandidatesUpdated = events.updatedEvents.length
    counts.dashboardFeedItemsCreated = events.feedItems.length
    const allEvents = [...events.events, ...events.updatedEvents]
```
- `classifyEvents(allEvents)` and `generateGapsAndTriggers(allEvents)`.

NOTE: the spread `...counts` into `scanRun.update` picks up the new column automatically (column added in Task 1).

- [ ] **Step 3: Verify + commit**

Run: `npm test` → all pass (69: 65 + 4 new). Check specifically that the previous events tests (RISK/OPPORTUNITY/WATCH/sector-level) still pass — the create path's numbers must be IDENTICAL to the spine (same formulas via `computeEventMetrics`). `npm run typecheck` clean.
```bash
git add -A && git commit -m "feat(2a): event lifecycle — same-key clusters merge into open events with RISING transitions"
```

---

### Task 5: Source health and scan history

**Files:**
- Create: `src/server/pipeline/health.ts`, `src/server/services/scans.ts`, `src/app/api/scans/route.ts`, `src/app/scans/page.tsx`
- Modify: `src/server/pipeline/collect.ts`, `src/server/pipeline/orchestrator.ts`, `src/server/services/dashboard.ts`, `src/app/page.tsx`, `src/app/admin/sources/page.tsx`
- Test: create `tests/pipeline/health.test.ts`; modify `tests/pipeline/orchestrator.test.ts`, `tests/api/api.test.ts`

**Interfaces:**
- `collectFromSources` return gains `perSource: SourceOutcome[]` where `type SourceOutcome = { sourceId: string; outcome: 'SUCCESS' | 'FAILED' | 'SKIPPED_UNSUPPORTED'; documentsStored: number }` (exported from `@/server/pipeline/health`).
- New `updateSourceHealth(outcomes: SourceOutcome[]): Promise<{ errors: PipelineError[] }>` from `@/server/pipeline/health` — binding rules: SUCCESS → failureCount 0, lastSuccessfulFetchAt now, `HEALTHY`/score 1 when documentsStored > 0 OR the source was already HEALTHY (dedupe rescans stay healthy), else `DEGRADED`/score 0.5 with note "Fetch succeeded but has not produced any documents yet."; FAILED → failureCount+1, lastFailedFetchAt now, score max(0, round2(1 − 0.34×failureCount)), status `DEGRADED` (1 failure) / `FAILING` (≥2); SKIPPED_UNSUPPORTED → `UNSUPPORTED`, score 0, note "No compatible collector.". A source that has never produced a document can never be HEALTHY.
- `SourceStatus` gains `healthStatus: string`, `healthScore: number`, `failureCount: number`, `lastSuccessfulFetchAt: string | null` (defaults `'UNKNOWN'`/0/0/null when no health row).
- New `getScanHistory(limit = 20): Promise<ScanHistoryItem[]>` from `@/server/services/scans` — serialized ScanRun list, newest first, with `errorCount`/`warningCount` instead of raw arrays.
- New `GET /api/scans` (list) and `/scans` page; dashboard source strip is coloured by healthStatus; admin sources table gains a Health column; dashboard header links to `/scans`.

- [ ] **Step 1: Tests first (RED)**

`tests/pipeline/health.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { updateSourceHealth } from '@/server/pipeline/health'
import { resetDb } from '../helpers'
import { makeSource } from '../factories'

describe('updateSourceHealth', () => {
  beforeEach(resetDb)

  it('marks producing sources HEALTHY and keeps them healthy across dedupe rescans', async () => {
    const source = await makeSource()
    await updateSourceHealth([{ sourceId: source.id, outcome: 'SUCCESS', documentsStored: 5 }])
    let health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('HEALTHY')
    expect(health.healthScore).toBe(1)
    // rescan: everything deduped, zero new docs — still healthy
    await updateSourceHealth([{ sourceId: source.id, outcome: 'SUCCESS', documentsStored: 0 }])
    health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('HEALTHY')
    expect(health.documentsStoredLastRun).toBe(0)
  })

  it('never marks a source HEALTHY before it has produced a document', async () => {
    const source = await makeSource()
    await updateSourceHealth([{ sourceId: source.id, outcome: 'SUCCESS', documentsStored: 0 }])
    const health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('DEGRADED')
    expect(health.healthScore).toBe(0.5)
  })

  it('degrades then fails sources on consecutive failures', async () => {
    const source = await makeSource()
    await updateSourceHealth([{ sourceId: source.id, outcome: 'FAILED', documentsStored: 0 }])
    let health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('DEGRADED')
    expect(health.failureCount).toBe(1)
    expect(health.healthScore).toBe(0.66)
    await updateSourceHealth([{ sourceId: source.id, outcome: 'FAILED', documentsStored: 0 }])
    health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('FAILING')
    expect(health.failureCount).toBe(2)
    expect(health.healthScore).toBe(0.32)
  })

  it('marks unsupported sources UNSUPPORTED with zero score', async () => {
    const source = await makeSource({ name: 'Unsupported', accessMethod: 'UNSUPPORTED', url: null })
    await updateSourceHealth([{ sourceId: source.id, outcome: 'SKIPPED_UNSUPPORTED', documentsStored: 0 }])
    const health = await prisma.sourceHealth.findUniqueOrThrow({ where: { sourceId: source.id } })
    expect(health.status).toBe('UNSUPPORTED')
    expect(health.healthScore).toBe(0)
  })
})
```

In `tests/pipeline/orchestrator.test.ts` first test, append:
```ts
    // source health recorded for every active source
    expect(await prisma.sourceHealth.count()).toBe(3)
    const healthStatuses = (await prisma.sourceHealth.findMany()).map((h) => h.status).sort()
    expect(healthStatuses).toEqual(['HEALTHY', 'HEALTHY', 'UNSUPPORTED'])
```

In `tests/api/api.test.ts` (second describe, which runs a full scan in beforeEach), add:
```ts
  it('GET /api/scans lists scan history with error and warning counts', async () => {
    const res = await getScans()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
    expect(body[0].eventCandidatesCreated).toBeGreaterThan(0)
    expect(body[0].warningCount).toBe(1)
    expect(body[0].errorCount).toBe(0)
    expect(body[0].errorsJson).toBeUndefined()
  })
```
with import `import { GET as getScans } from '@/app/api/scans/route'`.

Run: `npm test` → new tests FAIL (module not found / missing behaviour).

- [ ] **Step 2: Implement**

`src/server/pipeline/health.ts`:
```ts
import { prisma } from '@/server/db'
import type { PipelineError } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

export type SourceOutcome = {
  sourceId: string
  outcome: 'SUCCESS' | 'FAILED' | 'SKIPPED_UNSUPPORTED'
  documentsStored: number
}

export async function updateSourceHealth(
  outcomes: SourceOutcome[],
): Promise<{ errors: PipelineError[] }> {
  const errors: PipelineError[] = []
  for (const o of outcomes) {
    try {
      const existing = await prisma.sourceHealth.findUnique({ where: { sourceId: o.sourceId } })
      let data: Record<string, unknown>
      if (o.outcome === 'SUCCESS') {
        // A source that has never produced a document can never be HEALTHY.
        const everProduced = o.documentsStored > 0 || existing?.status === 'HEALTHY'
        data = {
          status: everProduced ? 'HEALTHY' : 'DEGRADED',
          healthScore: everProduced ? 1 : 0.5,
          failureCount: 0,
          lastSuccessfulFetchAt: new Date(),
          documentsStoredLastRun: o.documentsStored,
          notes: everProduced ? null : 'Fetch succeeded but has not produced any documents yet.',
        }
      } else if (o.outcome === 'FAILED') {
        const failureCount = (existing?.failureCount ?? 0) + 1
        data = {
          status: failureCount >= 2 ? 'FAILING' : 'DEGRADED',
          healthScore: Math.max(0, round2(1 - 0.34 * failureCount)),
          failureCount,
          lastFailedFetchAt: new Date(),
          documentsStoredLastRun: 0,
          notes: null,
        }
      } else {
        data = {
          status: 'UNSUPPORTED',
          healthScore: 0,
          documentsStoredLastRun: 0,
          notes: 'No compatible collector.',
        }
      }
      await prisma.sourceHealth.upsert({
        where: { sourceId: o.sourceId },
        create: { sourceId: o.sourceId, ...data },
        update: data,
      })
    } catch (err) {
      errors.push({
        stage: 'health',
        sourceId: o.sourceId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { errors }
}
```

`src/server/pipeline/collect.ts`: import `SourceOutcome` type from `./health`; add `const perSource: SourceOutcome[] = []` and include `perSource` in the return type/value. Record per branch:
- skip branch: `perSource.push({ sourceId: source.id, outcome: 'SKIPPED_UNSUPPORTED', documentsStored: 0 })`
- success path (after the source update to SUCCESS): `perSource.push({ sourceId: source.id, outcome: 'SUCCESS', documentsStored: createdForThisSource })` — count created docs per source in a local `let createdForThisSource = 0` incremented beside `documents.push(doc)` and reset per source.
- failure path: `perSource.push({ sourceId: source.id, outcome: 'FAILED', documentsStored: 0 })`

`src/server/pipeline/orchestrator.ts`: after the collect stage error/warning handling:
```ts
    // 4b. Update per-source health from this scan's outcomes.
    const health = await updateSourceHealth(collected.perSource)
    errors.push(...health.errors)
```
(import `updateSourceHealth` from `./health`).

`src/server/services/dashboard.ts`: `getSources()` now queries `prisma.source.findMany({ orderBy: { name: 'asc' }, include: { health: true } })` and maps the four new fields (`healthStatus: s.health?.status ?? 'UNKNOWN'`, `healthScore: s.health?.healthScore ?? 0`, `failureCount: s.health?.failureCount ?? 0`, `lastSuccessfulFetchAt: s.health?.lastSuccessfulFetchAt?.toISOString() ?? null`); extend the `SourceStatus` type accordingly.

`src/server/services/scans.ts`:
```ts
import { prisma } from '@/server/db'

export type ScanHistoryItem = {
  id: string
  scanType: string
  status: string
  startedAt: string
  completedAt: string | null
  sourcesScanned: number
  sourcesSkipped: number
  documentsFetched: number
  claimsExtracted: number
  signalsCreated: number
  clustersCreated: number
  eventCandidatesCreated: number
  eventCandidatesUpdated: number
  dashboardFeedItemsCreated: number
  errorCount: number
  warningCount: number
}

export async function getScanHistory(limit = 20): Promise<ScanHistoryItem[]> {
  const runs = await prisma.scanRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit })
  return runs.map((r) => ({
    id: r.id,
    scanType: r.scanType,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
    sourcesScanned: r.sourcesScanned,
    sourcesSkipped: r.sourcesSkipped,
    documentsFetched: r.documentsFetched,
    claimsExtracted: r.claimsExtracted,
    signalsCreated: r.signalsCreated,
    clustersCreated: r.clustersCreated,
    eventCandidatesCreated: r.eventCandidatesCreated,
    eventCandidatesUpdated: r.eventCandidatesUpdated,
    dashboardFeedItemsCreated: r.dashboardFeedItemsCreated,
    errorCount: (JSON.parse(r.errorsJson) as unknown[]).length,
    warningCount: (JSON.parse(r.warningsJson) as unknown[]).length,
  }))
}
```

`src/app/api/scans/route.ts`:
```ts
import { getScanHistory } from '@/server/services/scans'

export async function GET() {
  return Response.json(await getScanHistory())
}
```

`src/app/scans/page.tsx`:
```tsx
import Link from 'next/link'
import { getScanHistory } from '@/server/services/scans'
import { StatusBadge } from '@/components/badges'

export const dynamic = 'force-dynamic'

export default async function ScansPage() {
  const runs = await getScanHistory()
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">Scan History</h1>
      <p className="mt-1 text-sm text-slate-400">Every scan run, newest first — the radar&apos;s audit trail.</p>
      {runs.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No scans yet. Run one from the dashboard.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-700 uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">Started</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Sources</th>
                <th className="py-2 pr-3">Docs</th>
                <th className="py-2 pr-3">Claims</th>
                <th className="py-2 pr-3">Signals</th>
                <th className="py-2 pr-3">Clusters</th>
                <th className="py-2 pr-3">Events new</th>
                <th className="py-2 pr-3">Events updated</th>
                <th className="py-2 pr-3">Errors</th>
                <th className="py-2 pr-3">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-slate-800 text-slate-300">
                  <td className="py-2 pr-3">{new Date(r.startedAt).toLocaleString('en-GB')}</td>
                  <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                  <td className="py-2 pr-3">{r.sourcesScanned} scanned · {r.sourcesSkipped} skipped</td>
                  <td className="py-2 pr-3">{r.documentsFetched}</td>
                  <td className="py-2 pr-3">{r.claimsExtracted}</td>
                  <td className="py-2 pr-3">{r.signalsCreated}</td>
                  <td className="py-2 pr-3">{r.clustersCreated}</td>
                  <td className="py-2 pr-3">{r.eventCandidatesCreated}</td>
                  <td className="py-2 pr-3">{r.eventCandidatesUpdated}</td>
                  <td className={`py-2 pr-3 ${r.errorCount > 0 ? 'text-rose-400' : ''}`}>{r.errorCount}</td>
                  <td className="py-2 pr-3 text-slate-500">{r.warningCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
```

`src/app/page.tsx`:
- Header: next to the "Source admin" link in the Source Coverage section, add a "Scan history" link to `/scans` (same styling), OR add it beside the last-scan line — put it in the Source Coverage header row:
```tsx
          <div className="flex items-center gap-3">
            <Link href="/scans" className="text-xs text-slate-400 underline hover:text-slate-200">
              Scan history
            </Link>
            <Link href="/admin/sources" className="text-xs text-slate-400 underline hover:text-slate-200">
              Source admin
            </Link>
          </div>
```
- Source strip dot colour now keyed on health:
```tsx
              <span
                className={`h-2 w-2 rounded-full ${
                  s.healthStatus === 'HEALTHY'
                    ? 'bg-emerald-500'
                    : s.healthStatus === 'DEGRADED'
                      ? 'bg-amber-500'
                      : s.healthStatus === 'FAILING'
                        ? 'bg-rose-500'
                        : s.healthStatus === 'UNSUPPORTED'
                          ? 'bg-slate-600'
                          : 'bg-slate-700'
                }`}
              />
```

`src/app/admin/sources/page.tsx`: add a `Health` column header after `Collector`, and per-row:
```tsx
              <td className="py-2 pr-4">
                <span
                  className={
                    s.healthStatus === 'HEALTHY'
                      ? 'text-emerald-400'
                      : s.healthStatus === 'FAILING'
                        ? 'text-rose-400'
                        : s.healthStatus === 'UNKNOWN'
                          ? 'text-slate-500'
                          : 'text-amber-400'
                  }
                >
                  {s.healthStatus}
                </span>{' '}
                <span className="text-slate-500">({Math.round(s.healthScore * 100)}%)</span>
              </td>
```

- [ ] **Step 3: Verify + commit**

Run: `npm test` → all pass (74: 69 + 4 health + 1 scans API). `npm run typecheck` clean. `npm run build` → route table gains `/scans` and `/api/scans`.
```bash
git add -A && git commit -m "feat(2a): per-source health tracking and scan-history page"
```

---

### Task 6: Docs, proof addendum, push

**Files:**
- Modify: `README.md`, `docs/autonomous-radar-proof.md`

**Interfaces:** none — documentation honesty task. NEVER invent numbers; every figure comes from a command you ran.

- [ ] **Step 1: README updates**

- In the feature intro (first paragraph area), after the sentence about clicking Run scan, add:
```
Repeat scans update existing events rather than duplicating them — corroborated
events are marked RISING. Source health and the full scan audit trail live at
/admin/sources and /scans.
```
- Deferred list: REMOVE the "event lifecycle across scans" entry (it shipped);
  keep everything else (review queue, watchlist & alerts, backtesting, source-health
  tables → remove "source-health tables" too if present as deferred, security
  hardening, deployment runbook, LLM enrichment, entity resolution).
- Keep the local-only warning paragraph untouched.

- [ ] **Step 2: Proof addendum (REAL output only)**

Run against the dev DB and capture output:
```bash
npx tsx -e "import('./src/server/pipeline/orchestrator').then(async (m) => { const s = await m.runFullScan(); console.log(JSON.stringify(s, null, 2)); process.exit(0) })"
sqlite3 prisma/dev.db "SELECT status, sourcesScanned, sourcesSkipped, documentsFetched, eventCandidatesCreated, eventCandidatesUpdated FROM ScanRun ORDER BY startedAt DESC LIMIT 3;"
sqlite3 prisma/dev.db "SELECT status, COUNT(*) FROM SourceHealth GROUP BY status;"
```
Then start the dev server (`PORT=3210 npm run dev`, background), curl `/scans` and confirm "Scan History" renders with rows, curl `/` and confirm it still serves events; kill the server.

Append to `docs/autonomous-radar-proof.md`:
```markdown
## Phase 2a addendum (2026-07-02)

[exact commands + captured output]

Verified: scan status semantics (COMPLETED with N warning(s), 0 errors on the
default seed), SourceHealth rows per source, /scans renders the audit trail,
dashboard unaffected. Event lifecycle (merge → RISING) is proven by unit tests
in tests/pipeline/events.test.ts (fixture dedupe means a plain rescan creates
no new signals, so the merge path is exercised at unit level).
Phase 2a verdict: PASS — the radar is a living radar.
```
(Replace bracketed text with the real transcript. If any step fails, STOP and report the blocker instead.)

- [ ] **Step 3: Final verification, commit, push**

Run: `npm test && npm run typecheck && npm run build`
Expected: all clean (74 tests).
```bash
git add -A && git commit -m "docs(2a): README living-radar updates and phase 2a proof addendum"
git push origin main
```

---

## Plan Self-Review Notes

- Spec §2.A ↔ Task 2; §2.B items 1–8 ↔ Task 3 (items 1/2/3/4/5/6/7/8 mapped in order); §2.C ↔ Task 4; §2.D ↔ Tasks 1+5; migration note ↔ Task 1; success criteria 1↔T4 tests, 2↔T2 tests, 3↔T5 tests+build, 4↔T6.
- Type-consistency spot-checks: `CollectorEntry` (T3) consumed by collect.ts in T3 only; `SourceOutcome` defined in health.ts (T5) and imported by collect.ts (T5 same task); `computeEventMetrics` return consumed only inside events.ts; `ScanSummary.counts.eventCandidatesUpdated` (T4) consumed by T5's scans service via the DB column (T1).
- Test-count arithmetic: baseline 60 → T1 61 → T2 62 (net +1: 1 new FAILED test, 2 modified) → T3 65 → T4 69 → T5 74. If an implementer's count differs by the modified-test nuance, the binding requirement is "full suite green", not the exact total.
- Deliberate scope guards: no auth, no RSS scheme allowlist (Phase 3 security pass); no review queue/watchlist/backtesting (Phase 2b).

