import { prisma } from '@/server/db'
import { assertNoAdviceLanguage, findAdviceLanguage } from '@/server/safety/advice-language'
import { classifyQuery } from '@/server/interrogate/classify'
import type { CommodityCategory, InstrumentType, MarketResultType } from '@/shared/enums'
import { getActiveMarketProvider } from './provider'
import { CommodityContextSchema, InstrumentHitSchema, QuoteSchema, validateProviderData } from './validate'
import type { CommodityContextData, MarketDataProvider, MarketQuote } from './types'

export type ServiceOptions = { provider?: MarketDataProvider | null }

export type SerializedInstrument = {
  provider: string
  symbol: string
  name: string
  exchange: string | null
  instrumentType: InstrumentType
  currency: string
  delayed: boolean
  isFixture: boolean
}

export type SerializedCommodity = {
  provider: string | null
  name: string
  symbol: string | null
  category: CommodityCategory
  keySupplyRegions: string[]
  keyDemandSectors: string[]
  delayed: boolean
  isFixture: boolean
}

/** Public event-graph context for a symbol/name, gathered from GraphNode
 *  title matches. Deliberately minimal — a correct-but-shallow lookup;
 *  Task 3's fuller interrogation/graph integration extends this. NEVER
 *  fabricates: no matches means empty arrays. */
export type MarketGraphEvidence = {
  relatedEventTitles: string[]
  sectorPressureSignals: string[]
  contradictions: string[]
}

const EMPTY_GRAPH_EVIDENCE: MarketGraphEvidence = {
  relatedEventTitles: [],
  sectorPressureSignals: [],
  contradictions: [],
}

/** Minimal graph-evidence lookup: GraphNodes whose title case-insensitively
 *  contains `identifier`, split into EVENT titles vs SIGNAL-ish (sector
 *  pressure) titles by nodeType, plus any CONTRADICTS edges between matched
 *  nodes. Real but shallow by design (see MarketGraphEvidence doc) — no
 *  fabricated evidence, just what's already in the graph. */
async function gatherGraphEvidence(identifier: string): Promise<MarketGraphEvidence> {
  const trimmed = identifier.trim()
  if (trimmed.length === 0) return EMPTY_GRAPH_EVIDENCE

  const lower = trimmed.toLowerCase()
  // SQLite has no case-insensitive `contains` at the query-engine level (that's
  // a Postgres/MongoDB-only Prisma feature), so filter in JS after fetch —
  // matches the existing convention in interrogate/service.ts's findMatchingNodes.
  const allNodes = await prisma.graphNode.findMany()
  const matched = allNodes.filter((n) => n.title.toLowerCase().includes(lower))
  if (matched.length === 0) return EMPTY_GRAPH_EVIDENCE

  const relatedEventTitles = matched.filter((n) => n.nodeType === 'EVENT').map((n) => n.title)
  const sectorPressureSignals = matched.filter((n) => n.nodeType === 'SIGNAL' || n.nodeType === 'SECTOR').map((n) => n.title)

  const matchedIds = matched.map((n) => n.id)
  const contradictionEdges = await prisma.graphEdge.findMany({
    where: {
      edgeType: 'CONTRADICTS',
      OR: [{ sourceNodeId: { in: matchedIds } }, { targetNodeId: { in: matchedIds } }],
    },
  })
  const contradictionNodeIds = new Set<string>()
  for (const edge of contradictionEdges) {
    contradictionNodeIds.add(edge.sourceNodeId)
    contradictionNodeIds.add(edge.targetNodeId)
  }
  const contradictionNodes =
    contradictionNodeIds.size > 0
      ? await prisma.graphNode.findMany({ where: { id: { in: [...contradictionNodeIds] } } })
      : []
  const nodeById = new Map(contradictionNodes.map((n) => [n.id, n]))
  const contradictions = contradictionEdges
    .map((edge) => {
      const a = nodeById.get(edge.sourceNodeId)
      const b = nodeById.get(edge.targetNodeId)
      return a && b ? `${a.title} vs ${b.title}` : null
    })
    .filter((c): c is string => c !== null)

  return { relatedEventTitles, sectorPressureSignals, contradictions }
}

/** Resolves the provider to use: explicit opts.provider (including an
 *  explicit null for "dormant") takes precedence; otherwise falls back to
 *  getActiveMarketProvider() (env-driven, dormant with no key). */
