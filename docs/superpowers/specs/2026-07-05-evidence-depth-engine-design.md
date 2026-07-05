# Evidence Depth Engine — Design Spec

**Date:** 2026-07-05
**Branch:** `feat/evidence-depth-engine`
**Status:** Approved (owner approved design 2026-07-05; delivery = full engine, staged commits; investigation search = dormant this pass)
**Pass:** Pass 2 of the depth roadmap in `docs/depth-gap-audit.md`

## Purpose

Archlight currently treats a feed item as a single shallow event summary (regex over an RSS headline → one signal). This engine makes it instead extract **atomic claims**, group them into **canonical claims**, trace **lineage** (origin vs copy vs independent support), score **reliability** with explanations, and generate (and later run) **follow-up investigation queries**. This is the foundation required before Archlight can name who benefits or is harmed.

For every meaningful document ingested, Archlight must be able to answer: what exact claims were made; which are repeated across sources; which source is the origin; which sources are independent; which reports are copies; which claims are supported; which are weak/stale/recycled/contradicted; and what follow-up queries should verify or challenge them.

## Guiding principles (carried from the existing codebase)

1. **Additive, not a rewrite.** The existing `claim → signal → cluster → event` spine stays byte-identical. Nothing is removed. All 351 existing tests must stay green.
2. **Joined by `documentId`.** The new layer keys off the same `Document` rows the legacy signal path uses. An event's deep evidence is a read-side join: event → signals → `documentId`s → atomic/canonical claims from those documents. No coupling to `EventCandidate`.
3. **Deterministic-first, LLM-dormant.** Every service works fully offline with deterministic rules and passes tests with no API key. LLM assist (extraction fallback, query generation) routes through the existing `runLLMTask` + `validateLLMOutput` (schema-validated, evidence-grounded, advice-guarded, `FakeProvider` seam). With AI dormant, deterministic output stands alone — never a fabricated fallback.
4. **Dormant-safe.** The investigation loop and its search-adapter registry are structured but ship with no active connector (empty registry, returns `NOT_CONFIGURED`), mirroring the existing market layer. Never fabricates.
5. **Fault-isolated.** If the depth layer errors during a scan, the scan still completes (wrapped like the existing timeline stage).
6. **Local-only.** App remains local-only until the deferred security pass. The dormant search adapter means zero new outbound calls in this pass.

## Cross-references to existing contracts (verified)

- `runLLMTask(req: LLMRequest, opts: { provider?, validate? }): { status, text?, parsed?, llmRunId, validation }` — `src/server/llm/run.ts`. Inject a `FakeProvider` (or `null`) via `opts.provider` for tests; omit for dormant-by-default.
- `validateLLMOutput(raw, { schema, evidenceIds, requireGrounding, extraCheckers })` — `src/server/llm/validate.ts`. Zod schema + grounding + advice guard.
- `LLM_TASK_TYPES` already includes `CLAIM_EXTRACTION_ASSIST`, `ENTITY_RESOLUTION_ASSIST`, `CONTRADICTION_ANALYSIS` — reuse. Add `INVESTIGATION_QUERY_GENERATION`.
- JSON is stored as `String` columns with a `...Json` suffix (SQLite has no native JSON), default `"[]"`/`"{}"` — follow this convention.
- `runFullScan()` orchestrator — `src/server/pipeline/orchestrator.ts`. New stages insert after parse; new `ScanRun` counters spread into the existing update.
- Source authority is derived deterministically from the existing `Source.category` + `accessMethod` — **no new column on `Source`** (keeps the migration to new tables + additive `ScanRun` counters only).

---

## Stage 1 — Schema & enums (additive migration)

New module directory: `src/server/evidence/`.

### New enums (`src/shared/enums.ts`, additive)

