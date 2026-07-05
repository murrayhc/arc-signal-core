# Evidence Depth Engine Implementation Plan

> **For agentic workers:** Implement task-by-task with TDD. Steps use checkbox (`- [ ]`) syntax. Full algorithms/rationale live in the design spec: `docs/superpowers/specs/2026-07-05-evidence-depth-engine-design.md`. This plan locks file structure, exact cross-task interfaces, test cases, and commit points.

**Goal:** Give Archlight an additive evidence-depth layer that extracts atomic claims, clusters repeats into canonical claims, traces lineage (origin/copy/independent), scores reliability with explanations, and generates follow-up investigation queries — without changing the existing scan spine.

**Architecture:** New `src/server/evidence/` module + new Prisma models, keyed to existing `Document` rows by `documentId`. Deterministic-first; LLM assist is optional and dormant-by-default via the existing `runLLMTask`. The legacy `claim → signal → cluster → event` spine is frozen; only `ScanRun` gains additive counters. Evidence-depth runs as a non-fatal block after parse; the recursive loop is on-demand and ships with a dormant (empty) search-adapter registry.

**Tech Stack:** Next.js 15, TypeScript (strict), Prisma + SQLite, Zod, Vitest.

## Global Constraints

- Additive only. Do NOT remove/rename existing models, routes, services, or the dashboard. Only existing model edited = `ScanRun` (new `Int @default(0)` counters).
- All 351 existing tests stay green; `npm run typecheck` clean after every task.
- Zero fabricated data. Dormant paths (LLM, search) return honest "not configured", never fake output.
- JSON stored as `String` columns, `...Json` suffix, default `"[]"`/`"{}"` (SQLite convention).
- No inline network calls in this pass beyond the existing RSS collector; search adapter registry ships empty.
- Cross-references to existing tables (`documentId`, `sourceId`, `entityId`, `eventCandidateId`) are plain indexed `String` fields — no Prisma relation to existing models.
- Files under ~500 lines; one responsibility each.
- Commit after each green task. Feature branch `feat/evidence-depth-engine`; no push to `main` without owner approval.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Prisma test resets need `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` (already granted in `tests/global-setup.ts`).

---

## File Structure

**New — evidence module:**
- `src/server/evidence/types.ts` — shared TS types (result shapes, `NormalisedText`, `ReliabilityResult`, `InvestigationSummary`, limits).
- `src/server/evidence/text.ts` — `normalise`, `jaccard`, `trigramSimilarity`, `blendedSimilarity`, threshold constants.
- `src/server/evidence/authority.ts` — `deriveAuthority(category, accessMethod)`, `AUTHORITY_BY_CATEGORY`.
- `src/server/evidence/matchers.ts` — `ATOMIC_MATCHERS` (phrase→ATOMIC_CLAIM_TYPE), sector/region/commodity/instrument keyword maps, opinion markers.
- `src/server/evidence/extraction.ts` — `extractAtomicClaims`.
- `src/server/evidence/canonical.ts` — `assignCanonicalClaims`.
- `src/server/evidence/lineage.ts` — `traceLineage`, `traceLineageForMany`.
- `src/server/evidence/reliability.ts` — `scoreReliability`, `scoreReliabilityForMany`.
- `src/server/evidence/investigation-query.ts` — `generateQueriesForCanonical`, `QUERY_TEMPLATES`.
- `src/server/evidence/investigation-loop.ts` — `runInvestigation`.
- `src/server/evidence/search/registry.ts` — `SearchAdapter`, `ADAPTER_REGISTRY` (empty), `getActiveSearchAdapters`, `NullSearchAdapter`, `NoSearchAdapterConfiguredError`.
- `src/server/evidence/depth-pipeline.ts` — `runEvidenceDepth(parsedDocs, docsById, sourcesById)` orchestrating extraction→canonical→lineage→reliability→in-scan query gen; returns counts.
- `src/server/services/evidence-depth.ts` — read-side joins for the API (`getEventEvidenceDepth`, `getClaimLineage`, `getClaimReliability`).

