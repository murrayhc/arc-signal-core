# Watch Markets, Opportunity Portfolio, and Graph Replay

Date: 2026-07-03
Scope: Revenue Lens CRUD + `averageDealSize` commercial-value weighting, Watch
Markets, the Opportunity Portfolio, and the graph-event replay/momentum/decay
layer (Stage 13 of the intelligence-radar upgrade). Covers the models, the
watch-market scope-matching rule, the portfolio lifecycle, the
timeline/momentum/decay formulas and constants, replay, and the
`averageDealSize` weighting bands.

## Models

### RevenueLens

`prisma/schema.prisma` (`RevenueLens`). A lens shapes how an
`EventCandidate` is converted into an `OpportunityCard` (`scoreOpportunity`
in `src/server/pipeline/opportunity.ts`) and how strategic positioning is
generated. Exactly one lens may have `isDefault: true` at a time.

| Field | Type | Notes |
|---|---|---|
| `name` | string (unique) | |
| `description` | string? | |
| `userType` | string | one of `POSITIONING_USER_TYPES` (`src/shared/enums.ts`), default `GENERAL` |
| `targetSectorsJson` / `targetRegionsJson` / `offerTypesJson` / `buyerPersonasJson` / `excludedSectorsJson` | string (JSON array) | serialized to `string[]` at the service boundary — never leaked raw |
| `averageDealSize` | string? | free-text GBP deal-size band, e.g. `"£50k"`, `"£10k-£50k"` — feeds `lensValueSignal` (below) |
| `salesCycle` | string? | free text, informational only |
| `riskAppetite` | string | one of `RISK_APPETITES` (`LOW`/`MEDIUM`/`HIGH`), default `MEDIUM` |
| `active` | boolean | default `true` |
| `isDefault` | boolean | default `false`; single-default invariant enforced in the service (below) |

Service: `src/server/lens/service.ts` — `createLens` / `listLenses` /
`getLens` / `updateLens` / `deleteLens`. `userType` and `riskAppetite` are
validated against the shared enums (`InvalidLensFieldError` on a bad value).

**Single-default invariant.** Creating or updating a lens with
`isDefault: true` clears `isDefault` on every other lens first, inside the
same transaction as the write, so the database can never hold two default
lenses at once.

**Deletion guard.** `deleteLens` refuses to delete the current default lens
(`DefaultLensDeletionError`, surfaced by the API as `409`). The caller must
make another lens the default first (`updateLens(otherId, { isDefault: true
})`), which — by the invariant above — clears the old lens's `isDefault`
flag and unblocks its deletion. The `/lenses` UI surfaces this directly: the
Delete button on the default lens is disabled with an explanatory tooltip,
and attempting the API call anyway surfaces the service's error message.

Routes: `GET/POST /api/lenses`, `GET/PATCH/DELETE /api/lenses/[id]`.

### WatchMarket

`prisma/schema.prisma` (`WatchMarket`). A watch market is a saved scope —
sectors, regions, themes, free-text query terms — tracked ahead of a
fully-formed opportunity, independent of any single `EventCandidate`.

| Field | Type | Notes |
|---|---|---|
| `name` | string (unique) | |
| `description` | string? | |
| `sectorsJson` / `regionsJson` / `themesJson` / `queryTermsJson` | string (JSON array) | serialized to `string[]` at the service boundary |
| `active` | boolean | default `true` |

Service: `src/server/watch/service.ts` — `createWatchMarket` /
`listWatchMarkets` / `getWatchMarket` / `updateWatchMarket` /
`deleteWatchMarket` / `resolveWatchMarket`.

Routes: `GET/POST /api/watch`, `GET/PATCH/DELETE /api/watch/[id]`,
`GET /api/watch/[id]?resolve=1`.

#### Scope-matching (`resolveWatchMarket`)

SQLite has no case-insensitive `mode`, so this fetches all `EventCandidate`
rows and filters in JS (the same convention `src/server/interrogate/service.ts`
already uses). An event matches the market if **any** of:

