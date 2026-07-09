# Archlight — Deep Intelligence Audit (claude-fable-5)

**Date:** 2026-07-09
**Commit audited:** `2505dae` (fresh clone of `origin/main`)
**Baseline verified:** 453/453 tests green (80 files), typecheck-clean, on this clone.
**Method:** Six parallel subsystem investigators (pipeline/sources, evidence engine,
consequence engine, LLM routing + safety, graph/interrogation/frontend, data model +
tests), each reading code first-hand with file:line evidence, cross-checked against
the repo's own prior audits (`docs/depth-gap-audit.md` 2026-07-05,
`docs/final-system-audit.md` 2026-07-03) and the Pass 2/3 design docs.

**Question this audit answers:** does Archlight behave like a deep public
intelligence engine — trace signals to origin, separate fact from noise, name who
benefits and who is harmed, and project forward — or does it only look like one?

---

## 1. Executive verdict

### The engine room is real. The engine is not connected to the drivetrain, the fuel line is closed, and the radar only sees one lighthouse.

Archlight in July 2026 is **far past** the "news dashboard" the upgrade brief warns
against. Since the 2026-07-05 depth-gap audit, Passes 2–5 landed genuine machinery:

- a real **atomic-claim → canonical-claim → lineage → reliability** engine where
  copies never inflate confidence and contradictions genuinely lower scores
  (proven behaviourally in e2e tests, not just wired);
- a real **company-impact resolver** that cannot invent a company (names come only
  from evidence; everything inferential is labelled "(category)" at confidence 0.3);
- a real **persisted evidence graph** with six-degree arcs and a composite True
  Potential Score computed by weighted BFS;
- a real **event-sourced replay timeline** (diff-based, epsilon-guarded, never
  synthetic);
- a genuinely strong **safety spine**: a runtime advice-language filter enforced
  before persistence at 12+ call sites, fail-closed LLM validation with redaction,
  fail-closed production auth, SSRF-hardened fetching.

But measured against "living public intelligence engine", three structural truths
dominate everything else:

**T1 — The deep evidence layer does not drive events.** Two claim spines run in
parallel over the same documents. Events — their confidence, severity, probability,
risk/opportunity scores, everything the dashboard ranks by — are computed from the
**legacy** regex-claim spine (`src/server/pipeline/claims.ts`, hardcoded
`credibilityScore: 0.7` at `claims.ts:103`). The Pass-2 reliability engine
(`src/server/evidence/reliability.ts`) — the best module in the codebase, seven real
scored dimensions — feeds only the consequence layer's confidence figures. A
STRONGLY_SUPPORTED claim and a RECYCLED one currently move event scores identically.
The system built a brain and never connected it to the spine.

**T2 — The radar sees one lighthouse, when a human presses a button.** One live
source (BBC Business RSS, `src/server/seed.ts:43-53`), two collectors total
(RSS + fixture, `collectors/registry.ts:10-13`), no scheduler (the only
`setInterval` in the repo is a UI clock), no Atom support, no regulatory /
procurement / filings / government collectors — those source categories exist only
as authority-prior table entries (`evidence/authority.ts:6-21`) with no ingestion
path. "Continuously gather public information" is currently false in both words.

**T3 — Every intelligence amplifier is dormant.** The recursive investigation loop
is a well-built bounded harness with **zero search adapters**
(`SEARCH_ADAPTER_REGISTRY = {}`, `evidence/search/registry.ts:43`) — it generates
follow-up queries, marks them `SKIPPED_NO_ADAPTER`, and stops. The LLM layer is
seeded `enabled:false` with current model IDs and, even when activated, reaches only
3 of its 26 routed task classes. The market-data registry is empty. None of this is
dishonest — dormancy is labelled everywhere — but the product's investigative
depth ceiling today is regex + Jaccard string overlap.

**One-line summary:** an honest, well-tested, safety-hardened intelligence
*chassis* whose deepest components are either disconnected from the output path,
dormant, or starved of input.

