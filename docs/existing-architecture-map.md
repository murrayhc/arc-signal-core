# Existing Architecture Map & Preservation Plan (Upgrade Stage 0)

Date: 2026-07-03
Purpose: Stage 0 deliverable for the "Autonomous Intelligence Radar, Evidence
Graph, Opportunity Engine and Multi-Model LLM Layer" upgrade. Produced BEFORE
any feature code, per the upgrade document's critical instruction ("Audit before
changing. Reuse before adding. Extend before replacing. Do not build a parallel
architecture.").

This map reconciles the upgrade document's expected foundations and suggested new
models against the **actual** Archlight codebase (spine + Phase 2a, 74 tests
green, HEAD `0e096ee`).

## 1. Verdict up front

Archlight already IS the "Public Forecasting Machine style" foundation the
upgrade document assumes. The autonomous event-discovery pipeline exists, is
wired to a Run-scan dashboard action, and is proven end-to-end. **This is an
in-place upgrade, not a rebuild.** Stages 0 and 1 of the document are already
substantially satisfied (see §4). The genuine work is Stages 2–13: opportunity
conversion, strategic positioning, the evidence graph, six-degree arcs, a 3D
graph UI, manual interrogation, market-data adapters, a multi-model LLM layer,
playbooks, watch markets, and graph replay.

## 2. Existing foundations → document's 21 expected foundations

| # | Document expects | Exists in Archlight? | Where |
|---|---|---|---|
| 1 | Source Registry | ✅ | `Source` model; `/admin/sources`; `getSources()` |
| 2 | Entity Registry | ✅ (minimal, support-layer-only by design) | `Entity`, `EventCandidateEntity`, `SignalClusterEntity` |
| 3 | Document storage | ✅ | `Document` + `ParsedDocument` |
| 4 | Collector framework | ✅ | `pipeline/collectors/` (registry + fixture + rss) |
| 5 | Parser framework | ✅ | `pipeline/parse.ts` |
| 6 | Claim extraction | ✅ | `pipeline/claims.ts`; `Claim` |
| 7 | Signal engine | ✅ | `pipeline/signals.ts`; `Signal` |
| 8 | EventTemplate | ⚠️ Not a named model | Event typing/scoring is deterministic inline in `pipeline/events.ts` (`computeEventMetrics`). No separate template table. |
| 9 | Forecast logic | ⚠️ Partial / deferred | No `Forecast` model. `probability` + `TriggerCondition` cover part of the intent. Backtesting/forecast is a documented deferral. |
| 10 | EventCandidate | ✅ | `EventCandidate` (+ lifecycle merge, Phase 2a) |
| 11 | SignalCluster | ✅ | `SignalCluster` + `SignalClusterSignal` join |
| 12 | ScanRun | ✅ | `ScanRun` (full stage counters, errors + warnings) |
| 13 | DashboardFeedItem | ✅ | `DashboardFeedItem` |
| 14 | RiskOpportunity | ✅ | `RiskOpportunity` (rule-based logic + questions) |
| 15 | Event-first dashboard | ✅ | `app/page.tsx` — radar-room dashboard at `/` |
| 16 | Event interrogation route | ✅ | `app/events/[id]/page.tsx` |
| 17 | Worker services | ⚠️ By design, inline | No separate worker process. `runFullScan` orchestrator (`pipeline/orchestrator.ts`) runs inline; deliberately Next-free so it can move behind a queue later. The document explicitly allows "add a central pipeline orchestrator only if one does not already exist" — one exists. |
| 18 | Prisma schema | ✅ | `prisma/schema.prisma` (17 models) |
| 19 | Existing tests | ✅ | 15 test files, 74 tests, incl. an e2e proof |
| 20 | Existing API routes | ✅ | `/api/scans/run`, `/api/scans`, `/api/scans/[id]`, `/api/dashboard`, `/api/events/[id]`, `/api/sources` |
| 21 | Existing web app structure | ✅ | Next.js 15 App Router + Tailwind 4 |

**Gaps vs the document's expected foundations:** only #8 (no `EventTemplate`
table — scoring is inline and deterministic, which is fine) and #9 (no
`Forecast` model — deferred). Neither blocks the upgrade; both are noted so we
don't accidentally "rediscover" them as new work.

## 3. Current models (17) — the reuse surface

`Source, SourceHealth, Entity, Document, ParsedDocument, Claim, Signal,
SignalCluster, SignalClusterSignal, SignalClusterEntity, EventCandidate,
EventCandidateEntity, RiskOpportunity, DashboardFeedItem, ScanRun, DataGap,
TriggerCondition.`

Every one of these is REUSED as-is by the upgrade. The graph layer (Stage 4)
projects over them; it does not replace them.

## 4. Stage 0 & Stage 1 reconciliation

- **Stage 0 (this document):** DONE.
- **Stage 1 (stabilise the pipeline):** ALREADY SATISFIED. The pipeline runs
  end-to-end; the Run-scan button triggers `POST /api/scans/run` → `runFullScan`;
  ScanRun counters populate across all stages; events appear on the dashboard
  with no company upload; the event page opens with evidence. Proof (with fresh
  before/after row counts) is recorded in `docs/autonomous-pipeline-proof.md`
  (Stage 1 format) and `docs/autonomous-radar-proof.md` (original). The
  document's required Stage 1 outputs (`runFullScan`, `POST /scans/run`, wired
  Run-scan button, ScanRun counts, e2e proof test, proof report) all exist.

## 5. New models genuinely required (by upgrade stage)

Only added where the existing schema cannot express the new concept. None
duplicate an existing model.

