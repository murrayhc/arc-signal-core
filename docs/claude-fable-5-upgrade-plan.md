# Archlight — Upgrade Plan (claude-fable-5)

**Date:** 2026-07-09 · **Base:** `2505dae`, 453/453 tests green.
**Companion:** `docs/claude-fable-5-archlight-audit.md` (findings T1–T3, R1–R9 —
referenced throughout).

---

## STATUS: COMPLETE — Stages 0–10 shipped (2026-07-09)

All eleven stages landed on `origin/main`, each a separately-committed,
test-pinned unit. **573/573 tests green** (up from the 453 baseline — 120 new),
typecheck clean, `next build` clean, deterministic-scan invariant intact
(AI/embeddings/market/search all still dormant by default).

| Stage | What shipped | Audit findings closed |
|---|---|---|
| 0 | Truth & hygiene: router `enabled` semantics + `SKIPPED_UNROUTED`; token-priced daily **monetary** budget; grounded+re-guarded enrichment; collectorStatus/error-detail truth; doc-drift fixes; dead-code/route removal | R8, R9, M-1 |
| 1 | Reliability maths: publisher **independence groups**, SimHash **document fingerprints**, **manipulation-risk** (copy-burst), origin-confidence into reliability, factuality rollup | R5, +manipulation-risk (was MISSING) |
| 2 | **Spine unification** — events now driven by canonical-claim reliability; RECYCLED/CONTRADICTED **quarantined**; publisher-group diversity; first-class commodities/instruments/momentum; continuous novelty | **T1/R1** (the structural fix) |
| 3 | Source depth: Atom/RDF + conditional GET; **5 live source categories** (news/regulator/gov/procurement/GDELT); per-source cadence + backoff; **scan worker**; recency-gated LIVE | **T2**, B8, B9 |
| 4 | Investigation loop **live + bounded**: runtime/cost/source-type limits enforced; **GDELT** search adapter; LLM query-gen reachable; interrogate→investigate bridge | **R4**, +T3 (partial) |
| 5 | **Entity resolution**: legal-suffix folding, alias/keyword classification, honest UNKNOWN excluded from named impacts; join tables populated | **R3**, B4 |
| 6 | **Review queue**: 5 producers, `/review` UI + API, approve/reject/needs-more | +review-queue (was MISSING) |
| 7 | Synthesis depth: event-specific scenario narratives, **historic-analogue retrieval**, genuinely differentiated report types, confidence-movement panel | B7, report-diff |
| 8 | **Embedding seam** (removes the Jaccard ceiling, dormant); multi-provider base-URL; JSON-repair retry | (semantic-similarity ceiling) |
| 9 | **Arc caching** (no write-on-GET); dashboard source-category coverage + review count | M-2 |
| 10 | Guardrail sweep (full brief forbidden-list at runtime) + **cross-stage acceptance proof** (disputed-claim-caught + corroborated-claim-drives-named-exposure) + 6-degree arc assertion | I-2, M-4 (hardened) |

**Owner-gated, still off by design** (activation is a cost decision, all
plumbing built + tested): the LLM provider, the embedding provider, and the
market-data adapter. Turning any on is env-only; deterministic output is the
floor, never gated on them.

**Net effect vs the audit's three structural truths:** T1 (deep layer didn't
drive events) — CLOSED. T2 (one lighthouse, manual) — CLOSED (5 categories,
scheduler). T3 (every amplifier off) — the investigation loop is now live and
bounded; the LLM/embedding/market layers remain owner-gated by design.

---

## Ordering rationale (where this differs from the brief's suggested stages)

The brief suggests starting with source depth. The audit changes the order in one
critical way: **the deep evidence layer must drive events (T1/R1) before source
breadth multiplies input**, and **publisher-independence + loop limits (R4/R5) must
land before any new source or search adapter**, otherwise adding sources *inflates*
reliability exactly when volume grows, and the first search adapter turns a bounded
loop into an unbounded crawler. So: harden the mathematics first, then widen the
intake, then switch on the amplifiers.

Standing constraints honoured throughout:
- **Deterministic-first, dormant-LLM.** Every capability works with no API key;
  LLM/embedding/market layers upgrade output when activated, never gate it.
  Activation stays an owner decision (cost).
- **No fabrication, ever.** New adapters and synthesis inherit the sentinel /
  isFixture / advice-guard discipline.