The upgrade job is therefore **not** a rebuild. It is: connect the deep layer to
the event path, feed the system real breadth of public sources, turn the
investigation loop on against a lawful free search backend, and only then deepen
synthesis. Details in `docs/claude-fable-5-upgrade-plan.md`.

---

## 2. State chronology (why previous audits disagree)

| Date | HEAD | State |
|---|---|---|
| 2026-07-03 | `acb1d99` | Spine + Phases 2a/3a–3f. 341 tests. `final-system-audit.md`: acceptance-complete for local fixture-scale radar; LLM + market dormant-by-design. |
| 2026-07-05 | `996ea4b` | `depth-gap-audit.md`: PARTIAL — deterministic keyword matching, constant credibility, no lineage, no entities, no loop, AI structurally disconnected. |
| 2026-07-06 | `2505dae` | Passes 2–5 landed: Evidence Depth Engine, Commercial Consequence Engine, on-demand AI enrichment (dormant), security hardening. 453 tests. **← this audit** |

Most of the 07-05 audit's P0 blockers were genuinely addressed *as machinery*
(B2 atomic claims, B3 reliability, B4 entity population, B5 loop harness, B6
lineage). What was **not** addressed: the machinery drives the consequence layer
only, not the events themselves (T1); source breadth (B8) and continuous scanning
(B9) are untouched; the loop has no adapter (B5 in practice).

---

## 3. What exists and is genuinely deep — PRESERVE

Verified first-hand, with the strongest evidence for each:

1. **Evidence reliability engine** — `src/server/evidence/reliability.ts`.
   Seven computed dimensions (authority prior, independence `1−0.5^n`, support,
   specificity, freshness with 180-day horizon, contradiction ratio, copy-loop
   ratio), combined as weighted sum × **multiplicative penalties**
   (`reliability.ts:84-90`) so copying/contradiction can only lower scores. Real
   factuality labels; human-readable `reasoningSummary` + `evidenceFor/Against` +
   `warnings`. e2e proves two independent sources beat one, contradictions lower
   scores, copies don't inflate (`tests/evidence-depth-pipeline.e2e.test.ts:55-112`).
2. **Event detection & lifecycle** — `src/server/pipeline/cluster.ts`, `events.ts`.
   Real clustering (`signalType|sector|region`), single-signal corroboration
   penalty ×0.6, transactional MERGE of recurring events with dependent
   regeneration, sticky analyst statuses, all event metrics computed not defaulted,
   transparent formula summaries.
3. **Company-impact provenance discipline** — `src/server/consequence/company-impact.ts`.
   Named companies only from evidence entities; category-level inferences are
   suffixed "(category)", confidence-capped 0.3, `lowConfidence:true`; every string
   advice-guarded; populates `Entity` via upsert. The *discipline* is preserve-grade
   even though the entity extraction feeding it is shallow (§4.3).
4. **Evidence graph + arcs** — `src/server/graph/builder.ts`, `arc.ts`. Persisted
   `GraphNode`/`GraphEdge` projected from the real Prisma evidence chain; idempotent
   upserts; six-degree bidirectional BFS with degree decay, breadth caps, and a real
   composite True Potential Score (`arc.ts:49-109`); five chain classes; contradiction
   edges only for genuinely opposing event pairs.
5. **Replay/timeline** — `src/server/graph/timeline.ts`. Diff-based `GraphEvent`
   recording (one row per real change, epsilon-guarded), momentum/decay computed
   from supporting events only so a fresh contradiction cannot masquerade as fresh
   support.
6. **Playbook generation path** — `src/server/playbook/service.ts`. The most
   rigorous generation pipeline: deterministic baseline, LLM upgrade only when a
   provider is active, schema + grounding + advice + guaranteed-outcome checks, and
   a **re-guard of parsed output** to defeat JSON-escape evasion
   (`service.ts:254-272`). This resolves the old audit's I-1 finding.
