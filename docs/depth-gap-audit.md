# Archlight — Depth-Gap Audit

**Date:** 2026-07-05
**Commit audited:** `996ea4b` (branch `main`)
**Scope:** Read-only forensic audit. No application code was changed (see §9).
**Method:** Full read of the scan pipeline, LLM layer, services, schema, API routes and UI, plus five parallel investigators cross-checked against first-hand reads and `grep` verification of every "absent" claim.

**The only question this audit answers:** *Can Archlight deeply investigate information from origin to consequence?*

---

## 1. Executive verdict

### PARTIAL — real, honest foundations, but today it behaves as a surface-level system.

Measured against the product intent — *continuously scan public sources, extract atomic claims, trace them to origin, separate supported evidence from weak repetition, run follow-up investigations, name who benefits and who is harmed, and present risk/opportunity with full evidence lineage* — **the answer today is no.** Archlight does not yet deeply investigate. It ingests **one live news feed**, extracts **headline-level keyword matches** (not atomic claims), scores them with **hardcoded constants** (not a reliability engine), and renders **deterministic template prose** into well-designed cards. **The AI layer makes zero calls** — it is coded but switched off and structurally disconnected from the pipeline.

It is rated **PARTIAL, not FAIL**, for one reason that matters for the rebuild: the foundations are genuine and honest. The 15-stage pipeline is fully wired and truthfully instrumented; present-evidence strength is computed from real clustered sources; the graph, the safety guard, and the (dormant) LLM validation layer are competently built; and the system never fabricates — fixtures are tainted, dormant subsystems label themselves `configured:false`, and empty sections self-hide. Pass 2/3 build **on** this, not over rubble.

It is **PARTIAL, not PASS**, because every capability that would make it "deep" is absent or a placeholder: no LLM reasoning, no atomic claim extraction, no reliability engine, no origin/lineage tracing, no recursive investigation loop, no entity/company resolution, no scenarios, no historic analogues. A polished dashboard and 351 passing tests do not change this — the tests pin down deterministic template behaviour, not investigative depth.

**Blunt one-line summary:** Archlight is today a competent, honest, single-source deterministic news-collector with a graph UI and a dormant AI brain — not an investigative intelligence engine.

---

## 2. Current architecture summary

**What exists and genuinely works:**

- **A complete, wired scan pipeline.** `runFullScan()` (`src/server/pipeline/orchestrator.ts:43-146`) runs 15 sequential stages, each persisting real rows: collect → dedupe → source-health → parse → claims → signals → cluster → event candidates → dashboard feed → risk/opportunity classify → data gaps + triggers → opportunity cards → positioning → graph node/edge sync → graph timeline. Per-source `try/catch` isolation (`src/server/pipeline/collect.ts:41,71`) means one dead source never stops the scan. Every stage's counts are written to `ScanRun` (`orchestrator.ts:148-151`).
- **Real (but singular) ingestion.** The RSS collector does a genuine network fetch with timeout and UA (`src/server/pipeline/collectors/rss.ts:56-64`).
- **Evidence-grounded present-strength.** `computeEventMetrics` (`src/server/pipeline/events.ts:11-55`) derives `evidenceCount`, `sourceDiversityScore`, risk/opportunity scores from actual clustered signals and their documents.
- **A graph projection + on-demand evidence arcs.** Events project into `GraphNode`/`GraphEdge` (`src/server/graph/builder.ts`); an evidence arc is scored by real BFS-over-graph math on event-page view (`src/server/graph/arc.ts:49-109`).
- **A robust, fail-closed financial-advice safety guard** (`src/server/safety/advice-language.ts:12-52`), re-run on parsed LLM output to defeat JSON-escape evasion (`src/server/playbook/service.ts:254-269`).
- **A well-architected — but dormant — multi-model LLM layer**: real Anthropic call code (`src/server/llm/provider.ts:59-64`), task routing (`src/server/llm/router.ts:23-42`), zod validation + evidence-grounding (`src/server/llm/validate.ts:38-59`), and cost/latency/token logging (`src/server/llm/run.ts:140-166`).

**What the architecture is built on (the honest gap):** every "analytical" stage is deterministic regex + fixed-formula arithmetic + template prose. There is **no model in the loop**. The intelligence is *information architecture over deterministic logic*, not reasoning.

**The data model already anticipates depth** — `EvidenceArc`, `SignalCluster`, `DataGap`, `TriggerCondition`, `RiskOpportunity`, `LLMOutputValidation`, `Entity`/`EventCandidateEntity` all exist in `prisma/schema.prisma`. The scaffolding is correct; **population and reasoning are missing.** Several of these tables are never written by a scan (see §4).