```
ATOMIC_CLAIM_TYPES = [LAYOFF_SIGNAL, HIRING_CHANGE, REGULATORY_PRESSURE, PROCUREMENT_ACTIVITY,
  SUPPLY_CHAIN_PRESSURE, MARKET_MOVEMENT, COMMODITY_PRESSURE, COMPANY_STATEMENT, EXECUTIVE_CHANGE,
  LEGAL_EVENT, CUSTOMER_COMPLAINT, DEMAND_SIGNAL, FUNDING_SIGNAL, MACRO_SIGNAL, UNKNOWN]
FACTUALITY_LABELS = [SUPPORTED, STRONGLY_SUPPORTED, WEAK_SINGLE_SOURCE, CONTRADICTED, STALE,
  RECYCLED, UNVERIFIED, NEEDS_REVIEW]
RELATION_TO_ORIGIN = [ORIGIN_CANDIDATE, INDEPENDENT_SUPPORT, LIKELY_COPY, COMMENTARY, CONTRADICTION, UNKNOWN]
QUERY_CLASSES = [ORIGIN_TRACE, SUPPORTING_EVIDENCE, CONTRADICTION, AFFECTED_ENTITIES,
  BENEFICIARY_SEARCH, HARMED_PARTY_SEARCH, HISTORIC_ANALOGUE, FUTURE_SCENARIO_SIGNAL]
CANONICAL_CLAIM_STATUSES = [ACTIVE, MERGED, STALE, SUPERSEDED]
INVESTIGATION_QUERY_STATUSES = [GENERATED, RUNNING, COMPLETED, FAILED, SKIPPED_NO_ADAPTER]
SEARCH_ADAPTER_STATUSES = [CONFIGURED, NOT_CONFIGURED]
```
Add `INVESTIGATION_QUERY_GENERATION` to `LLM_TASK_TYPES`.

### New Prisma models (`prisma/schema.prisma`)

Cross-references to existing tables (`documentId`, `sourceId`, `entityId`, `eventCandidateId`) are **plain indexed `String` fields — no Prisma relation** (keeps existing models frozen). Relations exist only *among the new models*.

**AtomicClaim** — `id` cuid; `documentId` (idx), `sourceId` (idx), `canonicalClaimId String?` (relation → CanonicalClaim, idx), `claimText`, `claimType`, `entitiesJson`/`sectorsJson`/`regionsJson`/`commoditiesJson`/`instrumentsJson` (String `"[]"`), `eventDate DateTime?`, `extractionMethod`, `extractionConfidence Float`, `specificityScore Float`, `factualityLabel`, `metadataJson String "{}"`, `createdAt`, `updatedAt`.

**CanonicalClaim** — `id`; `claimText`, `normalisedClaimText` (idx), `claimType` (idx), `firstSeenAt DateTime?`, `firstSeenSourceId String?`, `originCandidateUrl String?`, `independentSourceCount Int 0`, `repeatCount Int 0`, `contradictionCount Int 0`, `supportScore Float 0`, `reliabilityScore Float 0`, `status String "ACTIVE"`, `createdAt`, `updatedAt`; relations `atomicClaims`, `clusters`, `lineage`, `investigationQueries`.

**ClaimCluster** — `id`; `canonicalClaimId` (relation, `@@unique` — one cluster per canonical claim), `title`, `summary`, `sourceCount Int 0`, `independentSourceCount Int 0`, `copiedSourceCount Int 0`, `contradictionCount Int 0`, `reliabilityScore Float 0`, `momentumScore Float 0`, `createdAt`, `updatedAt`.

**ClaimLineage** — `id`; `canonicalClaimId` (relation, idx), `sourceId`, `documentId`, `url`, `publishedAt DateTime?`, `firstSeenAt DateTime?`, `relationToOrigin`, `isLikelyCopy Boolean false`, `originConfidence Float 0`, `createdAt`, `updatedAt`; `@@unique([canonicalClaimId, documentId])`.

**InvestigationQuery** — `id`; `canonicalClaimId String?` (relation, idx), `eventCandidateId String?` (idx, plain), `queryText`, `queryClass`, `status String "GENERATED"`, `resultCount Int 0`, `metadataJson String "{}"`, `createdAt`, `updatedAt`.

### `ScanRun` additive counters (only existing model touched)

`atomicClaimsExtracted`, `canonicalClaimsCreated`, `canonicalClaimsUpdated`, `claimClustersUpserted`, `lineageRecordsCreated`, `investigationQueriesGenerated` — all `Int @default(0)`.