**New — API routes:** `src/app/api/events/[id]/evidence-depth/route.ts`, `src/app/api/claims/[id]/lineage/route.ts`, `src/app/api/claims/[id]/reliability/route.ts`, `src/app/api/claims/[id]/investigate/route.ts`, `src/app/api/events/[id]/investigate/route.ts`.

**New — UI:** `src/components/EvidenceDepthPanel.tsx` (+ small subcomponents if needed).

**New — tests/fixtures:** the six unit tests + `tests/evidence-depth-pipeline.e2e.test.ts`; `fixtures/evidence-depth/*.json`.

**Modified:** `src/shared/enums.ts` (new enums), `prisma/schema.prisma` (new models + `ScanRun` counters), `src/server/pipeline/orchestrator.ts` (wire depth block + counters), `src/app/events/[id]/page.tsx` (render panel), `docs/evidence-depth-engine.md` (new).

---

## Shared interfaces (locked — every task uses these verbatim)

```ts
// src/server/evidence/types.ts
export type NormalisedText = { normalised: string; tokens: Set<string>; trigrams: Set<string> }
export type EvidenceError = { stage: string; message: string; documentId?: string; canonicalClaimId?: string }

export type ReliabilityDimensions = {
  authority: number; freshness: number; specificity: number
  independence: number; support: number; contradiction: number; copyLoopRisk: number
}
export type ReliabilityResult = {
  reliabilityScore: number            // 0..1
  factualityLabel: FactualityLabel
  dimensions: ReliabilityDimensions
  reasoningSummary: string
  evidenceFor: string[]; evidenceAgainst: string[]; warnings: string[]
}
export type InvestigationLimits = {
  maxDepth: number; maxQueriesPerClaim: number; maxDocumentsPerQuery: number
  maxRuntimeMs?: number; maxCostBudget?: number; allowedSourceTypes?: string[]
}
export const DEFAULT_INVESTIGATION_LIMITS: InvestigationLimits = {
  maxDepth: 3, maxQueriesPerClaim: 12, maxDocumentsPerQuery: 10,
}
export type InvestigationSummary = {
  target: { canonicalClaimId?: string; eventCandidateId?: string }
  queriesGenerated: number; adaptersTried: number; documentsAdded: number
  stoppedReason: 'NO_ADAPTER_CONFIGURED' | 'MAX_DEPTH' | 'SATURATED' | 'NO_NEW_EVIDENCE' | 'LIMIT'
}
```
(`FactualityLabel` etc. imported from `@/shared/enums`.)

---

## Task 1 — Schema, enums, migration (Stage 1)

**Files:** Modify `src/shared/enums.ts`, `prisma/schema.prisma`. Create migration.

**Produces:** enums `ATOMIC_CLAIM_TYPES`, `FACTUALITY_LABELS`, `RELATION_TO_ORIGIN`, `QUERY_CLASSES`, `CANONICAL_CLAIM_STATUSES`, `INVESTIGATION_QUERY_STATUSES`, `SEARCH_ADAPTER_STATUSES` (+ types); `INVESTIGATION_QUERY_GENERATION` in `LLM_TASK_TYPES`. Models `AtomicClaim`, `CanonicalClaim`, `ClaimCluster`, `ClaimLineage`, `InvestigationQuery`; `ScanRun` counters. Exact fields per spec Stage 1.

- [ ] Add the enum arrays + exported union types to `src/shared/enums.ts` (mirror existing `as const` style).
- [ ] Add the five models + `ScanRun` counters to `prisma/schema.prisma` per spec (JSON as `String`; cross-refs to existing tables are plain indexed strings; relations only among new models; `ClaimCluster.@@unique([canonicalClaimId])`; `ClaimLineage.@@unique([canonicalClaimId, documentId])`).
- [ ] Run `npx prisma format` then `npx prisma migrate dev --name evidence_depth_engine` (regenerates client). Expected: migration applies, new tables created.
- [ ] Run `npm run typecheck`. Expected: clean.
- [ ] Run `npm test`. Expected: 351 pass (no behavior changed).
- [ ] Commit: `feat(evidence): schema + enums for evidence depth engine (Stage 1)`.

