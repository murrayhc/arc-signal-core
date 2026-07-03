import { prisma } from '@/server/db'
import { getNodeNeighbourhood } from '@/server/services/graph'

/** Public event-graph context for a symbol/name, gathered by walking the
 *  matched COMMODITY/INSTRUMENT GraphNode's real 1-degree neighbourhood
 *  (`getNodeNeighbourhood`) once it has been projected (`syncMarketNodes`,
 *  src/server/market/graph.ts) — connected EVENT titles, SECTOR/SIGNAL
 *  pressure signals, and CONTRADICTS edges among the neighbourhood, exactly
 *  as they exist in the graph. Falls back to a title-substring scan only when
 *  no market node has been projected yet for this identifier — still real
 *  graph data, never invented. NEVER fabricates: no matches means empty
 *  arrays either way. */
export type MarketGraphEvidence = {
  relatedEventTitles: string[]
  sectorPressureSignals: string[]
  contradictions: string[]
}

const EMPTY_GRAPH_EVIDENCE: MarketGraphEvidence = {
  relatedEventTitles: [],
  sectorPressureSignals: [],
  contradictions: [],
}

/** Contradictions reaching a node set: any CONTRADICTS edge with EITHER endpoint
 *  inside `nodeIds` (the WHERE is an OR, one endpoint suffices — intentional, so
 *  a contradiction against a neighbour just outside the set is still surfaced),
 *  rendered as "A vs B" using the already-loaded `nodeById` map (falls back to a
 *  direct lookup for an endpoint not already in the map). */
async function contradictionsAmong(nodeIds: string[], nodeById: Map<string, { title: string }>): Promise<string[]> {
  if (nodeIds.length === 0) return []

  const edges = await prisma.graphEdge.findMany({
    where: { edgeType: 'CONTRADICTS', OR: [{ sourceNodeId: { in: nodeIds } }, { targetNodeId: { in: nodeIds } }] },
  })
  if (edges.length === 0) return []

  const missingIds = new Set<string>()
  for (const edge of edges) {
    if (!nodeById.has(edge.sourceNodeId)) missingIds.add(edge.sourceNodeId)
    if (!nodeById.has(edge.targetNodeId)) missingIds.add(edge.targetNodeId)
  }
  const merged = new Map(nodeById)
  if (missingIds.size > 0) {
    const missingNodes = await prisma.graphNode.findMany({ where: { id: { in: [...missingIds] } } })
    for (const n of missingNodes) merged.set(n.id, n)
  }

  return edges
    .map((edge) => {
      const a = merged.get(edge.sourceNodeId)
      const b = merged.get(edge.targetNodeId)
      return a && b ? `${a.title} vs ${b.title}` : null
    })
    .filter((c): c is string => c !== null)
}

/** Graph evidence via the real market-node neighbourhood: resolves the
 *  already-projected GraphNode for (refType, refId), walks its 1-degree
 *  neighbours, and splits them into EVENT titles vs SECTOR/SIGNAL pressure
 *  signals, plus CONTRADICTS edges reaching the node or its neighbours. */
async function neighbourhoodGraphEvidence(refType: 'instrument' | 'commodity', refId: string): Promise<MarketGraphEvidence | null> {
  const node = await prisma.graphNode.findUnique({ where: { refType_refId: { refType, refId } } })
  if (!node) return null

  const neighbourhood = await getNodeNeighbourhood(node.id)
  if (!neighbourhood) return null

  const relatedEventTitles = neighbourhood.neighbours.filter((n) => n.nodeType === 'EVENT').map((n) => n.title)
  const sectorPressureSignals = neighbourhood.neighbours
    .filter((n) => n.nodeType === 'SIGNAL' || n.nodeType === 'SECTOR')
    .map((n) => n.title)

  const nodeIds = [node.id, ...neighbourhood.neighbours.map((n) => n.id)]
  const nodeById = new Map<string, { title: string }>([[node.id, node], ...neighbourhood.neighbours.map((n) => [n.id, n] as const)])
  const contradictions = await contradictionsAmong(nodeIds, nodeById)

  return { relatedEventTitles, sectorPressureSignals, contradictions }
}

/** Fallback graph-evidence lookup for an identifier with no projected market
 *  node yet: GraphNodes whose title case-insensitively contains `identifier`,
 *  split the same way. Real but shallow — no fabricated evidence, just
 *  whatever's already in the graph under a plain title match. */
async function titleMatchGraphEvidence(identifier: string): Promise<MarketGraphEvidence> {
  const lower = identifier.toLowerCase()
  // SQLite has no case-insensitive `contains` at the query-engine level (that's
  // a Postgres/MongoDB-only Prisma feature), so filter in JS after fetch —
  // matches the existing convention in interrogate/service.ts's findMatchingNodes.
  const allNodes = await prisma.graphNode.findMany()
  const matched = allNodes.filter((n) => n.title.toLowerCase().includes(lower))
  if (matched.length === 0) return EMPTY_GRAPH_EVIDENCE

  const relatedEventTitles = matched.filter((n) => n.nodeType === 'EVENT').map((n) => n.title)
  const sectorPressureSignals = matched.filter((n) => n.nodeType === 'SIGNAL' || n.nodeType === 'SECTOR').map((n) => n.title)
  const nodeById = new Map(matched.map((n) => [n.id, n]))
  const contradictions = await contradictionsAmong(matched.map((n) => n.id), nodeById)

  return { relatedEventTitles, sectorPressureSignals, contradictions }
}

/** Public event-graph context for a market identifier. When `marketRef` names
 *  an already-projected COMMODITY/INSTRUMENT node (post `syncMarketNodes`),
 *  walks its real 1-degree neighbourhood; otherwise (no market node projected
 *  yet for this identifier — e.g. first-ever lookup before a graph sync has
 *  run) falls back to a plain title-substring scan of the graph. Both paths
 *  return only real graph data; neither fabricates. */
export async function gatherGraphEvidence(
  identifier: string,
  marketRef?: { refType: 'instrument' | 'commodity'; refId: string },
): Promise<MarketGraphEvidence> {
  const trimmed = identifier.trim()
  if (trimmed.length === 0) return EMPTY_GRAPH_EVIDENCE

  if (marketRef) {
    const fromNeighbourhood = await neighbourhoodGraphEvidence(marketRef.refType, marketRef.refId)
    if (fromNeighbourhood) return fromNeighbourhood
  }

  return titleMatchGraphEvidence(trimmed)
}
