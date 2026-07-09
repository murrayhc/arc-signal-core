import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { clusterSignals, scoreCluster } from '@/server/pipeline/cluster'
import { resetDb } from '../helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from '../factories'
import type { Signal } from '@prisma/client'

async function signalFrom(
  sourceOverrides: Parameters<typeof makeSource>[0],
  signalOverrides: Partial<Parameters<typeof makeSignal>[3]> = {},
): Promise<Signal> {
  const source = await makeSource(sourceOverrides)
  const doc = await makeDocument(source.id)
  const claim = await makeClaim(doc.id)
  return makeSignal(claim.id, doc.id, source.id, signalOverrides)
}

describe('scoreCluster (pure)', () => {
  it('gives higher confidence to multi-source clusters than single-source clusters', () => {
    const base = { strength: 0.7, confidence: 0.85 }
    const twoSources = scoreCluster([
      { ...base, sourceId: 's1' } as Signal,
      { ...base, sourceId: 's2' } as Signal,
    ])
    const oneSourceTwice = scoreCluster([
      { ...base, sourceId: 's1' } as Signal,
      { ...base, sourceId: 's1' } as Signal,
    ])
    expect(twoSources.confidence).toBeGreaterThan(oneSourceTwice.confidence)
    expect(twoSources.distinctSources).toBe(2)
    expect(oneSourceTwice.diversityRatio).toBe(0)
  })
})

describe('clusterSignals', () => {
  beforeEach(resetDb)

  it('clusters related signals (same type/sector/region) across sources', async () => {
    const a = await signalFrom({ name: 'Wire A' }, { sector: 'technology', region: 'UK' })
    const b = await signalFrom({ name: 'Wire B' }, { sector: 'technology', region: 'UK' })
    const { clusters } = await clusterSignals([a, b])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].memberSignals).toHaveLength(2)
    expect(clusters[0].clusterType).toBe('LAYOFF_SIGNAL')
    expect(clusters[0].sector).toBe('technology')
    expect(clusters[0].explanation).toContain('2 independent publisher')
    expect(await prisma.signalClusterSignal.count()).toBe(2)
  })

  it('does not cluster unrelated signals together', async () => {
    const layoff = await signalFrom({ name: 'Wire A' }, { sector: 'technology', region: 'UK' })
    const procurement = await signalFrom(
      { name: 'Wire B' },
      { signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE', sector: 'public-sector', region: 'UK' },
    )
    const { clusters } = await clusterSignals([layoff, procurement])
    expect(clusters).toHaveLength(2)
  })

  it('creates sector-level clusters with no entity attached', async () => {
    const a = await signalFrom({ name: 'Wire A' }, { sector: 'public-sector', region: 'UK', signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE' })
    const b = await signalFrom({ name: 'Wire B' }, { sector: 'public-sector', region: 'UK', signalType: 'PROCUREMENT_INCREASE', direction: 'POSITIVE' })
    const { clusters } = await clusterSignals([a, b])
    expect(clusters).toHaveLength(1)
    expect(await prisma.signalClusterEntity.count()).toBe(0)
  })

  it('drops single weak signals but keeps single decent signals', async () => {
    const weak = await signalFrom({ name: 'Wire A' }, { strength: 0.3 })
    const decent = await signalFrom(
      { name: 'Wire B' },
      { signalType: 'DEMAND_SPIKE', direction: 'POSITIVE', strength: 0.65, sector: 'energy', region: 'EU' },
    )
    const { clusters } = await clusterSignals([weak, decent])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].clusterType).toBe('DEMAND_SPIKE')
    // single-signal penalty applied
    expect(clusters[0].confidence).toBeLessThan(0.45)
  })

  it('labels mixed fixture/live clusters as fixture (conservative provenance)', async () => {
    const fixtureSig = await signalFrom({ name: 'Fixture Wire' }, { sector: 'technology', region: 'UK' })
    const liveSource = await makeSource({ name: 'Live Wire', isFixture: false, accessMethod: 'RSS', url: 'https://example.org/feed.xml' })
    const liveDoc = await makeDocument(liveSource.id, { isFixture: false })
    const liveClaim = await makeClaim(liveDoc.id, { isFixture: false })
    const liveSig = await makeSignal(liveClaim.id, liveDoc.id, liveSource.id, { isFixture: false, sector: 'technology', region: 'UK' })
    const { clusters } = await clusterSignals([fixtureSig, liveSig])
    expect(clusters).toHaveLength(1)
    expect(clusters[0].isFixture).toBe(true)
  })
})