## Task 2 — Text + authority + matcher helpers

**Files:** Create `src/server/evidence/types.ts`, `text.ts`, `authority.ts`, `matchers.ts`. Test `tests/evidence-text.test.ts`.

**Produces:**
```ts
// text.ts
export function normalise(text: string): NormalisedText
export function jaccard(a: Set<string>, b: Set<string>): number
export function trigramSimilarity(a: Set<string>, b: Set<string>): number
export function blendedSimilarity(a: NormalisedText, b: NormalisedText): number // 0..1
export const MATCH_THRESHOLD = 0.42
export const COPY_THRESHOLD = 0.85
// authority.ts
export function deriveAuthority(category: string, accessMethod: string): number // 0..1
// matchers.ts
export type AtomicMatcher = { claimType: AtomicClaimType; pattern: RegExp; baseConfidence: number }
export const ATOMIC_MATCHERS: AtomicMatcher[]
export function detectSectors(text: string): string[]
export function detectRegions(text: string): string[]
export function detectCommodities(text: string): string[]
export function detectInstruments(text: string): string[]
export function hasOpinionMarker(text: string): boolean
```

- [ ] **Test first** (`evidence-text.test.ts`): `normalise` strips punctuation/stopwords/case; identical sentences → `blendedSimilarity` ≈ 1; near-identical (one word changed) → ≥ `COPY_THRESHOLD`; unrelated → < `MATCH_THRESHOLD`; `deriveAuthority('OFFICIAL','RSS') > deriveAuthority('NEWS','RSS') > deriveAuthority('BLOG','RSS')`.
- [ ] Run test → FAIL (modules absent).
- [ ] Implement `types.ts`, `text.ts` (token set minus stopwords; trigram sets; blended = 0.6·jaccard(tokens)+0.4·trigram), `authority.ts` (`AUTHORITY_BY_CATEGORY` map, default low), `matchers.ts` (expand the existing `claims.ts` matcher set to the 15 `ATOMIC_CLAIM_TYPES`; keyword maps).
- [ ] Run test → PASS. `npm run typecheck` clean.
- [ ] Commit: `feat(evidence): text-similarity, authority, matcher helpers (Stage 2a)`.

## Task 3 — AtomicClaimExtractionService (Stage 2)

**Files:** Create `src/server/evidence/extraction.ts`. Test `tests/atomic-claim-extraction.test.ts`.

**Consumes:** `matchers.ts`, `text.ts`; Prisma `ParsedDocument`/`Document`/`Source`.
**Produces:** `export async function extractAtomicClaims(parsedDocs: ParsedDocument[], docsById: Map<string, Document>, sourcesById: Map<string, Source>): Promise<{ atomicClaims: AtomicClaim[]; errors: EvidenceError[] }>`

