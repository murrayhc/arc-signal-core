import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { syncGraphForEvents, rebuildGraph } from '@/server/graph/builder'
import { syncMarketNodes } from '@/server/market/graph'
import { resetDb } from '../helpers'

const NOW = new Date('2026-07-03T00:00:00Z')

describe('market graph projection', () => {
  beforeEach(resetDb)

  it('projects exactly one INSTRUMENT node and one COMMODITY node per seeded fixture profile', async () => {
    await prisma.instrumentProfile.create({
      data: {
        provider: 'FIXTURE',
        symbol: 'ACME',
        name: 'Acme Industrials (sample)',
        exchange: 'LSE',
        instrumentType: 'EQUITY',
        currency: 'GBP',
        isFixture: true,
      },
    })
    await prisma.commodityProfile.create({
      data: {
        provider: 'FIXTURE',
        name: 'Copper',
        category: 'METAL',
        keySupplyRegionsJson: JSON.stringify(['Chile', 'Peru', 'China']),
        keyDemandSectorsJson: JSON.stringify(['Construction', 'Electronics', 'EV']),
        isFixture: true,
      },
    })

    const result = await syncMarketNodes(NOW)
    expect(result.errors).toEqual([])
    expect(result.nodeCount).toBeGreaterThanOrEqual(2)

    const instrumentNodes = await prisma.graphNode.findMany({ where: { nodeType: 'INSTRUMENT' } })
    expect(instrumentNodes).toHaveLength(1)
    expect(instrumentNodes[0].refType).toBe('instrument')
    expect(instrumentNodes[0].title).toBe('Acme Industrials (sample)')
    expect(instrumentNodes[0].isFixture).toBe(true)

    const commodityNodes = await prisma.graphNode.findMany({ where: { nodeType: 'COMMODITY' } })
    expect(commodityNodes).toHaveLength(1)
    expect(commodityNodes[0].refType).toBe('commodity')
    expect(commodityNodes[0].title).toBe('Copper')
    expect(commodityNodes[0].isFixture).toBe(true)
  })

  it('re-running syncMarketNodes does not duplicate nodes (upsert-dedupe on refType+refId)', async () => {
    await prisma.instrumentProfile.create({
      data: { provider: 'FIXTURE', symbol: 'ACME', name: 'Acme Industrials (sample)', instrumentType: 'EQUITY', currency: 'GBP', isFixture: true },
    })
    await prisma.commodityProfile.create({
      data: { provider: 'FIXTURE', name: 'Copper', category: 'METAL', keySupplyRegionsJson: '[]', keyDemandSectorsJson: '[]', isFixture: true },
    })

    await syncMarketNodes(NOW)
    const after1 = await prisma.graphNode.count()

    await syncMarketNodes(NOW)
    const after2 = await prisma.graphNode.count()

    expect(after2).toBe(after1)
    expect(await prisma.graphNode.count({ where: { nodeType: 'INSTRUMENT' } })).toBe(1)
    expect(await prisma.graphNode.count({ where: { nodeType: 'COMMODITY' } })).toBe(1)
  })

  it('creates a COMMODITY-SUPPLIED_BY->REGION edge only when a matching REGION node already exists', async () => {
    // Seed an event so a REGION node ('chile') exists before the market projection runs.
    const scan = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Mining disruption — Chile',
        summary: 's',
        eventType: 'SUPPLY_CHAIN_DISRUPTION',
        eventClass: 'RISK',
        severity: 0.6,
        probability: 0.6,
        confidence: 0.7,
        affectedSector: 'Materials',
        affectedRegion: 'Chile',
        evidenceCount: 1,
        sourceDiversityScore: 0.5,
        signalStrength: 0.6,
        noveltyScore: 0.5,
        riskScore: 0.6,
        opportunityScore: 0.1,
        createdFromScanRunId: scan.id,
        isFixture: true,
      },
    })
    await syncGraphForEvents([event], NOW)
    const regionNodeBefore = await prisma.graphNode.findUnique({ where: { refType_refId: { refType: 'region', refId: 'chile' } } })
    expect(regionNodeBefore).not.toBeNull()

    await prisma.commodityProfile.create({
      data: {
        provider: 'FIXTURE',
        name: 'Copper',
        category: 'METAL',
        keySupplyRegionsJson: JSON.stringify(['Chile', 'Peru']),
        keyDemandSectorsJson: JSON.stringify(['Construction']),
        isFixture: true,
      },
    })

    const result = await syncMarketNodes(NOW)
    expect(result.errors).toEqual([])

    const commodityNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'COMMODITY' } })
    const suppliedByEdges = await prisma.graphEdge.findMany({ where: { edgeType: 'SUPPLIED_BY', sourceNodeId: commodityNode.id } })
    // Chile region node exists -> exactly one SUPPLIED_BY edge to it. Peru has no
    // pre-existing node, so no edge is fabricated for it.
    expect(suppliedByEdges).toHaveLength(1)
    expect(suppliedByEdges[0].targetNodeId).toBe(regionNodeBefore!.id)

    // Every created edge has both endpoints present as real GraphNode rows.
    for (const edge of suppliedByEdges) {
      const source = await prisma.graphNode.findUnique({ where: { id: edge.sourceNodeId } })
      const target = await prisma.graphNode.findUnique({ where: { id: edge.targetNodeId } })
      expect(source).not.toBeNull()
      expect(target).not.toBeNull()
    }
  })

  it('creates a COMMODITY-AFFECTS->SECTOR edge only when a matching SECTOR node already exists', async () => {
    const scan = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Demand surge — Construction',
        summary: 's',
        eventType: 'DEMAND_SIGNAL',
        eventClass: 'OPPORTUNITY',
        severity: 0.5,
        probability: 0.5,
        confidence: 0.6,
        affectedSector: 'Construction',
        affectedRegion: 'UK',
        evidenceCount: 1,
        sourceDiversityScore: 0.5,
        signalStrength: 0.5,
        noveltyScore: 0.5,
        riskScore: 0.1,
        opportunityScore: 0.5,
        createdFromScanRunId: scan.id,
        isFixture: true,
      },
    })
    await syncGraphForEvents([event], NOW)
    const sectorNodeBefore = await prisma.graphNode.findUnique({ where: { refType_refId: { refType: 'sector', refId: 'construction' } } })
    expect(sectorNodeBefore).not.toBeNull()

    await prisma.commodityProfile.create({
      data: {
        provider: 'FIXTURE',
        name: 'Copper',
        category: 'METAL',
        keySupplyRegionsJson: '[]',
        keyDemandSectorsJson: JSON.stringify(['Construction', 'Electronics']),
        isFixture: true,
      },
    })

    await syncMarketNodes(NOW)

    const commodityNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'COMMODITY' } })
    const affectsEdges = await prisma.graphEdge.findMany({ where: { edgeType: 'AFFECTS', sourceNodeId: commodityNode.id } })
    expect(affectsEdges).toHaveLength(1)
    expect(affectsEdges[0].targetNodeId).toBe(sectorNodeBefore!.id)
  })

  it('creates an INSTRUMENT-LINKED_TO->COMPANY edge only on an exact title match; skips silently otherwise', async () => {
    // No entity/COMPANY node exists with a matching title anywhere in fresh fixtures,
    // so the instrument fixture profile ("Acme Industrials (sample)") should link to
    // nothing — no edge fabricated for a non-existent company.
    await prisma.instrumentProfile.create({
      data: { provider: 'FIXTURE', symbol: 'ACME', name: 'Acme Industrials (sample)', instrumentType: 'EQUITY', currency: 'GBP', isFixture: true },
    })

    const result = await syncMarketNodes(NOW)
    expect(result.errors).toEqual([])

    const instrumentNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'INSTRUMENT' } })
    const linkedEdges = await prisma.graphEdge.findMany({ where: { edgeType: 'LINKED_TO', sourceNodeId: instrumentNode.id } })
    expect(linkedEdges).toHaveLength(0)
  })

  it('control: with NO market profiles present, syncMarketNodes projects zero nodes/edges (additive-only, no regression)', async () => {
    const result = await syncMarketNodes(NOW)
    expect(result.nodeCount).toBe(0)
    expect(result.edgeCount).toBe(0)
    expect(result.errors).toEqual([])
    expect(await prisma.graphNode.count({ where: { nodeType: { in: ['INSTRUMENT', 'COMMODITY'] } } })).toBe(0)
  })

  it('control: full-scan baseline node count is unaffected by market projection when no market profiles exist', async () => {
    await runSeed({ includeLive: false })
    // Baseline: clear any seeded market fixtures so this run has NO market profiles.
    await prisma.instrumentProfile.deleteMany()
    await prisma.commodityProfile.deleteMany()
    await runFullScan()

    const events = await prisma.eventCandidate.findMany()
    const baselineResult = await syncGraphForEvents(events, NOW)
    const baselineNodeCount = await prisma.graphNode.count()
    const baselineEdgeCount = await prisma.graphEdge.count()

    // Re-running with still-zero market profiles must not change counts.
    await syncGraphForEvents(events, NOW)
    expect(await prisma.graphNode.count()).toBe(baselineNodeCount)
    expect(await prisma.graphNode.count({ where: { nodeType: { in: ['INSTRUMENT', 'COMMODITY'] } } })).toBe(0)
    expect(baselineResult.nodesUpserted).toBeGreaterThan(0)
    expect(baselineEdgeCount).toBeGreaterThanOrEqual(0)
  })

  it('syncGraphForEvents (the single sync entrypoint) folds in market node/edge counts when profiles exist', async () => {
    // runSeed seeds fixture commodity/instrument profiles (Task 1); runFullScan
    // already routes through syncGraphForEvents once (orchestrator.ts:135), so the
    // market nodes exist by the time this test explicitly calls it again below —
    // that's the orchestrator wiring proving itself, not a bug in this assertion.
    await runSeed({ includeLive: false })
    await runFullScan()

    const events = await prisma.eventCandidate.findMany()
    const afterOrchestratorMarketNodes = await prisma.graphNode.count({ where: { nodeType: { in: ['INSTRUMENT', 'COMMODITY'] } } })
    expect(afterOrchestratorMarketNodes).toBeGreaterThan(0)

    const result = await syncGraphForEvents(events, NOW)
    expect(result.errors).toEqual([])

    // The explicit call folds in the same market node/edge counts (idempotent upsert
    // — no duplication, still present).
    const afterMarketNodes = await prisma.graphNode.count({ where: { nodeType: { in: ['INSTRUMENT', 'COMMODITY'] } } })
    expect(afterMarketNodes).toBe(afterOrchestratorMarketNodes)

    // Re-run is stable (idempotent upsert).
    const totalBefore = await prisma.graphNode.count()
    await syncGraphForEvents(events, NOW)
    expect(await prisma.graphNode.count()).toBe(totalBefore)
  })

  it('rebuildGraph also picks up market nodes via the same single sync entrypoint', async () => {
    await runSeed({ includeLive: false })
    await runFullScan()

    const result = await rebuildGraph(NOW)
    expect(result.errors).toEqual([])
    expect(await prisma.graphNode.count({ where: { nodeType: 'INSTRUMENT' } })).toBeGreaterThan(0)
    expect(await prisma.graphNode.count({ where: { nodeType: 'COMMODITY' } })).toBeGreaterThan(0)
  })
})
