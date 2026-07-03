import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { syncGraphForEvents } from '@/server/graph/builder'
import { buildArc, scoreArc, type ArcStepInput } from '@/server/graph/arc'
import { ARC_CLASSES } from '@/shared/enums'
import { resetDb } from '../helpers'

const NOW = new Date('2026-07-03T00:00:00Z')

describe('buildArc', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    await runFullScan()
    const events = await prisma.eventCandidate.findMany()
    await syncGraphForEvents(events, NOW)
  })

  it('reaches at least 3 degrees from an EVENT root on fixture data', async () => {
    const rootNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'EVENT' } })
    const result = await buildArc(rootNode.id, 6, NOW)

    expect(result).not.toBeNull()
    const { steps } = result!
    const maxDegree = Math.max(...steps.map((s) => s.degree))
    expect(maxDegree).toBeGreaterThanOrEqual(3)
  })

  it('dedupes steps: no nodeId appears twice', async () => {
    const rootNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'EVENT' } })
    const result = await buildArc(rootNode.id, 6, NOW)

    expect(result).not.toBeNull()
    const nodeIds = result!.steps.map((s) => s.nodeId)
    expect(new Set(nodeIds).size).toBe(nodeIds.length)
  })

  it('re-running buildArc for the same root deletes and recreates rather than accumulating', async () => {
    const rootNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'EVENT' } })

    const first = await buildArc(rootNode.id, 6, NOW)
    expect(first).not.toBeNull()
    const arcCountAfterFirst = await prisma.evidenceArc.count({ where: { rootNodeId: rootNode.id } })
    const stepCountAfterFirst = await prisma.evidenceArcStep.count()
    expect(arcCountAfterFirst).toBe(1)

    const second = await buildArc(rootNode.id, 6, NOW)
    expect(second).not.toBeNull()
    const arcCountAfterSecond = await prisma.evidenceArc.count({ where: { rootNodeId: rootNode.id } })
    const stepCountAfterSecond = await prisma.evidenceArcStep.count()

    expect(arcCountAfterSecond).toBe(1)
    expect(stepCountAfterSecond).toBe(stepCountAfterFirst)
  })

  it('persists an arc with a chainClass in ARC_CLASSES and truePotentialScore in [0,1]', async () => {
    const rootNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'EVENT' } })
    const result = await buildArc(rootNode.id, 6, NOW)

    expect(result).not.toBeNull()
    const { arc } = result!
    expect(ARC_CLASSES).toContain(arc.chainClass)
    expect(arc.truePotentialScore).toBeGreaterThanOrEqual(0)
    expect(arc.truePotentialScore).toBeLessThanOrEqual(1)

    const persisted = await prisma.evidenceArc.findUniqueOrThrow({ where: { id: arc.id } })
    expect(persisted.rootNodeId).toBe(rootNode.id)
  })

  it('returns null when the root node is missing', async () => {
    const result = await buildArc('does-not-exist', 6, NOW)
    expect(result).toBeNull()
  })

  it('a 2-source event yields sourceDiversity > 0 (identifies independent sources)', async () => {
    // Fixture data has only 2 SOURCE nodes total; pick the EVENT whose evidence chain
    // reaches both (an independently-corroborated event), so sourceDiversity > 0.
    const eventNodes = await prisma.graphNode.findMany({ where: { nodeType: 'EVENT' } })
    let best: { rootId: string; sourceDiversity: number } | null = null

    for (const eventNode of eventNodes) {
      const result = await buildArc(eventNode.id, 6, NOW)
      if (!result) continue
      const arc = await prisma.evidenceArc.findUniqueOrThrow({ where: { id: result.arc.id } })
      if (!best || arc.sourceDiversity > best.sourceDiversity) {
        best = { rootId: eventNode.id, sourceDiversity: arc.sourceDiversity }
      }
    }

    expect(best).not.toBeNull()
    expect(best!.sourceDiversity).toBeGreaterThan(0)
  })
})

describe('scoreArc (pure)', () => {
  const rootNode = {
    id: 'root-1',
    nodeType: 'EVENT',
    refType: 'event',
    refId: 'evt-1',
    title: 'Root event',
    summary: '',
    confidence: 0.7,
    riskScore: 0.5,
    opportunityScore: 0.3,
    impactScore: 0.6,
    freshnessScore: 0.8,
    isFixture: true,
    metadataJson: '{}',
    createdAt: NOW,
    updatedAt: NOW,
  } as unknown as Parameters<typeof scoreArc>[1]

  function makeStep(overrides: Partial<ArcStepInput>): ArcStepInput {
    return {
      degree: 1,
      nodeId: 'node-1',
      nodeType: 'SIGNAL',
      refId: 'sig-1',
      relationshipType: 'SUPPORTS',
      explanation: 'Reached via SUPPORTS',
      confidence: 0.6,
      sourceCount: 1,
      pathWeight: 0.5,
      signalType: 'LAYOFF_SIGNAL',
      ...overrides,
    }
  }

  it('yields chainClass CONTRADICTED when contradiction/weaken steps dominate', () => {
    const steps: ArcStepInput[] = [
      makeStep({ nodeId: 'a', relationshipType: 'CONTRADICTS', nodeType: 'EVENT', refId: 'evt-2' }),
      makeStep({ nodeId: 'b', relationshipType: 'CONTRADICTS', nodeType: 'EVENT', refId: 'evt-3' }),
      makeStep({ nodeId: 'c', relationshipType: 'WEAKENS', nodeType: 'DATA_GAP', refId: 'gap-1' }),
      makeStep({ nodeId: 'd', relationshipType: 'SUPPORTS', nodeType: 'SIGNAL', refId: 'sig-2' }),
    ]

    const scored = scoreArc(steps, rootNode, NOW)
    expect(scored.contradictionScore).toBeGreaterThanOrEqual(0.3)
    expect(scored.chainClass).toBe('CONTRADICTED')
  })

  it('produces values in [0,1] for all normalised scores and a valid chainClass', () => {
    const steps: ArcStepInput[] = [
      makeStep({ nodeId: 'a', nodeType: 'SOURCE', refId: 'src-1', relationshipType: 'REPORTED_BY', sourceCount: 1 }),
      makeStep({
        nodeId: 'b',
        nodeType: 'SOURCE',
        refId: 'src-2',
        relationshipType: 'REPORTED_BY',
        degree: 2,
        sourceCount: 2,
      }),
      makeStep({ nodeId: 'c', nodeType: 'CLAIM', refId: 'claim-1', relationshipType: 'DERIVED_FROM', degree: 1 }),
      makeStep({
        nodeId: 'd',
        nodeType: 'SIGNAL',
        refId: 'sig-1',
        relationshipType: 'SUPPORTS',
        degree: 1,
        signalType: 'FUNDING_SIGNAL',
      }),
    ]

    const scored = scoreArc(steps, rootNode, NOW)
    for (const value of [
      scored.originStrength,
      scored.sourceDiversity,
      scored.contradictionScore,
      scored.momentumScore,
      scored.confidence,
      scored.truePotentialScore,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(ARC_CLASSES).toContain(scored.chainClass)
  })

  it('returns rootNode.confidence when there are no steps', () => {
    const scored = scoreArc([], rootNode, NOW)
    expect(scored.confidence).toBe(rootNode.confidence)
    expect(scored.contradictionScore).toBe(0)
    expect(scored.sourceDiversity).toBe(0)
  })
})