- [ ] **Test first:** a fixture body with two distinct newsworthy sentences (a layoff with a number + a regulatory line) → **≥2** AtomicClaims (proves multi-claim, not one mega-claim); each has non-empty `documentId`, a valid `claimType`, `extractionConfidence` 0..1; a low-signal sentence → `factualityLabel==='NEEDS_REVIEW'` when confidence < 0.5; a claim with a number has higher `specificityScore` than one without.
- [ ] Run → FAIL. Implement per spec Stage 2 (sentence split; per-matcher emit; specificity from digits/dates/entities; entities from `entitiesMentionedJson` + capitalised sequences; `extractionMethod='rule:v2:<type>'`; LLM-assist path guarded behind `runLLMTask` but dormant — deterministic result stands). Persist via `prisma.atomicClaim.create`.
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(evidence): atomic claim extraction service (Stage 2)`.

## Task 4 — CanonicalClaimService (Stage 3)

**Files:** Create `src/server/evidence/canonical.ts`. Test `tests/canonical-claim-clustering.test.ts`.

**Consumes:** `text.ts`; `AtomicClaim`.
**Produces:** `export async function assignCanonicalClaims(atomicClaims: AtomicClaim[]): Promise<{ created: CanonicalClaim[]; updated: CanonicalClaim[]; affectedCanonicalIds: string[]; errors: EvidenceError[] }>` — also upserts a `ClaimCluster` per canonical claim and sets `AtomicClaim.canonicalClaimId`.

- [ ] **Test first:** two atomic claims, same `claimType`+entity, near-identical text → **one** canonical claim, `repeatCount===2`, both atomic rows linked. Two atomic claims about **different entities** → **two** canonical claims (never merged). Unrelated text same type → separate canonical claims.
- [ ] Run → FAIL. Implement per spec Stage 3 (normalise; candidate lookup by `claimType`+`normalisedClaimText` prefix/entity; `blendedSimilarity ≥ MATCH_THRESHOLD` + entity/date/region gates; create-or-link; record merge reason in `metadataJson`).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(evidence): canonical claim clustering service (Stage 3)`.

## Task 5 — ClaimLineageService (Stage 4)

**Files:** Create `src/server/evidence/lineage.ts`. Test `tests/claim-lineage.test.ts`.

**Consumes:** `text.ts`; `AtomicClaim`, `CanonicalClaim`.
**Produces:** `export async function traceLineage(canonicalClaimId: string): Promise<{ lineage: ClaimLineage[]; errors: EvidenceError[] }>` and `traceLineageForMany(ids: string[])`. Updates canonical + cluster counts.

- [ ] **Test first:** canonical claim with three atomic claims — earliest → `relationToOrigin==='ORIGIN_CANDIDATE'`; a later near-identical one → `isLikelyCopy===true`, `LIKELY_COPY`; a later differently-worded one from another source → `INDEPENDENT_SUPPORT`. After run: `CanonicalClaim.independentSourceCount` counts origin+independent but **excludes** the copy; `ClaimCluster.copiedSourceCount===1`.
- [ ] Run → FAIL. Implement per spec Stage 4 (order by `publishedAt`/`fetchedAt`; copy vs independent by `blendedSimilarity` vs `COPY_THRESHOLD` + timestamp/host; contradiction/commentary heuristics; upsert lineage on `[canonicalClaimId, documentId]`; recompute counts).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(evidence): claim lineage service (Stage 4)`.

## Task 6 — EvidenceReliabilityService (Stage 5)

**Files:** Create `src/server/evidence/reliability.ts`. Test `tests/evidence-reliability.test.ts`.

**Consumes:** `authority.ts`, `text.ts`; `CanonicalClaim`, `ClaimLineage`.
**Produces:** `export async function scoreReliability(canonicalClaimId: string): Promise<{ result: ReliabilityResult; errors: EvidenceError[] }>` and `scoreReliabilityForMany(ids)`. Writes `reliabilityScore`/`factualityLabel` onto canonical + cluster.

- [ ] **Test first (the load-bearing behaviours):**
  - copied vs independent: canonical A (origin + 2 `LIKELY_COPY`) vs canonical B (origin + 2 `INDEPENDENT_SUPPORT`) → `score(B) > score(A)` (copies don't inflate; independence does).
  - contradiction lowers: adding a `CONTRADICTION` lineage row to B reduces its score vs no-contradiction.
  - authority: official-source single claim `factualityLabel !== 'WEAK_SINGLE_SOURCE'` is acceptable; anonymous single-source → `WEAK_SINGLE_SOURCE`.
  - every result has non-empty `reasoningSummary`.
- [ ] Run → FAIL. Implement per spec Stage 5 (dimensions; multiplicative copy-loop + contradiction penalties; `factualityLabel` derivation; explanation strings).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(evidence): reliability scoring service (Stage 5)`.