7. **Safety spine** — `src/server/safety/advice-language.ts` (27 patterns,
   adversarially hardened, runtime, fail-closed, called before persist at 12+
   sites); LLM validation fail-closed with output redaction
   (`llm/run.ts:151-155`); daily pre-call budget gate; per-event enrich cooldown;
   production auth fail-closed (`middleware.ts:6-19`); per-IP rate limits with a
   tighter cap on paid routes; SSRF-guarded fetch (`net/safe-fetch.ts`).
8. **Honesty machinery** — `isFixture` propagated Source→…→GraphNode and badged
   across the UI; dormant layers report `NOT_CONFIGURED`/`SKIPPED_NO_ADAPTER`
   sentinels; seeds create zero events (everything shown flows from real pipeline
   runs over labelled fixtures); `tests/scan-deterministic-invariant.test.ts`
   locks "scans never make live LLM calls".
9. **Interrogation** — `src/server/interrogate/`. Deterministic classifier over 11
   query types, real subgraph synthesis with honest empty states, ticker/instrument
   queries return market-context-only with a verbatim non-advisory disclaimer.
10. **Test infrastructure** — serial SQLite test DB with recorded consent, real
    behavioural e2e proofs (counters equal row counts; full evidence trail
    reconstruction; advice-clean sweeps across all generated text).

**Do not destroy any of the above for theatre.** Every stage of the upgrade plan
builds on these.

---

## 4. What is shallow — the depth ceiling, module by module

### 4.1 Claim extraction is lexical
- 14 regex matchers over naively split sentences (`evidence/matchers.ts:8-92`,
  `extraction.ts:34-39`); one claim per (sentence × type).
- `extractionConfidence` = matcher constant + 0.1 if a digit is present
  (`extraction.ts:87-88`).
- Instruments detection = two ticker regexes (`matchers.ts:143-150`). Sector /
  region / commodity dictionaries are small and fixed (10 / 4 / 9 entries).
- No relative-date resolution, no negation scoping at extraction, no coreference.

### 4.2 Similarity is Jaccard, everywhere
- Clustering and copy detection both rest on
  `0.55·token-Jaccard + 0.45·char-trigram-Jaccard` (`evidence/text.ts:53-55`).
  Paraphrase without shared tokens is invisible. **No embeddings anywhere** — the
  single biggest capability ceiling in the evidence engine.
- The shared-entity merge bar (`ENTITY_MATCH_THRESHOLD = 0.2`,
  `canonical.ts:82`) is loose enough to risk over-merging distinct claims about
  the same company.

### 4.3 Entity extraction is the softest link in the whole chain
- Capitalised-word regex + stopword list (`extraction.ts:55-67`), filtered by a
  ~50-token hardcoded place blocklist (`consequence/watch-signals.ts:5-21`).
  No NER, no canonicalisation (no Ltd/PLC/Inc folding, no alias map), no
  org-vs-person-vs-product discrimination beyond capitalisation.
- This regex feeds the company-impact resolver — the flagship "who benefits, who
  is harmed" output. It cannot *invent* a company, but it can promote "Chief
  Executive" or a product name into one. No test exercises it against messy real
  prose.
- The two entity join tables (`SignalClusterEntity`, `EventCandidateEntity`) have
  **zero writes** in src — dead scaffolding from the never-built resolution layer.

### 4.4 Lineage origin is a timestamp sort
- Origin = earliest `eventDate ?? createdAt` (`lineage.ts:40-44`); copy = one
  similarity threshold (0.72); contradiction = one regex. Vulnerable to missing /
  backdated dates; no domain/publisher awareness, so two outlets syndicating one
  wire story with rewording count as independent; no hyperlink/citation tracing.
- `originConfidence` is computed then **ignored** by reliability scoring;
  non-origin rows get a hardcoded 0.

### 4.5 Synthesis prose is templated
- Scenario *summaries* are five fixed strings (`context.ts:15-26`) — the
  scaffolding around them (confirming/weakening signal sets from real triggers,
  computed per-scenario confidence, REVERSAL direction-swap) is genuinely
  synthesised, but the user-visible narrative is canned.
