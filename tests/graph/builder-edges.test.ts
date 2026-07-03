import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { syncGraphForEvents, rebuildGraph } from '@/server/graph/builder'
import { resetDb } from '../helpers'

const NOW = new Date('2026-07-03T00:00:00Z')

describe('graph edge projection', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    await runFullScan()
  })

  it('projects edges of every core type from scan data', async () => {
    const events = await prisma.eventCandidate.findMany()
    const result = await syncGraphForEvents(events, NOW)

    expect(result.nodesUpserted).toBeGreaterThan(0)
    expect(result.edgesUpserted).toBeGreaterThan(0)
    expect(result.errors).toEqual([])

    const byType = async (t: string) => prisma.graphEdge.count({ where: { edgeType: t } })
    expect(await byType('REPORTED_BY')).toBeGreaterThan(0)
    expect(await byType('DERIVED_FROM')).toBeGreaterThan(0)
    expect(await byType('SUPPORTS')).toBeGreaterThan(0)
    expect(await byType('AFFECTS')).toBeGreaterThan(0)
    expect(await byType('CREATES_OPPORTUNITY_FOR')).toBeGreaterThan(0)
    expect(await byType('WEAKENS')).toBeGreaterThan(0)
  })

  it('resolves a 3+ hop evidence chain: SIGNAL -> CLAIM -> DOCUMENT -> SOURCE', async () => {
    const events = await prisma.eventCandidate.findMany()
    await syncGraphForEvents(events, NOW)

    const signalNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'SIGNAL' } })

    const signalToClaim = await prisma.graphEdge.findFirstOrThrow({
      where: { sourceNodeId: signalNode.id, edgeType: 'DERIVED_FROM' },
    })
    const claimNode = await prisma.graphNode.findFirstOrThrow({ where: { id: signalToClaim.targetNodeId } })
    expect(claimNode.nodeType).toBe('CLAIM')

    const claimToDocument = await prisma.graphEdge.findFirstOrThrow({
      where: { sourceNodeId: claimNode.id, edgeType: 'DERIVED_FROM' },
    })
    const documentNode = await prisma.graphNode.findFirstOrThrow({ where: { id: claimToDocument.targetNodeId } })
    expect(documentNode.nodeType).toBe('DOCUMENT')

    const documentToSource = await prisma.graphEdge.findFirstOrThrow({
      where: { sourceNodeId: documentNode.id, edgeType: 'REPORTED_BY' },
    })
    const sourceNode = await prisma.graphNode.findFirstOrThrow({ where: { id: documentToSource.targetNodeId } })
    expect(sourceNode.nodeType).toBe('SOURCE')
  })

  it('links an OPPORTUNITY node to its EVENT node via CREATES_OPPORTUNITY_FOR', async () => {
    const events = await prisma.eventCandidate.findMany()
    await syncGraphForEvents(events, NOW)

    const opportunityNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'OPPORTUNITY' } })
    const edge = await prisma.graphEdge.findFirstOrThrow({
      where: { sourceNodeId: opportunityNode.id, edgeType: 'CREATES_OPPORTUNITY_FOR' },
    })
    const targetNode = await prisma.graphNode.findFirstOrThrow({ where: { id: edge.targetNodeId } })
    expect(targetNode.nodeType).toBe('EVENT')
  })

  it('does not duplicate edges on a re-run', async () => {
    const events = await prisma.eventCandidate.findMany()
    await syncGraphForEvents(events, NOW)
    const after1 = await prisma.graphEdge.count()

    await syncGraphForEvents(events, NOW)
    const after2 = await prisma.graphEdge.count()
    expect(after2).toBe(after1)

    await rebuildGraph(NOW)
    const after3 = await prisma.graphEdge.count()
    expect(after3).toBe(after1)
  })

  it('gives every edge a non-empty human label', async () => {
    const events = await prisma.eventCandidate.findMany()
    await syncGraphForEvents(events, NOW)

    const edges = await prisma.graphEdge.findMany()
    expect(edges.length).toBeGreaterThan(0)
    for (const edge of edges) {
      expect(edge.label).toBeTruthy()
      expect(edge.label.length).toBeGreaterThan(0)
    }
  })

  it('rebuildGraph projects nodes and edges over all events with no errors', async () => {
    const result = await rebuildGraph(NOW)
    expect(result.nodesUpserted).toBeGreaterThan(0)
    expect(result.edgesUpserted).toBeGreaterThan(0)
    expect(result.errors).toEqual([])
  })

  it('derives SOURCE node confidence from SourceHealth (not the 0.5 fallback)', async () => {
    const events = await prisma.eventCandidate.findMany()
    await syncGraphForEvents(events, NOW)
    // The scan set Fixture Wire health to HEALTHY (score 1.0); the SOURCE node must reflect it.
    const healthy = await prisma.sourceHealth.findFirstOrThrow({ where: { status: 'HEALTHY' }, include: { source: true } })
    const sourceNode = await prisma.graphNode.findFirstOrThrow({
      where: { refType: 'source', refId: healthy.sourceId },
    })
    expect(sourceNode.confidence).toBe(healthy.healthScore)
    expect(sourceNode.confidence).not.toBe(0.5)
  })
})

describe('contradiction edge projection (positive path)', () => {
  beforeEach(resetDb)

  it('creates a CONTRADICTS edge between opposing same-sector/region events', async () => {
    const scan = await prisma.scanRun.create({ data: {} })
    const base = {
      summary: 's', severity: 0.7, probability: 0.7, confidence: 0.8, affectedSector: 'technology',
      affectedRegion: 'UK', evidenceCount: 1, sourceDiversityScore: 0.5, signalStrength: 0.7,
      noveltyScore: 0.9, createdFromScanRunId: scan.id, isFixture: true,
    }
    const risk = await prisma.eventCandidate.create({
      data: { ...base, title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', riskScore: 0.7, opportunityScore: 0.15 },
    })
    const opp = await prisma.eventCandidate.create({
      data: { ...base, title: 'Hiring acceleration — technology (UK)', eventType: 'HIRING_ACCELERATION', eventClass: 'OPPORTUNITY', riskScore: 0.15, opportunityScore: 0.7 },
    })
    await syncGraphForEvents([risk, opp], NOW)

    const riskNode = await prisma.graphNode.findFirstOrThrow({ where: { refType: 'event', refId: risk.id } })
    const oppNode = await prisma.graphNode.findFirstOrThrow({ where: { refType: 'event', refId: opp.id } })
    const contradicts = await prisma.graphEdge.findMany({
      where: {
        edgeType: 'CONTRADICTS',
        sourceNodeId: { in: [riskNode.id, oppNode.id] },
        targetNodeId: { in: [riskNode.id, oppNode.id] },
      },
    })
    expect(contradicts.length).toBeGreaterThanOrEqual(1)
    expect(contradicts[0].label.length).toBeGreaterThan(0)
  })
})