---

## 3. Depth blockers

Ranked by how much each blocks "origin → consequence" depth. Priority: **P0** = a core investigation layer is absent/dormant; **P1** = a depth feature is missing; **P2** = quality/robustness.

### B1 — [P0] The AI reasoning layer is switched off and disconnected from the pipeline
- **Description:** Archlight makes zero real LLM calls. The Anthropic provider is triple-gated off and, even if un-gated, the SDK isn't installed. The one real caller sits on the opportunity page, not in the scan.
- **Evidence:** `getActiveProvider()` returns `null` unless a key is set **and** a config is enabled (`src/server/llm/provider.ts:100-106`); `.env`/`.env.example` contain only `DATABASE_URL` (verified); all provider configs seeded `enabled:false` (`src/server/seed.ts:90,145`); `@anthropic-ai/sdk` is **not** in `package.json` (verified); the sole real `runLLMTask` caller is `src/server/playbook/service.ts:217`; `grep runLLMTask src/server/pipeline src/server/interrogate` → nothing; `orchestrator.ts:119` labels the analytical step "(deterministic)".
- **Why it matters:** Without a model, there is no atomic claim extraction, no synthesis, no reasoning, no scenario generation. Every downstream depth capability depends on this being live and *inside* the pipeline.
- **Recommended fix:** Add `@anthropic-ai/sdk` to dependencies; set `ANTHROPIC_API_KEY`; enable real model ids on the seeded configs; then wire `runLLMTask` into the claim-extraction, reliability, entity, and synthesis stages (Pass 2/3). Keep the existing validation + advice-guard on every call.

### B2 — [P0] Claim "extraction" is headline-level keyword matching, not atomic claims
- **Description:** A "claim" is a whole sentence that matched one of ten regexes, truncated to 300 chars — and the sentence pool is only the RSS **title + description**, never the article body.
- **Evidence:** `MATCHERS` table (`src/server/pipeline/claims.ts:9-20`); sentence-split + regex test (`claims.ts:56-75`); `extractionMethod: 'rule:v1:...'` (`claims.ts:101`); RSS content is `` `${title}\n\n${description}` `` only (`src/server/pipeline/collectors/rss.ts:49`) — no full-text fetch anywhere.
- **Why it matters:** The system reasons over ~1-3 sentences of headline text. It cannot separate multiple facts in an article, cannot capture the substance, and produces "signals" that are really keyword hits. This is the root cause of "shallow signals."
- **Recommended fix:** Fetch full article bodies; replace regex extraction with LLM atomic-claim extraction (subject-predicate-object), each claim tagged with an epistemic label, linked entities, and exact source quote/offsets. Validate + ground via the existing `validate.ts`.

### B3 — [P0] There is no reliability engine — credibility is a constant
- **Description:** Every claim is stamped `credibilityScore: 0.7`. No dimension of reliability is computed. Source authority is never consulted; an official regulator and an anonymous blog score identically.
- **Evidence:** `credibilityScore: 0.7` hardcoded for every claim (`src/server/pipeline/claims.ts:103`); signal strengths hardcoded per type (`src/server/pipeline/signals.ts:14-38`); `Source.category` (`'OFFICIAL'` etc., `seed.ts`) is **never read by any scorer** (verified); "specificity" = *+0.1 if the sentence contains a digit* (`claims.ts:64`); contradictions are surfaced but never lower a score (`src/server/interrogate/service.ts:221-246`, display-only); no freshness term in the confidence path.
- **Why it matters:** Without scored authority/independence/freshness/contradiction, weak and strong evidence are indistinguishable, and weak claims drive output (`src/server/pipeline/opportunity.ts:44-46` admits events at confidence ≥ 0.45). "Separate supported facts from weak claims" is not happening.
- **Recommended fix:** Build a reliability engine that scores authority (from a source-tier field), independence (real near-duplicate/syndication detection), corroboration, contradiction (which must *reduce* confidence), specificity and freshness — each with a human-readable explanation. Quarantine sub-threshold claims from output.

