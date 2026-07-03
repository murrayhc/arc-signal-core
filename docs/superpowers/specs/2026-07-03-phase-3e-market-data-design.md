# Archlight Phase 3e — Market / Commodity / Instrument Data Adapters: Design

Date: 2026-07-03
Status: Approved direction (owner: deterministic-phases-first; paid providers built
DORMANT behind clean "not configured" states, activated later by the owner).
Implements upgrade **Stage 8** (market, commodity and instrument data adapters).
Predecessors: spine + 2a + 3a + 3b + 3c + 3d (168 tests, HEAD 825cdce).

## 1. Goal & core principle

Support manual interrogation of commodities, financial instruments and share
prices through **compliant provider APIs only** — never by scraping market pages.
Like the 3d LLM layer, this is built **DORMANT**: with no provider configured
(no `MARKET_DATA_API_KEY`), the whole layer returns a clean "market data provider
not configured" empty state and nothing is invented. Adding provider env vars
activates real lookups. Fully buildable/testable with **no key and no spend**
(an injectable `FakeMarketProvider` drives the configured paths in tests).

Market output is **CONTEXT only** — the non-advisory guard from 3a applies to
every rendered market summary. No buy/sell/hold, no price targets, no
personal-investment framing (see §2). Live prices (quotes/bars) come **only**
from a configured provider; the app never fabricates a price.

## 2. Non-negotiable rules (from the doc, Stage 8 + interrogation Stage 7)

1. Provider configured through **environment variables** only; API key never logged/committed.
2. Store provider **name**, **retrieval timestamp**, and **delayed-data status** on every fetched record.
3. **No provider → clear empty state** (dormant-honest; the existing `marketContextAvailable=false` disclaimer path is the default and stays byte-compatible).
4. **Do not present market data as personal advice.** Allowed instrument output: instrument profile, price context (as provided), public events, sector signals, contradictions, commodity exposure, a market-context summary. Disallowed: buy/sell/hold, price targets, "returns" claims, position sizing — all caught by `assertNoAdviceLanguage`.
5. **Do not mix stale market data with fresh event data without labelling it** — market records carry `provider` + `lastFetchedAt` + `delayed`; seeded reference profiles carry `isFixture` and render the existing FixtureBadge.
6. Respect provider terms; **provider APIs only, never scrape.**
7. Additive only: no existing route/section/pipeline behaviour regresses; the dormant path is the current behaviour.

## 3. New models (Prisma; `*Json` String columns, cuid ids, matches house style)

- `MarketSearchQuery` — id, query, queryType (a `QueryType`), resultCount (Int @default 0), createdAt. (Single-user local app; `userId/workspaceId` from the doc omitted until multi-tenant — noted, not invented.)
- `MarketSearchResult` — id, queryId (FK → MarketSearchQuery), resultType (a `MarketResultType`), title, summary, confidence (Float), refType (String, e.g. `instrument`/`commodity`), refId (String?), graphSnapshotId (String?, plain nullable column — GraphSnapshot is formalised in 3f; forward-compatible, no premature FK), createdAt.
- `InstrumentProfile` — id, provider (String), symbol (String), name, exchange (String?), instrumentType (an `InstrumentType`), currency (String — the instrument's **native** trading currency, factual; the app's own monetary framing stays GBP), delayed (Boolean @default true), metadataJson, lastFetchedAt (DateTime), isFixture (Boolean @default false), createdAt, updatedAt. `@@unique([provider, symbol])` (upsert on refetch).
- `CommodityProfile` — id, provider (String?), name (String), symbol (String?), category (a `CommodityCategory`), keySupplyRegionsJson, keyDemandSectorsJson, metadataJson, delayed (Boolean @default true), lastFetchedAt (DateTime?), isFixture (Boolean @default false), createdAt, updatedAt. `@@unique([name])`.

