# Archlight Phase 3e — Market / Commodity / Instrument Data Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Add market / commodity / instrument data adapters (upgrade Stage 8) built DORMANT: with no `MARKET_DATA_API_KEY` the whole layer returns a clean "market data provider not configured" state and no price is ever invented. Provider APIs only — never scrape. Market output is CONTEXT only; the 3a non-advisory guard applies to every rendered summary. Adding provider env vars activates real lookups; a real adapter is owner-funded later — this phase ships the interface, a `NullProvider`, the dormant resolution, the service, graph population from labelled fixture reference profiles, interrogation wiring, APIs, UI, and docs.

**Architecture:** New models (MarketSearchQuery, MarketSearchResult, InstrumentProfile, CommodityProfile) + 4 enums + a labelled fixture reference-profile seed (no prices). `src/server/market/` = types, provider (`NullProvider`, `getActiveMarketProvider`, `getMarketStatus`), boundary Zod validation, service (`searchMarket`, `getInstrumentContext`, `getCommodityContext`). Graph projection of COMMODITY/INSTRUMENT nodes. Interrogation gains a `marketContext` field (dormant default byte-compatible). `/api/market/status` + `/api/market/search`, an `/interrogate` market panel + not-configured empty state, `/admin/market`, `docs/market-data-adapters.md`. Verified with an injectable `FakeMarketProvider` — no key, no network, no spend.

**Tech Stack:** unchanged (Next.js 15 / TS / Prisma-SQLite / Vitest / Zod already present). Baseline: **168 tests, HEAD 825cdce**.

**Spec:** `docs/superpowers/specs/2026-07-03-phase-3e-market-data-design.md`.

## Global Constraints
- Working dir: `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight`.
- **DORMANT is mandatory:** with no `MARKET_DATA_API_KEY`, everything works, the market layer reports NOT_CONFIGURED, and **no price/quote is ever fabricated**. Tests run with NO key and use an injected `FakeMarketProvider` to exercise configured paths.
- **Provider APIs only — never scrape market pages.** (No real adapter ships this phase; `NullProvider` only. Real adapters register by provider name later.)
- **Market output is CONTEXT only.** Summaries are templated from structured fields and MUST pass `assertNoAdviceLanguage` (`@/server/safety/advice-language`). Disallowed everywhere: buy / sell / hold recommendation, target price, expected return, personal portfolio advice, guaranteed-profit language, personalised financial recommendation. Any provider-supplied free text is run through `findAdviceLanguage` and **omitted if flagged** — never passed through raw.
- **Additive only:** the dormant path IS the current behaviour and must stay byte-compatible — `marketContextAvailable=false` + the existing `MARKET_DISCLAIMER` for market-shaped queries when not configured. New behaviour only activates when a provider is configured.
- **Label market data:** every fetched/seeded record carries `provider` + `lastFetchedAt` + `delayed`; seeded reference profiles carry `isFixture=true` and render the existing FixtureBadge. Never mix live and stale/fixture data unlabelled.
- String enums via `src/shared/enums.ts`; `*Json` String columns; files < 500 lines; no `*Json` leak in APIs; en-GB spelling; **GBP** for the app's own monetary framing (an instrument's `currency` is its factual native trading currency).
- API key via env only, never logged/committed. Full suite green + typecheck + build clean before each commit; commit messages as given.

---

### Task 1: Migration — market models, enums, fixture reference seed

**Files:** Modify `prisma/schema.prisma`, `src/shared/enums.ts`, `src/server/seed.ts`; Test: `tests/schema.test.ts` (+cases), `tests/seed.test.ts` (+case).

**Interfaces:** `MarketSearchQuery`, `MarketSearchResult`, `InstrumentProfile`, `CommodityProfile` models; enums `MARKET_RESULT_TYPES`(4), `INSTRUMENT_TYPES`(8), `COMMODITY_CATEGORIES`(6), `MARKET_PROVIDER_STATUSES`(2); a small labelled fixture reference seed (no prices).