### B4 — [P0] No entity/company resolution — named beneficiaries and harmed parties do not exist as data
- **Description:** The `Entity` table is never written by anything. `Claim.entityId` is always NULL. The only "company names" are fixture headline strings echoed into `EventCandidate.title`.
- **Evidence:** `grep .entity.create/.upsert/.createMany` and `eventCandidateEntity.create` across all of `src` → **NONE FOUND** (verified); claim creation sets no `entityId` (`src/server/pipeline/claims.ts:93-107`); entity "extraction" is display-only capitalised-word regex dumped to `entitiesMentionedJson` and never read (`src/server/pipeline/parse.ts:22-25`); interrogate's `knownCompanies` reads the always-empty `Entity` table so the `COMPANY` query path is dead (`src/server/interrogate/classify.ts:54-55`); `likelyBuyers` is a hardcoded role list (`src/server/pipeline/opportunity.ts:90-97`).
- **Why it matters:** "Identify specific beneficiaries and harmed parties, each linked to evidence" is a core product promise and is entirely absent. There are no named companies, no evidence links, no direct/indirect exposure, no supplier/customer/competitor map.
- **Recommended fix:** Add an entity-resolution service (NER + canonicalisation), populate `Entity`/`EventCandidateEntity`, and add an entity-impact model linking each named company to an event with role (beneficiary/harmed), exposure type, confidence, and evidence ids.

### B5 — [P0] No recursive investigation loop — everything is one-shot
- **Description:** The pipeline is a strictly linear single pass; `interrogate()` is a read-only DB/graph lookup. No follow-up queries are generated, no new evidence is sought, nothing re-scans on a finding.
- **Evidence:** `interrogate()` performs only reads (`src/server/interrogate/service.ts:136-285`); `grep .create/.update/.upsert/collectFrom src/server/interrogate` → nothing; the only "follow-up" string is a static template (`src/server/playbook/templates.ts:90`); no loop/depth/iteration construct in `orchestrator.ts`; the `market/` search subsystem that could seek new evidence is dormant with an empty adapter registry (`src/server/market/provider.ts:48`).
- **Why it matters:** "Generate follow-up investigations; search for supporting, contradicting, and origin evidence; stop when saturated" is the defining behaviour of an investigative engine, and none of it exists.
- **Recommended fix:** Build an investigation orchestrator: on a meaningful claim/event, LLM-generate follow-up queries → run them across multiple source adapters (supporting / contradicting / origin / affected-company / historic-analogue) → persist results and re-score → stop on saturation, with enforced cost/depth/source limits.

### B6 — [P0] No origin/lineage tracing — syndication reads as independent corroboration
- **Description:** There is no first-seen/origin field; clustering counts distinct `sourceId`s as "diversity", so five outlets re-running one wire story look like five independent sources. The one artifact that resembles lineage — `EvidenceArc` — is never produced by a scan; it is rebuilt-and-discarded on each page view.
- **Evidence:** no `firstSeen`/`origin`/`provenance` field in schema (verified); cluster key is `signalType|sector|region` (`src/server/pipeline/cluster.ts:58`); "diversity" = distinct-`sourceId` count (`cluster.ts:31,39`); dedupe drops exact duplicates but never *links* them (`src/server/pipeline/collect.ts:51-52`); `EvidenceArc` is written only by `buildArc` on event-page render (`src/server/services/graph.ts:340`) and deletes the prior arc every view (`src/server/graph/arc.ts:269-272`); `ScanRun` has no evidence-arc counter.
- **Why it matters:** "Trace a claim back toward its origin; detect when five articles repeat one original claim; measure real source diversity" is unmet. The lineage shown to users is cosmetic.
- **Recommended fix:** Add near-duplicate/syndication detection (text shingling/embeddings), a first-seen origin pointer per claim, and persist evidence arcs from the scan (not on-demand), with independence measured by *content*, not row count.

### B7 — [P1] No historic analogues, no future scenarios, no confidence-movement
- **Description:** The "historic → present → future" synthesis is present only for "present". There is no comparable-past-event lookup, no scenario generator, and no confidence-over-time trend.
- **Evidence:** repo-wide grep for `scenario|analogue|historic context|future path|beneficiar|harmed` → zero matches in app logic; the only backward-looking logic flags evidence >14 days old as a data gap (`src/server/pipeline/gaps.ts:78-80`); `confidenceMovement` exists in `src/server/portfolio/service.ts` but is seeded `0` and never rendered on the event page.
- **Why it matters:** "Synthesise historic, present and future context; generate scenario paths with watch signals and winners/losers" is a headline promise and is absent.
- **Recommended fix:** Add a scenario-synthesis service (LLM: future paths + per-scenario winners/losers + watch signals), a historic-analogue retrieval service (similarity over past events), and confidence-history tracking rendered as a trend.