- **Non-advisory language** everywhere; forbidden-language tests extended, never
  weakened.
- **Additive migrations; staged removals.** Nothing is deleted until its consumer
  is migrated and tests pin the replacement (SR2-style two-part acceptance).
- Tests green + typecheck clean at every stage boundary; each stage is a
  separately committable, separately revertible unit.

---

## Stage 0 — Truth & hygiene (small, de-risking, no behaviour change)

Fixes every "the label lies" finding so later stages build on honest ground.

1. Runtime `collectorStatus` reconciliation: derive from
   `getCollector(accessMethod) != null` at scan time; stop stamping
   loop-ingested sources FUNCTIONAL (`investigation-loop.ts:62`).
2. Persist source error detail: keep last error message on `SourceHealth`
   (currently nulled, `health.ts:39`).
3. Router `enabled` semantics (R8): `routeTask` filters to enabled configs, falls
   back to `unrouted`; adjust dormant tests to inject enabled fakes.
4. Budget honesty (R7, partial): rename call-count cap in UI/docs; add per-model
   input/output token pricing table and a true daily monetary cap
   (`LLM_DAILY_SPEND_CAP_GBP`) enforced pre-call alongside the count cap; correct
   the `£`-on-USD display.
5. Grounding coverage: add schema + `requireGrounding` to both consequence-enrich
   calls (`enrich.ts:68,92`); strengthen grounding from any-substring to
   required-fraction of cited evidence IDs (R9).
6. Dead code: unreachable `UNVERIFIED` branch (`reliability.ts:34`); retire
   `/api/revenue-lenses` after pointing its single consumer at `/api/lenses`.
7. Doc drift: fix `multi-model-llm-routing.md` (placeholder-IDs claim),
   `llm-routing-and-guardrails.md` ("only enrich is live"),
   `evidence-arc-engine.md` (stale deferred list).

**Tests:** router-enabled filtering; monetary budget gate; grounding-fraction
rejection; collectorStatus reconciliation.
**Acceptance:** all labels match runtime truth; activation traps R8/R9 closed.

## Stage 1 — Reliability mathematics hardened for scale (pre-breadth)

1. **Publisher independence groups** (R5): `Source.independenceGroup` derived from
   registrable domain; lineage/reliability count independent *groups*, not rows.
2. **SimHash fingerprints** on documents (deterministic, no-API): near-duplicate +
   syndication detection replacing the single 0.72 Jaccard threshold as the copy
   signal (Jaccard retained as secondary).
3. **Manipulation-risk score** (new, on ClaimCluster): copy-burst detection —
   many same-fingerprint/same-group documents inside a short window; recorded with
   explanation, feeds reliability as a penalty dimension.
4. **Origin-confidence into reliability**: stop ignoring the computed
   `originConfidence`; per-copy confidences replace the hardcoded 0.
5. **Factuality rollup**: `CanonicalClaim.factualityLabel` re-derived on every
   re-score.

**Tests:** same-publisher syndication collapses to one independent group; copy
burst raises manipulation risk and lowers reliability; factuality re-rolls on new
evidence.
**Acceptance:** five copies of one wire story can never outrank two genuinely
independent reports, even after Stage 3 multiplies sources.

## Stage 2 — Connect the brain to the spine (T1/R1 — the structural fix)

Events consume the canonical-claim layer:

1. Signals gain `canonicalClaimId`; signal confidence/strength derive from the
   canonical claim's `reliabilityScore` + factuality (replacing the legacy
   constant-0.7 path). Legacy `Claim` becomes a typing shim during transition.
2. Event metrics (`computeEventMetrics`) weight member signals by reliability;
   sub-threshold factuality (RECYCLED / CONTRADICTED below floor) is quarantined
   from event creation and routed to the review queue (Stage 6) instead of the feed.
3. Event gains first-class `commoditiesJson` / `instrumentsJson` (promoted from
   atomic claims) and `momentumScore` (from the existing graph momentum);
   novelty becomes continuous (decayed similarity to prior events) not binary.
4. Retire `RiskOpportunity` after migrating the event-page Overview tab to the
   consequence layer.

**Tests:** e2e — a RECYCLED-only cluster creates no event; reliability-weighted
confidence beats count-weighted; existing 453 baseline behaviours re-pinned where
formulas legitimately change (documented deltas, not silent).
**Acceptance:** dashboard ranking provably moves when reliability moves; the
depth-gap audit's "weak claims drive output" is closed.