- [ ] **Step 1: Enums** — append to `src/shared/enums.ts`:
```ts
export const MARKET_RESULT_TYPES = ['INSTRUMENT','COMMODITY','COMPANY','NONE'] as const
export type MarketResultType = (typeof MARKET_RESULT_TYPES)[number]

export const INSTRUMENT_TYPES = ['EQUITY','ETF','INDEX','FX','FUTURE','BOND','CRYPTO','UNKNOWN'] as const
export type InstrumentType = (typeof INSTRUMENT_TYPES)[number]

export const COMMODITY_CATEGORIES = ['METAL','ENERGY','AGRICULTURE','LIVESTOCK','INDUSTRIAL','OTHER'] as const
export type CommodityCategory = (typeof COMMODITY_CATEGORIES)[number]

export const MARKET_PROVIDER_STATUSES = ['CONFIGURED','NOT_CONFIGURED'] as const
export type MarketProviderStatus = (typeof MARKET_PROVIDER_STATUSES)[number]
```

- [ ] **Step 2: Schema** — append models to `prisma/schema.prisma`:
```prisma
model MarketSearchQuery {
  id          String               @id @default(cuid())
  query       String
  queryType   String
  resultCount Int                  @default(0)
  createdAt   DateTime             @default(now())
  results     MarketSearchResult[]
}

model MarketSearchResult {
  id              String            @id @default(cuid())
  queryId         String
  query           MarketSearchQuery @relation(fields: [queryId], references: [id])
  resultType      String
  title           String
  summary         String
  confidence      Float             @default(0)
  refType         String            @default("")
  refId           String?
  graphSnapshotId String?
  createdAt       DateTime          @default(now())
}

model InstrumentProfile {
  id             String   @id @default(cuid())
  provider       String
  symbol         String
  name           String
  exchange       String?
  instrumentType String   @default("UNKNOWN")
  currency       String   @default("USD")
  delayed        Boolean  @default(true)
  metadataJson   String   @default("{}")
  lastFetchedAt  DateTime @default(now())
  isFixture      Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([provider, symbol])
}

model CommodityProfile {
  id                   String    @id @default(cuid())
  provider             String?
  name                 String    @unique
  symbol               String?
  category             String    @default("OTHER")
  keySupplyRegionsJson String    @default("[]")
  keyDemandSectorsJson String    @default("[]")
  delayed              Boolean   @default(true)
  metadataJson         String    @default("{}")
  lastFetchedAt        DateTime?
  isFixture            Boolean   @default(false)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
}
```

