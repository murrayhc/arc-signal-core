# Archlight Roadmap

Last updated: 2026-07-03 · Current state: spine + Phase 2a + the full
intelligence-radar upgrade (Phases 3a–3f) + the homepage command-centre
redesign shipped, 351/351 tests green.
Source of truth for phase history: `.superpowers/sdd/progress.md` (local
ledger) and `docs/superpowers/specs/`/`docs/superpowers/plans/` (design
docs). This file is a short current-state summary, not the durable record.

## Done

- **Spine (2026-07-02)** — the full autonomous pipeline: collect → parse →
  claims → signals → clusters → scored events → risk/opportunity
  classification → dashboard feed → data gaps + trigger conditions. Live
  dashboard (`/`), event interrogation (`/events/[id]`), read-only admin
  sources page. Proven end-to-end (recorded verdict: PASS).
- **Phase 2a — Living Radar (2026-07-02)** — repeated scans now update
  existing events instead of duplicating them (RISING lifecycle, sticky
  analyst statuses); scan warnings separated from genuine errors; per-source
  health tracking; `/scans` audit history page.
- **Phase 3a — Opportunity & Positioning (2026-07-03)** — commercially-scored
  `OpportunityCard`s and non-advisory `StrategicPositioningExample`s derived
  from qualifying events; dashboard Opportunity Radar; guard-clean templates
  verified against the advice-language guard.
- **Phase 3b — Evidence Graph & Arcs (2026-07-03)** — every event, claim,
  signal, source, document, opportunity, sector, region projected into
  `GraphNode`/`GraphEdge` rows; six-degree `EvidenceArc` tracing with
  chain-class detection; `/graph` explorer.
- **Phase 3c — 3D Graph + Interrogation (2026-07-03)** — interactive 2D/3D
  force-graph UI; manual free-text interrogation
  (company/sector/region/ticker/share-price/instrument/commodity/generic
  query classification) answered from real graph evidence.
- **Phase 3d — dormant LLM + Playbooks (2026-07-03)** — multi-model
  Claude-native router/adapter layer, schema-validated structured output,
  unsupported-claims + advice-language rejection, non-advisory playbook
  generation; ships dormant (no key configured), `/admin/llm` audit page.
- **Phase 3e — dormant Market Data (2026-07-03)** — commodity/instrument/
  ticker/share-price context from a compliant provider-API interface; ships
  dormant (`ADAPTER_REGISTRY` empty); safety contract in
  `docs/market-context-safety.md`, adapter mechanics in
  `docs/market-data-adapters.md`.
- **Phase 3f — Watch/Portfolio/Replay + RevenueLens CRUD (2026-07-03)** —
  saved watch markets, an opportunity portfolio with status tracking,
  graph-event timeline recording with momentum/confidence-decay scoring,
  event replay, and configurable revenue lenses.
- **Homepage command-centre redesign (2026-07-03)** — `/` rebuilt as a dark,
  graph-first intelligence command centre: Intelligence Brain force-graph hero
  (node selection opens an evidence detail panel), ranked Active
  Opportunities / Top Risks rails, operational panels driven by real pipeline
  counters and SignalCluster aggregates, global pulse ticker with honest
  provider placeholders. All prior routes, actions and card feeds preserved
  (secondary drawers). Independently reviewed (fable) + fix wave applied.

Current test count: **351**, all green
(`.superpowers/sdd/progress.md` has the per-phase task-by-task ledger; each
phase's detailed design lives in `docs/superpowers/specs/` and
`docs/superpowers/plans/`).

## Deferred / next

- **Activate the LLM provider by env.** Register a real Claude adapter and
  set the required key — the router, validator, and audit trail are already
  built and tested; only a live provider is missing (Phase 3d ships
  dormant by design).
- **Activate a market-data provider by env.** Implement `MarketDataProvider`
  for a real vendor (Polygon, Alpha Vantage, etc.) and register it in
  `ADAPTER_REGISTRY` (`docs/market-data-adapters.md` §6). Before doing so,
  close the pre-activation gate items already documented there: provider-
  error degradation on `/interrogate` (must not 500), symbol extraction for
  `SHARE_PRICE`/`TICKER`-shaped queries, and a seed-then-fetch-live
  integration test.
- **Security-hardening pass.** The app is explicitly **local-only** and
  unauthenticated until this lands — do not deploy it exposed to a network
  before completing it. Scope: authentication + admin route protection; rate
  limiting on scan/interrogate endpoints; RSS-link scheme allowlist
  (http/https only); response-size cap and content-type check on RSS
  fetches; audit logging for admin changes; dependency vulnerability scan.
- **Postgres migration.** SQLite was chosen for a zero-setup local radar;
  schema uses string-enum columns specifically to make this mechanical
  whenever it's actually needed.
- **Command-centre follow-ups** (from the redesign's independent review; all
  non-blocking): keyboard-accessible node selection for the Intelligence
  Brain; gate the LIVE indicator on scan recency; scope the three Google
  fonts to `/` only; fix the pre-existing `ForceGraph.tsx` paused mode on
  `/graph` (`d3VelocityDecay: 1` freezes the layout at the initial spiral
  instead of laying out statically — same class as the redesign's I-2 fix).
- **3a–3f minor rollups** tracked in `.superpowers/sdd/progress.md` — small,
  scoped items surfaced by each phase's whole-phase review. DONE (`acb1d99`):
  a P2002 sweep on duplicate-name POST/PATCH for `/watch` and `/lenses`
  (409) and portfolio POST (return-existing 200); `confidenceDecay`/
  freshness semantics on a fresh contradiction event (decided and
  documented); `CLAIM_REPEATED`/`SIGNAL_STRENGTHENED` timeline-event
  reachability; a server-side whitespace-term filter on watch-scope
  matching. Still open, none blocking: assorted doc-completeness and dedupe
  nits (`findNodeId`/`safeUpsertEdge` duplicated between `graph/builder.ts`
  and `market/graph.ts`; a builder↔market/graph circular import, runtime-safe
  today).

## How this file works

Update it whenever a phase starts, a fast-follow lands, or scope changes.
Each completed phase's detailed design lives in
`docs/superpowers/specs/YYYY-MM-DD-<phase>-design.md` and its full
implementation plan in `docs/superpowers/plans/YYYY-MM-DD-<phase>.md` — this
file is the short, current-state summary; those are the durable record.
