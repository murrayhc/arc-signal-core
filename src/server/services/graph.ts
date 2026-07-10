import { prisma } from '@/server/db'
import type { GraphEdge, GraphNode } from '@prisma/client'
import { buildArc } from '@/server/graph/arc'

export type GraphNodeData = {
  id: string
  nodeType: string
  refType: string
  refId: string
  title: string
  summary: string
  confidence: number
  riskScore: number
  opportunityScore: number
  impactScore: number
  freshnessScore: number
  isFixture: boolean
}

export type GraphEdgeData = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  edgeType: string
  label: string
  weight: number
  confidence: number
  evidenceCount: number
}

export type LiveGraphData = {
  nodes: GraphNodeData[]
  edges: GraphEdgeData[]
  lastScanAt: string | null
  graphStats: { nodeCount: number; edgeCount: number; byType: Record<string, number> }
  activeEventCount: number
  riskCount: number
  opportunityCount: number
  highUncertaintyCount: number
}

export type NodeNeighbourhood = {
  node: GraphNodeData
  neighbours: GraphNodeData[]
  edges: GraphEdgeData[]
}

const HIGH_UNCERTAINTY_CONFIDENCE_THRESHOLD = 0.45

function toNodeData(node: GraphNode): GraphNodeData {
  return {
    id: node.id,
    nodeType: node.nodeType,
    refType: node.refType,
    refId: node.refId,
    title: node.title,
    summary: node.summary,
    confidence: node.confidence,
    riskScore: node.riskScore,
    opportunityScore: node.opportunityScore,
    impactScore: node.impactScore,
    freshnessScore: node.freshnessScore,
    isFixture: node.isFixture,
  }
}

function toEdgeData(edge: GraphEdge): GraphEdgeData {
  return {
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    edgeType: edge.edgeType,
    label: edge.label,
    weight: edge.weight,
    confidence: edge.confidence,
    evidenceCount: edge.evidenceCount,
  }
}

/**
 * The live graph: the top `cap` nodes by (impactScore + freshnessScore) desc, plus
 * only the edges whose endpoints are both within that capped node set. Node/edge
 * counts here are DISTINCT rows (unlike the pipeline's upsert-operation counters).
 */
export async function getLiveGraph(cap = 400): Promise<LiveGraphData> {
  const allNodes = await prisma.graphNode.findMany()
  const ranked = [...allNodes].sort(
    (a, b) => b.impactScore + b.freshnessScore - (a.impactScore + a.freshnessScore),
  )
  const capped = ranked.slice(0, cap)
  const includedIds = new Set(capped.map((n) => n.id))

  const allEdges = await prisma.graphEdge.findMany()
  const edges = allEdges.filter((e) => includedIds.has(e.sourceNodeId) && includedIds.has(e.targetNodeId))

  const byType: Record<string, number> = {}
  for (const node of capped) {
    byType[node.nodeType] = (byType[node.nodeType] ?? 0) + 1
  }

  const lastScan = await prisma.scanRun.findFirst({ orderBy: { startedAt: 'desc' } })

  const [activeEventCount, riskCount, opportunityCount] = await Promise.all([
    prisma.eventCandidate.count({ where: { status: { notIn: ['DISMISSED'] } } }),
    prisma.eventCandidate.count({ where: { eventClass: 'RISK' } }),
    prisma.eventCandidate.count({ where: { eventClass: 'OPPORTUNITY' } }),
  ])

  const lowConfidenceCount = await prisma.eventCandidate.count({
    where: { confidence: { lt: HIGH_UNCERTAINTY_CONFIDENCE_THRESHOLD } },
  })
  const withGapsCount = await prisma.eventCandidate.count({
    where: { dataGaps: { some: {} } },
  })
  const lowConfidenceWithGapsCount = await prisma.eventCandidate.count({
    where: { confidence: { lt: HIGH_UNCERTAINTY_CONFIDENCE_THRESHOLD }, dataGaps: { some: {} } },
  })
  // confidence<0.45 OR >=1 DataGap: inclusion-exclusion to avoid double counting.
  const highUncertaintyCount = lowConfidenceCount + withGapsCount - lowConfidenceWithGapsCount

  return {
    nodes: capped.map(toNodeData),
    edges: edges.map(toEdgeData),
    lastScanAt: lastScan?.startedAt.toISOString() ?? null,
    graphStats: { nodeCount: capped.length, edgeCount: edges.length, byType },
    activeEventCount,
    riskCount,
    opportunityCount,
    highUncertaintyCount,
  }
}