- [ ] **Step 3: Migrate** — `npx prisma migrate dev --name phase3e_market_data` (if AI-guarded, that's a genuine BLOCKED — report it, do not widen the consent scope).

- [ ] **Step 4: Seed** — in `runSeed` (after existing seeds), upsert a small **labelled fixture reference** set (all `isFixture: true`, `provider: 'FIXTURE'`, **no price/quote**):
  - Commodities (upsert on `name`): `Copper` (METAL; supply ['Chile','Peru','China']; demand ['Construction','Electronics','EV']); `Brent Crude Oil` (ENERGY; supply ['Middle East','North Sea']; demand ['Transport','Energy','Chemicals']); `Wheat` (AGRICULTURE; supply ['Russia','United States','EU']; demand ['Food','Livestock']); `Lithium` (INDUSTRIAL; supply ['Australia','Chile']; demand ['EV','Battery Storage']).
  - Instruments (upsert on `(provider, symbol)`): `{ symbol:'ACME', name:'Acme Industrials (sample)', exchange:'LSE', instrumentType:'EQUITY', currency:'GBP' }`, `{ symbol:'SMPL-ETF', name:'Sample Sector ETF', exchange:'LSE', instrumentType:'ETF', currency:'GBP' }`.
  - These populate the COMMODITY/INSTRUMENT node types (Task 3) with static reference context only — never a fabricated price. Return value shape of `runSeed` unchanged.

- [ ] **Step 5: resetDb** — add FK-safe deletes: `prisma.marketSearchResult.deleteMany()` BEFORE `prisma.marketSearchQuery.deleteMany()`; `prisma.instrumentProfile.deleteMany()` and `prisma.commodityProfile.deleteMany()` (no inbound FK — anywhere). Place market-node cleanup with existing GraphNode reset (unchanged — GraphNodes are already cleared).

- [ ] **Step 6: Tests** —
  - `schema.test.ts`: create a `MarketSearchQuery` + 2 `MarketSearchResult` rows (assert relation load); create an `InstrumentProfile` and assert `@@unique([provider,symbol])` rejects a duplicate; create a `CommodityProfile` and assert `name` unique rejects a duplicate.
  - `seed.test.ts`: after `runSeed`, assert ≥1 `CommodityProfile` AND ≥1 `InstrumentProfile` exist with `isFixture=true` and `provider` set; assert none carry a persisted price field (there is no price column — reference only).

- [ ] **Step 7: Verify + commit** — `npm test` green, `npm run typecheck` clean.
```bash
git add -A && git commit -m "feat(3e): migration — market search/instrument/commodity models + enums + dormant fixture reference seed"
```

---

### Task 2: Market provider abstraction + service (dormant + boundary validation + guard)

**Files:** Create `src/server/market/types.ts`, `provider.ts`, `validate.ts`, `service.ts`; Test: `tests/market/provider.test.ts`, `tests/market/service.test.ts`.

**Interfaces:**
- `types.ts`:
  - `type InstrumentSearchHit = { symbol: string; name: string; exchange: string | null; instrumentType: InstrumentType; currency: string }`
  - `type MarketQuote = { symbol: string; price: number; currency: string; changePct: number | null; asOf: string; delayed: boolean }`
  - `type HistoricalBar = { t: string; o: number; h: number; l: number; c: number; v: number }`
  - `type CommodityContextData = { name: string; symbol: string | null; category: CommodityCategory; keySupplyRegions: string[]; keyDemandSectors: string[]; delayed: boolean }`
  - `type ProviderMetadata = { name: string; delayed: boolean; supportsCommodities: boolean }`
  - `interface MarketDataProvider { name: string; getProviderMetadata(): ProviderMetadata; searchInstrument(query: string): Promise<InstrumentSearchHit[]>; getQuote(identifier: string): Promise<MarketQuote>; getHistoricalBars(identifier: string, range: string): Promise<HistoricalBar[]>; getCompanyProfile(identifier: string): Promise<{ symbol: string; name: string; sector: string | null; description: string } | null>; getCommodityContext(identifier: string): Promise<CommodityContextData | null> }`
  - `class NoMarketProviderConfiguredError extends Error`; `class MarketDataValidationError extends Error`.
- `provider.ts`:
  - `class NullProvider implements MarketDataProvider` — `name='none'`; `getProviderMetadata()` → `{ name:'none', delayed:true, supportsCommodities:false }`; every async data method **throws `NoMarketProviderConfiguredError`**.
  - `const ADAPTER_REGISTRY: Record<string, (apiKey: string) => MarketDataProvider> = {}` — empty now (real adapters register here later, keyed by lowercased provider name).
  - `getActiveMarketProvider(env = process.env): MarketDataProvider | null` — returns `ADAPTER_REGISTRY[name](key)` iff `env.MARKET_DATA_API_KEY` is set AND `env.MARKET_DATA_PROVIDER` (lowercased) is a registry key; else `null` (dormant). Never logs the key.
  - `getMarketStatus(env = process.env): { status: MarketProviderStatus; provider: string | null; delayed: boolean }` — dormant → `{ status:'NOT_CONFIGURED', provider:null, delayed:true }`.
- `validate.ts` (boundary — external data is untrusted): Zod `InstrumentHitSchema`, `QuoteSchema`, `CommodityContextSchema`; `validateProviderData<T>(schema: ZodSchema<T>, raw: unknown): T` — `safeParse`; throws `MarketDataValidationError` on failure (so malformed provider data never reaches the graph/UI).
- `service.ts` (provider injectable, default `getActiveMarketProvider()`):
  - `searchMarket(query: string, opts?: { provider?: MarketDataProvider | null }): Promise<{ configured: boolean; results: { id: string; resultType: MarketResultType; title: string; summary: string; confidence: number; refType: string; refId: string | null }[] }>` — resolve provider; **dormant** → persist a `MarketSearchQuery` (`resultCount:0`) and return `{ configured:false, results:[] }`; **configured** → `searchInstrument` (validate each hit) + `getCommodityContext` when the query names a commodity, persist the query + `MarketSearchResult` rows, return them. Titles/summaries templated from structured fields, `assertNoAdviceLanguage`-clean.
  - `getInstrumentContext(symbol: string, opts?): Promise<{ configured: boolean; provider: string | null; delayed: boolean; profile: SerializedInstrument | null; quote: MarketQuote | null; summary: string; graphEvidence: MarketGraphEvidence }>` — **dormant** → `{ configured:false, provider:null, delayed:true, profile:null, quote:null, summary:'', graphEvidence }` (graphEvidence = public events / sector signals / contradictions already in the graph for that symbol/name; NO fabricated price); **configured** → `getCompanyProfile` + `getQuote` (validated), **upsert** `InstrumentProfile` (`provider`, `lastFetchedAt`, `delayed`), assemble a guard-clean templated `summary` (price movement/volume/sector-pressure/commodity-exposure context — allowed list only). Never emits a disallowed phrase.
  - `getCommodityContext(name: string, opts?): Promise<{ configured: boolean; provider: string | null; delayed: boolean; profile: SerializedCommodity | null; summary: string; graphEvidence }>` — **dormant** → the seeded fixture reference profile if one matches (labelled `isFixture`, no price) + graph evidence, `configured:false`; **configured** → live context, upsert `CommodityProfile`.
  - `getMarketStatusView()` → `getMarketStatus()` shape for the API. All summary text passes `assertNoAdviceLanguage` before return; any provider free-text is `findAdviceLanguage`-filtered and dropped if flagged.

- [ ] **Step 1: Failing tests.**
  `provider.test.ts`: `getActiveMarketProvider({})` (no env) → null; `getActiveMarketProvider({ MARKET_DATA_PROVIDER:'x', MARKET_DATA_API_KEY:'k' })` with unknown provider → null; `new NullProvider().getQuote('X')` rejects with `NoMarketProviderConfiguredError`; `getMarketStatus({})` → `{ status:'NOT_CONFIGURED', provider:null, delayed:true }`. `validateProviderData(QuoteSchema, { bad:1 })` throws `MarketDataValidationError`.
  `service.test.ts` (define a `FakeMarketProvider` in the test):
  - `searchMarket('copper', { provider:null })` → `{ configured:false, results:[] }` AND a `MarketSearchQuery` row persisted with `resultCount:0`.
  - `searchMarket('acme', { provider: fake })` → `configured:true`, ≥1 result persisted, every `title`+`summary` guard-clean (`findAdviceLanguage(...) === []`).
  - `getInstrumentContext('ACME', { provider:null })` → `configured:false`, `quote:null`, `profile:null`, no thrown error.
  - `getInstrumentContext('ACME', { provider: fake })` (fake returns a valid quote+profile) → `configured:true`, an `InstrumentProfile` upserted with `provider` + `delayed`, `summary` guard-clean; re-run upserts (no duplicate row).
  - **Adversarial:** a `FakeMarketProvider` whose company profile description contains "strong buy, price target 250" → the returned `summary` contains **no** disallowed phrase (`findAdviceLanguage(summary) === []`) — provider free-text is filtered, not passed through.
  Run → RED.
- [ ] **Step 2: Implement** per interfaces. `zod` is already available. `FakeMarketProvider` lives in the test only.
- [ ] **Step 3: Verify + commit** — `npm test`, `npm run typecheck`. With NO env key, every path that hits `getActiveMarketProvider()` must be dormant.
```bash
git add -A && git commit -m "feat(3e): dormant market-data provider abstraction + service with boundary validation and non-advisory guard"
```

---

### Task 3: Graph projection of COMMODITY/INSTRUMENT nodes + interrogation wiring

**Files:** Modify the graph builder/sync (read `src/server/services/graph.ts` and the scan graph-sync stage first — follow the existing node/edge projection + upsert-dedupe pattern), `src/server/interrogate/service.ts`; Test: `tests/graph/market-nodes.test.ts` (new), `tests/interrogate/market-context.test.ts` (new) or extend `tests/api/interrogate-api.test.ts`.

**Interfaces:**
- Graph projection — add `projectMarketNodes()` (or extend the existing rebuild): for each `InstrumentProfile`, upsert a `GraphNode` `{ nodeType:'INSTRUMENT', refType:'instrument', refId: profile.id, title: name, isFixture }`; for each `CommodityProfile`, `{ nodeType:'COMMODITY', refType:'commodity', refId: profile.id, title: name, isFixture }`. Upsert-dedupe on `(refType, refId)` like every other projection. Edges (only when BOTH endpoints already exist as nodes): `COMMODITY —SUPPLIED_BY→ REGION` (from `keySupplyRegions`), `COMMODITY —AFFECTS→ SECTOR` (from `keyDemandSectors`), `INSTRUMENT —LINKED_TO→ COMPANY`/`SECTOR` where a title/refId match exists. Call it from the same rebuild/sync entry the other projections use. **Additive:** it only creates nodes when profiles exist — existing graph tests (no market profiles seeded) keep identical counts.
- Interrogation — add to `InterrogationResult`: `marketContext: MarketContext | null` where `type MarketContext = { configured: boolean; provider: string | null; delayed: boolean; instrument: SerializedInstrument | null; commodity: SerializedCommodity | null; quote: MarketQuote | null; note: string }`. Make `interrogate(q, opts?: { marketProvider?: MarketDataProvider | null })` injectable (default resolves via the service). Logic: after `queryType`, if `MARKET_QUERY_TYPES.includes(queryType)` call `getInstrumentContext`/`getCommodityContext`:
  - **configured** → `marketContextAvailable=true`; `disclaimer` = the exact non-advisory market-context text (below); `marketContext` populated.
  - **dormant** → `marketContextAvailable=false` (UNCHANGED); `disclaimer=MARKET_DISCLAIMER` (UNCHANGED); `marketContext = { configured:false, provider:null, delayed:true, instrument:null, commodity:null, quote:null, note:'market data provider not configured' }`.
  - Non-market queries → `marketContext=null` (unchanged behaviour).
  The exact configured-path disclaimer (doc, verbatim): `This view provides public market context and strategic interpretation examples. It does not provide personal investment advice, portfolio advice, or buy, sell or hold recommendations.`
- **Consumer parity (SR2/SR9):** `InterrogationResult` is a shared type — Task 4 updates `InterrogationResults.tsx`; the `/api/interrogate` route passes the new field through unchanged; state in the task report which consumers were checked.

- [ ] **Step 1: Failing tests.**
  `graph/market-nodes.test.ts`: seed one `InstrumentProfile` + one `CommodityProfile`, run the projection/rebuild → assert exactly one `GraphNode` with `nodeType='INSTRUMENT'`/`refType='instrument'` and one with `nodeType='COMMODITY'`/`refType='commodity'`; re-run → counts stable (upsert dedupe); any created edge has both endpoints present. Control: with NO market profiles, the projected node count equals the pre-market baseline (no regression).
  `interrogate/market-context.test.ts`: a `COMMODITY`/`TICKER` query with `marketProvider:null` → `marketContextAvailable===false`, `disclaimer===MARKET_DISCLAIMER`, `marketContext.configured===false`, `marketContext.note` set; the same query with an injected `FakeMarketProvider` → `marketContextAvailable===true`, `disclaimer` === the verbatim market-context text, `marketContext.configured===true` with a populated instrument/commodity. A non-market query → `marketContext===null` and existing fields unchanged.
  Run → RED.
- [ ] **Step 2: Implement** the projection + wiring per interfaces; preserve the dormant default exactly.
- [ ] **Step 3: Verify + commit** — `npm test`, `npm run typecheck`.
```bash
git add -A && git commit -m "feat(3e): project COMMODITY/INSTRUMENT graph nodes + wire market context into interrogation"
```

---

### Task 4: Market APIs + UI + docs

**Files:** Create `src/app/api/market/status/route.ts`, `src/app/api/market/search/route.ts`, `src/app/admin/market/page.tsx`, `src/components/MarketContextPanel.tsx`; Modify `src/components/InterrogationResults.tsx`; add serialized reads to `src/server/services/market.ts` if needed; Create `docs/market-data-adapters.md`; Test: `tests/api/market-api.test.ts`.

**Interfaces:**
- `GET /api/market/status` → `{ configured: boolean; provider: string | null; delayed: boolean }` (from `getMarketStatus`; never leaks the key).
- `GET /api/market/search?q=` → `{ configured: boolean; results: [...] }` (from `searchMarket`; dormant → `{ configured:false, results:[] }`).
- `/admin/market` (read-only, mirrors `/admin/llm`): provider configuration state (CONFIGURED / NOT_CONFIGURED), the seeded fixture reference profiles (commodities + instruments, each FixtureBadge-labelled), and recent `MarketSearchQuery` rows. No key shown.
- `InterrogationResults.tsx`: when `marketContext` is present and `configured` → render `MarketContextPanel` (instrument/commodity profile, price context with a **delayed** label + native currency, linked public events / sector signals / contradictions — allowed-output list only, non-advisory). When a market-shaped query is NOT configured → the existing `!marketContextAvailable` block gains a clear **"Market data provider not configured"** empty state (keep the existing disclaimer). FixtureBadge on any fixture reference profile. Guard: no buy/sell/hold/target-price wording anywhere in the panel copy.
- `docs/market-data-adapters.md`: the `MarketDataProvider` interface + methods; env activation (`MARKET_DATA_PROVIDER` + `MARKET_DATA_API_KEY`); the dormancy model (no key → NOT_CONFIGURED, empty state, no invented price); the allowed vs disallowed instrument-output lists + the verbatim disclaimer; the no-scraping / provider-APIs-only rule; how to add a real adapter (register in `ADAPTER_REGISTRY`); the fixture-reference-profile labelling; safety guarantees; and what's deferred (live quote/bar persistence, `GraphSnapshot` FK in 3f, `MARKET_CONTEXT_SYNTHESIS` LLM enrichment).

- [ ] **Step 1: Failing tests.**
  `api/market-api.test.ts`: `GET /api/market/status` (dormant) → 200 `{ configured:false, provider:null, delayed:true }`; `GET /api/market/search?q=copper` (dormant) → 200 `{ configured:false, results:[] }`; assert neither response contains any env key value. (Handler tests follow the existing `tests/api/*` pattern.)
  Run → RED.
- [ ] **Step 2: Implement** the routes, `MarketContextPanel`, the `InterrogationResults` not-configured empty state, and `/admin/market`.
- [ ] **Step 3: Docs** — write `docs/market-data-adapters.md` per the interface above; honest about what's dormant/deferred.
- [ ] **Step 4: Verify + commit** — `npm test`, `npm run typecheck`, `npm run build` (new routes listed). Controller does browser verification (CDP console capture) on `/interrogate` (a commodity + a ticker query → not-configured panel, no hydration crash) and `/admin/market` before sign-off.
```bash
git add -A && git commit -m "feat(3e): market status/search APIs + interrogation market panel + /admin/market page + docs"
```

---

## Plan Self-Review Notes
- Spec §3 models + enums ↔ T1; §4 provider + §5 service ↔ T2; §5 graph projection + §6 interrogation ↔ T3; §7 API/UI + docs ↔ T4. §8 dormancy verified across all (no-key default + FakeMarketProvider for configured paths).
- Safety: T2 templates summaries from structured fields + guard-filters provider free-text (adversarial "strong buy/target price" test); every rendered market summary `assertNoAdviceLanguage`-clean; disallowed-output list enforced; no fabricated price on any dormant path.
- Additive/dormant: dormant interrogation path byte-compatible (T3 control test); market graph projection only fires when profiles exist (T3 control); no new npm dep; en-GB; app money GBP, instrument currency factual-native.
- Type flow: `MarketDataProvider`/quote/hit/context types (T2 → T3 → T4); `InterrogationResult.marketContext` (T3 → T4 consumer). Shared-type change verified across `InterrogationResults.tsx` + `/api/interrogate` + tests (SR2/SR9).
- Deferred (not gaps): real provider adapters (owner-funded), live bar persistence/caching, `GraphSnapshot` FK (3f), LLM market synthesis (needs both layers active), watch-markets/portfolio (3f).
```
