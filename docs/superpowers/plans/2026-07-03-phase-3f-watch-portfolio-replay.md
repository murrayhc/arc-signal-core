# Archlight Phase 3f — Watch Markets, Opportunity Portfolio, Graph Replay/Momentum + RevenueLens CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Implement upgrade Stages 11–12 (Watch Markets + Opportunity Portfolio; graph replay + momentum/decay tracking), the Stage 13 additive dashboard restructuring, and the RevenueLens CRUD that unblocks the `averageDealSize` weighting hardcoded to 0.5 in 3a. Fully deterministic — no LLM/provider/key.

**Architecture:** 4 new models (WatchMarket, OpportunityPortfolioItem, GraphSnapshot, GraphEvent) + 3 enums. `src/server/watch/` + `src/server/portfolio/` services + APIs (+ wire the 3d "Save to portfolio" stub). `src/server/graph/timeline.ts` (GraphEvent recording hooked after `syncGraphForEvents`, snapshot capture) + `src/server/graph/momentum.ts` (pure momentum/decay/freshness scorers). RevenueLens CRUD UI + `lensValueSignal` from `averageDealSize`. Additive dashboard sections/actions (Stage 13). New pages: `/watch`, `/portfolio`, `/lenses`, event-page replay. Verified with fixture two-scan sequences — no key/spend.

**Tech Stack:** unchanged (Next.js 15 / TS / Prisma-SQLite / Vitest). Baseline: **211 tests, HEAD fe593b5**.

**Spec:** `docs/superpowers/specs/2026-07-03-phase-3f-watch-portfolio-replay-design.md`.

## Global Constraints
- Working dir: `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight`.
- **Additive only:** no existing route/section/pipeline/test regresses. The ONLY intentional behaviour change is the `averageDealSize` weighting (Task 4) — the default-lens path (no `averageDealSize`) MUST stay at `0.5` so existing scored cards are byte-compatible; prove it with a test.
- **Deterministic + honest:** momentum/decay/freshness are pure functions; GraphEvents recorded ONLY for changes that actually occurred (compare current DB state vs the last recorded GraphEvent); replay reflects recorded history only — never fabricate a formation timeline.
- Reuse `freshness()` from `@/server/graph/builder` for ageing/decay; reuse the interrogation classifier for watch-market scope matching; SQLite has no case-insensitive `mode` — fetch-then-filter-in-JS.
- String enums in `src/shared/enums.ts`; `*Json` String columns; no `*Json` leak in APIs; files < 500 lines; en-GB; GBP. Non-advisory guard (3a) applies to any generated copy; SR10/SR11 register locks apply to copy.
- Full suite green + `npm run typecheck` + `npm run build` clean before each commit; commit messages as given.

---

### Task 1: Migration — watch/portfolio/replay models + enums

**Files:** Modify `prisma/schema.prisma`, `src/shared/enums.ts`, `src/server/seed.ts`, `tests/helpers.ts`; Test: `tests/schema.test.ts` (+cases), `tests/seed.test.ts` (+case).

**Interfaces:** `WatchMarket`, `OpportunityPortfolioItem`, `GraphSnapshot`, `GraphEvent` models; enums `PORTFOLIO_STATUSES`(8), `GRAPH_EVENT_TYPES`(10), `GRAPH_SNAPSHOT_TYPES`(3).

- [ ] **Step 1: Enums** — append to `src/shared/enums.ts`:
```ts
export const PORTFOLIO_STATUSES = ['NEW','INVESTIGATING','QUALIFIED','REJECTED','ACTING','WON','LOST','WATCHING'] as const
export type PortfolioStatus = (typeof PORTFOLIO_STATUSES)[number]

export const GRAPH_EVENT_TYPES = [
  'FIRST_DETECTED','NEW_SOURCE','CLAIM_REPEATED','SIGNAL_STRENGTHENED','CONTRADICTION_DETECTED',
  'OPPORTUNITY_GENERATED','CONFIDENCE_ROSE','CONFIDENCE_FELL','EVENT_COOLED','EVENT_ESCALATED',
] as const
export type GraphEventType = (typeof GRAPH_EVENT_TYPES)[number]

export const GRAPH_SNAPSHOT_TYPES = ['EVENT_FORMATION','CURRENT_STATE','MANUAL'] as const
export type GraphSnapshotType = (typeof GRAPH_SNAPSHOT_TYPES)[number]
```