| Stage | New models | Reuses / links to |
|---|---|---|
| 2 Opportunity | `RevenueLens`, `OpportunityCard` | `EventCandidate`, `RiskOpportunity`, `SignalCluster`, `Signal`, `Claim` |
| 3 Positioning | `StrategicPositioningExample` | `EventCandidate`, `OpportunityCard`, `RevenueLens`, arc |
| 4 Graph | `GraphNode`, `GraphEdge` | projection over ALL existing records (refType+refId, unique) |
| 5 Evidence Arc | `EvidenceArc`, `EvidenceArcStep` | `GraphNode`/`GraphEdge`, `EventCandidate`, `Claim` |
| 8 Market data | `InstrumentProfile`, `CommodityProfile`, `MarketSearchQuery`, `MarketSearchResult` (+ `MarketDataProvider` interface) | provider-gated; graceful empty state when unconfigured |
| 9 LLM | `LLMProvider` (config), `LLMRun`, `LLMOutputValidation` (+ `LLMTaskRouter` service) | interpretation only; deterministic core stays source of truth |
| 10 Playbooks | `OpportunityPlaybook` | `OpportunityCard` |
| 11 Watch/Portfolio | `WatchMarket`, `OpportunityPortfolioItem` | `OpportunityCard`, sectors/regions |
| 12 Replay | `GraphSnapshot`, `GraphEvent` | `GraphNode` |

Note on `RiskOpportunity` vs `OpportunityCard`: `RiskOpportunity` already holds
risk/opportunity *logic* per event. `OpportunityCard` is a richer COMMERCIAL
projection (buyer pain, likely buyers, suggested offer, value/urgency/
actionability scores). We EXTEND the concept via a new `OpportunityCard`. As
built in Phase 3a, the card links to its `EventCandidate` (the shared source of
truth for both records) rather than to `RiskOpportunity` directly — both are
event-derived, so the event FK is the cleaner join.

## 6. Preservation guarantees (what the upgrade must NOT do)

1. Not rebuild the app or create a second app / second dashboard.
2. Not duplicate existing models under new names.
3. Not replace working collectors, parsers, or the orchestrator without a
   smaller/safer/better-tested reason.
4. Not move the product back to a manual company-registry workflow; company/
   commodity/instrument search is an ENTRY POINT INTO the graph, not the centre.
5. Keep the deterministic pipeline as the source of truth; the LLM layer
   interprets and renders, and fails closed on validation.
6. Preserve fixture/live labelling and evidence trails already enforced.

## 7. Compatibility notes carried from the current design

- **No-LLM core stays.** The current design decision "deterministic rule-based
  intelligence (no LLM in the spine)" is PRESERVED. The document's Stage 9 LLM
  layer is additive interpretation on top, explicitly "not a replacement for
  deterministic scoring," with a mandated clean no-provider state — fully
  compatible. Stages 2–5 (opportunity, positioning, graph, arcs) are built
  DETERMINISTICALLY and need no LLM or external provider to function.
- **Self-contained frontend stays.** No external CDNs/fonts. The Stage 6 3D
  graph uses a BUNDLED npm library (e.g. `3d-force-graph`), not a CDN, with a
  2D / reduced-motion fallback as the document requires.
- **Local-only / unauthenticated** remains the posture until the deferred
  security-hardening pass. Adding LLM/market-data provider keys RAISES the
  secrets stakes — keys via env vars only, never committed, never logged (the
  document's own LLM safety rules agree).
- **GBP** and non-advisory framing: the document's strict non-advisory rules
  (no buy/sell/hold/target-price/guaranteed) are adopted as hard constraints
  and will be enforced by failing tests (Stage 3 & Stage 14).

## 8. Proposed phase sequencing (deterministic-first)

The upgrade is large (14 feature stages). Proposed grouping into reviewable
phases, deterministic and no-cost work first, paid-provider work gated behind
graceful degradation so nothing blocks on owner spend:

- **Phase 3a — Opportunity & Positioning** (doc Stages 2–3): RevenueLens,
  OpportunityCard, StrategicPositioningExample + services + Opportunity Radar +
  advice-language guard tests. Deterministic. No keys, no cost.
- **Phase 3b — Evidence Graph & Arcs** (doc Stages 4–5): GraphNode/GraphEdge
  projection + GraphBuilderService + six-degree EvidenceArc + graph APIs.
  Deterministic. No keys.
- **Phase 3c — 3D Graph & Interrogation UI** (doc Stages 6–7, 13): bundled 3D
  force graph + manual interrogation search + dashboard restructure, with a 2D
  fallback. No keys; frontend-heavy.
- **Phase 3d — LLM orchestration & Playbooks** (doc Stages 9–10): provider/
  router/run/validation abstraction with graceful no-provider state (buildable &
  testable WITHOUT keys); playbooks render from templates now, LLM-enhanced when
  a key is added.
- **Phase 3e — Market data** (doc Stage 8): `MarketDataProvider` interface + a
  null provider (clean empty state) now; a real paid provider added later.
- **Phase 3f — Watch/Portfolio/Replay & momentum** (doc Stages 11–12).
- **Stage 14 proof / Stage 15 delivery**: continuous; final upgrade proof at the
  end (`docs/final-upgrade-proof.md`).

Owner decisions (all DEFERRABLE behind graceful degradation, so none blocks the
start): (1) which LLM provider + budget to fund Stage 9's live mode (Anthropic
recommended — Claude-native); (2) which market-data provider + budget for Stage
8; (3) confirm the bundled 3D library choice for Stage 6. Everything up to those
"light-it-up" points is buildable now with no spend.