## Stage 3 — Source depth & scan truth (breadth, on hardened maths)

1. **Feed parser upgrade**: Atom + RDF + JSON-feed; conditional GET
   (ETag/If-Modified-Since); per-source cadence + backoff columns.
2. **Free lawful public source pack** (all via `safeFetchText`, all
   health-tracked, all env-optional):
   - curated multi-outlet RSS/Atom set (trade press, regulator news feeds,
     gov publications) — config-seeded, owner-editable;
   - UK Contracts Finder API collector (procurement notices, free);
   - Companies House streaming/filings collector (filings; free API key,
     env-gated like other paid/keyed layers);
   - GDELT DOC 2.0 collector (keyless, global news index).
3. **Scheduler**: a worker loop (`scripts/scan-worker.ts` + npm script) running
   `runFullScan()` per-source-cadence with jitter; honest LIVE indicator gated on
   scan recency. Local-first (no external cron dependency).
4. **Postgres readiness check** (R6): index the hot paths; keep SQLite default
   for local, but land the mechanical Postgres migration scripts so volume growth
   has an exit.

**Tests:** per-collector fixture + live-shape tests; conditional-GET no-op scans;
scheduler tick isolation; source-health truth under mixed success/failure.
**Acceptance:** ≥4 source *categories* live (news, regulator/gov, procurement,
filings) with honest per-source health; unattended scans occur on schedule.

## Stage 4 — Investigation loop goes live (bounded)

1. **Wire the declared limits first** (R4): `maxRuntimeMs`, `maxCostBudget`,
   `allowedSourceTypes` enforced inside the loop; add per-run document cap.
2. **First search adapter: GDELT DOC 2.0** (keyless, lawful, free) registered in
   `SEARCH_ADAPTER_REGISTRY`; second adapter interface-proven by the Stage-3
   Contracts Finder search endpoint.
3. Investigation query generation receives the active LLM provider when one is
   configured (currently injected-only); template generation remains the default.
4. Interrogate→investigate bridge: thin-coverage searches offer a bounded
   investigation run.

**Tests:** limits enforced (runtime/docs/depth/queries); saturation stop; adapter
failure isolation; no re-ingest of same fingerprint; e2e — a seeded claim triggers
queries that ingest, re-cluster, and re-score against a faked adapter.
**Acceptance:** "trace it backwards, test it against other sources" happens
automatically and provably terminates within limits.

## Stage 5 — Entity resolution & company impact precision (R3)

1. Canonicaliser: legal-suffix folding (Ltd/PLC/Inc/GmbH…), alias table,
   case/punctuation normalisation; populate `Entity` canonically and finally write
   `EventCandidateEntity`/`SignalClusterEntity`.
2. Organisation classifier: deterministic features (suffixes, known-role/product
   stoplists, gazetteer of places) with an honest UNKNOWN class that is **excluded
   from named impacts** (falls back to category level); dormant
   ENTITY_RESOLUTION_ASSIST LLM task upgrades ambiguous cases when active.
3. Impact pathways cite the resolver's evidence (which claims, which documents,
   which fingerprint groups).
4. Messy-prose regression corpus: real-world-shaped fixtures (titles, honorifics,
   products, places) pinning non-invention.

**Acceptance:** named beneficiaries/harmed are real organisations with evidence
trails; non-organisations demonstrably cannot reach a named impact.

## Stage 6 — Review queue (human-in-the-loop)

1. `ReviewItem` model: type (atomic claim / canonical claim / company impact /
   event candidate / contradiction / positioning example / source), status
   (PENDING / APPROVED / REJECTED / NEEDS_MORE_EVIDENCE), reason, evidence refs,
   reviewer note, timestamps.
2. Producers: Stage-2 quarantine, low-confidence impacts, UNKNOWN entities,
   contradiction spikes, manipulation-risk alerts.
3. `/review` UI + API; approval re-admits to the normal flow, rejection tombstones
   (and teaches the alias/stoplists where applicable).

**Acceptance:** nothing sub-threshold silently ships or silently disappears — it
queues, visibly.

## Stage 7 — Synthesis depth (context, scenarios, positioning, reports)

