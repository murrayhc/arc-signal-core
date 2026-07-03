import type { EvidenceArc, EvidenceArcStep, GraphEdge, GraphNode } from '@prisma/client'
import { prisma } from '@/server/db'
import type { ArcClass } from '@/shared/enums'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

const DEGREE_DECAY = 0.85
const BREADTH_CAP_PER_DEGREE = 12
const DEFAULT_MAX_DEGREES = 6

const CONTRADICT_OR_WEAKEN: ReadonlySet<string> = new Set(['CONTRADICTS', 'WEAKENS'])

/**
 * One reached node during traversal, carrying enough context for scoreArc to
 * work purely off the array (no DB lookups needed inside scoring). Mirrors
 * EvidenceArcStep's persisted fields, plus the node's type/refId/signalType
 * (for SIGNAL nodes) which aren't stored on the step row itself.
 */
export type ArcStepInput = {
  degree: number
  nodeId: string
  nodeType: string
  refId: string
  relationshipType: string
  explanation: string
  confidence: number
  sourceCount: number
  pathWeight: number
  signalType?: string | null
}

export type ArcScoreResult = {
  originStrength: number
  sourceDiversity: number
  contradictionScore: number
  momentumScore: number
  confidence: number
  truePotentialScore: number
  chainClass: ArcClass
}

/**
 * Pure scoring per spec §8. All ratios clamped to [0,1] and rounded to 2dp.
 * `now` is accepted for interface parity with the traversal timestamp but no
 * formula here is time-dependent (freshness is precomputed onto rootNode).
 */
export function scoreArc(steps: ArcStepInput[], rootNode: GraphNode, _now: Date): ArcScoreResult {
  const distinctSourcesWithin2Degrees = new Set(
    steps.filter((s) => s.nodeType === 'SOURCE' && s.degree <= 2).map((s) => s.refId),
  ).size
  const distinctSources = new Set(steps.filter((s) => s.nodeType === 'SOURCE').map((s) => s.refId)).size
  const claimSignalCount = steps.filter((s) => s.nodeType === 'CLAIM' || s.nodeType === 'SIGNAL').length
  const contradictOrWeakenSteps = steps.filter((s) => CONTRADICT_OR_WEAKEN.has(s.relationshipType)).length
  const distinctSignalTypes = new Set(
    steps.filter((s) => s.nodeType === 'SIGNAL' && s.signalType).map((s) => s.signalType as string),
  ).size

  const originStrength = round2(clamp01(Math.min(1, distinctSourcesWithin2Degrees / 2)))
  const sourceDiversity = round2(
    clamp01(claimSignalCount > 0 ? Math.min(1, distinctSources / claimSignalCount) : 0),
  )
  const contradictionScore = round2(clamp01(steps.length ? contradictOrWeakenSteps / steps.length : 0))
  const momentumScore = round2(clamp01(0.5 * rootNode.freshnessScore + 0.5 * rootNode.impactScore))

  const pathWeightSum = steps.reduce((sum, s) => sum + s.pathWeight, 0)
  const confidence =
    steps.length && pathWeightSum > 0
      ? round2(clamp01(steps.reduce((sum, s) => sum + s.confidence * s.pathWeight, 0) / pathWeightSum))
      : round2(clamp01(rootNode.confidence))

  const crossSignalConfirmation = round2(clamp01(Math.min(1, distinctSignalTypes / 3)))
  const avgPathWeight = round2(clamp01(steps.length ? pathWeightSum / steps.length : 0))

  const truePotentialScore = round2(
    clamp01(
      0.28 * originStrength +
        0.24 * sourceDiversity +
        0.18 * momentumScore +
        0.15 * crossSignalConfirmation +
        0.15 * avgPathWeight -
        0.35 * contradictionScore,
    ),
  )

  let chainClass: ArcClass
  if (contradictionScore >= 0.3) {
    chainClass = 'CONTRADICTED'
  } else if (truePotentialScore >= 0.6 && sourceDiversity >= 0.5) {
    chainClass = 'STRONG_CHAIN'
  } else if (steps.length >= 5 && sourceDiversity < 0.34) {
    chainClass = 'WIDELY_REPEATED_WEAK_SOURCE'
  } else if (truePotentialScore >= 0.55 && confidence < 0.45) {
    chainClass = 'HIGH_POTENTIAL_LOW_CONFIDENCE'
  } else {
    chainClass = 'WEAK_SIGNAL'
  }

  return {
    originStrength,
    sourceDiversity,
    contradictionScore,
    momentumScore,
    confidence,
    truePotentialScore,
    chainClass,
  }
}