### B8 — [P1] Source coverage is one live feed of one narrow type
- **Description:** The entire live intake is a single BBC Business RSS URL, padded by two JSON fixtures and one permanently-skipped "Companies House" stub. No official/filings/regulator/API/scrape adapters exist.
- **Evidence:** two collectors only, `FIXTURE` + `RSS` (`src/server/pipeline/collectors/registry.ts:10-13`); four seeded sources of which one is live (`src/server/seed.ts:33-48`); Companies House seeded `accessMethod:'UNSUPPORTED'` → skipped every run (`seed.ts:33-39`).
- **Why it matters:** "Continuously scan public data across many sources" is false — the radar sees one newswire. Depth is impossible on a single narrow source.
- **Recommended fix:** Add 4-6 adapters spanning source *types* (company filings/registries, regulator notices, official statistics/APIs, primary documents), each with a real health/authority tier.

### B9 — [P1] No continuous or scheduled scanning — the radar only sees the world when a human clicks
- **Description:** There is no worker, cron, or queue. Scans fire only when someone POSTs `/api/scans/run`.
- **Evidence:** the only `setInterval` in `src` is a 1-second UI clock (`src/components/dashboard/GlobalPulseTicker.tsx:33`, verified); `package.json` scripts are `dev/build/start/test/db:*` only — no worker process.
- **Why it matters:** "Continuously scan" is unmet; the system is a manual batch tool.
- **Recommended fix:** Add a scheduler/worker (cron or a queue runner) invoking `runFullScan()` on an interval, with per-source cadence.

### B10 — [P2] `needsReview` is a label, not a quarantine gate
- **Description:** Sub-threshold claims are flagged but not withheld; only a hard floor filters.
- **Evidence:** `needsReview = confidence < 0.5` is rendered as a UI label only (`src/app/events/[id]/page.tsx:21`); real floors exist at `src/server/pipeline/signals.ts:51` (`<0.4` dropped) and `src/server/pipeline/cluster.ts:64`, but anything above the floor flows to output regardless of source quality.
- **Why it matters:** Weak claims still drive risk/opportunity cards.
- **Recommended fix:** Make reliability (B3) gate output; route flagged claims to a review queue rather than the feed.

### B11 — [P2] Risk/opportunity "logic" is fixed template prose keyed by event type
- **Description:** The explanatory logic users read is a static per-type dictionary, not analysis of the specific event.
- **Evidence:** `CLASSIFY_RULES` string table + `GENERIC_RULE` fallback (`src/server/pipeline/classify.ts:8-59`); trigger conditions are templates with hardcoded probability deltas (`src/server/pipeline/gaps.ts:15-41`); `likelyBuyers` hardcoded (`opportunity.ts:90-97`).
- **Why it matters:** Two different layoffs in the same sector get identical prose; the output reads specific but isn't.
- **Recommended fix:** Replace template prose with grounded LLM synthesis (Pass 3), retaining the deterministic version as a fail-closed fallback.

---

## 4. Missing models (schema)

New models/fields needed for deeper investigation. (Several existing tables — `Entity`, `EventCandidateEntity`, `EvidenceArc` — exist but are unwritten by scans; "populate these" is as important as "add these".)

- **`Claim` — new fields:** `epistemicType` (FACT | INFERENCE | PREDICTION | COMMENTARY | OPINION); `exactQuote` + `charStart`/`charEnd` (evidence offsets); `sourceId` (denormalised for scoring); `originClaimId` + `firstSeenAt` (lineage); replace constant `credibilityScore` with computed value; **actually populate `entityId`**.
- **`ClaimReliability` (new)** — per-claim, per-dimension: `authorityScore`, `independenceScore`, `corroborationScore`, `contradictionScore`, `specificityScore`, `freshnessScore`, `composite`, and an `explanation` per dimension.
- **`ClaimLink` (new)** — `SAME_AS` / `DERIVED_FROM` / `CONTRADICTS` edges between claims for syndication/lineage detection.
- **`Source` — new fields:** `authorityTier`, `isPrimary` (official/primary-record boost), `independenceGroup` (to detect same-owner syndication).
- **`EntityImpact` (new)** — `entityId` × `eventCandidateId` × `role` (BENEFICIARY | HARMED) × `exposureType` (DIRECT | INDIRECT) × `confidence` × `evidenceClaimIds`; plus **`EntityRelationship` (new)** for supplier/customer/competitor edges.
- **`EventScenario` (new)** — `eventCandidateId` × `narrative` × `probability` × `winnersJson` × `losersJson` × `watchSignalIds` × `horizon`.
- **`HistoricAnalogue` (new)** — `eventCandidateId` × `pastEventRef` × `similarityScore` × `outcomeSummary`.
- **`ConfidenceHistory` (new)** — `eventCandidateId`/`claimId` × `timestamp` × `confidence` (for confidence-movement).
- **`InvestigationRun` / `InvestigationStep` (new)** — the recursive loop: generated query, source hit, result, depth, cost, saturation state, limits.
- **Populate existing-but-empty:** `Entity`, `EventCandidateEntity`, `SignalClusterEntity`, and persist `EvidenceArc`/`EvidenceArcStep` from the scan (with an `evidenceArcsCreated` counter on `ScanRun`).

