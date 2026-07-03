import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import { runSeed } from '@/server/seed'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { getCommodityContext, getInstrumentContext, searchMarket } from '@/server/market/service'
import type {
  CommodityContextData,
  CompanyProfile,
  HistoricalBar,
  InstrumentSearchHit,
  MarketDataProvider,
  MarketQuote,
  ProviderMetadata,
} from '@/server/market/types'

/** Test double implementing MarketDataProvider. No real key, no network. */
class FakeMarketProvider implements MarketDataProvider {
  name = 'fake'

  constructor(
    private opts: {
      hits?: InstrumentSearchHit[]
      quote?: MarketQuote
      profile?: CompanyProfile | null
      commodity?: CommodityContextData | null
    } = {},
  ) {}

  getProviderMetadata(): ProviderMetadata {
    return { name: 'fake', delayed: true, supportsCommodities: true }
  }

  async searchInstrument(): Promise<InstrumentSearchHit[]> {
    return this.opts.hits ?? []
  }

  async getQuote(identifier: string): Promise<MarketQuote> {
    if (this.opts.quote) return this.opts.quote
    return { symbol: identifier, price: 100, currency: 'GBP', changePct: 1.5, asOf: new Date().toISOString(), delayed: true }
  }

  async getHistoricalBars(): Promise<HistoricalBar[]> {
    return []
  }

  async getCompanyProfile(): Promise<CompanyProfile | null> {
    return this.opts.profile ?? null
  }

  async getCommodityContext(): Promise<CommodityContextData | null> {
    return this.opts.commodity ?? null
  }
}

const ACME_HIT: InstrumentSearchHit = {
  symbol: 'ACME',
  name: 'Acme Industrials (sample)',
  exchange: 'LSE',
  instrumentType: 'EQUITY',
  currency: 'GBP',
}

const ACME_QUOTE: MarketQuote = {
  symbol: 'ACME',
  price: 123.45,
  currency: 'GBP',
  changePct: 2.3,
  asOf: new Date().toISOString(),
  delayed: true,
}

const ACME_PROFILE: CompanyProfile = {
  symbol: 'ACME',
  name: 'Acme Industrials (sample)',
  sector: 'Industrials',
  description: 'A sample industrial manufacturer used for fixture testing.',
}

describe('searchMarket', () => {
  beforeEach(resetDb)

  it('dormant (provider:null): returns configured:false and persists a query with resultCount:0', async () => {
    const result = await searchMarket('copper', { provider: null })
    expect(result).toEqual({ configured: false, results: [] })

    const queries = await prisma.marketSearchQuery.findMany()
    expect(queries).toHaveLength(1)
    expect(queries[0].query).toBe('copper')
    expect(queries[0].resultCount).toBe(0)
  })

  it('configured: returns results, persists them, and every title+summary is guard-clean', async () => {
    const fake = new FakeMarketProvider({ hits: [ACME_HIT] })
    const result = await searchMarket('acme', { provider: fake })

    expect(result.configured).toBe(true)
    expect(result.results.length).toBeGreaterThanOrEqual(1)
    for (const r of result.results) {
      expect(findAdviceLanguage(r.title)).toEqual([])
      expect(findAdviceLanguage(r.summary)).toEqual([])
    }

    const persisted = await prisma.marketSearchResult.findMany()
    expect(persisted.length).toBeGreaterThanOrEqual(1)
  })
})

describe('getInstrumentContext', () => {
  beforeEach(resetDb)

  it('dormant (provider:null): configured:false, quote:null, profile:null, does not throw', async () => {
    const result = await getInstrumentContext('ACME', { provider: null })
    expect(result.configured).toBe(false)
    expect(result.quote).toBeNull()
    expect(result.profile).toBeNull()
  })

  it('configured: upserts InstrumentProfile with provider+delayed, summary is guard-clean; re-run does not duplicate', async () => {
    const fake = new FakeMarketProvider({ quote: ACME_QUOTE, profile: ACME_PROFILE })

    const result = await getInstrumentContext('ACME', { provider: fake })
    expect(result.configured).toBe(true)
    expect(result.quote).not.toBeNull()
    expect(result.profile).not.toBeNull()
    expect(findAdviceLanguage(result.summary)).toEqual([])

    const profiles = await prisma.instrumentProfile.findMany({ where: { provider: 'fake', symbol: 'ACME' } })
    expect(profiles).toHaveLength(1)
    expect(profiles[0].provider).toBe('fake')
    expect(profiles[0].delayed).toBe(true)

    // Re-run: no duplicate row (upsert on provider+symbol)
    await getInstrumentContext('ACME', { provider: fake })
    const profilesAfter = await prisma.instrumentProfile.findMany({ where: { provider: 'fake', symbol: 'ACME' } })
    expect(profilesAfter).toHaveLength(1)
  })

  it('adversarial: provider free-text advice language never reaches the returned summary', async () => {
    const adversarialProfile: CompanyProfile = {
      symbol: 'ACME',
      name: 'Acme Industrials (sample)',
      sector: 'Industrials',
      description: 'Analysts rate this a strong buy, price target 250.',
    }
    const fake = new FakeMarketProvider({ quote: ACME_QUOTE, profile: adversarialProfile })

    const result = await getInstrumentContext('ACME', { provider: fake })
    expect(result.configured).toBe(true)
    expect(findAdviceLanguage(result.summary)).toEqual([])
  })
})

describe('getCommodityContext', () => {
  beforeEach(resetDb)

  it('dormant: surfaces the seeded fixture reference profile (labelled, no price), configured:false', async () => {
    await runSeed({ includeLive: false })

    const result = await getCommodityContext('Copper', { provider: null })
    expect(result.configured).toBe(false)
    expect(result.profile).not.toBeNull()
    expect(result.profile?.name).toBe('Copper')
    expect(findAdviceLanguage(result.summary)).toEqual([])
  })

  it('configured: upserts CommodityProfile from live context', async () => {
    const liveCommodity: CommodityContextData = {
      name: 'Copper',
      symbol: 'HG',
      category: 'METAL',
      keySupplyRegions: ['Chile', 'Peru'],
      keyDemandSectors: ['Construction', 'EV'],
      delayed: true,
    }
    const fake = new FakeMarketProvider({ commodity: liveCommodity })

    const result = await getCommodityContext('Copper', { provider: fake })
    expect(result.configured).toBe(true)
    expect(result.profile).not.toBeNull()
    expect(findAdviceLanguage(result.summary)).toEqual([])

    const profiles = await prisma.commodityProfile.findMany({ where: { name: 'Copper' } })
    expect(profiles).toHaveLength(1)
    expect(profiles[0].provider).toBe('fake')
  })
})