- The six report types differ **only by a header string** (`report.ts:9-16`);
  a RISK_BRIEF and a SALES_OPPORTUNITY_BRIEF render identical bodies.
- Positioning examples are disciplined role-differentiated template fill.
- Watch signals are a static per-claim-type lookup table
  (`watch-signals.ts:41-57`).

### 4.6 LLM grounding and budget are thinner than their labels
- Evidence-ID grounding is enforced on 2 of 5 live-reachable call sites (playbook
  strongly; extraction weakly). The flagship consequence-enrich paths
  (COMPANY_IMPACT_ANALYSIS, PRESENT_CONTEXT — `enrich.ts:68,92`) pass evidence
  in-prompt but never validate citations; company-impact rationale has **no
  schema** at all. Grounding itself is a spoofable single-substring check
  (`validate.ts:54-56`).
- The "spend cap" is a **daily call-count cap** (`budget.ts:22-27`) — 100 Opus
  calls and 100 Haiku calls are identical to it. Cost figures are flat per-token
  estimates that ignore input/output price splits and are rendered with a `£`
  symbol against USD-shaped constants (`run.ts:33-37`, `admin/llm/page.tsx:95`).
  Real enforcement, wrong denomination.
- `routeTask` prefers but does not require `enabled` configs
  (`router.ts:24-33`) — the activation trap flagged in the 07-03 audit (I-3)
  is still present.
- "Multi-provider" is Anthropic-only; 3 of 26 task classes are unrouted
  (log `model:'unrouted'`); INVESTIGATION_QUERY_GENERATION is coded but never
  receives a provider even when AI is on.

### 4.7 Source layer breadth and truth
- RSS-2.0 only (no Atom/RDF/JSON-feed); no conditional GET (full re-download every
  scan); no per-source cadence/backoff.
- `Source.collectorStatus` is a **static seed string** never reconciled at runtime
  (`seed.ts:20,29,50`) — a broken collector still shows FUNCTIONAL; the
  investigation loop even stamps its synthetic sources FUNCTIONAL
  (`investigation-loop.ts:62`).
- No source-level error detail persists (`SourceHealth.notes` nulled on failure,
  `health.ts:39`); no independence/ownership grouping; no staleness metric.
- Novelty is binary 0.9/0.4 (`cluster.ts:72`), not a real metric.

---

## 5. What is dormant (built, honest, switched off)

| Layer | Gate | What activation takes |
|---|---|---|
| Investigation loop execution | `SEARCH_ADAPTER_REGISTRY = {}` (`evidence/search/registry.ts:43`) | Register one `SearchAdapter`. **But first**: `maxRuntimeMs`, `maxCostBudget`, `allowedSourceTypes` are declared and never read (`evidence/types.ts:34-36`) — unbounded runtime if enabled as-is. |
| LLM enrichment | configs `enabled:false` + no `ANTHROPIC_API_KEY` (`provider.ts:100-107`) | `scripts/llm-activate.ts on` + key. Model IDs are current (`claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-4-8`). Owner-funded decision. |
| Market data | `ADAPTER_REGISTRY = {}` (`market/provider.ts:48`) | Implement one provider; pre-activation gates documented in `docs/market-data-adapters.md` still open (graceful degrade on provider throw). |

Dormancy is honestly reported at every layer (status endpoints, sentinels, UI
ticker). The problem is not honesty; it is that the product's headline behaviours
live behind these three registries.

---

## 6. What is missing entirely

1. **Continuous scanning** — no scheduler/worker of any kind.
2. **Source categories** — no collector for regulatory, procurement, filings,
   government, company-site, trade-press-API sources. (Categories exist only as
   authority priors.)
3. **Review queue** — no model, no flow, no human transition logic.
   `Claim.needsReview` is a threshold-set UI label; `EVENT_STATUSES` has
   NEEDS_REVIEW but nothing consumes it into a workflow. README lists it as
   deferred.