---

## 5. Missing services

- **Full-text article fetch + extraction** — retrieve article bodies beyond the RSS blurb (B2).
- **LLM atomic-claim extraction service** — replace the regex matcher: atomic claims, epistemic labels, entity linking, exact quotes/offsets, validated + grounded (B2, B1).
- **Entity-resolution service** — NER + canonicalisation + linking claims/events to a populated `Entity` table (B4).
- **Reliability/credibility engine** — multi-dimension scoring with explanations; contradiction reduces confidence; official/primary boosts it (B3).
- **Lineage/provenance service** — near-duplicate & syndication detection, first-seen origin, independent-vs-copied classification; persist arcs from scans (B6).
- **Recursive investigation orchestrator** — follow-up query generation → multi-source search (support/contradict/origin/company/analogue) → saturation + cost/depth/source limits (B5).
- **Company-impact service** — named beneficiaries/harmed with evidence links, direct/indirect exposure, supplier/customer/competitor mapping (B4).
- **Scenario-synthesis service** — future paths + per-scenario winners/losers + watch signals (B7).
- **Historic-analogue retrieval service** — comparable past events + outcomes (B7).
- **Additional source collectors** — filings/registry, regulator, official-statistics/API, primary-document adapters (B8).
- **Scheduler/worker** — continuous scanning on an interval (B9).

---

## 6. Missing UI outputs

The event page renders **7 of 12** target elements (origin trace, fact-vs-uncertainty, supporting evidence, contradicting evidence, data gaps, suggested questions, and — on the linked opportunity page — positioning examples). Missing:

- **Named beneficiaries** — with per-company evidence links and confidence (currently absent; `src/app/events/[id]/page.tsx` has no beneficiary section).
- **Named harmed parties** — same (risk is prose-only, `page.tsx:100-103`).
- **Future scenarios** — scenario paths with winners/losers and watch signals (absent).
- **Confidence movement over time** — the event page shows a static confidence value only (`page.tsx:74`).
- **Historic analogues** — comparable-past-events panel (absent).
- **Reliability breakdown** — per-dimension scores + explanations instead of one number.
- **Fact vs inference vs commentary** — an epistemic split in the evidence timeline.
- **Independent-vs-syndicated distinction** in the origin trace (the arc currently treats copies as independent).

Credit where due: the opportunity page and dashboard are genuinely deep on what they *do* show, and truthfully expose dormant state (`llmConfigured` flag, `configured:false`, self-hiding empty sections) — no fabricated fills.

---

## 7. Source coverage truth

**Yes — Archlight depends on far too few sources, and this is the single most visible cause of "surface level".**

- **One** live source in total: the BBC Business RSS feed (`src/server/seed.ts:48`).
- **One** source *type* supported end-to-end: RSS. The only other collector is `FIXTURE` (bundled JSON) (`src/server/pipeline/collectors/registry.ts:10-13`).
- The one "official" source seeded — Companies House — is `accessMethod:'UNSUPPORTED'` and is **skipped on every scan** (`seed.ts:33-39`).
- The parallel `market/` price subsystem is dormant with an empty adapter registry (`src/server/market/provider.ts:48`) and feeds nothing into scans.
- Even the one live source is **headline-deep**: only the RSS title + description are ingested, never the article body (`src/server/pipeline/collectors/rss.ts:49`).
- There is no scheduler, so even that one feed is only read when a human clicks (§B9).

The registry *does* honestly distinguish working from unsupported sources (`collectorStatus`, per-source health capped at `DEGRADED`/`UNSUPPORTED` in `src/server/pipeline/health.ts`) — the accounting is truthful. The problem is not dishonesty; it is that there is almost nothing to account for.

---

## 8. Recommended implementation sequence

Two passes. **Pass 2 makes the spine real; Pass 3 makes it investigative.** Each item builds on the honest foundations already in place.

