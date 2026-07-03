# Market / commodity / instrument data adapters

Phase 3e. How Archlight supports manual interrogation of commodities,
financial instruments and share prices through **compliant provider APIs
only**, why it stays **dormant by default**, and why every rendered market
summary is non-advisory by construction.

Source: `src/server/market/provider.ts`, `src/server/market/types.ts`,
`src/server/market/validate.ts`, `src/server/market/service.ts`,
`src/server/market/graph.ts`, `src/server/market/graph-evidence.ts`,
`src/server/interrogate/service.ts`, `src/app/api/market/status/route.ts`,
`src/app/api/market/search/route.ts`, `src/app/admin/market/page.tsx`,
`src/components/MarketContextPanel.tsx`.

## 1. Why this exists

Interrogating a commodity, ticker or share price is one of the query shapes
the deterministic interrogation engine already classifies
(`TICKER`/`SHARE_PRICE`/`INSTRUMENT`/`COMMODITY` — see
`src/server/interrogate/classify.ts`). Like the Phase 3d LLM layer, live
market data is an optional, strictly-governed upgrade path: with no provider
configured, those query shapes still work — they return whatever public
event-graph evidence already exists — but no price, quote or live profile is
ever invented. Adding provider credentials activates real lookups without
changing anything else about how the query is classified or how the result
is rendered.

Market output is **context only**. The same non-advisory guard used
everywhere else in Archlight (`assertNoAdviceLanguage`,
`src/server/safety/advice-language.ts`) is applied to every rendered market
summary before it is returned from the service layer — buy/sell/hold framing,
price targets, and "guaranteed return" language are rejected the same way
they are for playbooks and evidence-arc summaries.

## 2. The `MarketDataProvider` interface

```ts
interface MarketDataProvider {
  name: string
  getProviderMetadata(): ProviderMetadata
  searchInstrument(query: string): Promise<InstrumentSearchHit[]>
  getQuote(identifier: string): Promise<MarketQuote>
  getHistoricalBars(identifier: string, range: string): Promise<HistoricalBar[]>
  getCompanyProfile(identifier: string): Promise<CompanyProfile | null>
  getCommodityContext(identifier: string): Promise<CommodityContextData | null>
}
```

(`src/server/market/types.ts`.) Every method returns typed data that is
**boundary-validated with a Zod schema** before it can reach the service
layer, the graph, or the UI — external market data is untrusted input,
exactly like LLM output in the 3d layer. The three response shapes that
cross the boundary (`InstrumentSearchHit`, `MarketQuote`,
`CommodityContextData`) each have a matching schema in
`src/server/market/validate.ts`; `validateProviderData(schema, raw)` throws
`MarketDataValidationError` on any parse failure, so malformed provider data
never silently reaches a persisted record or a rendered panel.

`CompanyProfile.description` is explicitly **untrusted provider free-text**
(analyst notes, marketing copy) — it is never templated into a persisted or
rendered summary. Every summary the service produces is built only from
structured fields (symbol, name, price, currency, category, supply regions,
demand sectors, graph evidence), never from raw provider prose, and is then
run through `assertNoAdviceLanguage` as a second, independent check.

`NullProvider` (`provider.ts`) is the only provider shipped in this phase.
Every one of its data methods throws `NoMarketProviderConfiguredError` — an
explicit "dormant" signal, never thrown for content/business reasons.

## 3. The dormancy model

`getActiveMarketProvider(env)` (`provider.ts`) is the single source of truth
for "is market data live." It returns a provider only when **both**:

1. `env.MARKET_DATA_API_KEY` is set, **and**
2. `env.MARKET_DATA_PROVIDER` (lowercased) names an adapter registered in
   `ADAPTER_REGISTRY`.

`ADAPTER_REGISTRY` is **empty** in this phase — no real adapter ships yet
(see §6), so `getActiveMarketProvider()` always resolves to `null` with the
shipped codebase, regardless of what env vars are set. `env` defaults to
`process.env` but is an injectable parameter, so tests and the service layer
never depend on real process state — a `FakeMarketProvider` test double
drives every "configured" code path deterministically, with no real network
call, key, or spend.

