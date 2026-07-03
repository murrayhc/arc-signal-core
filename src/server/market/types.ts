import type { CommodityCategory, InstrumentType } from '@/shared/enums'

/** A single instrument search hit from a provider. */
export type InstrumentSearchHit = {
  symbol: string
  name: string
  exchange: string | null
  instrumentType: InstrumentType
  currency: string
}

/** A live (or provider-delayed) quote for one instrument. */
export type MarketQuote = {
  symbol: string
  price: number
  currency: string
  changePct: number | null
  asOf: string
  delayed: boolean
}

/** One OHLCV bar. */
export type HistoricalBar = {
  t: string
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** Commodity context as returned by a provider — reference data, not a quote. */
export type CommodityContextData = {
  name: string
  symbol: string | null
  category: CommodityCategory
  keySupplyRegions: string[]
  keyDemandSectors: string[]
  delayed: boolean
}

/** Static description of a provider's capabilities — never the key itself. */
export type ProviderMetadata = {
  name: string
  delayed: boolean
  supportsCommodities: boolean
}

/** Company profile as returned by a provider. description is UNTRUSTED
 *  provider free-text (analyst notes, marketing copy) — callers must run it
 *  through findAdviceLanguage before it can appear in any persisted/rendered
 *  summary; never pass it through raw. */
export type CompanyProfile = {
  symbol: string
  name: string
  sector: string | null
  description: string
}

/** Adapter abstraction for a real market-data vendor. Real adapters (Task 4+)
 *  and test doubles (FakeMarketProvider) both implement this so the service
 *  never depends on a concrete SDK. */
export interface MarketDataProvider {
  name: string
  getProviderMetadata(): ProviderMetadata
  searchInstrument(query: string): Promise<InstrumentSearchHit[]>
  getQuote(identifier: string): Promise<MarketQuote>
  getHistoricalBars(identifier: string, range: string): Promise<HistoricalBar[]>
  getCompanyProfile(identifier: string): Promise<CompanyProfile | null>
  getCommodityContext(identifier: string): Promise<CommodityContextData | null>
}

/** Thrown whenever no usable market-data provider is available — missing API
 *  key, unknown provider name, or an explicit null. Never thrown for
 *  business/content reasons; always means "dormant". */
export class NoMarketProviderConfiguredError extends Error {
  constructor(message = 'No market-data provider is configured — market data is dormant.') {
    super(message)
    this.name = 'NoMarketProviderConfiguredError'
  }
}

/** Thrown when provider-returned data fails boundary (Zod) validation.
 *  External market data is untrusted input — malformed data must never
 *  reach the graph/UI. */
export class MarketDataValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarketDataValidationError'
  }
}
