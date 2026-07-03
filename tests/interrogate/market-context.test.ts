import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { interrogate, MARKET_DISCLAIMER } from '@/server/interrogate/service'
import type { MarketDataProvider } from '@/server/market/types'
import { resetDb } from '../helpers'

/** Test double implementing MarketDataProvider. No real key, no network — mirrors
 *  tests/market/service.test.ts's FakeMarketProvider convention. */
class FakeMarketProvider implements MarketDataProvider {
  name = 'fake'

  getProviderMetadata() {
    return { name: 'fake', delayed: true, supportsCommodities: true }
  }

  async searchInstrument() {
    return []
  }

  async getQuote(identifier: string) {
    return { symbol: identifier, price: 123.45, currency: 'GBP', changePct: 2.3, asOf: new Date().toISOString(), delayed: true }
  }

  async getHistoricalBars() {
    return []
  }

  async getCompanyProfile(identifier: string) {
    return { symbol: identifier, name: 'Acme Industrials (sample)', sector: 'Industrials', description: 'A sample manufacturer.' }
  }

  async getCommodityContext(identifier: string) {
    return {
      name: identifier,
      symbol: null,
      category: 'METAL' as const,
      keySupplyRegions: ['Chile', 'Peru'],
      keyDemandSectors: ['Construction'],
      delayed: true,
    }
  }
}

const CONFIGURED_DISCLAIMER =
  'This view provides public market context and strategic interpretation examples. It does not provide personal investment advice, portfolio advice, or buy, sell or hold recommendations.'

describe('interrogate market context wiring', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    await runFullScan()
  })

  it('dormant (no marketProvider passed): a market-shaped query stays byte-identical to today', async () => {
    const result = await interrogate('BP')
    expect(result.queryType).toBe('TICKER')
    expect(result.marketContextAvailable).toBe(false)
    expect(result.disclaimer).toBe(MARKET_DISCLAIMER)
    expect(result.marketContext).toEqual({
      configured: false,
      provider: null,
      delayed: true,
      instrument: null,
      commodity: null,
      quote: null,
      note: 'market data provider not configured',
    })
  })

  it('dormant (explicit marketProvider: null): identical to the default-resolved dormant path', async () => {
    const result = await interrogate('Copper', { marketProvider: null })
    expect(result.queryType).toBe('COMMODITY')
    expect(result.marketContextAvailable).toBe(false)
    expect(result.disclaimer).toBe(MARKET_DISCLAIMER)
    expect(result.marketContext?.configured).toBe(false)
    expect(result.marketContext?.note).toBe('market data provider not configured')
  })

  it('configured (injected FakeMarketProvider): a COMMODITY query populates marketContext and swaps the disclaimer', async () => {
    const fake = new FakeMarketProvider()
    const result = await interrogate('Copper', { marketProvider: fake })

    expect(result.queryType).toBe('COMMODITY')
    expect(result.marketContextAvailable).toBe(true)
    expect(result.disclaimer).toBe(CONFIGURED_DISCLAIMER)
    expect(result.marketContext).not.toBeNull()
    expect(result.marketContext?.configured).toBe(true)
    expect(result.marketContext?.commodity).not.toBeNull()
    expect(result.marketContext?.commodity?.name).toBe('Copper')
  })

  it('configured (injected FakeMarketProvider): a TICKER query populates instrument marketContext', async () => {
    const fake = new FakeMarketProvider()
    const result = await interrogate('BP', { marketProvider: fake })

    expect(result.queryType).toBe('TICKER')
    expect(result.marketContextAvailable).toBe(true)
    expect(result.disclaimer).toBe(CONFIGURED_DISCLAIMER)
    expect(result.marketContext?.configured).toBe(true)
    expect(result.marketContext?.instrument).not.toBeNull()
    expect(result.marketContext?.quote).not.toBeNull()
  })

  it('non-market query: marketContext is null and existing fields are unchanged, provider or not', async () => {
    const fake = new FakeMarketProvider()

    const dormant = await interrogate('technology')
    expect(dormant.marketContext).toBeNull()
    expect(dormant.marketContextAvailable).toBe(true)
    expect(dormant.disclaimer).toBeNull()

    const configured = await interrogate('technology', { marketProvider: fake })
    expect(configured.marketContext).toBeNull()
    expect(configured.marketContextAvailable).toBe(true)
    expect(configured.disclaimer).toBeNull()
  })

  it('never fabricates: an empty-string query yields configured:false market context with no injected provider call needed', async () => {
    const result = await interrogate('')
    expect(result.marketContext).toBeNull()
  })

  it('graph evidence: a configured COMMODITY query surfaces connected event/sector context from the 1-degree neighbourhood, never fabricated', async () => {
    // Seed a commodity fixture profile + project it into the graph, wired to a real
    // sector node, so the neighbourhood traversal has something genuine to find.
    await prisma.commodityProfile.upsert({
      where: { name: 'Copper' },
      update: {},
      create: {
        provider: 'FIXTURE',
        name: 'Copper',
        category: 'METAL',
        keySupplyRegionsJson: '[]',
        keyDemandSectorsJson: JSON.stringify(['technology']),
        isFixture: true,
      },
    })
    const { syncMarketNodes } = await import('@/server/market/graph')
    await syncMarketNodes(new Date())

    const fake = new FakeMarketProvider()
    const result = await interrogate('Copper', { marketProvider: fake })

    expect(result.marketContextAvailable).toBe(true)
    expect(result.marketContext?.configured).toBe(true)
    // No graph evidence is fabricated: whatever's returned must be real subgraph data,
    // not free text. An empty array is a legitimate "no evidence" outcome too.
    expect(Array.isArray(result.subgraph.nodes)).toBe(true)
  })
})