`GET /api/market/status` (`src/app/api/market/status/route.ts`) reports this
without ever leaking the key:

```json
{ "configured": false, "provider": null, "delayed": true }
```

`getMarketStatus(env)` is the underlying status resolver
(`status: 'CONFIGURED' | 'NOT_CONFIGURED'`, `provider`, `delayed`); the route
maps `status === 'CONFIGURED'` to the API's boolean `configured` field. With
no key, `/api/market/search?q=` behaves the same way:

```json
{ "configured": false, "results": [] }
```

No dormant response contains an env-var name or key value in any field —
verified by `tests/api/market-api.test.ts`.

## 4. What a configured provider is allowed to render

Every rendered instrument/commodity summary — in `searchMarket`,
`getInstrumentContext`, `getCommodityContext`, and the `MarketContextPanel`
UI that consumes their output — is restricted to:

**Allowed:**
- Instrument or commodity profile (symbol, name, exchange, type/category,
  native trading currency)
- Price context *as provided by the configured provider* (price, percentage
  change, as-of timestamp), always labelled with the **delayed** flag and
  the instrument's native currency
- Public events / sector signals linked from the graph (via
  `gatherGraphEvidence` — the matched `INSTRUMENT`/`COMMODITY` graph node's
  real 1-degree neighbourhood)
- Contradictions among that neighbourhood (`CONTRADICTS` edges), rendered
  the same "A vs B" way as everywhere else in the app
- Commodity supply-region / demand-sector exposure
- A short market-context summary templated only from the fields above