1. Scenario narratives composed from event-specific computed facts (drivers,
   momentum, named exposures, watch signals) — deterministic composition replacing
   the five canned strings; FUTURE_SCENARIOS LLM task upgrades narrative when
   active (schema-validated, evidence-grounded, advice-guarded).
2. Historic context widens beyond own-history: analogue retrieval over the (now
   populated) event corpus by type/sector/entity-overlap similarity with outcome
   summaries.
3. Report types genuinely differentiated: per-type section selection, ordering,
   and emphasis (sales brief leads with beneficiaries + positioning; risk brief
   with harmed/contradictions/watch signals; procurement with notices + suppliers).
4. Watch signals become claim-derived (from trigger conditions + scenario deltas)
   rather than a static per-type lookup.
5. Confidence-history panel on the event page rendered from existing
   CONFIDENCE_ROSE/FELL GraphEvents (near-free win).

**Acceptance:** two different events of the same type produce visibly different
narratives, scenarios, and reports; all outputs remain guard-clean.

## Stage 8 — LLM routing & enrichment expansion

1. Provider abstraction honestly multi-provider (config-driven base URLs /
   adapters), Anthropic remains the shipped implementation; embedding-provider
   interface added on the same dormant pattern (deterministic lexical fallback).
2. Wire the routed-but-unreachable task classes as on-demand enrichments where
   they earn their cost: CONTRADICTION_ANALYSIS, SOURCE_COMPARISON,
   HISTORIC_CONTEXT, FUTURE_SCENARIOS, REPORT_SYNTHESIS — all fail-open to
   deterministic output, all inside the monetary budget from Stage 0.
3. JSON_REPAIR retry path (one bounded repair attempt on schema failure before
   drop — currently drop-only).

**Acceptance:** with AI on, every enrichment is validated, grounded
(fraction-based), budgeted in money, and auditable; with AI off, byte-identical
deterministic behaviour (invariant test extended).

## Stage 9 — Interrogation, dashboard truth, graph extensions

1. REGULATION / PROCUREMENT node types projected from Stage-3 collectors; prune
   or wire the remaining unused enum members (decide per member, documented).
2. Arc caching (recompute on scan, serve cached on read) — removes the
   write-on-GET wart; event-page loads stop racing.
3. Dashboard: LIVE indicator gated on scan recency; source-category coverage
   panel; manipulation-risk and review-queue chips; command bar reaches the
   interrogate→investigate bridge.

## Stage 10 — Guardrails & proof sweep (continuous, finalised here)

1. Forbidden-language test extended to the brief's full list (should buy/sell,
   buy/sell/hold rating, target price, guaranteed profit, certain return,
   portfolio allocation) — audit shows near-complete coverage; close the gaps and
   add rating-language patterns to the runtime guard, not just tests.
2. Cross-stage e2e: one scan over mixed real-shaped fixtures (origin, copies,
   syndication burst, contradiction, procurement notice, filing) must produce: a
   lineage-traced event with reliability-weighted confidence, named + category
   impacts, differentiated reports, review-queue entries for the quarantined
   items, and zero guard violations — the brief's acceptance scenario as a single
   pinned proof.
3. Six-degree arc asserted at `=== 6` on the proof fixture (closes the old I-2
   under-assertion).

---

## What is explicitly NOT done (owner decisions, kept honest)

- **Turning the LLM on** — everything is built to upgrade when
  `ANTHROPIC_API_KEY` + enabled configs exist; flipping it costs money and stays
  with the owner (`docs/ai-activation.md`).
- **Market-data adapter** — interface hardened, still dormant pending provider
  choice (a paid vendor decision).
- **Cloud deployment** — remains local-first; auth/rate-limit/SSRF hardening from
  Pass 5 is a prerequisite already in place, but exposure is a separate decision.

## Sequencing summary

```
0 truth → 1 maths → 2 spine unification → 3 sources+scheduler → 4 loop live
→ 5 entities → 6 review queue → 7 synthesis → 8 LLM expansion → 9 UI/graph
→ 10 proof sweep (guardrails continuous throughout)
```

Stages 0–2 are the highest-leverage and lowest-glamour: after them, everything
Archlight already computes starts *mattering*. Stages 3–4 make it a living radar.
Stages 5–7 make it name names and tell futures credibly. Stages 8–10 make it
scale, stay honest, and prove itself.
