# Archlight Phase 3f — Watch Markets, Opportunity Portfolio, Graph Replay/Momentum + RevenueLens CRUD: Design

Date: 2026-07-03
Status: Approved direction (owner: deterministic-phases-first; proceed to completion).
Implements upgrade **Stages 11–12** (Watch Markets + Opportunity Portfolio; graph
replay + momentum tracking), the **Stage 13** dashboard restructuring (additive), and
the RevenueLens CRUD deferred from 3a. Predecessors: spine+2a+3a–3e (211 tests, HEAD fe593b5).
Fully **deterministic** — no LLM, no external provider, no key/spend.

## 1. Goal & core principle
Turn the radar from "detect + score" into "track over time + act": users save
intelligence scopes (**Watch Markets**), promote opportunities into a tracked
**Portfolio** with a status lifecycle, and **replay** how an event formed from first
source to current state with **momentum / confidence-decay / freshness** scoring. Plus
the **RevenueLens CRUD** that unblocks the `averageDealSize` weighting hardcoded to 0.5
in 3a. Everything is additive to existing routes/pipeline and deterministic.

## 2. Non-negotiable rules
1. **Additive only:** no existing route/section/pipeline/test behaviour regresses. New dashboard sections/actions are added, not substituted; production marketing is not in scope (this is the Archlight app, standalone).
2. **Deterministic:** momentum/decay/freshness are pure functions of the recorded timeline + timestamps; no invented data. GraphEvents are recorded only for changes that actually happened in a scan.
3. **Honesty:** replay/timeline reflect real recorded GraphEvents + snapshots; never fabricate a formation history. Momentum/decay are explainable (the inputs are auditable rows).
4. **Non-advisory carries over:** portfolio/opportunity copy stays within the 3a guard (no buy/sell/hold/guaranteed) — `estimatedValue` is a user-entered figure, GBP.
5. House style: string enums in `src/shared/enums.ts`; `*Json` String columns (no `*Json` leak in APIs); files < 500 lines; en-GB; **GBP** for money; upsert-dedupe on stable uniques.

## 3. New models (Prisma; cuid ids, `*Json` String columns)
- `WatchMarket` — id, name (unique), description (String?), sectorsJson, regionsJson, themesJson, queryTermsJson (all String @default "[]"), active (Boolean @default true), createdAt, updatedAt. A saved intelligence scope (e.g. "Lithium supply chain", "AI regulation").
- `OpportunityPortfolioItem` — id, opportunityCardId (FK → OpportunityCard, `@unique` — one item per card), status (a `PortfolioStatus`, default `NEW`), estimatedValue (String?, GBP), owner (String?), nextAction (String?), deadline (DateTime?), evidenceStrength (Float @default 0), buyerClarity (Float @default 0), confidenceMovement (Float @default 0 — signed delta), createdAt, updatedAt.
- `GraphSnapshot` — id, snapshotType (a `GraphSnapshotType`), rootNodeId (String — the GraphNode.id the snapshot centres on), nodesJson, edgesJson (compact captured neighbourhood), createdAt.
- `GraphEvent` — id, graphNodeId (String — ref to GraphNode.id; plain ref, NOT an FK, so the timeline survives graph re-projection), eventCandidateId (String?, for stable re-linking), eventType (a `GraphEventType`), description (String), occurredAt (DateTime @default now), metadataJson (String @default "{}"). Index `@@index([graphNodeId, occurredAt])` for timeline queries.