export type RenderNode = GraphNodeData & { group: string; val: number }

export type RenderFilters = {
  nodeTypes?: string[]
  sector?: string
  region?: string
  minConfidence?: number
  riskOnly?: boolean
  opportunityOnly?: boolean
  sinceDays?: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** val = 1 + impactScore*4, so render sizing ranges roughly [1, 5]. */
function toRenderNode(node: GraphNodeData): RenderNode {
  return { ...node, group: node.nodeType, val: 1 + node.impactScore * 4 }
}

/**
 * The render-ready graph: reuses the existing capped (400) node/edge load from
 * `getLiveGraph`, then applies optional filters over that capped set. `sector`/`region`
 * match a SECTOR/REGION node's refId (lowercased) or title (case-insensitive).
 * `riskOnly`/`opportunityOnly` filter to nodes whose riskScore/opportunityScore is
 * the dominant (>0 and >= the other) score. `sinceDays` is evaluated against
 * `EventCandidate.lastUpdatedAt` for EVENT nodes (refId is the EventCandidate id);
 * non-EVENT nodes are unaffected by `sinceDays`. Edges are only kept when both
 * endpoints survive the node filter. No raw *Json is exposed.
 */
export async function getGraphForRender(
  filters: RenderFilters = {},
): Promise<{ nodes: RenderNode[]; edges: GraphEdgeData[]; stats: { nodeCount: number; edgeCount: number; byType: Record<string, number> } }> {
  const live = await getLiveGraph()
  let nodes = live.nodes

  if (filters.nodeTypes && filters.nodeTypes.length > 0) {
    const wanted = new Set(filters.nodeTypes)
    nodes = nodes.filter((n) => wanted.has(n.nodeType))
  }

  if (filters.sector) {
    const wanted = filters.sector.toLowerCase()
    nodes = nodes.filter((n) => {
      if (n.nodeType !== 'SECTOR') return true
      return n.refId.toLowerCase() === wanted || n.title.toLowerCase() === wanted
    })
  }

  if (filters.region) {
    const wanted = filters.region.toLowerCase()
    nodes = nodes.filter((n) => {
      if (n.nodeType !== 'REGION') return true
      return n.refId.toLowerCase() === wanted || n.title.toLowerCase() === wanted
    })
  }

  if (typeof filters.minConfidence === 'number') {
    const min = filters.minConfidence
    nodes = nodes.filter((n) => n.confidence >= min)
  }

  if (filters.riskOnly) {
    nodes = nodes.filter((n) => n.riskScore > 0 && n.riskScore >= n.opportunityScore)
  }

  if (filters.opportunityOnly) {
    nodes = nodes.filter((n) => n.opportunityScore > 0 && n.opportunityScore >= n.riskScore)
  }

  if (typeof filters.sinceDays === 'number') {
    const sinceDays = filters.sinceDays
    const eventRefIds = nodes.filter((n) => n.nodeType === 'EVENT').map((n) => n.refId)
    const events =
      eventRefIds.length > 0
        ? await prisma.eventCandidate.findMany({
            where: { id: { in: eventRefIds } },
            select: { id: true, lastUpdatedAt: true },
          })
        : []
    const lastUpdatedById = new Map(events.map((e) => [e.id, e.lastUpdatedAt]))
    const cutoff = Date.now() - sinceDays * MS_PER_DAY
    nodes = nodes.filter((n) => {
      if (n.nodeType !== 'EVENT') return true
      const lastUpdatedAt = lastUpdatedById.get(n.refId)
      return lastUpdatedAt ? lastUpdatedAt.getTime() >= cutoff : false
    })
  }

  const includedIds = new Set(nodes.map((n) => n.id))
  const edges = live.edges.filter((e) => includedIds.has(e.sourceNodeId) && includedIds.has(e.targetNodeId))

  const byType: Record<string, number> = {}
  for (const node of nodes) {
    byType[node.nodeType] = (byType[node.nodeType] ?? 0) + 1
  }

  return {
    nodes: nodes.map(toRenderNode),
    edges,
    stats: { nodeCount: nodes.length, edgeCount: edges.length, byType },
  }
}

/** A node plus its incident edges and the other endpoint per edge (1-degree). */
export async function getNodeDetail(
  id: string,
): Promise<{ node: GraphNodeData; edges: { edge: GraphEdgeData; otherNode: GraphNodeData }[] } | null> {
  const node = await prisma.graphNode.findUnique({ where: { id } })
  if (!node) return null

  const edges = await prisma.graphEdge.findMany({
    where: { OR: [{ sourceNodeId: id }, { targetNodeId: id }] },
  })

  const otherIds = new Set<string>()
  for (const edge of edges) {
    otherIds.add(edge.sourceNodeId === id ? edge.targetNodeId : edge.sourceNodeId)
  }

  const otherNodes =
    otherIds.size > 0 ? await prisma.graphNode.findMany({ where: { id: { in: [...otherIds] } } }) : []
  const otherNodeById = new Map(otherNodes.map((n) => [n.id, toNodeData(n)]))

  return {
    node: toNodeData(node),
    edges: edges
      .map((edge) => {
        const otherId = edge.sourceNodeId === id ? edge.targetNodeId : edge.sourceNodeId
        const otherNode = otherNodeById.get(otherId)
        if (!otherNode) return null
        return { edge: toEdgeData(edge), otherNode }
      })
      .filter((e): e is { edge: GraphEdgeData; otherNode: GraphNodeData } => e !== null),
  }
}

/** A node plus its 1-degree neighbourhood (nodes reachable by exactly one edge, either direction). */
export async function getNodeNeighbourhood(id: string): Promise<NodeNeighbourhood | null> {
  const node = await prisma.graphNode.findUnique({ where: { id } })
  if (!node) return null

  const edges = await prisma.graphEdge.findMany({
    where: { OR: [{ sourceNodeId: id }, { targetNodeId: id }] },
  })

  const neighbourIds = new Set<string>()
  for (const edge of edges) {
    if (edge.sourceNodeId !== id) neighbourIds.add(edge.sourceNodeId)
    if (edge.targetNodeId !== id) neighbourIds.add(edge.targetNodeId)
  }

  const neighbours =
    neighbourIds.size > 0
      ? await prisma.graphNode.findMany({ where: { id: { in: [...neighbourIds] } } })
      : []

  return {
    node: toNodeData(node),
    neighbours: neighbours.map(toNodeData),
    edges: edges.map(toEdgeData),
  }
}

/** The EVENT GraphNode id for a given EventCandidate id, keyed on the (refType='event', refId) unique. */
export async function getEventGraphNodeId(eventId: string): Promise<string | null> {
  const node = await prisma.graphNode.findUnique({ where: { refType_refId: { refType: 'event', refId: eventId } } })
  return node?.id ?? null
}

export type EvidenceArcData = {
  id: string
  rootNodeId: string
  title: string
  summary: string
  maxDegrees: number
  truePotentialScore: number
  confidence: number
  originStrength: number
  sourceDiversity: number
  contradictionScore: number
  momentumScore: number
  chainClass: string
  isFixture: boolean
}

export type EvidenceArcStepData = {
  degree: number
  nodeType: string
  nodeTitle: string
  relationshipType: string
  explanation: string
  confidence: number
  sourceCount: number
}

/** Shapes persisted arc + step rows into the display DTO (shared by the
 *  cached read and the rebuild path). */
async function shapeArc(
  arc: EvidenceArcData,
  steps: { degree: number; nodeId: string; relationshipType: string; explanation: string; confidence: number; sourceCount: number }[],
): Promise<{ arc: EvidenceArcData; steps: EvidenceArcStepData[] }> {
  const stepNodes = await prisma.graphNode.findMany({ where: { id: { in: steps.map((s) => s.nodeId) } } })
  const nodeById = new Map(stepNodes.map((n) => [n.id, n]))
  const stepsData: EvidenceArcStepData[] = steps
    .map((s) => {
      const node = nodeById.get(s.nodeId)
      return {
        degree: s.degree,
        nodeType: node?.nodeType ?? 'UNKNOWN',
        nodeTitle: node?.title ?? 'Unknown node',
        relationshipType: s.relationshipType,
        explanation: s.explanation,
        confidence: s.confidence,
        sourceCount: s.sourceCount,
      }
    })
    .sort((a, b) => a.degree - b.degree)
  return { arc, steps: stepsData }
}

const asArcData = (arc: {
  id: string; rootNodeId: string; title: string; summary: string; maxDegrees: number; truePotentialScore: number
  confidence: number; originStrength: number; sourceDiversity: number; contradictionScore: number
  momentumScore: number; chainClass: string; isFixture: boolean
}): EvidenceArcData => ({
  id: arc.id, rootNodeId: arc.rootNodeId, title: arc.title, summary: arc.summary, maxDegrees: arc.maxDegrees,
  truePotentialScore: arc.truePotentialScore, confidence: arc.confidence, originStrength: arc.originStrength,
  sourceDiversity: arc.sourceDiversity, contradictionScore: arc.contradictionScore, momentumScore: arc.momentumScore,
  chainClass: arc.chainClass, isFixture: arc.isFixture,
})

/**
 * The evidence arc rooted at an event's EVENT GraphNode. CACHED: serves the
 * persisted EvidenceArc/steps when they are fresh (built at/after the graph
 * node's last update) rather than rebuilding — this removes the write-on-GET
 * behaviour (viewing an event page no longer deletes+recreates arc rows and
 * two concurrent views no longer race). Rebuilds only on a cache miss (never
 * built) or staleness (the graph node changed since). Arcs are warmed at scan
 * time by `buildArcsForEvents`. Returns null if the event has no graph node.
 */
export async function getEventArc(
  eventId: string,
): Promise<{ arc: EvidenceArcData; steps: EvidenceArcStepData[] } | null> {
  const nodeId = await getEventGraphNodeId(eventId)
  if (!nodeId) return null

  // Cache check: a persisted arc that is at least as new as its root node.
  const node = await prisma.graphNode.findUnique({ where: { id: nodeId }, select: { updatedAt: true } })
  const cached = await prisma.evidenceArc.findFirst({ where: { rootNodeId: nodeId }, orderBy: { updatedAt: 'desc' } })
  if (cached && node && cached.updatedAt >= node.updatedAt) {
    const cachedSteps = await prisma.evidenceArcStep.findMany({ where: { evidenceArcId: cached.id } })
    return shapeArc(asArcData(cached), cachedSteps)
  }

  const result = await buildArc(nodeId)
  if (!result) return null

  return shapeArc(asArcData(result.arc), result.steps)
}

/**
 * Warms the arc cache for a scan's events by building each event's arc once,
 * at scan time — so subsequent event-page reads are cache hits and never
 * write. Non-fatal: a failed arc build for one event never fails the scan.
 */
export async function buildArcsForEvents(
  events: { id: string }[],
): Promise<{ built: number; errors: { stage: string; message: string }[] }> {
  const errors: { stage: string; message: string }[] = []
  let built = 0
  for (const event of events) {
    try {
      const nodeId = await getEventGraphNodeId(event.id)
      if (!nodeId) continue
      const result = await buildArc(nodeId)
      if (result) built++
    } catch (err) {
      errors.push({ stage: 'arc', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { built, errors }
}
