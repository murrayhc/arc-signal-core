# Market context — safety contract

Stage 14 required doc. This is the **safety contract** for every
instrument/commodity/ticker/share-price query Archlight can answer: what a
rendered market summary is allowed to say, what it is never allowed to say,
how that is enforced mechanically (not by caller discipline), and how the
whole layer behaves with no provider configured (the shipped default).

For **how** the provider layer is built — the `MarketDataProvider` interface,
boundary validation, the adapter registry, the graph projection, the audit
page — see `docs/market-data-adapters.md`. This doc is the contract; that doc
is the implementation.

Source: `src/server/market/service.ts`, `src/server/market/provider.ts`,
`src/server/market/validate.ts`, `src/server/safety/advice-language.ts`,
`src/server/interrogate/service.ts`.

## 1. Market context only, never advice

Archlight can surface **public market context** for a query that names a
commodity, ticker, share price, or financial instrument. It never gives
investment advice. This is not a style preference enforced by prompt
wording — it is a deterministic, code-level guard that runs on every
templated summary before it can be persisted or rendered, and it fails
closed: if a guard check fails, the summary is rejected, not shipped with a
caveat.

## 2. Allowed output — the only things a market summary may contain

Every rendered instrument/commodity summary — from `searchMarket`,
`getInstrumentContext`, `getCommodityContext`, and the `MarketContextPanel`
UI that displays their output — is restricted to:

- **Instrument or commodity profile** — symbol, name, exchange, type/category,
  native trading currency.
- **Price context, exactly as provided by the configured provider** — price,
  percentage change, as-of timestamp — always labelled with the **delayed**
  flag and the instrument's native currency. Nothing is estimated,
  extrapolated, or smoothed beyond what the provider returned.
- **Public events / sector signals already on record** — the matched
  `INSTRUMENT`/`COMMODITY` graph node's real 1-degree neighbourhood, gathered
  by `gatherGraphEvidence` (`src/server/market/graph-evidence.ts`).
- **Contradictions** among that neighbourhood (`CONTRADICTS` edges), rendered
  the same "A vs B" way as everywhere else in the app.
- **Commodity supply-region / demand-sector exposure** — `keySupplyRegions`
  and `keyDemandSectors`, structured fields only.
- **A short market-context summary**, templated only from the fields above —
  never from provider free-text (see §4).

## 3. Disallowed output — rejected wherever it appears

The following are never permitted in any market summary, title, or panel,
regardless of what a provider's raw data or free-text says:

- **Buy / sell / hold recommendations**, or any rating framing ("strong buy",
  "rate this a hold").
- **Target price** language ("target price", "price target" — both word
  orders).