Migration: `prisma migrate dev --name evidence_depth_engine` — new tables + additive default-0 columns only. Safe on the existing SQLite DB. Regenerate client.

---

## Stage 2 — AtomicClaimExtractionService (`src/server/evidence/extraction.ts`)

`extractAtomicClaims(parsedDocs, docsById, sourcesById): { atomicClaims, errors }`.

- Deterministic: split `bodyText` into sentences; run an expanded matcher table mapping phrases → `ATOMIC_CLAIM_TYPES`; emit **one atomic claim per (sentence, matched type)** — short, specific, testable; never one mega-claim per article.
- Populate `documentId`, `sourceId`, `entitiesJson` (from parse `entitiesMentionedJson` + capitalised-sequence detection), `sectorsJson`/`regionsJson`/`commoditiesJson`/`instrumentsJson` (keyword maps), `eventDate` (parsed `publishedAt`), `extractionMethod` (`rule:v2:<type>`), `extractionConfidence`, `specificityScore` (numbers/dates/named entities present), `factualityLabel` (`NEEDS_REVIEW` if confidence < 0.5, else `UNVERIFIED`; opinion markers → commentary flag in metadata, factuality stays `UNVERIFIED`, never asserted as fact).
- LLM-assist (optional, dormant by default): only when deterministic yields nothing from substantive text — `CLAIM_EXTRACTION_ASSIST`, Zod-array schema, each item must cite the `documentId` (grounding), advice-guarded. Invalid output → rejected → deterministic result (or `NEEDS_REVIEW`), never fabricated.

## Stage 3 — CanonicalClaimService (`src/server/evidence/canonical.ts`)

`assignCanonicalClaims(atomicClaims): { created, updated, links }`.

- `normalise(text)`: lowercase, strip punctuation, remove stopwords, collapse whitespace → token set + trigram set.
- Match a new atomic claim to an existing canonical claim when **all** hold: same `claimType`; entity overlap (or both entity-less with strong text match); compatible date (same/near) and region; text similarity ≥ `MATCH_THRESHOLD` (Jaccard over tokens blended with trigram similarity).
- No match → create canonical (`firstSeenAt`/`firstSeenSourceId` from this claim). Match → link, bump `repeatCount`, recompute counts. Different entity ⇒ never merge. Different date/region ⇒ merge only if clearly related.
- Every merge decision recorded (in `metadataJson` reason) — explainable.
- Copied wording alone does **not** count as independent support (that determination is Stage 4).

## Stage 4 — ClaimLineageService (`src/server/evidence/lineage.ts`)

`traceLineage(canonicalClaimId): { lineageRecords, counts }`.

- Order the canonical claim's atomic claims by `publishedAt` (fallback `fetchedAt`). Earliest ⇒ `ORIGIN_CANDIDATE` (`originConfidence` from timestamp gap + source authority).
- Likely copy: near-identical wording (similarity ≥ `COPY_THRESHOLD`) AND later timestamp (and/or same URL host / same wire) ⇒ `LIKELY_COPY`, `isLikelyCopy = true`.
- Independent support: different source, different wording basis ⇒ `INDEPENDENT_SUPPORT`.
- Commentary: opinion markers referencing the claim ⇒ `COMMENTARY`. Contradiction: negation/opposite-direction heuristic ⇒ `CONTRADICTION`.
- Writes `ClaimLineage` (upsert per `[canonicalClaimId, documentId]`); updates `CanonicalClaim.independentSourceCount` (distinct sources among origin + independent, **excluding copies**), `repeatCount`, `contradictionCount`, and the `ClaimCluster` `sourceCount`/`independentSourceCount`/`copiedSourceCount`/`contradictionCount`.

## Stage 5 — EvidenceReliabilityService (`src/server/evidence/reliability.ts`)

`scoreReliability(canonicalClaimId): { reliabilityScore, factualityLabel, reasoningSummary, evidenceFor, evidenceAgainst, warnings }` (and applies to the atomic/canonical/cluster rows).

