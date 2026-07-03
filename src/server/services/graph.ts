import { prisma } from '@/server/db'
import type { GraphEdge, GraphNode } from '@prisma/client'

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