- **Expected or guaranteed return** claims ("expected return", "guaranteed
  profit", "% returns", idiomatic guarantees like "can't lose").
- **Personal investment or portfolio advice**, including position-sizing
  language ("load up on", "allocate your portfolio").

These are the same categories the shared guard enforces for the dormant LLM
layer (playbooks, evidence-arc summaries) — the market layer reuses the
identical mechanism rather than a parallel, weaker one.

## 4. How this is enforced — fail-closed, not caller discipline

`findAdviceLanguage` / `assertNoAdviceLanguage`
(`src/server/safety/advice-language.ts`) is a deterministic, case-insensitive
pattern guard covering all of §3, including adversarial-probe patterns found
during review (analyst-register ratings, reversed "price target" word order,
idiomatic guarantees, "short this name" asset-noun matching to avoid false
positives on unrelated uses of "short").

**Guard-before-persist**: `assertNoAdviceLanguage` is called on the exact
title/summary text **before** `searchMarket`, `getInstrumentContext`, or
`getCommodityContext` return it — and, critically, before that same text is
written to `InstrumentProfile.name` / `CommodityProfile.name` via the
upsert. That name later becomes the graph node's title
(`syncMarketNodes()`, `src/server/market/graph.ts`), rendered on
`/admin/market`, the graph explorer, and `/interrogate` — none of which
re-runs the guard at render time. Guarding the write, not just the read, is
what makes this fail-closed: advice-tainted text can never reach persistence,
so it can never reach a surface that trusts the database.

`CompanyProfile.description` is explicitly **untrusted provider free-text**
(analyst notes, marketing copy from the vendor). It is never templated into
a persisted or rendered summary at all — every summary is built only from
structured fields (symbol, name, price, currency, category, supply regions,
demand sectors, graph evidence). The advice-language guard is then run as a
**second, independent check** on top of that structural exclusion, not a
substitute for it.

## 5. The verbatim non-advisory disclaimer

Once a market provider is configured and `marketContext` is populated for a
market-shaped query, the interrogation result carries this exact text
(`CONFIGURED_MARKET_DISCLAIMER`, `src/server/interrogate/service.ts`):

> This view provides public market context and strategic interpretation
> examples. It does not provide personal investment advice, portfolio
> advice, or buy, sell or hold recommendations.

This string is fixed and must stay static — it is not templated or
provider-dependent.

## 6. Dormancy — the shipped default

No real market-data adapter ships today. `ADAPTER_REGISTRY`
(`src/server/market/provider.ts`) is empty, so `getActiveMarketProvider()`
always resolves to `null` regardless of environment variables. The dormant
default disclaimer (`MARKET_DISCLAIMER`, same file as §5) is what every
market-shaped query gets:

> This query looks like a market/price lookup. Archlight does not provide
> live market data or pricing — this is not investment advice. Live market
> context is planned for a later phase; the results below are limited to
> whatever event-graph evidence already exists for this query, if any.

With no active provider:

- `GET /api/market/status` reports `{ "configured": false, "provider": null,
  "delayed": true }` — never an env-var name or key value.
- `GET /api/market/search?q=...` reports `{ "configured": false, "results":
  [] }`.
- `getInstrumentContext` / `getCommodityContext` return `profile: null` /
  `quote: null` — **never a fabricated price**. The one exception is a
  labelled seeded fixture reference row (see §7), which still carries no
  price.
- Public graph evidence for the query (events, sector signals,
  contradictions already on record) is still returned honestly — dormancy
  affects live provider data only, not what the graph already knows.
- `interrogate()`'s `marketContext` for a market-shaped query is a fixed
  not-configured sentinel (`configured: false`, `provider: null`, `delayed:
  true`, `instrument`/`commodity`/`quote: null`, `note: 'market data provider
  not configured'`), `marketContextAvailable` is `false`, and `disclaimer` is
  the dormant `MARKET_DISCLAIMER` above — byte-identical across every call.

Activating a real provider (adding one to `ADAPTER_REGISTRY` plus the two env
vars — see `docs/market-data-adapters.md` §6) does not weaken or bypass any
guard in this document: boundary validation, guard-before-persist, and the
disclaimer swap all apply identically to live calls.

## 7. Fixture reference rows are not an exception

A small set of `isFixture: true` `CommodityProfile` / `InstrumentProfile`
rows is seeded so the market graph-node types are populated even with no
provider configured. These carry **static context only** (name, category,
supply regions, demand sectors for commodities; symbol, name, exchange, type,
native currency for instruments) — **never a price** — and are always shown
with a `FixtureBadge`. A dormant lookup that matches a seeded fixture
honestly reports `configured: false` with a summary stating plainly that this
is seeded reference data with no live price; a non-matching lookup returns
`profile: null`. Nothing is fabricated to fill a gap either way.

## 8. Safety guarantees — summary

- **No key → no network call, ever.** A missing key or unregistered provider
  name short-circuits to `NullProvider`, whose every method throws
  `NoMarketProviderConfiguredError` rather than attempting a call.
- **No fabricated price, on any dormant path.** Dormant context calls return
  `null` profile/quote fields, or a labelled fixture with no price.
- **Fail closed on malformed provider data.** Every provider response is
  boundary-validated with a Zod schema before it can be persisted, projected
  into the graph, or rendered; a parse failure throws
  `MarketDataValidationError`.
- **No advice, no guarantees, anywhere.** Every rendered market summary —
  search result, instrument context, commodity context — passes
  `assertNoAdviceLanguage` before it is returned from the service layer, and
  before it is persisted (§4).
- **No secrets logged or leaked.** Status and audit endpoints return only
  provider name and delayed flag, never the key.
- **Provider APIs only, no scraping.** Every `MarketDataProvider` method is a
  typed async call to a vendor's documented API — there is no HTML-parsing or
  headless-browser code path in the market layer, and none should be added.
- **Additive only.** The dormant interrogation path is byte-identical to
  before this layer existed; the graph projection only fires when market
  profiles exist.

## 9. What this contract does not cover

Live-quote persistence/caching design, the adapter-registration mechanics,
the graph projection algorithm, and the `/admin/market` audit surface are
documented in `docs/market-data-adapters.md`. This contract governs *content*
— what a market summary is allowed and forbidden to say, and how that is
enforced — regardless of which provider (if any) is active.