## Task 7 — InvestigationQueryService (Stage 6)

**Files:** Create `src/server/evidence/investigation-query.ts`. Test `tests/investigation-query-generation.test.ts`.

**Consumes:** `CanonicalClaim`.
**Produces:** `export async function generateQueriesForCanonical(canonicalClaimId: string, opts?: { max?: number; provider?: LLMProvider | null }): Promise<InvestigationQuery[]>`. Stores rows `status='GENERATED'`.

- [ ] **Test first:** a canonical claim (entities=['Battery Corp'], sector='energy', region='EU', commodity='lithium') → queries covering **all 8** `QUERY_CLASSES`, each `queryText` non-empty and containing an entity/sector/region/commodity token; total ≤ `maxQueriesPerClaim`; deduped; each persisted with `queryClass` set.
- [ ] Run → FAIL. Implement per spec Stage 6 (`QUERY_TEMPLATES` per class filled from claim tokens; cap+dedupe; optional `INVESTIGATION_QUERY_GENERATION` LLM path with Zod array schema, dormant → templates).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(evidence): investigation query generation (Stage 6)`.

## Task 8 — Search registry + InvestigationLoopService (Stage 7)

**Files:** Create `src/server/evidence/search/registry.ts`, `src/server/evidence/investigation-loop.ts`. Test `tests/investigation-loop.test.ts`.

**Consumes:** `investigation-query.ts`, registry.
**Produces:** `export async function runInvestigation(target: { canonicalClaimId?: string; eventCandidateId?: string }, limits?: InvestigationLimits): Promise<InvestigationSummary>`. Registry: `getActiveSearchAdapters(): SearchAdapter[]` (empty).

- [ ] **Test first:** with the empty registry, `runInvestigation({canonicalClaimId})` returns `stoppedReason==='NO_ADAPTER_CONFIGURED'`, `documentsAdded===0`, `queriesGenerated>0`, and the generated queries are marked `SKIPPED_NO_ADAPTER`; a thrown adapter (test-injected) is recorded, not propagated; the same document id is never processed twice (dedupe set) — assert via an injected fake adapter returning one repeated doc across depths that still terminates and adds it once.
- [ ] Run → FAIL. Implement per spec Stage 7 (registry mirrors market provider; loop generates → tries adapters → dormant path → limits/saturation/processed-set; per-adapter try/catch).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(evidence): dormant search registry + investigation loop (Stage 7)`.

## Task 9 — Depth pipeline + orchestrator wiring (Stage 8)

**Files:** Create `src/server/evidence/depth-pipeline.ts`. Modify `src/server/pipeline/orchestrator.ts`. Test `tests/evidence-depth-wiring.test.ts`.

**Produces:** `export async function runEvidenceDepth(parsedDocs, docsById, sourcesById): Promise<{ counts: EvidenceDepthCounts; errors: EvidenceError[] }>` where `EvidenceDepthCounts = { atomicClaimsExtracted, canonicalClaimsCreated, canonicalClaimsUpdated, claimClustersUpserted, lineageRecordsCreated, investigationQueriesGenerated }`.

- [ ] **Test first:** `runEvidenceDepth` over 2 parsed fixture docs returns counts with `atomicClaimsExtracted>0`; a `runFullScan()` integration assertion that the returned `counts` now include the six new fields and existing counters are unchanged in meaning; if the depth block throws (inject failure), scan status is still `COMPLETED`/`COMPLETED_WITH_ERRORS`, never crashes.
- [ ] Run → FAIL. Implement `depth-pipeline.ts` (extraction→canonical→lineage(affected)→reliability(affected)→capped in-scan query gen). Insert a try/catch block into `orchestrator.ts` after parse (step 5), push errors non-fatally, spread the six counters into the `ScanRun` update and `ScanSummary.counts`.
- [ ] Run → PASS. `npm test` (all, incl. existing scan tests) green. `typecheck` clean. Commit: `feat(evidence): wire evidence depth into scan pipeline (Stage 8)`.