/** Deterministic, advice-free explanation of how a node was reached. */
function describeStep(edgeType: string, neighbour: GraphNode): string {
  const explanation = `Reached via ${edgeType} — ${neighbour.nodeType.toLowerCase()} "${neighbour.title}".`
  assertNoAdviceLanguage(explanation, 'EvidenceArcStep.explanation')
  return explanation
}

/** Deterministic title/summary, no advice language, citing degrees/sources/chainClass. */
function composeTitleAndSummary(
  rootNode: GraphNode,
  maxDegreeReached: number,
  distinctSources: number,
  chainClass: ArcClass,
): { title: string; summary: string } {
  const title = `Evidence arc for "${rootNode.title}"`
  const summary = `Traversed ${maxDegreeReached} degree${maxDegreeReached === 1 ? '' : 's'} from this node, ` +
    `citing ${distinctSources} distinct source${distinctSources === 1 ? '' : 's'}. Chain classification: ${chainClass}.`
  assertNoAdviceLanguage(title, 'EvidenceArc.title')
  assertNoAdviceLanguage(summary, 'EvidenceArc.summary')
  return { title, summary }
}

type Frontier = {
  nodeId: string
  degree: number
  pathWeight: number
  sourcesOnPath: number
  relationshipType: string
}

/**
 * BFS both directions from rootNodeId over GraphEdges, deduping nodes (shortest
 * degree wins), capped at `maxDegrees` and BREADTH_CAP_PER_DEGREE new nodes per
 * degree. Deletes any existing arc for this root, then persists a fresh
 * EvidenceArc + EvidenceArcStep rows. Returns null if the root node is missing.
 */