### Enums (append to `src/shared/enums.ts`)
- `PORTFOLIO_STATUSES`: `NEW`, `INVESTIGATING`, `QUALIFIED`, `REJECTED`, `ACTING`, `WON`, `LOST`, `WATCHING`.
- `GRAPH_EVENT_TYPES` (the doc's 10 tracked): `FIRST_DETECTED`, `NEW_SOURCE`, `CLAIM_REPEATED`, `SIGNAL_STRENGTHENED`, `CONTRADICTION_DETECTED`, `OPPORTUNITY_GENERATED`, `CONFIDENCE_ROSE`, `CONFIDENCE_FELL`, `EVENT_COOLED`, `EVENT_ESCALATED`.
- `GRAPH_SNAPSHOT_TYPES`: `EVENT_FORMATION`, `CURRENT_STATE`, `MANUAL`.

## 4. Watch Markets + Portfolio (`src/server/watch/`, `src/server/portfolio/`)
- **WatchMarket service:** CRUD (`createWatchMarket`, `listWatchMarkets`, `updateWatchMarket`, `deleteWatchMarket`); `resolveWatchMarket(id)` → the matching live intelligence for its scope: events/opportunities/signals whose sector/region/theme/queryTerm matches the saved scope (reuse the interrogation classifier + existing event/opportunity queries; deterministic string/term match, fetch-then-filter-in-JS — SQLite has no case-insensitive `mode`). No fabrication: empty scope → empty feed.
- **Portfolio service:** `addToPortfolio(opportunityCardId)` (creates an `OpportunityPortfolioItem` from the card — `evidenceStrength` from the card's evidenceScore, `buyerClarity` from actionability/confidence, `confidenceMovement` from the card's recent confidence delta if available, else 0; status `NEW`), `updatePortfolioItem(id, {status, owner, nextAction, deadline, estimatedValue})`, `listPortfolio(filter?)`. Unique on `opportunityCardId` (re-add = idempotent no-op/return existing). Wire the 3d playbook **"Save to portfolio" stub** to `addToPortfolio`.

## 5. Graph replay + momentum/decay (`src/server/graph/timeline.ts`)
- **GraphEvent recording (in the scan):** hook into the scan orchestrator right after `syncGraphForEvents`. For each event created/updated this scan, compare against the prior state and record the GraphEvents that actually occurred: `FIRST_DETECTED` (new event), `NEW_SOURCE` (a source not previously linked), `CLAIM_REPEATED`, `SIGNAL_STRENGTHENED`, `CONTRADICTION_DETECTED`, `OPPORTUNITY_GENERATED`, `CONFIDENCE_ROSE`/`CONFIDENCE_FELL` (signed confidence delta vs last scan), `EVENT_COOLED`/`EVENT_ESCALATED` (status transitions). Each row is a real, auditable change — never speculative.
- **GraphSnapshot capture:** on `FIRST_DETECTED` and `EVENT_ESCALATED`, capture an `EVENT_FORMATION`/`CURRENT_STATE` snapshot of the event node's neighbourhood (compact nodesJson/edgesJson) so replay can render intermediate graph states, not only the timeline. Bounded to the event neighbourhood (not the whole graph) to cap storage.
- **Scores (pure functions, `src/server/graph/momentum.ts`):** `momentumScore(events, now)` (recent supporting GraphEvents raise it; contradictions/confidence-fell lower it), `confidenceDecay(lastUpdatedAt, now)` (time since last supporting evidence), `signalFreshness`/`evidenceAgeing` (reuse/extend the existing `freshness()` in builder.ts). Behaviours from the doc: stale events fade (freshness→low), new supporting evidence raises momentum, contradictions reduce confidence/→ MIXED, no new evidence lowers freshness. Hand-verify every formula in the plan + tests.
- **Replay service:** `getEventReplay(eventCandidateId)` → the ordered GraphEvent timeline + any captured snapshots + the computed momentum/decay/freshness, for the event-page replay view and a dashboard "Open graph replay" action.

## 6. RevenueLens CRUD + averageDealSize weighting
- CRUD service + UI (`/lenses` list + create/edit/delete; `active`/`isDefault` toggles) for the existing `RevenueLens` model (from 3a). Never delete the default lens without reassigning.
- **Unblock the deferred weighting:** implement `lensValueSignal` from `RevenueLens.averageDealSize` — a deterministic bucket parse (`averageDealSize` string → a signal in [0,1], e.g. bands by GBP magnitude), replacing the hardcoded `0.5` in the 3a opportunity scoring. This CHANGES `commercialValueScore` when a lens has `averageDealSize` set → a scoring change: hand-verify the formula, add tests, and confirm the default-lens (no averageDealSize) path stays at the prior 0.5 (byte-compatible for existing scored cards). SR10/SR11 register locks still apply to any copy.

## 7. Dashboard restructuring (Stage 13, additive)
Add to the dashboard (keeping all existing panels): a **Watch Markets** section, and the primary actions **Create Revenue Lens**, **Create Watch Market**, **Open graph replay**. Do NOT promote admin/support actions (add source/entity/registry) to primary. Additive — existing sections/order preserved; new sections appended per the 3c additive-restructure precedent.

## 8. Additivity, determinism & honesty (acceptance heart)
Existing scans/routes/tests unchanged except the intentional, tested `averageDealSize` weighting (default path byte-compatible). GraphEvents/snapshots recorded only for real changes; momentum/decay pure and auditable; replay reflects recorded history only. No LLM, no provider, no key. Watch-market feeds + portfolio + replay all degrade to honest empty states with no data.

## 9. Out of scope (later / deferred)
LLM narration of replay (needs the LLM layer active); alerts/notifications on watch markets (Phase 2b "watchlist & alerts" territory — not this phase); real-time momentum streaming; multi-user portfolio ownership (owner is a free-text field now). `GraphSnapshot` is captured at formation/escalation only, not every scan (storage bound).

## 10. Success criteria
1. WatchMarket CRUD + `resolveWatchMarket` returns real matching events/opportunities (empty when none); Portfolio add/update with the status lifecycle; the 3d "Save to portfolio" stub now creates a portfolio item.
2. Scans record correct GraphEvents for real changes (first-detected, new-source, confidence up/down, escalated/cooled, contradiction) — tested against a two-scan fixture sequence; snapshots captured at formation/escalation.
3. Momentum/confidence-decay/freshness formulas hand-verified + unit-tested (stale fades, new evidence raises momentum, contradiction lowers confidence); `getEventReplay` returns the ordered timeline + snapshots.
4. RevenueLens CRUD UI works; `averageDealSize` weighting wired + hand-verified; default-lens path byte-compatible with prior scores (existing opportunity tests green or intentionally updated).
5. Dashboard gains Watch Markets + the three new primary actions, additively (all prior sections intact). Full suite green + typecheck + build clean; `docs/watch-portfolio-replay.md` written. Controller browser-verifies the new pages (CDP hydration).

## 11. Task breakdown (right-sized; precise code + assertions in the plan)
1. **Migration + enums** — 4 models (WatchMarket, OpportunityPortfolioItem, GraphSnapshot, GraphEvent) + 3 enums + resetDb + optional sample WatchMarket seed. (transcription → haiku)
2. **Watch Markets + Portfolio** — services (CRUD + resolve + addToPortfolio/updates), APIs, wire the 3d "Save to portfolio" stub; tests. (logic/integration → sonnet)
3. **Graph replay + momentum/decay** — GraphEvent recording hooked into the scan, snapshot capture, momentum/decay/freshness pure scorers (hand-verified), replay service; tests over a two-scan sequence. (integration/scoring → sonnet)
4. **RevenueLens CRUD + averageDealSize weighting + dashboard (Stage 13) + UI (portfolio/watch/replay pages) + docs.** (UI/integration → sonnet)