- [ ] **Step 2: Schema** — append models to `prisma/schema.prisma`:
```prisma
model WatchMarket {
  id            String   @id @default(cuid())
  name          String   @unique
  description   String?
  sectorsJson   String   @default("[]")
  regionsJson   String   @default("[]")
  themesJson    String   @default("[]")
  queryTermsJson String  @default("[]")
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model OpportunityPortfolioItem {
  id                 String          @id @default(cuid())
  opportunityCardId  String          @unique
  opportunityCard    OpportunityCard @relation(fields: [opportunityCardId], references: [id])
  status             String          @default("NEW")
  estimatedValue     String?
  owner              String?
  nextAction         String?
  deadline           DateTime?
  evidenceStrength   Float           @default(0)
  buyerClarity       Float           @default(0)
  confidenceMovement Float           @default(0)
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt
}

model GraphSnapshot {
  id           String   @id @default(cuid())
  snapshotType String
  rootNodeId   String
  nodesJson    String   @default("[]")
  edgesJson    String   @default("[]")
  createdAt    DateTime @default(now())
}

model GraphEvent {
  id               String   @id @default(cuid())
  graphNodeId      String
  eventCandidateId String?
  eventType        String
  description      String
  occurredAt       DateTime @default(now())
  metadataJson     String   @default("{}")

  @@index([graphNodeId, occurredAt])
}
```
Add the back-relation to `model OpportunityCard`: `portfolioItem OpportunityPortfolioItem?`.