### Pass 2 — Activate and deepen the spine (make one source deep and trustworthy)
1. **Turn the AI on (B1).** Add `@anthropic-ai/sdk`; set the key; enable configs with real model ids. Prove a live `runLLMTask` writes a `SUCCEEDED` `LLMRun` + validation row.
2. **Full-text ingestion (B2, B8-lite).** Fetch article bodies for RSS items.
3. **LLM atomic-claim extraction (B2).** Replace the regex matcher with model extraction: atomic claims, epistemic labels, entity linking, exact quotes — routed through the existing `validate.ts` (schema + grounding + advice guard). Keep the regex path as a fail-closed fallback.
4. **Reliability engine (B3, B10).** Real per-dimension scoring with explanations; contradiction lowers confidence; official/primary boosts it; sub-threshold claims quarantined from output. Add `Source.authorityTier`/`isPrimary`.
5. **Entity resolution (B4).** Populate `Entity`/`EventCandidateEntity`; render named beneficiaries/harmed with evidence links and confidence on the event page.
6. **More sources + scheduler (B8, B9).** Add 3-4 adapters across source *types* and a worker for continuous scanning.

### Pass 3 — Deep investigation and synthesis (origin → consequence)
7. **Recursive investigation loop (B5).** LLM follow-up query generation → multi-source search (support / contradict / origin / company / analogue) → re-score → saturation stop, with enforced cost/depth/source limits. Persist `InvestigationRun`/`Step`.
8. **Lineage & syndication (B6).** Near-duplicate detection, first-seen origin, independent-vs-copied classification; persist evidence arcs from the scan; independence measured by content not row-count.
9. **Historic + future synthesis (B7).** Scenario paths (winners/losers + watch signals), historic-analogue retrieval, confidence-movement tracking.
10. **Deep UI (B6, B7, §6).** Render scenarios, confidence movement, historic analogues, reliability breakdowns, fact/inference split, and an independent-vs-syndicated origin trace.

**Sequencing rationale:** depth on a single trustworthy source (Pass 2) beats breadth over garbage. Get atomic + reliable + entity-linked + AI-on first; only then add the recursive loop and synthesis that consume those primitives.

---

## 9. No code changes summary

This pass changed **no application behaviour**. It was read-only:

- **No** source files, schema, seeds, pipeline, services, API routes, or UI were modified.
- **No** migrations were run, no dependencies added, no environment changed, no scan triggered.
- The **only** file created is this document, `docs/depth-gap-audit.md`, as requested.
- Archlight runs exactly as it did at commit `996ea4b`. Every "activate the LLM", "add a model", "add a service" recommendation above is a **proposal for Pass 2/3**, not an action taken here.

---

## Appendix A — Area-by-area evidence ledger

Direct answers to every audit question, with file paths. Verdict shorthand: **REAL** (wired, real data) · **HEURISTIC** (regex/hardcoded) · **FIXTURE/DORMANT** · **ABSENT**.

### 1. Source coverage
- **How many source adapters exist?** Two: `FIXTURE`, `RSS` — `src/server/pipeline/collectors/registry.ts:10-13`.
- **Which are functional?** Both function. RSS does a real fetch (`collectors/rss.ts:56-64`); FIXTURE reads bundled JSON (`collectors/fixture.ts`).
- **Which are placeholders?** No collector is a placeholder, but the "Companies House" *source* is `UNSUPPORTED` and has no collector (`seed.ts:33-39`).
- **Which public sources are seeded?** Four: Fixture Wire A, Fixture Wire B, Companies House Filings (unsupported), BBC News Business (RSS) — `src/server/seed.ts:33-48`.
- **Which are active?** All seeded `isActive:true`, but "active" ≠ "produces data".
- **Which actually produce documents in a real scan?** One live: BBC RSS. Fixtures produce `isFixture`-tainted docs. Companies House is skipped every run.
- **One narrow source type?** YES — RSS news is the only live type.
- **Registry distinguishes working vs unsupported?** YES — `collectorStatus` + `getCollector` returning `null` (`registry.ts:17`, `collect.ts:30-33`), health forced to `UNSUPPORTED` (`health.ts:41-47`).
- **Does a failed source stop the scan?** NO — per-source `try/catch` isolates failures (`collect.ts:41,71`).