Dimensions (each 0–1, explained): `authority` (derived from `Source.category`+`accessMethod` via an `AUTHORITY_BY_CATEGORY` map — official/regulator/filing high, major news medium, blog/unknown low), `freshness` (recency decay from newest supporting doc; below threshold ⇒ `STALE`), `specificity` (mean atomic specificity), `independence` (diminishing-returns fn of `independentSourceCount`, penalised by copy ratio), `support` (independent sources + support score), `contradiction` (penalty), `copyLoopRisk` (high `repeatCount` + low independence ⇒ multiplicative penalty).

Composite = weighted sum with **copy-loop and contradiction applied as multiplicative penalties** so wide copying never raises confidence. `factualityLabel` derivation: `STRONGLY_SUPPORTED` (≥2 independent + high authority + fresh), `SUPPORTED` (≥2 independent OR ≥1 primary/official), `WEAK_SINGLE_SOURCE` (1 non-primary), `CONTRADICTED` (material contradiction), `STALE`, `RECYCLED` (high repeat, all copies, no new independent), `NEEDS_REVIEW` (extraction-flagged), else `UNVERIFIED`. Every score yields a human-readable `reasoningSummary` + `evidenceFor`/`evidenceAgainst`/`warnings`. Weak claims are labelled and must not silently drive major output.

## Stage 6 — InvestigationQueryService (`src/server/evidence/investigation-query.ts`)

`generateQueries(canonicalClaim | eventCandidate, opts): InvestigationQuery[]`.

- One template family per `QUERY_CLASS`, filled from the claim's entity/sector/region/commodity/instrument/claimType — specific, entity/region-preserving, no unsupported speculation.
- Capped by `maxQueriesPerClaim` (default 12); deduped; stored as `InvestigationQuery` rows (`status = GENERATED`).
- LLM-assist optional (`INVESTIGATION_QUERY_GENERATION`): returns structured JSON array, Zod-validated; invalid ⇒ deterministic templates.

## Stage 7 — Investigation loop + search adapters (`src/server/evidence/investigation-loop.ts`, `src/server/evidence/search/`)

**Search adapter registry** (`search/registry.ts`) mirrors the market pattern: `interface SearchAdapter { name; status(): SEARCH_ADAPTER_STATUS; search(query, opts): Promise<SearchDoc[]> }`; `ADAPTER_REGISTRY = {}` (empty — dormant); `getActiveSearchAdapters(): SearchAdapter[]` returns `[]` when unconfigured; `NullSearchAdapter` throws `NoSearchAdapterConfiguredError`.

**InvestigationLoopService** — `runInvestigation({ canonicalClaimId | eventCandidateId }, limits): InvestigationSummary`.

Flow: generate queries → for each, try active adapters. Dormant ⇒ mark queries `SKIPPED_NO_ADAPTER`, `resultCount 0`. When an adapter is active later: store returned docs → extract atomic claims → canonical match → lineage → reliability update. Stop when: `maxDepth` (3) reached, no new evidence, reliability delta < `SATURATION_EPSILON`, or a limit hit. Limits (configurable, defaults): `maxDepth 3`, `maxQueriesPerClaim 12`, `maxDocumentsPerQuery 10`, `maxRuntimeMs`, `maxCostBudget`, `allowedSourceTypes`. Rules: no arbitrary scraping (only registered adapters); per-adapter failures recorded, never crash; track processed doc ids (no reprocessing); no infinite loops. Returns `{ queriesGenerated, adaptersTried, documentsAdded, stoppedReason }` — `documentsAdded: 0`, `stoppedReason: 'NO_ADAPTER_CONFIGURED'` this pass.

## Stage 8 — Pipeline wiring (`src/server/pipeline/orchestrator.ts`)

Insert an **evidence-depth block after parse (step 5)**, wrapped in try/catch (non-fatal): `extractAtomicClaims` → `assignCanonicalClaims` → `traceLineage` (per affected canonical) → `scoreReliability` (per affected canonical) → in-scan `generateQueries` for meaningful canonical claims only (capped). The existing `claims → signals → cluster → events → …` stages run unchanged afterwards. Spread the six new counters into the existing `ScanRun` update. The recursive **loop is NOT run in-scan** (on-demand via API/UI). If the block throws, push a `PipelineError` and continue — the scan still completes.