## Task 10 — Read service + API routes (Stage 9)

**Files:** Create `src/server/services/evidence-depth.ts` + the five route files. Test `tests/evidence-depth-api.test.ts`.

**Produces:** `getEventEvidenceDepth(eventId)`, `getClaimLineage(canonicalClaimId)`, `getClaimReliability(canonicalClaimId)`.

- [ ] **Test first:** after a scan, `getEventEvidenceDepth(eventId)` returns `{ hasDepth: true, atomicClaims, canonicalClaims, clusters, lineage, reliability, supporting, contradicting, queries, gaps }` joined by the event's document ids; an event with no depth returns `{ hasDepth: false }`; `POST investigate` returns the dormant summary.
- [ ] Run → FAIL. Implement the read service (event→signals→documentIds→atomic/canonical join) and the five routes (GET read; POST → `runInvestigation`). Follow existing route conventions (`NextResponse.json`, param `await`).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(evidence): evidence-depth read service + API routes (Stage 9)`.

## Task 11 — Event page depth UI (Stage 10)

**Files:** Create `src/components/EvidenceDepthPanel.tsx`. Modify `src/app/events/[id]/page.tsx`. Test: extend the API/read-service assertions (server-rendered; no jsdom needed — assert the read service shape the panel consumes; light render check only if the repo already renders components in tests).

- [ ] Extend `page.tsx` to fetch `getEventEvidenceDepth` and render `EvidenceDepthPanel` (atomic facts, weak/disputed claims, origin trace, lineage, supporting vs contradicting, reliability + reasoning, queries, gaps). Empty state: "Deep investigation has not run for this event yet." Add a "Run deeper investigation" button posting the event investigate route. Sections self-hide when empty (match existing page convention). No dashboard changes.
- [ ] `npm test` green; `typecheck` clean; `npm run build` succeeds (RSC boundary check). Commit: `feat(evidence): event page evidence-depth panel (Stage 10)`.

## Task 12 — E2E + fixtures (Stage 11)

**Files:** Create `fixtures/evidence-depth/*.json` (copied / independent / contradicting sets), `tests/evidence-depth-pipeline.e2e.test.ts`.

- [ ] Build fixtures: source X reports claim C (origin); source X2 reprints near-identical (copy); source Y reports C differently (independent); source Z contradicts C. Seed via a test fixture source.
- [ ] **E2E asserts all 10 spec items** (docs collected; atomic extracted; canonical created; repeats clustered; copied doesn't inflate; independent raises; contradiction lowers; lineage created; queries generated; event API returns depth).
- [ ] Run → PASS. Full `npm test` green; `typecheck` clean. Commit: `test(evidence): end-to-end evidence depth pipeline proof (Stage 11)`.

## Task 13 — Documentation

**Files:** Create `docs/evidence-depth-engine.md`.

- [ ] Write: what atomic claims are; canonical claims; lineage (origin/copy/independent); reliability scoring (dimensions + penalties); recursive investigation (dormant search); how copied reporting is handled; how weak claims are labelled; how to activate a search adapter later.
- [ ] Commit: `docs: evidence depth engine documentation`.

---

## Self-Review (completed)

- **Spec coverage:** Tasks 1–13 map 1:1 to spec Stages 1–11 + docs. ✓
- **Placeholders:** none — each task carries concrete interfaces + named test assertions; algorithms in the linked spec. ✓
- **Type consistency:** `NormalisedText`, `blendedSimilarity`, `MATCH_THRESHOLD`/`COPY_THRESHOLD`, `ReliabilityResult`, `InvestigationSummary`, `EvidenceDepthCounts` referenced identically across tasks. ✓