**Disallowed — anywhere in a market summary or panel:**
- Buy / sell / hold language, or any rating framing ("strong buy", "rate
  this a hold")
- Price targets ("target price", "price target")
- Expected/guaranteed-return or "% returns" claims
- Personal-investment or portfolio-advice framing, or position-sizing
  language ("load up on", "allocate your portfolio")

These are enforced deterministically by
`findAdviceLanguage`/`assertNoAdviceLanguage`
(`src/server/safety/advice-language.ts`) — the same shared guard used by the
3d LLM/playbook layer, including its adversarial-probe patterns (analyst-
register ratings, reversed "price target" word order, idiomatic guarantees).
`assertNoAdviceLanguage` is called on every templated title/summary before
`searchMarket`, `getInstrumentContext`, or `getCommodityContext` return —
fail-closed, not caller discipline.

The **verbatim** non-advisory disclaimer shown once a market provider is
configured and `marketContext` is populated
(`CONFIGURED_MARKET_DISCLAIMER`, `src/server/interrogate/service.ts`):

> This view provides public market context and strategic interpretation
> examples. It does not provide personal investment advice, portfolio
> advice, or buy, sell or hold recommendations.

The dormant-default disclaimer (`MARKET_DISCLAIMER`, same file) is unchanged
from before this phase and remains the default for every market-shaped query
with no active provider.

## 5. No scraping — provider APIs only

Every method on `MarketDataProvider` is a typed async call to a **compliant
provider API** — there is no HTML-parsing, headless-browser, or scraping
code path anywhere in the market layer, and none should ever be added. A
real adapter (§6) must call its vendor's documented API surface under that
vendor's terms of service; if a vendor doesn't offer an API for the data
needed, that data is out of scope rather than sourced by scraping the
vendor's pages.

## 6. How to register a real adapter

No real adapter ships in this phase (owner-funded, added later). To add one:

1. Implement `MarketDataProvider` for the vendor (Polygon, Alpha Vantage,
   etc.), calling only that vendor's documented API endpoints.
2. Have every method's return value assembled into the exact shape
   (`InstrumentSearchHit`, `MarketQuote`, `HistoricalBar`, `CompanyProfile`,
   `CommodityContextData`) — the service layer boundary-validates these with
   the existing Zod schemas in `validate.ts`, so a malformed vendor response
   fails loudly instead of reaching the graph or UI.
3. Register a builder function in `ADAPTER_REGISTRY`
   (`src/server/market/provider.ts`), keyed by the **lowercased** provider
   name that will be set in `MARKET_DATA_PROVIDER`:

   ```ts
   export const ADAPTER_REGISTRY: Record<string, (apiKey: string) => MarketDataProvider> = {
     polygon: (apiKey) => new PolygonProvider(apiKey),
   }
   ```
4. Set `MARKET_DATA_API_KEY` (the vendor's key — never logged, never
   committed) and `MARKET_DATA_PROVIDER=polygon` (or whichever name was
   registered) in the environment.

With both env vars set and the name resolving in `ADAPTER_REGISTRY`,
`getActiveMarketProvider()` returns the real adapter and `/api/market/status`
reports `configured: true`. Every safety gate in §4 — boundary validation,
advice-language guard, delayed/currency labelling — applies identically to
live calls; nothing about activation bypasses it.

## 7. Fixture reference profiles

A small, clearly-labelled set of `isFixture: true` `CommodityProfile` /
`InstrumentProfile` rows is seeded (`src/server/seed.ts`) so the
`COMMODITY`/`INSTRUMENT` graph node types are demonstrably populated and
visible in the living graph even with no provider configured — **static
context only** (name, category, supply regions, demand sectors for
commodities; symbol, name, exchange, type, native currency for instruments),
**never a price**. Every surface that renders a fixture profile — the
`/interrogate` market panel, `/admin/market`, and the graph explorer — shows
the shared `FixtureBadge` (`src/components/badges.tsx`) next to it, the same
labelling convention used for every other fixture row in the app (sources,
opportunity cards, positioning examples).

`getCommodityContext(name)` treats a dormant lookup that matches a seeded
fixture as a legitimate reference result: it returns `configured: false`
(honest — no live provider answered) together with the fixture profile and a
summary that says plainly *"seeded fixture reference data (no live price).
Provider is not configured."* A non-matching dormant lookup returns
`profile: null` — nothing is fabricated to fill the gap.

## 8. The graph projection

`syncMarketNodes()` (`src/server/market/graph.ts`) projects every persisted
`InstrumentProfile` → an `INSTRUMENT` `GraphNode` and every
`CommodityProfile` → a `COMMODITY` `GraphNode`, upsert-deduped on
`(refType, refId)` exactly like every other node type in
`src/server/graph/builder.ts`. It then projects edges **only to nodes that
already exist** — never fabricating the endpoint:

- `COMMODITY —SUPPLIED_BY→ REGION`, one per `keySupplyRegions` entry
- `COMMODITY —AFFECTS→ SECTOR`, one per `keyDemandSectors` entry
- `INSTRUMENT —LINKED_TO→ COMPANY`, best-effort on an exact
  case-insensitive title match

This is wired into the single graph-sync entrypoint
(`syncGraphForEvents`/`rebuildGraph`) and is **additive and idempotent**: it
fires only when profiles exist, so the pre-3e node/edge counts are unchanged
when no market profiles are present, and re-running never duplicates a node
or edge.

`gatherGraphEvidence(identifier, marketRef?)`
(`src/server/market/graph-evidence.ts`) is what lets the "linked public
events / sector signals / contradictions" in §4 be **real graph data**: once
a market node has been projected, it walks that node's actual 1-degree
neighbourhood; before a market node exists for an identifier yet, it falls
back to a plain title-substring scan of the graph. Either way, no evidence
is invented — no matches means empty arrays.

## 9. Interrogation wiring

`InterrogationResult.marketContext: MarketContext | null` is an additive
field on the shared interrogation type. For a market-shaped query
(`TICKER`/`SHARE_PRICE`/`INSTRUMENT`/`COMMODITY`):

- **Dormant** (no active provider): `marketContext` is a fixed
  not-configured sentinel (`configured: false`, `provider: null`,
  `delayed: true`, `instrument`/`commodity`/`quote: null`,
  `note: 'market data provider not configured'`), `marketContextAvailable`
  is `false`, and `disclaimer` is `MARKET_DISCLAIMER` — byte-identical to
  the interrogation engine's behaviour before this phase.
- **Configured**: `marketContext` is populated from `getCommodityContext`
  (for `COMMODITY` queries) or `getInstrumentContext` (everything else —
  `TICKER`/`SHARE_PRICE`/`INSTRUMENT` all name a tradeable instrument),
  `marketContextAvailable` flips to `true`, and `disclaimer` swaps to
  `CONFIGURED_MARKET_DISCLAIMER` (§4).

Non-market queries always get `marketContext: null`, dormant or configured —
this field only exists for the four market-shaped query types.

`InterrogationResults.tsx` is the sole UI consumer: it destructures
`marketContext` alongside the existing fields and, when
`marketContextAvailable && marketContext?.configured`, renders
`MarketContextPanel` (a pure display component — instrument/commodity
profile, price context, native currency, the graph-evidence-derived summary
note). When not configured, the existing amber notice card now leads with an
explicit **"Market data provider not configured"** heading before the
existing explanatory paragraph and disclaimer — the disclaimer text itself
is unchanged. `MarketContextPanel` takes no client-only state and performs
no `typeof window` branching, so its server-rendered and first-client-
rendered output always match (no hydration mismatch risk).

## 10. The audit trail

`/admin/market` (`src/app/admin/market/page.tsx`, mirrors `/admin/llm`) is
the read-only auditability surface: provider status
(`CONFIGURED`/`NOT_CONFIGURED`, never the key), every seeded fixture
reference profile (commodities and instruments, each `FixtureBadge`-
labelled), and the most recent `MarketSearchQuery` rows (query text, query
type, result count, timestamp). `getMarketAudit(limit)`
(`src/server/market/service.ts`) serves all three to the page in one call,
mirroring `getLLMAudit`'s shape for `/admin/llm`.

## 11. Safety guarantees

- **No key → no network call, ever.** `getActiveMarketProvider()`
  short-circuits on a missing key or an unregistered provider name; the
  `NullProvider`'s methods all throw `NoMarketProviderConfiguredError` rather
  than attempting a call.
- **No fabricated price, on any dormant path.** A dormant
  `getInstrumentContext`/`getCommodityContext` call returns `profile: null`
  / `quote: null` (or a labelled fixture with no price) — never an invented
  number.
- **Fail closed on malformed provider data.** Every provider response is
  boundary-validated with a Zod schema before it can be persisted, projected
  into the graph, or rendered; a parse failure throws
  `MarketDataValidationError` instead of silently shipping bad data.
- **No advice, no guarantees.** Every rendered market summary — search
  result, instrument context, commodity context — passes
  `assertNoAdviceLanguage` before it is returned from the service layer.
- **No secrets logged or leaked.** `getMarketStatus`/`/api/market/status`
  return only provider name and delayed flag, never the key; `/admin/market`
  never displays a key.
- **Provider APIs only.** No scraping code path exists or should be added
  (§5).
- **Additive only.** The dormant interrogation path
  (`marketContext: null`/not-configured sentinel, `MARKET_DISCLAIMER`) is
  byte-identical to pre-3e behaviour; the graph projection only fires when
  market profiles exist, so pre-3e node/edge counts are unchanged with none
  seeded.

## 12. What's deferred (not gaps)

- **Real provider adapters** are owner-funded and added later (§6) — none
  ships in this phase.
- **Live quote/bar persistence and caching.** Quotes and historical bars are
  returned transiently by the provider (typed, validated) and rendered —
  they are not persisted as models; only reference profiles and search
  history persist.
- **`GraphSnapshot` FK on `MarketSearchResult`.** `graphSnapshotId` is a
  plain nullable column today; `GraphSnapshot` itself is formalised in
  Phase 3f, at which point the FK can be added without a shape change to
  `MarketSearchResult`.
- **`MARKET_CONTEXT_SYNTHESIS` LLM enrichment.** This task type is routable
  (`src/shared/enums.ts`, see `docs/multi-model-llm-routing.md` §9) but no
  service calls `runLLMTask` with it yet — it will only be wired once
  *both* the market-data layer and the LLM layer are independently active;
  the deterministic, structured-field-only summary documented in §4 remains
  the default and the source of truth even after that wiring exists.
- **Watch-markets / portfolio / replay.** Tracked for Phase 3f, same as the
  LLM layer's "save to portfolio" stub.