## Stage 9 — API routes

- `GET /api/events/[id]/evidence-depth` → resolve event's `documentId`s (via its signals) → atomic claims, canonical claims, clusters, lineage, reliability, supporting vs contradicting evidence, generated queries, evidence gaps. Empty ⇒ `{ hasDepth: false }`.
- `GET /api/claims/[id]/lineage` → lineage records + origin trace for a canonical claim.
- `GET /api/claims/[id]/reliability` → reliability score + reasoning.
- `POST /api/claims/[id]/investigate` → run the (dormant) loop for a canonical claim.
- `POST /api/events/[id]/investigate` → run the (dormant) loop for an event.

New read services under `src/server/services/` (e.g. `evidence-depth.ts`) do the `documentId` joins.

## Stage 10 — UI depth (event detail page only)

**No dashboard redesign.** Extend `src/app/events/[id]/page.tsx` with an "Evidence Depth" section rendering: atomic facts, weak claims, disputed/contradicted claims, source origin trace, claim lineage, supporting vs contradicting sources, reliability score + reasoning, investigation queries generated, evidence gaps. Empty state: *"Deep investigation has not run for this event yet."* Add a **"Run deeper investigation"** action (POSTs the event investigate route; honestly shows the dormant "no search connector configured" result + the queries it would run). New components under `src/components/` (server-rendered; sections self-hide when data absent, matching the existing page's convention).

## Stage 11 — Tests + docs

Unit (`tests/`): `atomic-claim-extraction.test.ts`, `canonical-claim-clustering.test.ts`, `claim-lineage.test.ts`, `evidence-reliability.test.ts`, `investigation-query-generation.test.ts`, `investigation-loop.test.ts`.

E2E: `tests/evidence-depth-pipeline.e2e.test.ts` — proves (1) multiple docs collected, (2) atomic claims extracted, (3) canonical claims created, (4) repeated claims clustered, (5) copied reporting does **not** inflate confidence, (6) independent support increases reliability, (7) contradictions reduce reliability, (8) lineage records created, (9) follow-up queries generated, (10) the event API returns deep evidence.

New fixtures (`fixtures/`): documents modelling the same claim **copied** (near-identical wording, later timestamps), **independently reported** (different wording/source), and **contradicted** — seeded via a test fixture source so the e2e can assert 5/6/7. LLM-assist paths tested with an injected `FakeProvider`.

Docs: `docs/evidence-depth-engine.md` — what atomic claims are; how canonical claims work; how lineage works; how reliability scoring works; how recursive investigation works; how copied reporting is handled; how weak claims are labelled.

---

## Delivery — staged commits (each: `@workspace` typecheck clean + `vitest run` green)

1. ✅ Audit doc.
2. Spec doc (this file).
3. Stage 1 — schema + enums + migration + client.
4. Stage 2 — extraction service + test.
5. Stage 3 — canonical service + test.
6. Stage 4 — lineage service + test.
7. Stage 5 — reliability service + test.
8. Stage 6 — investigation-query service + test.
9. Stage 7 — search registry (dormant) + loop service + test.
10. Stage 8 — orchestrator wiring + ScanRun counters.
11. Stage 9 — API routes.
12. Stage 10 — event page depth UI.
13. Stage 11 — e2e + fixtures.
14. docs/evidence-depth-engine.md.

Feature branch only; no push to `main` without owner approval.

## Acceptance criteria

Archlight must no longer treat an article as a single shallow signal. It must extract and track testable atomic claims, cluster repeats, trace where they came from (origin vs copy vs independent), score how reliable they are with explanations, and generate follow-up investigations — with copied reporting never inflating confidence, independent support raising it, and contradictions lowering it. All existing behaviour and the 351-test baseline remain intact.

## Non-goals (this pass)

Live web search (adapter ships dormant); naming beneficiaries/harmed parties (Pass 3 — this engine is the prerequisite); dashboard redesign; migrating the legacy `claim → signal` spine onto the new layer; deployment/security hardening.