- its `affectedSector` case-insensitively equals one of the market's `sectors`;
- its `affectedRegion` case-insensitively equals one of the market's `regions`;
- any of the market's `themes` **or** `queryTerms` (concatenated — there is
  no dedicated theme column on `EventCandidate` to compare against) appears
  case-insensitively as a substring of `"{title} {summary}"`.

Matched events' `OpportunityCard`s are flattened into the `opportunities`
list. **An empty scope (no sectors/regions/themes/queryTerms) never
fabricates a match** — it returns `{ events: [], opportunities: [] }` even if
events exist in the database.

### OpportunityPortfolioItem

`prisma/schema.prisma` (`OpportunityPortfolioItem`). Tracks one saved
`OpportunityCard` through a manual follow-up lifecycle. `opportunityCardId`
is `@unique` — at most one portfolio item per card.

| Field | Type | Notes |
|---|---|---|
| `opportunityCardId` | string (unique) | FK to `OpportunityCard` |
| `status` | string | one of `PORTFOLIO_STATUSES` (below), default `NEW` |
| `estimatedValue` | string? | free-text GBP, set via the PATCH route |
| `owner` | string? | free text |
| `nextAction` | string? | free text |
| `deadline` | DateTime? | |
| `evidenceStrength` | float | seeded once from `card.evidenceScore` on first add |
| `buyerClarity` | float | seeded once from `card.actionabilityScore` on first add |
| `confidenceMovement` | float | starts at `0` — no confidence history at add time; the graph timeline (below) can enrich this later |

`PORTFOLIO_STATUSES` (`src/shared/enums.ts`): `NEW`, `INVESTIGATING`,
`QUALIFIED`, `REJECTED`, `ACTING`, `WON`, `LOST`, `WATCHING`.

Service: `src/server/portfolio/service.ts` — `addToPortfolio` /
`getPortfolioItem` / `updatePortfolioItem` / `listPortfolio`.

**Lifecycle.**

1. **Add** (`addToPortfolio`, `POST /api/portfolio { opportunityCardId }`,
   or the "Save to portfolio" button on `/opportunities/[id]`) — **idempotent**
   on `opportunityCardId`: re-adding the same card returns the existing item
   unchanged (its `status` is not reset to `NEW`, scores are not
   recomputed). The API returns `201` on first add, `200` on a repeat add.
   Throws `PortfolioCardNotFoundError` (surfaced as `404`) for an unknown
   card id.