function resolveProvider(opts?: ServiceOptions): MarketDataProvider | null {
  if (opts && 'provider' in opts) return opts.provider ?? null
  return getActiveMarketProvider()
}

function pctText(changePct: number | null): string {
  if (changePct === null) return 'change not reported'
  const direction = changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat'
  return `${direction} ${Math.abs(changePct).toFixed(1)}% on the period`
}

// ---------------------------------------------------------------------------
// searchMarket
// ---------------------------------------------------------------------------

export type MarketSearchResultView = {
  id: string
  resultType: MarketResultType
  title: string
  summary: string
  confidence: number
  refType: string
  refId: string | null
}

export type MarketSearchView = { configured: boolean; results: MarketSearchResultView[] }

const COMMODITY_QUERY_TYPES = new Set(['COMMODITY'])

/**
 * Templated, structured-field-only instrument search result. Title/summary
 * never carry provider free-text — only symbol/name/exchange/currency, which
 * are factual identifiers, not advice-shaped text.
 */
function instrumentResultView(hit: { symbol: string; name: string; exchange: string | null; instrumentType: InstrumentType; currency: string }): {
  title: string
  summary: string
} {
  const exchangePart = hit.exchange ? ` on ${hit.exchange}` : ''
  return {
    title: `${hit.name} (${hit.symbol})`,
    summary: `${hit.instrumentType} instrument${exchangePart}, priced in ${hit.currency}.`,
  }
}

function commodityResultView(ctx: CommodityContextData): { title: string; summary: string } {
  const supply = ctx.keySupplyRegions.length > 0 ? ctx.keySupplyRegions.join(', ') : 'no key regions on record'
  const demand = ctx.keyDemandSectors.length > 0 ? ctx.keyDemandSectors.join(', ') : 'no key sectors on record'
  return {
    title: `${ctx.name} (${ctx.category.toLowerCase()})`,
    summary: `Supply concentrated in ${supply}; demand driven by ${demand}.`,
  }
}

/**
 * searchMarket: dormant (no active provider) persists a MarketSearchQuery
 * with resultCount:0 and returns configured:false — never fabricates a
 * result. Configured queries the provider's searchInstrument (validated per
 * hit) and, when the query classifies as COMMODITY, also tries
 * getCommodityContext; every hit is persisted as a MarketSearchResult with a
 * guard-clean, structured-field-templated title/summary.
 */
export async function searchMarket(query: string, opts?: ServiceOptions): Promise<MarketSearchView> {
  const provider = resolveProvider(opts)
  const trimmed = query.trim()
  const queryType = classifyQuery(trimmed)

  if (!provider) {
    await prisma.marketSearchQuery.create({ data: { query: trimmed, queryType, resultCount: 0 } })
    return { configured: false, results: [] }
  }

  const results: MarketSearchResultView[] = []

  const rawHits = await provider.searchInstrument(trimmed)
  for (const rawHit of rawHits) {
    const hit = validateProviderData(InstrumentHitSchema, rawHit)
    const { title, summary } = instrumentResultView(hit)
    assertNoAdviceLanguage(title, 'searchMarket.title')
    assertNoAdviceLanguage(summary, 'searchMarket.summary')
    results.push({
      id: `instrument:${hit.symbol}`,
      resultType: 'INSTRUMENT',
      title,
      summary,
      confidence: 0.9,
      refType: 'instrument',
      refId: hit.symbol,
    })
  }

  if (COMMODITY_QUERY_TYPES.has(queryType)) {
    const rawCommodity = await provider.getCommodityContext(trimmed)
    if (rawCommodity) {
      const ctx = validateProviderData(CommodityContextSchema, rawCommodity)
      const { title, summary } = commodityResultView(ctx)
      assertNoAdviceLanguage(title, 'searchMarket.title')
      assertNoAdviceLanguage(summary, 'searchMarket.summary')
      results.push({
        id: `commodity:${ctx.name}`,
        resultType: 'COMMODITY',
        title,
        summary,
        confidence: 0.85,
        refType: 'commodity',
        refId: ctx.name,
      })
    }
  }

  const searchQuery = await prisma.marketSearchQuery.create({
    data: { query: trimmed, queryType, resultCount: results.length },
  })
  if (results.length > 0) {
    await prisma.marketSearchResult.createMany({
      data: results.map((r) => ({
        queryId: searchQuery.id,
        resultType: r.resultType,
        title: r.title,
        summary: r.summary,
        confidence: r.confidence,
        refType: r.refType,
        refId: r.refId,
      })),
    })
  }

  return { configured: true, results }
}