- [ ] **Step 3: Migrate** — `npx prisma migrate dev --name phase3f_watch_portfolio_replay` (genuine BLOCKED if AI-guarded — report, don't widen consent).

- [ ] **Step 4: Seed** — in `runSeed`, upsert one sample `WatchMarket` (upsert on `name`), e.g. `{ name:'Lithium supply chain', sectors:['Mining','EV','Battery Storage'], regions:['Australia','Chile'], themes:['supply chain'], queryTerms:['lithium'], active:true }` (JSON.stringify the arrays). Return value shape unchanged.

- [ ] **Step 5: resetDb** — FK-safe deletes in `tests/helpers.ts`: `prisma.opportunityPortfolioItem.deleteMany()` BEFORE `opportunityCard.deleteMany()`; `graphEvent.deleteMany()`, `graphSnapshot.deleteMany()`, `watchMarket.deleteMany()` (no inbound FK — anywhere).

- [ ] **Step 6: Tests** — `schema.test.ts`: create a WatchMarket (assert `name` unique rejects a dupe); create an OpportunityPortfolioItem linked to a card (assert `@unique(opportunityCardId)` rejects a second item for the same card); create a GraphEvent + GraphSnapshot (assert round-trip of the `*Json` fields). `seed.test.ts`: assert ≥1 `WatchMarket` seeded with `active=true`.

- [ ] **Step 7: Verify + commit** — `npm test`, `npm run typecheck` clean.
```bash
git add -A && git commit -m "feat(3f): migration — watch market / opportunity portfolio / graph snapshot + event models + enums"
```

---

### Task 2: Watch Markets + Opportunity Portfolio services + APIs

**Files:** Create `src/server/watch/service.ts`, `src/server/portfolio/service.ts`, `src/app/api/watch/route.ts` (+ `[id]`), `src/app/api/portfolio/route.ts` (+ `[id]`); Modify the 3d playbook "Save to portfolio" stub site (grep `save to portfolio`/`portfolio` under `src/app/opportunities` + `src/components` + `src/server/playbook` — read it first, then wire it to `addToPortfolio`). Test: `tests/watch/service.test.ts`, `tests/portfolio/service.test.ts`, `tests/api/watch-portfolio-api.test.ts`.

**Interfaces:**
- `watch/service.ts`: `createWatchMarket(input)`, `listWatchMarkets()`, `getWatchMarket(id)`, `updateWatchMarket(id, patch)`, `deleteWatchMarket(id)`; `resolveWatchMarket(id): Promise<{ market; events; opportunities }>` — match the saved scope (sectors/regions/themes/queryTerms) against existing `EventCandidate`/`OpportunityCard` via case-insensitive JS filtering + the interrogation classifier for term matching; empty scope → empty arrays (NEVER fabricated). `*Json` parsed in, never leaked raw out.
- `portfolio/service.ts`: `addToPortfolio(opportunityCardId): Promise<OpportunityPortfolioItem>` — load the card; `evidenceStrength = card.evidenceScore`, `buyerClarity = card.actionabilityScore` (or `(actionability+confidence)/2`), `confidenceMovement = 0` (no history yet — Task 3's timeline can enrich later), `status='NEW'`; upsert on `opportunityCardId` (re-add returns the existing item, idempotent). `updatePortfolioItem(id, { status?, owner?, nextAction?, deadline?, estimatedValue? })` (validate `status` ∈ PORTFOLIO_STATUSES). `listPortfolio(filter?)`. All serialized (no raw `*Json`).
- Routes: `GET/POST /api/watch`, `GET/PATCH/DELETE /api/watch/[id]` (+ `GET /api/watch/[id]?resolve=1`); `GET/POST /api/portfolio`, `PATCH /api/portfolio/[id]`. Follow the existing `src/app/api/*` route pattern.
- Wire the 3d **"Save to portfolio"** stub → `POST /api/portfolio` with the card id (replace the stub link/handler).

- [ ] **Step 1: Failing tests.**
  `watch/service.test.ts`: create → list → update → delete round-trip; `resolveWatchMarket` on a scope matching a seeded event returns that event, and an empty-scope market returns empty arrays (no fabrication).
  `portfolio/service.test.ts`: `addToPortfolio(card)` creates an item with status NEW + evidenceStrength/buyerClarity from the card; re-adding the same card is idempotent (count stays 1); `updatePortfolioItem` to QUALIFIED persists; an invalid status is rejected.
  `api/watch-portfolio-api.test.ts`: `POST /api/watch` creates; `POST /api/portfolio` from a card id returns the item; `PATCH /api/portfolio/[id]` updates status; 404 unknown ids.
  Run → RED.
- [ ] **Step 2: Implement** the services, routes, and the stub wiring.
- [ ] **Step 3: Verify + commit** — `npm test`, `npm run typecheck`.
```bash
git add -A && git commit -m "feat(3f): watch-market + opportunity-portfolio services, APIs, and save-to-portfolio wiring"
```

---

### Task 3: Graph replay + momentum / confidence-decay tracking

**Files:** Create `src/server/graph/timeline.ts` (GraphEvent recording + snapshot capture + replay read), `src/server/graph/momentum.ts` (pure scorers); Modify `src/server/pipeline/orchestrator.ts` (call the recorder after `syncGraphForEvents`); Test: `tests/graph/timeline.test.ts`, `tests/graph/momentum.test.ts`.

**Interfaces:**
- `momentum.ts` (PURE, hand-verify every formula in the plan; no DB):
  - `const MOMENTUM_WINDOW_DAYS = 21`, `MOMENTUM_SCALE = 4`.
  - `POSITIVE = ['NEW_SOURCE','SIGNAL_STRENGTHENED','CONFIDENCE_ROSE','OPPORTUNITY_GENERATED','EVENT_ESCALATED','CLAIM_REPEATED']`, `NEGATIVE = ['CONFIDENCE_FELL','EVENT_COOLED','CONTRADICTION_DETECTED']` (FIRST_DETECTED is neutral).
  - `momentumScore(events: {eventType; occurredAt: Date}[], now: Date): number` — for each event `d = daysBetween(now, occurredAt)`, `w = max(0, 1 - d/MOMENTUM_WINDOW_DAYS)`; contribution `+w` if POSITIVE, `-w` if NEGATIVE, else 0; `raw = Σ contributions`; return `clamp01(0.5 + raw / MOMENTUM_SCALE)`.
  - `confidenceDecay(lastSupportingAt: Date | null, now: Date): number` = `1 - freshness(lastSupportingAt, now)` (0 fresh → ~0.9 stale; reuse builder `freshness`). `decayedConfidence(base, lastSupportingAt, now) = base * freshness(lastSupportingAt, now)`.
- `timeline.ts`:
  - `recordGraphEvents(events: EventCandidate[], now: Date): Promise<{ recorded: number }>` — for each event: find its EVENT `GraphNode` (refType `event`); load the LAST recorded `GraphEvent` for that node (the prior recorded state in `metadataJson`: `{confidence, status, sourceCount, contradictionCount, opportunityCount}`). Compare to the CURRENT persisted state and append a GraphEvent per real change: `FIRST_DETECTED` (no prior GraphEvent), `NEW_SOURCE` (sourceCount ↑), `CONFIDENCE_ROSE`/`CONFIDENCE_FELL` (signed confidence delta beyond an epsilon, e.g. 0.01), `EVENT_ESCALATED`/`EVENT_COOLED` (status → ESCALATED / DECLINING|DISMISSED), `CONTRADICTION_DETECTED` (contradictionCount ↑), `OPPORTUNITY_GENERATED` (opportunityCount ↑). Each recorded change event's `metadataJson` carries the CURRENT full state `{confidence, status, sourceCount, contradictionCount, opportunityCount}`; if NOTHING changed this scan, write NO row (the most-recent GraphEvent's metadata remains the diff baseline for the next scan). Every `eventType` written is one of the 10 GRAPH_EVENT_TYPES — never a synthetic "state" type. Deterministic; only real changes recorded — never a speculative or empty-diff row.
  - Snapshot capture: on `FIRST_DETECTED` → an `EVENT_FORMATION` `GraphSnapshot` of the event node's 1-degree neighbourhood (reuse `getNodeNeighbourhood`); on `EVENT_ESCALATED` → a `CURRENT_STATE` snapshot. Bounded to the neighbourhood.
  - `getEventReplay(eventCandidateId): Promise<{ timeline: GraphEvent[]; snapshots: GraphSnapshot[]; momentum: number; confidenceDecay: number; freshness: number }>` — ordered `occurredAt` timeline + snapshots + computed scores.
- `orchestrator.ts`: after `syncGraphForEvents(allEvents)` (~line 135), `await recordGraphEvents(allEvents, now)`; fold any errors into the scan result’s existing error array; keep it non-fatal (a timeline failure must not fail the scan).

- [ ] **Step 1: Failing tests.**
  `momentum.test.ts` (hand-verified expected values in the plan): a single fresh NEW_SOURCE → momentum > 0.5; a fresh CONTRADICTION_DETECTED → < 0.5; an event with no events → 0.5; events older than MOMENTUM_WINDOW_DAYS contribute 0; `confidenceDecay` fresh → ~0, stale (>30d) → high; `decayedConfidence` shrinks with age.
  `timeline.test.ts` (two-scan sequence on fixtures): first scan records `FIRST_DETECTED` + a formation snapshot; a second scan that raises an event's confidence + adds a source records `CONFIDENCE_ROSE` + `NEW_SOURCE`; an unchanged event records no change event (only the state row); `getEventReplay` returns the ordered timeline + snapshots + scores. Assert no GraphEvent is recorded for a change that didn't happen.
  Run → RED.
- [ ] **Step 2: Implement** per interfaces; keep `recordGraphEvents` non-fatal in the orchestrator.
- [ ] **Step 3: Verify + commit** — `npm test`, `npm run typecheck`.
```bash
git add -A && git commit -m "feat(3f): graph-event timeline recording, formation snapshots, momentum + confidence-decay scoring, event replay"
```

---

### Task 4: RevenueLens CRUD + averageDealSize weighting + dashboard (Stage 13) + UI + docs

**Files:** Create `src/server/lens/service.ts`, `src/app/api/lenses/route.ts` (+ `[id]`), `src/app/lenses/page.tsx`, `src/app/watch/page.tsx`, `src/app/portfolio/page.tsx`, a replay view component (event page + a dashboard "Open graph replay" action), `docs/watch-portfolio-replay.md`; Modify the 3a opportunity scoring (grep `lensValueSignal`/the hardcoded `0.5` under `src/server` — read it first) and `src/app/page.tsx` (dashboard, additive). Test: `tests/lens/service.test.ts`, `tests/pipeline/opportunity.test.ts` (+weighting case), `tests/api/lens-api.test.ts`.

**Interfaces:**
- `lens/service.ts`: `createLens`/`listLenses`/`getLens`/`updateLens`/`deleteLens` (never delete the `isDefault` lens without reassigning default; validate `userType`∈POSITIONING_USER_TYPES, `riskAppetite`∈RISK_APPETITES). Serialized (no raw `*Json`).
- **`lensValueSignal(lens): number`** (the deferred 3a unblock — pure, hand-verify):
  - `parseDealSize(s: string | null): number | null` — strip `£`/`,`/spaces; read the leading number + optional `k`/`m` suffix; for a range ("10k-50k") take the LOW end; return GBP or null if unparseable.
  - bucket: `null → 0.5` (DEFAULT — byte-compatible with the prior hardcoded 0.5); `<10_000 → 0.3`; `10_000..<100_000 → 0.5`; `100_000..<1_000_000 → 0.7`; `≥1_000_000 → 0.9`.
  - Replace the hardcoded `0.5` in the opportunity scoring with `lensValueSignal(lens)`. The default lens (no `averageDealSize`) MUST yield `0.5` → existing scores byte-compatible.
- Routes: `GET/POST /api/lenses`, `GET/PATCH/DELETE /api/lenses/[id]`.
- UI (all SSR-safe — no `typeof window` render branching; the 3c hydration lesson): `/lenses` (list + create/edit/delete form), `/watch` (list + create; resolve view), `/portfolio` (list by status; update status/owner/nextAction/deadline), event-page replay panel (timeline + momentum/decay + snapshots) + a dashboard "Open graph replay" entry. `src/app/page.tsx`: ADD a **Watch Markets** section + the primary actions **Create Revenue Lens**, **Create Watch Market**, **Open graph replay** — additive, existing sections/order preserved (Stage 13). FixtureBadge where fixture-derived.
- `docs/watch-portfolio-replay.md`: the models, the watch-market scope-matching, the portfolio lifecycle, the timeline/momentum/decay formulas (with the constants), replay, and the `averageDealSize` weighting bands + how the default path stays 0.5.

- [ ] **Step 1: Failing tests.**
  `lens/service.test.ts`: CRUD round-trip; deleting the default lens without reassignment is refused; `lensValueSignal` bands — null/no-averageDealSize → 0.5, "£5k" → 0.3, "£50k" → 0.5, "£250k" → 0.7, "£2m" → 0.9, "10k-50k" → 0.5.
  `pipeline/opportunity.test.ts` (+case): a card scored under a lens with `averageDealSize='£2m'` has a higher `commercialValueScore` than the same card under the default lens; the default-lens score equals the pre-change baseline (byte-compatible).
  `api/lens-api.test.ts`: CRUD via routes; 404 unknown id.
  Run → RED.
- [ ] **Step 2: Implement** the service, weighting, routes, pages, dashboard additions.
- [ ] **Step 3: Docs** — write `docs/watch-portfolio-replay.md`.
- [ ] **Step 4: Verify + commit** — `npm test`, `npm run typecheck`, `npm run build` (new routes listed). Controller does CDP browser verification of `/lenses`, `/watch`, `/portfolio`, the replay panel, and the restructured dashboard.
```bash
git add -A && git commit -m "feat(3f): revenue-lens CRUD + averageDealSize weighting + watch/portfolio/replay UI + dashboard restructuring + docs"
```

---

## Plan Self-Review Notes
- Spec §3 models+enums ↔ T1; §4 watch+portfolio ↔ T2; §5 replay+momentum ↔ T3; §6 lens CRUD+weighting + §7 dashboard ↔ T4. §8 additivity/determinism verified across all (default-lens byte-compat test; GraphEvents only for real changes; empty states honest).
- Scoring (hand-verify): T3 momentum/decay formulas + T4 averageDealSize bands have exact constants + expected test values; both are pure functions with unit tests.
- Additive/determinism: T3 recorder is non-fatal in the orchestrator + only records real diffs; T4 default-lens path proven byte-compatible; no LLM/provider/key; en-GB; GBP.
- Integration reads (implementers must read before editing): T2 the 3d save-to-portfolio stub; T3 `orchestrator.ts` around the `syncGraphForEvents` call + `getNodeNeighbourhood`; T4 the hardcoded `lensValueSignal`/`0.5` in the opportunity scoring + `src/app/page.tsx` dashboard structure.
- SR2/SR9: T3 changes `orchestrator.ts` (shared) — verify the scan result shape/consumers unchanged; T4 changes opportunity scoring (shared) — verify all consumers + the default byte-compat.
- Deferred (not gaps): watch-market alerts/notifications (Phase 2b territory), LLM replay narration (needs LLM active), snapshot-every-scan (bounded to formation/escalation), multi-user portfolio ownership.
```
