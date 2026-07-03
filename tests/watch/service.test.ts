import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import {
  createWatchMarket,
  listWatchMarkets,
  getWatchMarket,
  updateWatchMarket,
  deleteWatchMarket,
  resolveWatchMarket,
} from '@/server/watch/service'

describe('watch market service', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('create -> list -> update -> delete round-trips cleanly', async () => {
    const created = await createWatchMarket({
      name: 'Lithium supply chain',
      description: 'Monitor lithium risk',
      sectors: ['Mining', 'EV'],
      regions: ['Australia', 'Chile'],
      themes: ['supply chain'],
      queryTerms: ['lithium'],
    })
    expect(created.name).toBe('Lithium supply chain')
    expect(created.sectors).toEqual(['Mining', 'EV'])
    expect(created.regions).toEqual(['Australia', 'Chile'])
    expect(created.themes).toEqual(['supply chain'])
    expect(created.queryTerms).toEqual(['lithium'])
    expect(created.active).toBe(true)

    const listed = await listWatchMarkets()
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(created.id)

    const fetched = await getWatchMarket(created.id)
    expect(fetched?.name).toBe('Lithium supply chain')

    const updated = await updateWatchMarket(created.id, { active: false, sectors: ['Mining'] })
    expect(updated?.active).toBe(false)
    expect(updated?.sectors).toEqual(['Mining'])

    await deleteWatchMarket(created.id)
    const afterDelete = await getWatchMarket(created.id)
    expect(afterDelete).toBeNull()
    expect(await listWatchMarkets()).toHaveLength(0)
  })

  it('getWatchMarket returns null for an unknown id', async () => {
    expect(await getWatchMarket('does-not-exist')).toBeNull()
  })

  it('updateWatchMarket returns null for an unknown id', async () => {
    expect(await updateWatchMarket('does-not-exist', { active: false })).toBeNull()
  })

  it('never leaks raw *Json strings — service output is fully parsed', async () => {
    const created = await createWatchMarket({
      name: 'AI regulation',
      sectors: ['Technology'],
      regions: ['EU'],
      themes: [],
      queryTerms: ['AI Act'],
    })
    const serialized = JSON.stringify(created)
    expect(serialized).not.toMatch(/"sectorsJson"|"regionsJson"|"themesJson"|"queryTermsJson"/)
    expect(Array.isArray(created.sectors)).toBe(true)
    expect(Array.isArray(created.regions)).toBe(true)
    expect(Array.isArray(created.themes)).toBe(true)
    expect(Array.isArray(created.queryTerms)).toBe(true)
  })

  async function seedEventWithSector(overrides: Partial<{ affectedSector: string; affectedRegion: string; title: string }> = {}) {
    const sr = await prisma.scanRun.create({ data: {} })
    return prisma.eventCandidate.create({
      data: {
        title: overrides.title ?? 'Lithium price spike — Chile export curbs',
        eventType: 'SUPPLY_CHAIN_EVENT',
        eventClass: 'OPPORTUNITY',
        summary: 'Export curbs are tightening lithium supply.',
        severity: 0.6,
        probability: 0.7,
        confidence: 0.75,
        affectedSector: overrides.affectedSector ?? 'Mining',
        affectedRegion: overrides.affectedRegion ?? 'Chile',
        evidenceCount: 3,
        sourceDiversityScore: 1,
        signalStrength: 0.7,
        noveltyScore: 0.8,
        opportunityScore: 0.6,
        riskScore: 0.3,
        createdFromScanRunId: sr.id,
        isFixture: true,
      },
    })
  }

  it('resolveWatchMarket matches a scoped event by sector/region (case-insensitive)', async () => {
    const event = await seedEventWithSector({ affectedSector: 'mining', affectedRegion: 'chile' })
    const market = await createWatchMarket({
      name: 'Lithium supply chain',
      sectors: ['Mining'],
      regions: ['Chile'],
      themes: [],
      queryTerms: [],
    })

    const resolved = await resolveWatchMarket(market.id)
    expect(resolved).not.toBeNull()
    expect(resolved!.market.id).toBe(market.id)
    expect(resolved!.events.map((e) => e.id)).toContain(event.id)
  })

  it('resolveWatchMarket matches on a query term against the event title (case-insensitive)', async () => {
    const event = await seedEventWithSector({
      affectedSector: 'Technology',
      affectedRegion: 'UK',
      title: 'Cobalt refining bottleneck emerges in supply chain',
    })
    const market = await createWatchMarket({
      name: 'Cobalt watch',
      sectors: [],
      regions: [],
      themes: [],
      queryTerms: ['cobalt'],
    })

    const resolved = await resolveWatchMarket(market.id)
    expect(resolved!.events.map((e) => e.id)).toContain(event.id)
  })

  it('resolveWatchMarket with an empty scope returns empty arrays — never fabricated', async () => {
    await seedEventWithSector()
    const market = await createWatchMarket({
      name: 'Empty scope market',
      sectors: [],
      regions: [],
      themes: [],
      queryTerms: [],
    })

    const resolved = await resolveWatchMarket(market.id)
    expect(resolved).not.toBeNull()
    expect(resolved!.events).toEqual([])
    expect(resolved!.opportunities).toEqual([])
  })

  it('resolveWatchMarket returns null for an unknown market id', async () => {
    expect(await resolveWatchMarket('does-not-exist')).toBeNull()
  })

  it('resolveWatchMarket treats a whitespace-only queryTerm as empty — no spurious substring match', async () => {
    // A " " term would otherwise substring-match almost any multi-word title/summary via
    // `haystack.includes(term)`. Trimming + dropping empties must stop that.
    await seedEventWithSector({
      affectedSector: 'Technology',
      affectedRegion: 'UK',
      title: 'Cobalt refining bottleneck emerges in supply chain',
    })
    const market = await createWatchMarket({
      name: 'Whitespace-term market',
      sectors: [],
      regions: [],
      themes: [],
      queryTerms: [' '],
    })

    const resolved = await resolveWatchMarket(market.id)
    expect(resolved).not.toBeNull()
    expect(resolved!.events).toEqual([])
    expect(resolved!.opportunities).toEqual([])
  })

  it('resolveWatchMarket still matches on a term with surrounding whitespace, trimmed', async () => {
    const event = await seedEventWithSector({
      affectedSector: 'Technology',
      affectedRegion: 'UK',
      title: 'Cobalt refining bottleneck emerges in supply chain',
    })
    const market = await createWatchMarket({
      name: 'Padded term market',
      sectors: [],
      regions: [],
      themes: [],
      queryTerms: ['  cobalt  '],
    })

    const resolved = await resolveWatchMarket(market.id)
    expect(resolved!.events.map((e) => e.id)).toContain(event.id)
  })
})