// ---------------------------------------------------------------------------
// getInstrumentContext
// ---------------------------------------------------------------------------

export type InstrumentContextView = {
  configured: boolean
  provider: string | null
  delayed: boolean
  profile: SerializedInstrument | null
  quote: MarketQuote | null
  summary: string
  graphEvidence: MarketGraphEvidence
}

/**
 * getInstrumentContext: dormant (no active provider) returns configured:false
 * with no profile/quote — NEVER fabricates a price — but still surfaces
 * whatever public graph evidence already exists for the symbol. Configured
 * fetches company profile + quote (both boundary-validated), upserts
 * InstrumentProfile on (provider, symbol), and assembles a guard-clean
 * summary templated ONLY from structured fields (price movement, currency,
 * sector, graph evidence) — provider free-text (e.g. the profile
 * description) is never passed through raw.
 */
export async function getInstrumentContext(symbol: string, opts?: ServiceOptions): Promise<InstrumentContextView> {
  const provider = resolveProvider(opts)
  const trimmedSymbol = symbol.trim()
  const graphEvidence = await gatherGraphEvidence(trimmedSymbol)

  if (!provider) {
    return { configured: false, provider: null, delayed: true, profile: null, quote: null, summary: '', graphEvidence }
  }

  const [rawProfile, rawQuote] = await Promise.all([
    provider.getCompanyProfile(trimmedSymbol),
    provider.getQuote(trimmedSymbol),
  ])
  const quote = validateProviderData(QuoteSchema, rawQuote)

  const metadata = provider.getProviderMetadata()

  const upserted = await prisma.instrumentProfile.upsert({
    where: { provider_symbol: { provider: provider.name, symbol: quote.symbol } },
    create: {
      provider: provider.name,
      symbol: quote.symbol,
      name: rawProfile?.name ?? quote.symbol,
      exchange: null,
      instrumentType: 'UNKNOWN',
      currency: quote.currency,
      delayed: quote.delayed,
      lastFetchedAt: new Date(),
    },
    update: {
      name: rawProfile?.name ?? quote.symbol,
      currency: quote.currency,
      delayed: quote.delayed,
      lastFetchedAt: new Date(),
    },
  })

  const profile: SerializedInstrument = {
    provider: upserted.provider,
    symbol: upserted.symbol,
    name: upserted.name,
    exchange: upserted.exchange,
    instrumentType: upserted.instrumentType as InstrumentType,
    currency: upserted.currency,
    delayed: upserted.delayed,
    isFixture: upserted.isFixture,
  }

  // Structured-field-only summary, built from the allowed-output list (price
  // movement, currency, sector, graph evidence). rawProfile.description is
  // provider free-text (company descriptions, analyst notes) — untrusted and
  // not on the allowed list, so it is deliberately never templated into the
  // summary, regardless of its content. assertNoAdviceLanguage below is the
  // enforced belt-and-braces: even if a future edit adds a new templated
  // field, any advice-shaped phrase anywhere in `summary` fails loudly
  // instead of silently shipping.
  const sectorPart = rawProfile?.sector ? ` Sector: ${rawProfile.sector}.` : ''
  const evidencePart =
    graphEvidence.sectorPressureSignals.length > 0
      ? ` Related sector signals on record: ${graphEvidence.sectorPressureSignals.join(', ')}.`
      : ''
  const summary =
    `${profile.name} (${profile.symbol}) is ${pctText(quote.changePct)}, priced in ${quote.currency}` +
    `${metadata.delayed ? ' (delayed data)' : ''}.${sectorPart}${evidencePart}`

  assertNoAdviceLanguage(summary, 'getInstrumentContext.summary')

  return { configured: true, provider: provider.name, delayed: metadata.delayed, profile, quote, summary, graphEvidence }
}

// ---------------------------------------------------------------------------
// getCommodityContext
// ---------------------------------------------------------------------------

export type CommodityContextView = {
  configured: boolean
  provider: string | null
  delayed: boolean
  profile: SerializedCommodity | null
  summary: string
  graphEvidence: MarketGraphEvidence
}