### 2. Scan pipeline depth
- **What happens on a scan?** 15 wired stages (`orchestrator.ts:43-146`).
- **Collect only?** NO — collect + parse + claims + signals + cluster + events + feed + classify + gaps + opportunities + positioning + graph + timeline.
- **Auto-parse / extract claims / create signals / event candidates / feed items?** YES to all — `orchestrator.ts:85,89,94,104-108`.
- **Runs event detection after collection?** YES — `clusterSignals` + `createEventCandidates` (`cluster.ts`, `events.ts:113-176`).
- **Logs every stage into `ScanRun`?** YES — all counters + errors/warnings (`orchestrator.ts:148-151`).
- **Dashboard scan action → full pipeline or partial?** FULL — both buttons POST `/api/scans/run` → `runFullScan()` (`src/app/api/scans/run/route.ts:25`). No partial variant.
- **Continuous?** NO — manual only; no scheduler (§B9).

### 3. Claim extraction depth
- **Atomic claims or summaries?** Neither — whole matched sentences, HEURISTIC (`claims.ts:56-75`).
- **One article → multiple claims?** Mechanically yes (sentence × matcher loop), but near-duplicate full sentences, not semantic decomposition.
- **Retains source/document/timestamp/entity/sector/region/confidence?** PARTIAL — document/date/sector/region/confidence yes; **`entityId` NULL**; source only transitively via document (`claims.ts:93-107`).
- **Classifies claim type?** YES but topical — 10 reachable regex categories of 15 enum values (`claims.ts:9-20`, `src/shared/enums.ts`).
- **Factuality/reliability labels?** ABSENT as a label; only numeric `extractionConfidence` + `needsReview`.
- **Separates fact / inference / commentary?** ABSENT — `claimType` is a topic taxonomy, not epistemic.
- **Preserves exact evidence references?** ABSENT — no offsets/anchors; `claimText` is a truncated sentence copy.

### 4. Claim clustering and lineage
- **Repeated claims across sources?** PARTIAL — groups *signals* by `signalType|sector|region` (`cluster.ts:58`), not by claim identity.
- **Independent vs copied reporting?** ABSENT — "independence" = distinct-`sourceId` count (`cluster.ts:31`); syndication reads as independent.
- **Traces claim to origin / first-seen?** ABSENT — no origin/first-seen field; `originStrength` is a count ratio (`arc.ts:60`), not a pointer.
- **Detects "5 articles repeating 1 claim"?** PARTIAL — a `WIDELY_REPEATED_WEAK_SOURCE` class label (`arc.ts:92`) flags the shape but never names the origin.
- **Measures source diversity?** REAL but naive — distinct-`sourceId` arithmetic (`cluster.ts:39`, `arc.ts:61-63`).
- **Detects stale/recycled claims?** PARTIAL — date/decay only (`builder.ts:21-32`, `timeline.ts:115`); no text-recycling detection.
- **Is `EvidenceArc` populated by a real scan?** NO — built on-demand at page view and deleted/recreated each time (`services/graph.ts:340`, `arc.ts:269-272`); never counted by `ScanRun`.

### 5. Evidence reliability
- **Scores claim reliability?** PARTIAL — `credibilityScore` is a constant `0.7` (`claims.ts:103`); only `confidence` is computed.
- **Which dimensions?** Only member-count + distinct-source diversity + regex confidence + digit bonus (`cluster.ts:41-46`, `claims.ts:64-68`).
- **Source authority?** ABSENT — `Source.category` never read by any scorer.
- **Independence?** PARTIAL/crude — distinct-`sourceId` count only.
- **Contradiction?** PARTIAL — surfaced but display-only; never lowers a score.
- **Specificity?** HEURISTIC — "+0.1 if a digit is present".
- **Freshness?** ABSENT from the reliability path.
- **Reduces confidence for copied loops / boosts primary/official?** ABSENT both directions.
- **Weak claims quarantined?** Weakly — `needsReview` is a UI label (`page.tsx:21`); only hard floors filter (`signals.ts:51`, `cluster.ts:64`); above-floor weak claims drive output.
- **Every score has an explanation?** YES — explanation strings at every stage (`signals.ts:74`, `cluster.ts:73-79`, `events.ts:60-68`), though they narrate the formula, not evidence quality.

### 6. Recursive investigation loop
- **Generates follow-up queries?** ABSENT — only a static template string (`playbook/templates.ts:90`).
- **Searches supporting / contradicting / original / affected-company / historic evidence?** ABSENT — `interrogate()` is read-only over pre-scanned graph (`interrogate/service.ts:136-285`).
- **Actual loop or one-shot?** ONE-SHOT — linear pipeline, no re-query construct.
- **Market search hits an external provider?** NO — dormant, empty adapter registry (`market/provider.ts:48`); returns empty or labelled-fixture data, never fabricated.
- **Stops on saturation / enforces cost-depth-source limits?** ABSENT — no loop to bound; cost is an audit *estimate* only (`llm/run.ts:32-36`).
- **Avoids unsafe scraping?** YES — only configured RSS fetch with timeout + UA (`rss.ts:56-64`); no headless browser anywhere.

