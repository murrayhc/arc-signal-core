import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { collectFromSources } from '@/server/pipeline/collect'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { makeSource } from '../factories'

describe('collectFromSources', () => {
  beforeEach(resetDb)

  it('creates documents from a supported fixture source', async () => {
    await runSeed({ includeLive: false })
    const sources = await prisma.source.findMany({ where: { isActive: true } })
    const result = await collectFromSources(sources)

    expect(result.documents.length).toBe(8) // 5 items in feed A + 3 in feed B
    const doc = result.documents[0]
    expect(doc.isFixture).toBe(true)
    expect(doc.rawContentHash).toHaveLength(64)
    const updated = await prisma.source.findFirstOrThrow({ where: { name: 'Fixture Wire A' } })
    expect(updated.lastRunStatus).toBe('SUCCESS')
    expect(updated.lastRunAt).not.toBeNull()
  })

  it('skips duplicate documents on a second collection', async () => {
    await runSeed({ includeLive: false })
    const sources = await prisma.source.findMany({ where: { isActive: true } })
    await collectFromSources(sources)
    const second = await collectFromSources(sources)
    expect(second.documents).toHaveLength(0)
    expect(await prisma.document.count()).toBe(8)
  })

  it('skips unsupported sources with a recorded reason', async () => {
    await runSeed({ includeLive: false })
    const sources = await prisma.source.findMany({ where: { isActive: true } })
    const result = await collectFromSources(sources)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toContain('UNSUPPORTED')
    const skippedSource = await prisma.source.findFirstOrThrow({ where: { name: 'Companies House Filings' } })
    expect(skippedSource.lastRunStatus).toBe('SKIPPED_UNSUPPORTED')
  })

  it('records an error for a failing source without throwing, and continues', async () => {
    await runSeed({ includeLive: false })
    // Unroutable local port → fast deterministic connection failure, no external network.
    await makeSource({
      name: 'Broken RSS',
      accessMethod: 'RSS',
      url: 'http://127.0.0.1:9/nope.xml',
      isFixture: false,
    })
    const sources = await prisma.source.findMany({ where: { isActive: true } })
    const result = await collectFromSources(sources)
    expect(result.documents.length).toBe(8) // fixture docs still collected
    expect(result.errors.some((e) => e.stage === 'collect' && e.message.length > 0)).toBe(true)
    const broken = await prisma.source.findFirstOrThrow({ where: { name: 'Broken RSS' } })
    expect(broken.lastRunStatus).toBe('FAILED')
    // The failure detail is carried on the per-source outcome for SourceHealth.
    const outcome = result.perSource.find((o) => o.sourceId === broken.id)
    expect(outcome?.outcome).toBe('FAILED')
    expect(outcome?.errorMessage).toBeTruthy()
  })

  it('reconciles collectorStatus with runtime truth on every scan, ignoring stale seed values', async () => {
    await runSeed({ includeLive: false })
    // Lie in the DB in both directions: a supported source stamped UNSUPPORTED,
    // and the unsupported Companies House placeholder stamped FUNCTIONAL.
    await prisma.source.updateMany({ where: { name: 'Fixture Wire A' }, data: { collectorStatus: 'UNSUPPORTED' } })
    await prisma.source.updateMany({ where: { name: 'Companies House Filings' }, data: { collectorStatus: 'FUNCTIONAL' } })

    const sources = await prisma.source.findMany({ where: { isActive: true } })
    await collectFromSources(sources)

    const wireA = await prisma.source.findFirstOrThrow({ where: { name: 'Fixture Wire A' } })
    expect(wireA.collectorStatus).toBe('FUNCTIONAL') // a collector exists and ran
    const companiesHouse = await prisma.source.findFirstOrThrow({ where: { name: 'Companies House Filings' } })
    expect(companiesHouse.collectorStatus).toBe('UNSUPPORTED') // no collector exists
  })

  it('refuses fixture paths outside fixtures/', async () => {
    const evil = await makeSource({ name: 'Evil Fixture', url: '../.env' })
    const result = await collectFromSources([evil])
    expect(result.documents).toHaveLength(0)
    expect(result.errors[0].message).toContain('outside fixtures')
  })

  it('reports a clear error for a malformed fixture file', async () => {
    const bad = await makeSource({ name: 'Bad Fixture', url: 'fixtures/malformed-fixture.json' })
    const result = await collectFromSources([bad])
    expect(result.documents).toHaveLength(0)
    expect(result.errors[0].message).toContain('Malformed fixture file')
  })
})
