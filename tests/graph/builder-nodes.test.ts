import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { projectNodesForEvents, rebuildNodes, freshness } from '@/server/graph/builder'
import { resetDb } from '../helpers'

describe('freshness (pure)', () => {
  it('is high for recent and low for old', () => {
    const now = new Date('2026-07-03T00:00:00Z')
    expect(freshness(new Date('2026-07-02T00:00:00Z'), now)).toBeGreaterThan(0.8)
    expect(freshness(new Date('2026-05-01T00:00:00Z'), now)).toBeLessThan(0.2)
    expect(freshness(null, now)).toBeCloseTo(0.3, 5)
  })
})

describe('graph node projection', () => {
  beforeEach(async () => { await resetDb(); await runSeed({ includeLive: false }); await runFullScan() })

  it('creates EVENT/SOURCE/CLAIM/SIGNAL/OPPORTUNITY/DATA_GAP/SECTOR nodes from scan data', async () => {
    const events = await prisma.eventCandidate.findMany()
    const { nodeCount } = await projectNodesForEvents(events, new Date('2026-07-03T00:00:00Z'))
    expect(nodeCount).toBeGreaterThan(0)
    const byType = async (t: string) => prisma.graphNode.count({ where: { nodeType: t } })
    expect(await byType('EVENT')).toBe(events.length)
    expect(await byType('SOURCE')).toBeGreaterThan(0)
    expect(await byType('CLAIM')).toBeGreaterThan(0)
    expect(await byType('SIGNAL')).toBeGreaterThan(0)
    expect(await byType('OPPORTUNITY')).toBeGreaterThan(0)
    expect(await byType('SECTOR')).toBeGreaterThan(0)
    // fixture flag carried
    const evNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'EVENT' } })
    expect(evNode.isFixture).toBe(true)
  })

  it('never duplicates a node for the same refType+refId across a rebuild', async () => {
    const now = new Date('2026-07-03T00:00:00Z')
    const events = await prisma.eventCandidate.findMany()
    await projectNodesForEvents(events, now)
    const after1 = await prisma.graphNode.count()
    await rebuildNodes(now)
    const after2 = await prisma.graphNode.count()
    expect(after2).toBe(after1)
  })
})