export async function buildArc(
  rootNodeId: string,
  maxDegrees = DEFAULT_MAX_DEGREES,
  now: Date = new Date(),
): Promise<{ arc: EvidenceArc; steps: EvidenceArcStep[] } | null> {
  const rootNode = await prisma.graphNode.findUnique({ where: { id: rootNodeId } })
  if (!rootNode) return null

  // visited: nodeId -> degree at which it was first reached (shortest degree wins).
  const visited = new Map<string, number>()
  visited.set(rootNodeId, 0)

  const reached: Array<{ node: GraphNode; degree: number; pathWeight: number; sourcesOnPath: number; relationshipType: string }> = []

  const rootSourcesOnPath = rootNode.nodeType === 'SOURCE' ? 1 : 0
  let frontier: Frontier[] = [
    { nodeId: rootNodeId, degree: 0, pathWeight: 1, sourcesOnPath: rootSourcesOnPath, relationshipType: '' },
  ]

  for (let degree = 1; degree <= maxDegrees && frontier.length > 0; degree++) {
    const candidates: Frontier[] = []

    for (const current of frontier) {
      const outEdges = await prisma.graphEdge.findMany({ where: { sourceNodeId: current.nodeId } })
      const inEdges = await prisma.graphEdge.findMany({ where: { targetNodeId: current.nodeId } })

      const neighbours: Array<{ neighbourId: string; edge: GraphEdge }> = [
        ...outEdges.map((edge) => ({ neighbourId: edge.targetNodeId, edge })),
        ...inEdges.map((edge) => ({ neighbourId: edge.sourceNodeId, edge })),
      ]

      for (const { neighbourId, edge } of neighbours) {
        if (visited.has(neighbourId)) continue
        if (neighbourId === current.nodeId) continue

        visited.set(neighbourId, degree)
        candidates.push({
          nodeId: neighbourId,
          degree,
          pathWeight: current.pathWeight * edge.weight,
          sourcesOnPath: current.sourcesOnPath,
          relationshipType: edge.edgeType,
        })
      }
    }

    // Breadth cap per degree: keep the first BREADTH_CAP_PER_DEGREE candidates
    // discovered this round (dedup against `visited` already applied above).
    const capped = candidates.slice(0, BREADTH_CAP_PER_DEGREE)
    // Any candidates beyond the cap were already marked visited; un-mark them
    // so they remain reachable from a future frontier node if re-discovered
    // at the same degree via a different path (they won't be re-added this
    // round, but must not block correctness at deeper degrees either).
    for (const dropped of candidates.slice(BREADTH_CAP_PER_DEGREE)) {
      visited.delete(dropped.nodeId)
    }

    if (capped.length === 0) {
      frontier = []
      continue
    }

    const nodes = await prisma.graphNode.findMany({ where: { id: { in: capped.map((c) => c.nodeId) } } })
    const nodeById = new Map(nodes.map((n) => [n.id, n]))

    const nextFrontier: Frontier[] = []
    for (const candidate of capped) {
      const node = nodeById.get(candidate.nodeId)
      if (!node) continue
      const sourcesOnPath = candidate.sourcesOnPath + (node.nodeType === 'SOURCE' ? 1 : 0)
      reached.push({
        node,
        degree: candidate.degree,
        pathWeight: candidate.pathWeight,
        sourcesOnPath,
        relationshipType: candidate.relationshipType,
      })
      nextFrontier.push({ ...candidate, sourcesOnPath })
    }

    frontier = nextFrontier
  }

  // sourceCount per reached node: count of SOURCE nodes along the shortest
  // BFS path used to reach it (carried forward from each frontier's parent).
  const stepInputs: ArcStepInput[] = []
  const signalTypeCache = new Map<string, string | null>()

  for (const { node, degree, pathWeight, sourcesOnPath, relationshipType } of reached) {
    let signalType: string | null = null
    if (node.nodeType === 'SIGNAL') {
      if (signalTypeCache.has(node.refId)) {
        signalType = signalTypeCache.get(node.refId) ?? null
      } else {
        const signal = await prisma.signal.findUnique({ where: { id: node.refId } })
        signalType = signal?.signalType ?? null
        signalTypeCache.set(node.refId, signalType)
      }
    }

    stepInputs.push({
      degree,
      nodeId: node.id,
      nodeType: node.nodeType,
      refId: node.refId,
      relationshipType,
      explanation: describeStep(relationshipType, node),
      confidence: node.confidence,
      sourceCount: sourcesOnPath,
      pathWeight: round2(clamp01(pathWeight * Math.pow(DEGREE_DECAY, degree))),
      signalType,
    })
  }

  const scored = scoreArc(stepInputs, rootNode, now)
  const maxDegreeReached = stepInputs.length ? Math.max(...stepInputs.map((s) => s.degree)) : 0
  const distinctSourceCount = new Set(stepInputs.filter((s) => s.nodeType === 'SOURCE').map((s) => s.refId)).size
  const { title, summary } = composeTitleAndSummary(rootNode, maxDegreeReached, distinctSourceCount, scored.chainClass)

  const eventCandidateId = rootNode.refType === 'event' ? rootNode.refId : null
  const claimId = rootNode.refType === 'claim' ? rootNode.refId : null

  await prisma.evidenceArcStep.deleteMany({ where: { evidenceArc: { rootNodeId } } })
  await prisma.evidenceArc.deleteMany({ where: { rootNodeId } })

  const arc = await prisma.evidenceArc.create({
    data: {
      rootNodeId,
      rootEventCandidateId: eventCandidateId,
      rootClaimId: claimId,
      title,
      summary,
      maxDegrees,
      truePotentialScore: scored.truePotentialScore,
      confidence: scored.confidence,
      originStrength: scored.originStrength,
      sourceDiversity: scored.sourceDiversity,
      contradictionScore: scored.contradictionScore,
      momentumScore: scored.momentumScore,
      chainClass: scored.chainClass,
      isFixture: rootNode.isFixture,
      steps: {
        create: stepInputs.map((s) => ({
          degree: s.degree,
          nodeId: s.nodeId,
          relationshipType: s.relationshipType,
          explanation: s.explanation,
          confidence: s.confidence,
          sourceCount: s.sourceCount,
          pathWeight: s.pathWeight,
        })),
      },
    },
    include: { steps: true },
  })

  const { steps, ...arcRest } = arc
  return { arc: arcRest as EvidenceArc, steps }
}