function toSerializedCommodity(row: {
  provider: string | null
  name: string
  symbol: string | null
  category: string
  keySupplyRegionsJson: string
  keyDemandSectorsJson: string
  delayed: boolean
  isFixture: boolean
}): SerializedCommodity {
  return {
    provider: row.provider,
    name: row.name,
    symbol: row.symbol,
    category: row.category as CommodityCategory,
    keySupplyRegions: JSON.parse(row.keySupplyRegionsJson) as string[],
    keyDemandSectors: JSON.parse(row.keyDemandSectorsJson) as string[],
    delayed: row.delayed,
    isFixture: row.isFixture,
  }
}

/**
 * getCommodityContext: dormant (no active provider) looks for a matching
 * seeded fixture CommodityProfile (case-insensitive exact name match,
 * isFixture:true) and returns it labelled with configured:false and no
 * price — a legitimate reference lookup, not fabricated live data. No match
 * means profile:null. Configured fetches live context (validated), upserts
 * CommodityProfile on name, and returns configured:true.
 */
export async function getCommodityContext(name: string, opts?: ServiceOptions): Promise<CommodityContextView> {
  const provider = resolveProvider(opts)
  const trimmedName = name.trim()
  const graphEvidence = await gatherGraphEvidence(trimmedName)

  if (!provider) {
    // SQLite has no case-insensitive equality at the query-engine level, so
    // compare in JS after fetch (same reasoning as gatherGraphEvidence above).
    const fixtures = await prisma.commodityProfile.findMany({ where: { isFixture: true } })
    const fixture = fixtures.find((f) => f.name.toLowerCase() === trimmedName.toLowerCase())
    if (!fixture) {
      return { configured: false, provider: null, delayed: true, profile: null, summary: '', graphEvidence }
    }
    const profile = toSerializedCommodity(fixture)
    const summary = `${profile.name}: seeded fixture reference data (no live price). Provider is not configured.`
    assertNoAdviceLanguage(summary, 'getCommodityContext.summary')
    return { configured: false, provider: null, delayed: true, profile, summary, graphEvidence }
  }

  const rawContext = await provider.getCommodityContext(trimmedName)
  if (!rawContext) {
    return { configured: true, provider: provider.name, delayed: true, profile: null, summary: '', graphEvidence }
  }
  const ctx = validateProviderData(CommodityContextSchema, rawContext)
  const metadata = provider.getProviderMetadata()

  const upserted = await prisma.commodityProfile.upsert({
    where: { name: ctx.name },
    create: {
      provider: provider.name,
      name: ctx.name,
      symbol: ctx.symbol,
      category: ctx.category,
      keySupplyRegionsJson: JSON.stringify(ctx.keySupplyRegions),
      keyDemandSectorsJson: JSON.stringify(ctx.keyDemandSectors),
      delayed: ctx.delayed,
      lastFetchedAt: new Date(),
    },
    update: {
      provider: provider.name,
      symbol: ctx.symbol,
      category: ctx.category,
      keySupplyRegionsJson: JSON.stringify(ctx.keySupplyRegions),
      keyDemandSectorsJson: JSON.stringify(ctx.keyDemandSectors),
      delayed: ctx.delayed,
      lastFetchedAt: new Date(),
    },
  })

  const profile = toSerializedCommodity(upserted)
  const supply = profile.keySupplyRegions.length > 0 ? profile.keySupplyRegions.join(', ') : 'no key regions on record'
  const demand = profile.keyDemandSectors.length > 0 ? profile.keyDemandSectors.join(', ') : 'no key sectors on record'
  const evidencePart =
    graphEvidence.sectorPressureSignals.length > 0
      ? ` Related sector signals on record: ${graphEvidence.sectorPressureSignals.join(', ')}.`
      : ''
  const summary =
    `${profile.name} (${profile.category.toLowerCase()}) supply concentrated in ${supply}; demand driven by ${demand}` +
    `${metadata.delayed ? ' (delayed data)' : ''}.${evidencePart}`

  assertNoAdviceLanguage(summary, 'getCommodityContext.summary')

  return { configured: true, provider: provider.name, delayed: metadata.delayed, profile, summary, graphEvidence }
}

// ---------------------------------------------------------------------------
// getMarketStatusView
// ---------------------------------------------------------------------------

export { getMarketStatus as getMarketStatusView } from './provider'

// Re-exported so callers can check provider free-text before including it
// anywhere, without a second import path.
export { findAdviceLanguage }