Live **quotes** and **historical bars** are returned transiently by the provider
(typed, validated) and rendered/charted — **not persisted as models** (they are
time-sensitive; the doc's suggested records do not include them). Only reference
profiles + search history persist.

### Enums (append to `src/shared/enums.ts`; string enums, house rule)
- `MARKET_RESULT_TYPES`: `INSTRUMENT`, `COMMODITY`, `COMPANY`, `NONE`.
- `INSTRUMENT_TYPES`: `EQUITY`, `ETF`, `INDEX`, `FX`, `FUTURE`, `BOND`, `CRYPTO`, `UNKNOWN`.
- `COMMODITY_CATEGORIES`: `METAL`, `ENERGY`, `AGRICULTURE`, `LIVESTOCK`, `INDUSTRIAL`, `OTHER`.
- `MARKET_PROVIDER_STATUSES`: `CONFIGURED`, `NOT_CONFIGURED`.
- (`NODE_TYPES.COMMODITY/INSTRUMENT`, `QUERY_TYPES.COMMODITY/INSTRUMENT/TICKER/SHARE_PRICE`, `EDGE_TYPES.PRICED_BY/SUPPLIED_BY/DEPENDS_ON/LINKED_TO/AFFECTS`, `LLM_TASK_TYPES.MARKET_CONTEXT_SYNTHESIS` already exist — reused, not re-added.)

## 4. Provider abstraction & dormancy (`src/server/market/provider.ts`)

Mirrors 3d exactly:

- `interface MarketDataProvider` with `name`, `getProviderMetadata()`, `searchInstrument(query)`, `getQuote(identifier)`, `getHistoricalBars(identifier, range)`, `getCompanyProfile(identifier)`, `getCommodityContext(identifier)`. Every method returns typed data validated by a Zod schema at the boundary (external data is untrusted, exactly like LLM output).
- `class NullProvider` — the only provider shipped now; every data method throws `NoMarketProviderConfiguredError` (or returns a not-configured sentinel). Real adapters (Polygon/AlphaVantage/etc.) are **owner-funded, added later**, and register by provider name.
- `getActiveMarketProvider(): MarketDataProvider | null` — returns a registered real provider **only if** `MARKET_DATA_PROVIDER` names a registered adapter **and** `MARKET_DATA_API_KEY` is set; else `null` (dormant). Injectable (default resolves from env) so tests pass a `FakeMarketProvider`.
- `getMarketStatus(): { status: MarketProviderStatus; provider: string | null; delayed: boolean }` — dormant-honest; never leaks the key.

## 5. Market service & graph projection (`src/server/market/`)

- `service.ts` — `searchMarket(query)` persists a `MarketSearchQuery` + `MarketSearchResult` rows and returns them (dormant → empty results + `NOT_CONFIGURED`); `getInstrumentContext(symbol)` / `getCommodityContext(name)` return a guard-clean context object `{ profile, quote?, delayed, provider, retrievedAt, publicEvents[], sectorSignals[], contradictions[] }` from the configured provider **plus** the existing event-graph evidence for that entity; dormant → `{ configured:false }` + whatever graph evidence exists, no fabricated price. Every rendered summary passes `assertNoAdviceLanguage` before return.
- `graph.ts` (or extend `src/server/services/graph`) — project `InstrumentProfile` → `INSTRUMENT` GraphNode (refType `instrument`), `CommodityProfile` → `COMMODITY` GraphNode (refType `commodity`), upsert-deduped on `(refType, refId)` like every other projection. Edges (only to nodes that already exist): `COMMODITY —SUPPLIED_BY→ REGION`, `COMMODITY —AFFECTS→ SECTOR` (from keySupplyRegions/keyDemandSectors), `INSTRUMENT —LINKED_TO→ COMPANY`/`SECTOR` where a match exists. Projection is **additive and only fires when profiles exist** — existing graph tests (which seed no market profiles) keep their exact node/edge counts; new tests seed market fixtures and assert the new nodes.
- **Honest population:** a small set of clearly-labelled `isFixture=true` **reference** commodity/instrument profiles (static context — name/category/supply-regions/demand-sectors, **no prices**) is seeded so the `COMMODITY`/`INSTRUMENT` node types are demonstrably populated and visible in the graph, each rendering the FixtureBadge. Live prices remain dormant. This is consistent with the app's existing fixture pattern and never presents a fabricated quote.

## 6. Interrogation wiring (`src/server/interrogate/service.ts`)

The current behaviour — market-shaped queries (`TICKER`/`SHARE_PRICE`/`INSTRUMENT`/`COMMODITY`) get `marketContextAvailable=false` + `MARKET_DISCLAIMER` — is the **dormant default and stays intact**. Phase 3e adds:

- `InterrogationResult` gains `marketContext: MarketContext | null` (new optional field — additive to the shared type).
- When `getActiveMarketProvider()` is non-null AND the query is market-shaped: populate `marketContext` from `getInstrumentContext`/`getCommodityContext`, set `marketContextAvailable=true`, and swap `MARKET_DISCLAIMER` for the "public market context, not investment advice" wording (doc line 793). Live data is labelled with provider + retrievedAt + delayed.
- When dormant: `marketContext=null`, `marketContextAvailable=false`, existing disclaimer unchanged — but matched `COMMODITY`/`INSTRUMENT` reference nodes (if any) now legitimately appear in the returned subgraph, and are FixtureBadge-labelled.
- Shared-type change → verify **all** consumers: `InterrogationResults.tsx`, the `/api/interrogate` route, and interrogation tests (SR2/SR9 parity — the verdict states which were checked).

## 7. API + UI

- `GET /api/market/status` → `{ configured: boolean; provider: string | null; delayed: boolean }` (dormant-honest; never leaks the key). Mirrors `/api/llm/status`.
- `GET /api/market/search?q=` → `MarketSearchResult[]` (dormant → `[]` + a not-configured note in the payload).
- `/interrogate` results: the existing `marketContextAvailable=false` block gains a "market data provider not configured" empty state; when configured, a market-context panel (instrument/commodity profile, price context with delayed label, native currency, linked public events/sector signals/contradictions) — all non-advisory.
- `/admin/market` — a read-only status page mirroring `/admin/llm`: provider configuration state, the seeded fixture reference profiles (clearly labelled), and recent market searches. The auditability/honesty surface.
- Docs: `docs/market-data-adapters.md` (interface, env activation, dormancy, safety/allowed-output rules).

## 8. Dormancy & honesty (the acceptance heart)

With no `MARKET_DATA_API_KEY`: `getActiveMarketProvider()` → null; `searchMarket` → empty + `NOT_CONFIGURED`; `getInstrumentContext`/`getCommodityContext` → `{configured:false}` + existing graph evidence only; `/api/market/status` → `configured:false`; `/interrogate` shows the not-configured empty state with the non-advisory disclaimer; `/admin/market` shows "not configured". NOTHING breaks, no price is invented. To ACTIVATE later: register a real adapter, set `MARKET_DATA_PROVIDER` + `MARKET_DATA_API_KEY` (see the doc). Verification is fully deterministic: `FakeMarketProvider` drives the configured search/quote/context paths; no real API call, key, or spend in tests or CI.

## 9. Out of scope (later)
Real provider adapters (owner-funded); live quote/bar persistence & caching;
`GraphSnapshot` FK on `MarketSearchResult` (3f formalises GraphSnapshot);
watch-markets / portfolio / replay (3f); `MARKET_CONTEXT_SYNTHESIS` LLM
enrichment of the market summary (wired only when BOTH the market provider and
the LLM layer are active — the deterministic summary is the default and source
of truth).

## 10. Success criteria
1. With no key: full suite green; every route works; `/api/market/status` says not configured; `/interrogate` market queries show the not-configured empty state + non-advisory disclaimer; no fabricated price anywhere.
2. `MarketDataProvider` interface + `NullProvider` + `getActiveMarketProvider` (env-gated, injectable) — `FakeMarketProvider` exercises configured search/quote/instrument/commodity paths (unit-tested); boundary Zod validation rejects malformed provider data.
3. `COMMODITY`/`INSTRUMENT` graph node types populated from seeded fixture reference profiles, upsert-deduped, FixtureBadge-labelled; existing graph node/edge counts unchanged when no market profiles present.
4. Interrogation: configured path populates `marketContext` + flips `marketContextAvailable` + swaps disclaimer; dormant path byte-identical to today; all shared-type consumers verified.
5. Every rendered market summary is `assertNoAdviceLanguage`-clean (adversarially tested against buy/sell/hold/price-target). Typecheck + build clean; `docs/market-data-adapters.md` written.

## 11. Task breakdown (right-sized; precise code + assertions in the plan)
1. **Migration + enums + fixture seed** — 4 models + 4 enums + a small labelled fixture reference-profile seed. (transcription-heavy → haiku)
2. **Provider abstraction + market service** — interface, NullProvider, dormant resolution, service (search/instrument/commodity/status), Zod boundary validation, advice-guard on summaries; FakeMarketProvider-driven tests. (logic/safety → sonnet)
3. **Graph projection + interrogation wiring** — COMMODITY/INSTRUMENT node+edge projection in graph sync/rebuild; `marketContext` on InterrogationResult; dormant-default preserved; consumer parity. (integration → sonnet)
4. **API + UI + docs** — `/api/market/status`, `/api/market/search`, `/interrogate` market panel + empty state, `/admin/market`, `docs/market-data-adapters.md`. (UI/integration → sonnet)