4. **Manipulation risk** — no column, no enum, no code reference anywhere. The
   only proxy is `copyLoopRisk`. No coordinated-timing / copy-burst detection.
5. **Semantic similarity** — no embedding path, not even an optional dormant one.
6. **Factuality rollup** — `factualityLabel` is frozen at atomic-extraction time;
   `CanonicalClaim` never re-derives it (reliability writes a label but the
   canonical record carries only scores).
7. **Event-level exposure fields** — commodities/instruments live on
   `AtomicClaim.commoditiesJson/instrumentsJson` and are never promoted to the
   event; `EventCandidate` has no momentum field (momentum exists only at graph
   layer); no confidence-history series (though `GraphEvent` CONFIDENCE_ROSE/FELL
   rows mean the data already exists to render one).
8. **Search interrogation depth** — interrogation reads the existing graph; it
   cannot trigger an investigation of a new term (no interrogate→investigate
   bridge).

---

## 7. What should be removed or corrected

**Remove / retire (with justification):**
- `RiskOpportunity` model — redundant with `OpportunityCard` +
  `EventContextSynthesis`/`FutureScenario`; carries duplicate riskLogic /
  opportunityLogic fields. Retire after the event-page Overview tab reads from the
  consequence layer. (Not removed until its UI consumer is migrated — SR2.)
- `/api/revenue-lenses` — duplicate of `/api/lenses` with a different shape
  (flagged in 07-03 audit m-1, still present).
- Unreachable `return 'UNVERIFIED'` branch (`reliability.ts:34`).
- `ClaimCluster.momentumScore` — never written by the evidence engine; either wire
  it or drop it.
- Dead-if-not-populated: `SignalClusterEntity`, `EventCandidateEntity` — the
  upgrade plan **populates** them (entity resolution) rather than dropping them.
- **Legacy claim spine duplication** — the long-term decision (see plan Stage 2):
  events must consume the canonical-claim layer; the legacy regex `Claim` path is
  then reduced to a signal-typing shim and eventually retired. This is the one
  large removal, and it is staged, not big-bang.

**Doc corrections (code is right, docs lie):**
- `docs/multi-model-llm-routing.md:62-72` claims seeded model names are
  placeholders (`claude-fast` etc.) — the seed ships real current IDs and deletes
  the placeholders (`seed.ts:90-93`).
- `docs/llm-routing-and-guardrails.md:40` claims enrich is the only live LLM path
  — playbook generation is also live when activated.
- `docs/evidence-arc-engine.md:136-151` lists market nodes / replay /
  interrogation as deferred — all three shipped.
- README/branding says "autonomous"/"live" — scanning is manual until the
  scheduler lands.

---

## 8. Design risks in the current architecture

| # | Risk | Consequence if unaddressed |
|---|---|---|
| R1 | Dual claim spines (T1) | All depth work is cosmetic to ranking; weak claims drive dashboards; two models drift apart. |
| R2 | Relation-free additive models (schema comments `655-658`, `764-767`) | Orphaned rows, no referential integrity as volume grows; joins by plain string IDs. |
| R3 | Entity regex feeding company impacts | Public-facing "beneficiary/harmed" names polluted with non-companies once real messy feeds arrive. Currently masked by clean fixtures. |
| R4 | Loop limits unwired (`maxRuntimeMs`/`maxCostBudget`/`allowedSourceTypes`) | First registered search adapter turns the bounded loop into an unbounded crawler. Must be wired **before** any adapter. |
| R5 | Timestamp-based origin + no publisher grouping | Syndication counted as independence exactly when source count grows — reliability inflates with breadth unless fixed **before** Stage-1 source expansion. |
| R6 | Full-table scans + SQLite serial writes | Fine at 88 nodes; will not survive multi-feed continuous scanning. Postgres migration is designed to be mechanical (string enums) — trigger point is Stage 1. |
| R7 | Call-count budget + in-memory rate limiter | Cost control illusion under real LLM activation and multi-process deployment. |
| R8 | Router prefers-not-requires `enabled` | Cost-control trap at activation (owner enables cheap model, tasks still route to expensive one). |
| R9 | Substring grounding | LLM output can cite one ID and fabricate the rest, and still pass. |

