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
})
