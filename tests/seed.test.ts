import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { resetDb } from './helpers'

describe('runSeed', () => {
  beforeEach(resetDb)

  it('seeds fixture sources, an unsupported source, and (optionally) the live RSS source', async () => {
    const result = await runSeed({ includeLive: false })
    expect(result.sourcesSeeded).toBe(3)

    const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } })
    expect(sources.map((s) => s.name)).toEqual([
      'Companies House Filings',
      'Fixture Wire A',
      'Fixture Wire B',
    ])
    const fixtureA = sources.find((s) => s.name === 'Fixture Wire A')!
    expect(fixtureA.isFixture).toBe(true)
    expect(fixtureA.accessMethod).toBe('FIXTURE')
    expect(fixtureA.collectorStatus).toBe('FUNCTIONAL')

    const unsupported = sources.find((s) => s.name === 'Companies House Filings')!
    expect(unsupported.accessMethod).toBe('UNSUPPORTED')
    expect(unsupported.collectorStatus).toBe('UNSUPPORTED')
    expect(unsupported.isActive).toBe(true)

    const lens = await prisma.revenueLens.findFirstOrThrow({ where: { isDefault: true } })
    expect(lens.name).toBe('General Commercial Lens')
  })

  it('includes the live BBC RSS source when includeLive is true and is idempotent', async () => {
    await runSeed({ includeLive: true })
    await runSeed({ includeLive: true })
    const sources = await prisma.source.findMany()
    expect(sources).toHaveLength(4)
    const bbc = sources.find((s) => s.name === 'BBC News Business')!
    expect(bbc.accessMethod).toBe('RSS')
    expect(bbc.isFixture).toBe(false)
    expect(bbc.url).toBe('https://feeds.bbci.co.uk/news/business/rss.xml')
  })

  it('seeds ≥1 LLMProviderConfig with enabled=false', async () => {
    await runSeed({ includeLive: false })
    const configs = await prisma.lLMProviderConfig.findMany()
    expect(configs.length).toBeGreaterThanOrEqual(1)
    for (const config of configs) {
      expect(config.enabled).toBe(false)
      expect(config.providerName).toBe('Anthropic')
    }
    // Verify the fast (Haiku) and reasoning (Opus) real-model configs exist
    const fastModel = configs.find((c) => c.modelName === 'claude-haiku-4-5')
    const reasoningModel = configs.find((c) => c.modelName === 'claude-opus-4-8')
    expect(fastModel).toBeDefined()
    expect(reasoningModel).toBeDefined()
  })

  it('seeds fixture CommodityProfile and InstrumentProfile records with isFixture=true and provider set', async () => {
    await runSeed({ includeLive: false })

    const commodities = await prisma.commodityProfile.findMany({
      where: { isFixture: true },
    })
    expect(commodities.length).toBeGreaterThanOrEqual(1)
    for (const commodity of commodities) {
      expect(commodity.isFixture).toBe(true)
      expect(commodity.provider).toBe('FIXTURE')
    }

    // Verify at least the seeded commodities exist
    const copper = commodities.find((c) => c.name === 'Copper')
    const oil = commodities.find((c) => c.name === 'Brent Crude Oil')
    const wheat = commodities.find((c) => c.name === 'Wheat')
    const lithium = commodities.find((c) => c.name === 'Lithium')
    expect(copper).toBeDefined()
    expect(oil).toBeDefined()
    expect(wheat).toBeDefined()
    expect(lithium).toBeDefined()

    const instruments = await prisma.instrumentProfile.findMany({
      where: { isFixture: true },
    })
    expect(instruments.length).toBeGreaterThanOrEqual(1)
    for (const instrument of instruments) {
      expect(instrument.isFixture).toBe(true)
      expect(instrument.provider).toBe('FIXTURE')
    }

    // Verify at least the seeded instruments exist
    const acme = instruments.find((i) => i.symbol === 'ACME')
    const smplEtf = instruments.find((i) => i.symbol === 'SMPL-ETF')
    expect(acme).toBeDefined()
    expect(smplEtf).toBeDefined()

    // Confirm that no price-related fields exist (reference-only)
    // Both commodity and instrument models have no price/quote columns by design
    expect(copper?.metadataJson).toBe('{}')
    expect(acme?.metadataJson).toBe('{}')
  })

  it('seeds ≥1 WatchMarket with active=true', async () => {
    await runSeed({ includeLive: false })
    const markets = await prisma.watchMarket.findMany()
    expect(markets.length).toBeGreaterThanOrEqual(1)
    const lithium = markets.find((m) => m.name === 'Lithium supply chain')
    expect(lithium).toBeDefined()
    expect(lithium?.active).toBe(true)
    const sectors = JSON.parse(lithium!.sectorsJson)
    expect(sectors).toContain('Mining')
    expect(sectors).toContain('EV')
  })
})