---

## 9. Most important files and services (the load-bearing walls)

| Area | Files |
|---|---|
| Scan orchestration | `src/server/pipeline/orchestrator.ts` (15 stages + 5b depth + 13b consequence, per-stage non-fatal) |
| Evidence depth | `src/server/evidence/{extraction,canonical,lineage,reliability,investigation-loop,investigation-query,depth-pipeline}.ts` |
| Event spine | `src/server/pipeline/{claims,signals,cluster,events,classify,opportunity,positioning}.ts` |
| Consequence | `src/server/consequence/{company-impact,context,positioning,report,enrich,watch-signals}.ts` |
| Graph | `src/server/graph/{builder,arc,timeline,momentum}.ts` |
| LLM | `src/server/llm/{router,provider,run,validate,budget,enrich-text}.ts` |
| Safety | `src/server/safety/advice-language.ts`, `src/middleware.ts`, `src/server/net/safe-fetch.ts` |
| Collectors | `src/server/pipeline/collectors/{registry,rss,fixture}.ts`, `src/server/evidence/search/registry.ts` |
| Data | `prisma/schema.prisma` (43 models), `src/server/seed.ts` |
| Proof | `tests/evidence-depth-pipeline.e2e.test.ts`, `tests/deep-commercial-consequence.e2e.test.ts`, `tests/e2e-proof.test.ts`, `tests/scan-deterministic-invariant.test.ts` |

---

## 10. Proposed capabilities beyond the brief

1. **Publisher independence groups** (R5): domain-derived `independenceGroup` on
   Source; independence counting collapses same-group sources. Cheap, huge
   correctness payoff, prerequisite for source expansion.
2. **SimHash/MinHash syndication fingerprints** on documents: deterministic,
   no-API near-duplicate detection far stronger than one Jaccard threshold;
   doubles as the manipulation-risk primitive (copy-burst detection = many
   same-fingerprint docs in a short window from one group).
3. **Interrogate→investigate bridge**: a searched term with thin graph coverage
   offers "run an investigation", reusing the loop with the term as seed — turns
   search from a lookup into an investigation trigger.
4. **Confidence-history rendering from existing GraphEvent rows**: the
   CONFIDENCE_ROSE/FELL timeline already exists; the event page just never draws
   it. Near-free depth win.
5. **Dormant-by-default embedding provider interface** (mirroring the LLM/market
   pattern): deterministic lexical similarity remains the fallback; a configured
   embedding provider upgrades clustering/paraphrase detection. Keeps the
   no-key-no-cost default while removing the permanent Jaccard ceiling.
6. **Token-denominated budget** with per-model input/output pricing and a true
   daily monetary cap — replaces the call-count cap honestly.
7. **Free lawful public source pack**: regulator/government RSS+Atom feeds, UK
   Contracts Finder (procurement, free API), Companies House filings stream (free
   key, env-gated), GDELT DOC 2.0 (free, keyless) as both a collector and the
   investigation loop's first search adapter. All fetched via the existing
   SSRF-guarded client, all honestly health-tracked.

---

## 11. Bottom line for the owner

What you have is much better than a headline summariser — the honesty machinery,
safety spine, and evidence mathematics are genuinely good, and nothing found in
this audit fabricates anything, ever. What it is **not yet** is a living
intelligence engine: it watches one feed on demand, its deepest reasoning doesn't
influence what the dashboard ranks, and its investigation loop, AI, and market
layers are all switched off. The upgrade plan connects what exists, feeds it real
sources, wires the loop's safety limits, and then — and only then — deepens the
synthesis. No working foundation is destroyed; the two-spine duplication is
unified in a staged, test-pinned way.