2. **Update** (`updatePortfolioItem`, `PATCH /api/portfolio/[id]`, or the
   `/portfolio` page's inline edit form) — any of `status` / `owner` /
   `nextAction` / `deadline` / `estimatedValue`. An invalid `status` throws
   `InvalidPortfolioStatusError` (surfaced as `400`) and leaves the row
   unchanged.
3. **List** (`listPortfolio`, `GET /api/portfolio?status=...`) — all items,
   optionally filtered to one status; the `/portfolio` page uses this to
   drive its status-filter chips (mirroring the dashboard inbox's filter
   pattern).

## Graph replay: timeline, momentum, confidence decay

`src/server/graph/timeline.ts` and `src/server/graph/momentum.ts`
(Task 3). Every `EventCandidate` that has been graph-synced
(`syncGraphForEvents`) accumulates an ordered `GraphEvent` timeline —
written by `recordGraphEvents`, called after `syncGraphForEvents` in the scan
orchestrator, **never fatal**: per-event failures are collected as
`PipelineError`s so a timeline failure never fails the scan.

### GraphEvent

`prisma/schema.prisma` (`GraphEvent`). One row per **real, detected state
change** — nothing is ever written speculatively, and if nothing changed
since the last recorded event, nothing is written this pass.

| `eventType` (`GRAPH_EVENT_TYPES`) | Written when |
|---|---|
| `FIRST_DETECTED` | no prior `GraphEvent` exists for this node |
| `NEW_SOURCE` | the evidence-chain source count increased |
| `CONFIDENCE_ROSE` / `CONFIDENCE_FELL` | `confidence` delta exceeds ±0.01 (`CONFIDENCE_EPSILON`, floors out float noise) |
| `CONTRADICTION_DETECTED` | the 1-degree neighbourhood's `CONTRADICTS` edge count increased |
| `OPPORTUNITY_GENERATED` | the event's `OpportunityCard` count increased |
| `EVENT_ESCALATED` / `EVENT_COOLED` | `status` changed into `ESCALATED`, or into `DECLINING`/`DISMISSED` |

`recordGraphEvents` also captures a bounded (1-degree neighbourhood)
`GraphSnapshot` on `FIRST_DETECTED` (`snapshotType: EVENT_FORMATION`) and on
`EVENT_ESCALATED` (`snapshotType: CURRENT_STATE`) — not on every scan, only
at those two structurally meaningful points.

### Momentum (`momentumScore`, `src/server/graph/momentum.ts`)

Pure function, `[0, 1]`, centred on **0.5 = neutral (no signal)**. Each
`GraphEvent` contributes a recency-weighted `+1`/`-1`/`0`:

- **Positive** types (`NEW_SOURCE`, `SIGNAL_STRENGTHENED`, `CONFIDENCE_ROSE`,
  `OPPORTUNITY_GENERATED`, `EVENT_ESCALATED`, `CLAIM_REPEATED`) contribute
  `+weight`.
- **Negative** types (`CONFIDENCE_FELL`, `EVENT_COOLED`,
  `CONTRADICTION_DETECTED`) contribute `-weight`.
- Everything else (notably `FIRST_DETECTED`, deliberately) contributes `0`
  — first detection is neutral, not a positive signal.

The per-event weight decays linearly from `1` (occurring right now) to `0`
at **`MOMENTUM_WINDOW_DAYS = 21`** days old; anything older contributes
nothing. The summed weighted contribution is divided by
**`MOMENTUM_SCALE = 4`** and added to the `0.5` baseline, then clamped to
`[0, 1]`:

```
momentum = clamp01(0.5 + Σ(±weight) / MOMENTUM_SCALE)
weight(event) = max(0, 1 − daysSince(event) / MOMENTUM_WINDOW_DAYS)
```

The `ReplayPanel` UI labels `momentum > 0.6` as **Rising**, `< 0.4` as
**Cooling**, otherwise **Neutral**.

### Confidence decay and freshness

`confidenceDecay(lastSupportingAt, now) = 1 − freshness(lastSupportingAt,
now)`. `freshness` (`src/server/graph/builder.ts`, reused rather than
duplicated) is `1` for evidence within 3 days, decaying linearly to `0.1` by
30 days, floored at `0.1` beyond that; a `null` date (unknown recency) scores
a fixed `0.3` (→ `0.7` decay). `decayedConfidence(base, lastSupportingAt,
now) = base * freshness(...)` applies the same factor directly to a
confidence value, never exceeding `base`.

### Replay (`getEventReplay`)

`getEventReplay(eventCandidateId, now = new Date())` returns:

```ts
type EventReplay = {
  timeline: GraphEvent[]       // ordered oldest -> newest
  snapshots: GraphSnapshot[]   // ordered oldest -> newest
  momentum: number             // momentumScore(timeline, now)
  confidenceDecay: number      // confidenceDecay(last event's occurredAt, now)
  freshness: number            // freshness(last event's occurredAt, now)
}
```

Returns `null` if the event has never been graph-synced (no `EVENT`
`GraphNode`) or has no recorded timeline yet. Rendered by
`src/components/ReplayPanel.tsx` — a **server component** (no client fetch,
no `typeof window` branching) mounted directly on `/events/[id]#graph-replay`.
The dashboard's **"Open graph replay"** action and the opportunity page's
**"Open graph replay"** link both jump straight to that anchor; the
dashboard defaults to the most recently updated inbox event when no single
event is already in view, falling back to `/graph` if the inbox is empty.

## `averageDealSize` commercial-value weighting

The deferred 3a unblock. `scoreOpportunity` (`src/server/pipeline/opportunity.ts`)
previously used a hardcoded `0.5` placeholder for the deal-size component of
`commercialValueScore`. That placeholder is now `lensValueSignal(lens)`
(`src/server/lens/service.ts`), and **the default (no-lens / no-`averageDealSize`)
path is proven byte-compatible** — see the Byte-compatibility section below.

### `parseDealSize`

```ts
parseDealSize(s: string | null | undefined): number | null
```

Strips `£`, `,` and spaces; reads the leading number with an optional
`k`/`m` suffix (`×1,000` / `×1,000,000`); for a range (e.g. `"10k-50k"`)
takes the **low** end only, discarding everything after the first `-`.
Never throws — any unparseable shape (`null`, empty, non-numeric) returns
`null`.

### `lensValueSignal`

```ts
lensValueSignal(lens: { averageDealSize: string | null } | null): number
```

| `parseDealSize(lens.averageDealSize)` | Band | Signal |
|---|---|---|
| `null` lens, or `null`/unparseable `averageDealSize` | **DEFAULT** | **0.5** |
| `< £10,000` | small | 0.3 |
| `£10,000 – < £100,000` | mid-market | 0.5 |
| `£100,000 – < £1,000,000` | large | 0.7 |
| `≥ £1,000,000` | major/strategic | 0.9 |

Note the mid-market band and the default band both resolve to `0.5` — that
is intentional, not a bug: `0.5` was already the exact hardcoded placeholder
this replaces, so the "no meaningful signal" case and the "known
mid-market deal" case land on the same neutral value.

### Byte-compatibility

`commercialValueScore` is computed as:

```
commercialValueScore = clamp01(
  0.5 * max(riskScore, opportunityScore) + 0.3 * lensValueSignal(lens) + 0.2 * urgencyScore
)
```

Because `lensValueSignal(null) === 0.5` and `lensValueSignal({ isDefault:
true, averageDealSize: null }) === 0.5` — the exact prior hardcoded
constant — every opportunity card scored under a `null` lens or the default
lens (no `averageDealSize` set) produces **the identical
`commercialValueScore`** it would have produced before this weighting
existed. Proven by
`tests/pipeline/opportunity.test.ts` ("byte-compatible: a null lens produces
the same commercialValueScore as the pre-3f-4 hardcoded 0.5" and "byte-
compatible: a default lens ... scores identically to a null lens"). A lens
with a large `averageDealSize` (e.g. `£2m`) raises `commercialValueScore`
above the default-lens score; a small `averageDealSize` (e.g. `£5k`) lowers
it below — also covered by dedicated tests in the same file.

## UI surfaces

| Route | Purpose |
|---|---|
| `/lenses` | List/create/edit/delete Revenue Lenses; the default-lens delete guard is surfaced directly (disabled button + explanatory error) |
| `/watch` | List/create/delete Watch Markets; per-market "Resolve" button renders matched events/opportunities inline |
| `/portfolio` | List portfolio items filterable by status; inline edit for status/owner/nextAction/deadline |
| `/events/[id]#graph-replay` | The `ReplayPanel` — timeline, momentum/decay/freshness, captured snapshots |
| `/opportunities/[id]` | Adds "Save to portfolio" (`POST /api/portfolio`) and an "Open graph replay" link to the source event |
| `/` (dashboard) | Adds a **Watch Markets** section (additive, after the existing event-derived sections) and three primary actions: **Create revenue lens**, **Create watch market**, **Open graph replay** |

All list/detail UI components are additive and SSR-safe: server components
fetch data directly (`getEventReplay`, `listLenses`, `listWatchMarkets`,
`listPortfolio`) and pass it as props; client components (`LensManager`,
`WatchMarketManager`, `PortfolioManager`, `SaveToPortfolioButton`) hold no
render-time `typeof window`/`document` branching — they seed local state
from server-fetched props and only touch the network from event handlers
(`onClick`/`onSubmit`), the same pattern already used by `RunScanButton`,
`EventActions`, and `OpportunityActions`.