### 7. Company impact depth
- **Names benefiting / harmed companies?** ABSENT — no per-company benefit/harm object; only type-keyed template prose (`classify.ts:9-14`) and hardcoded `likelyBuyers` (`opportunity.ts:90-97`).
- **Explains why each company is named + links to evidence?** ABSENT — no named companies; evidence links exist only at event level (`services/events.ts:53-67`).
- **Distinguishes direct vs indirect; maps suppliers/customers/competitors?** ABSENT/template-only — sector/region are keyword regex; competitor "mapping" is a fixed string (`opportunity.ts:178-185`).
- **Where do companies come from / avoids invention?** Avoids invention only because it never names companies — `Entity` table never written (verified); interrogate's `knownCompanies` is always empty (`interrogate/classify.ts:54-55`).
- **Confidence per company impact?** ABSENT — confidence is event-scoped (`classify.ts:93`).

### 8. Historic / present / future context
- **Historic context / comparable past events?** ABSENT — zero matches repo-wide; only a >14-day staleness gap (`gaps.ts:78-80`).
- **Present evidence strength?** REAL — `computeEventMetrics` from real clustered sources (`events.ts:11-55`).
- **Future scenario paths?** ABSENT — no scenario generator (LLM or template).
- **Watch signals per scenario + winners/losers?** PARTIAL — `TriggerCondition` templates with hardcoded deltas exist (`gaps.ts:15-36`) but have no scenario or entity FK.
- **Avoids personal financial advice?** YES — robust fail-closed guard (`safety/advice-language.ts:12-52`), re-run on parsed LLM output (`playbook/service.ts:254-269`).

### 9. Multi-model LLM integration
- **Supports multiple providers + routes by strength?** PARTIAL — real `routeTask` logic (`llm/router.ts:23-42`) but only Anthropic seeded, placeholder model ids, all disabled.
- **Separates extraction / reasoning / synthesis / report?** YES as a config taxonomy (`seed.ts:95-132`); nothing consumes it live.
- **Schema-validated + grounded in evidence ids?** REAL but unused — zod `safeParse` + grounding (`llm/validate.ts:38-59`).
- **Logs model/task/latency/cost/validation?** YES — `LLMRun` + `LLMOutputValidation` written (`llm/run.ts:140-166`); today only ever `SKIPPED_NO_PROVIDER` (`run.ts:63-85`); prompts stored as sha256 hash only (privacy-safe).
- **On validation failure?** Fail-closed — `REJECTED_VALIDATION`, output redacted, deterministic baseline returned (`run.ts:131-134`, `playbook/service.ts:248-271`).
- **Bottom line:** **No real LLM calls happen. The intelligence layer is deterministic** — dead-gated by a missing key, all-disabled configs, and an uninstalled SDK, and structurally severed from the scan (`orchestrator.ts:119`; no `runLLMTask` in the pipeline).

### 10. User-facing output depth (event page)
| Element | Present? | Evidence |
|---|---|---|
| Origin trace | YES | `app/events/[id]/page.tsx:90-92` (evidence arc) |
| Fact vs uncertainty | YES | `page.tsx:21,73-77` (confidence + review flag) |
| Supporting evidence | YES | `page.tsx:111-117` (evidence timeline) |
| Contradicting evidence | YES | `page.tsx:119-127`; `services/events.ts:72` |
| Named beneficiaries | **ABSENT** | no beneficiary field repo-wide |
| Named harmed parties | **ABSENT** | risk is prose only (`page.tsx:100-103`) |
| Future scenarios | **ABSENT** | no scenario modelling |
| Strategic positioning examples | YES (on linked opportunity page) | `app/opportunities/[id]/page.tsx:119-140` |
| Watch signals | PARTIAL | trigger conditions stand in (`page.tsx:174-185`) |
| Confidence movement | **ABSENT** on event page | static value only (`page.tsx:74`) |
| Data gaps | YES | `page.tsx:157-172` |
| Suggested interrogation questions | YES | `page.tsx:187-191` |

**Event-page depth: 7 of 12 present.** The opportunity page and dashboard are genuinely deep on provenance and evidence, and truthfully expose dormant state — but named beneficiaries, named harmed parties, future scenarios, and confidence-movement are absent.
