import type { MarketProviderStatus } from '@/shared/enums'
import {
  NoMarketProviderConfiguredError,
  type CommodityContextData,
  type CompanyProfile,
  type HistoricalBar,
  type InstrumentSearchHit,
  type MarketDataProvider,
  type MarketQuote,
  type ProviderMetadata,
} from './types'

/** Always-dormant provider. Used as an explicit fallback; every async data
 *  method throws NoMarketProviderConfiguredError so callers degrade the same
 *  way whether they hold a NullProvider or got null from
 *  getActiveMarketProvider(). */
export class NullProvider implements MarketDataProvider {
  name = 'none'

  getProviderMetadata(): ProviderMetadata {
    return { name: 'none', delayed: true, supportsCommodities: false }
  }

  async searchInstrument(_query: string): Promise<InstrumentSearchHit[]> {
    throw new NoMarketProviderConfiguredError()
  }

  async getQuote(_identifier: string): Promise<MarketQuote> {
    throw new NoMarketProviderConfiguredError()
  }

  async getHistoricalBars(_identifier: string, _range: string): Promise<HistoricalBar[]> {
    throw new NoMarketProviderConfiguredError()
  }

  async getCompanyProfile(_identifier: string): Promise<CompanyProfile | null> {
    throw new NoMarketProviderConfiguredError()
  }

  async getCommodityContext(_identifier: string): Promise<CommodityContextData | null> {
    throw new NoMarketProviderConfiguredError()
  }
}

/** Real adapters (Task 4+) register here, keyed by lowercased provider name
 *  (matches env.MARKET_DATA_PROVIDER). Empty now — no adapter ships in this
 *  task, so the registry can never resolve to a live provider yet. */
export const ADAPTER_REGISTRY: Record<string, (apiKey: string) => MarketDataProvider> = {}

/** The subset of env this module actually reads — narrower than
 *  NodeJS.ProcessEnv so tests can pass plain partial objects (e.g. `{}`)
 *  without needing to fake the entire ambient process env. The index
 *  signature (rather than just two optional properties) is what lets
 *  NodeJS.ProcessEnv itself satisfy this type as the default value. */
export type MarketEnv = { [key: string]: string | undefined; MARKET_DATA_API_KEY?: string; MARKET_DATA_PROVIDER?: string }

/** The single source of truth for "is market data live". Returns a
 *  registry-built provider only when BOTH env.MARKET_DATA_API_KEY is set AND
 *  env.MARKET_DATA_PROVIDER (lowercased) names a registered adapter; else
 *  null — dormant. Never logs the key. env defaults to process.env but is
 *  injectable so callers/tests never depend on real process state. */
export function getActiveMarketProvider(env: MarketEnv = process.env): MarketDataProvider | null {
  const apiKey = env.MARKET_DATA_API_KEY
  if (!apiKey) return null

  const providerName = env.MARKET_DATA_PROVIDER?.toLowerCase()
  if (!providerName) return null

  const build = ADAPTER_REGISTRY[providerName]
  if (!build) return null

  return build(apiKey)
}

/** Status view for the API: whether market data is live, which provider (if
 *  any), and whether that provider's data is delayed. Dormant (no active
 *  provider) always reports NOT_CONFIGURED/null/delayed:true — never invents
 *  a provider name or claims real-time data. */
export function getMarketStatus(
  env: MarketEnv = process.env,
): { status: MarketProviderStatus; provider: string | null; delayed: boolean } {
  const provider = getActiveMarketProvider(env)
  if (!provider) return { status: 'NOT_CONFIGURED', provider: null, delayed: true }

  const metadata = provider.getProviderMetadata()
  return { status: 'CONFIGURED', provider: metadata.name, delayed: metadata.delayed }
}
