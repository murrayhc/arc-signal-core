import type { GraphEdgeData, RenderNode } from '@/server/services/graph'

/**
 * Pure semantic model for the Intelligence Brain mesh. Central nodes are the
 * EVENT nodes whose REAL risk/opportunity scores dominate the projection —
 * nothing is invented; centrality is read straight off persisted fields.
 */

export type CentralKind = 'RISK' | 'OPPORTUNITY'

/** Node class → base dot colour (shared by the 2D and 3D renderers, the
 *  legend and the detail panel). Every projected class has an entry. */
export const CLASS_COLORS: Record<string, string> = {
  EVENT: '#55a9ff',
  SIGNAL: '#8cc5ff',
  CLAIM: '#c7d9f2',
  DOCUMENT: '#8fa3c4',
  SOURCE: '#64748b',
  SECTOR: '#a182ff',
  REGION: '#37d6b0',
  OPPORTUNITY: '#e3b341',
  POSITIONING: '#c4b0ff',
  COMPANY: '#e8eef9',
  PERSON: '#e8eef9',
  COMMODITY: '#7fe0c3',
  INSTRUMENT: '#d9c08a',
  DATA_GAP: '#efa33d',
  CONTRADICTION: '#f4574d',
}

export function brainColor(group: string): string {
  return CLASS_COLORS[group] ?? '#8fa3c4'
}

export type CentralNode = {
  id: string
  title: string
  kind: CentralKind
  /** The dominant score (max of risk/opportunity) that earned centrality. */
  score: number
}

export const CENTRAL_THRESHOLD = 0.5
export const CENTRAL_CAP = 6

/** Red for risk, green for opportunity — the mesh's core colour contract. */
export const CENTRAL_COLORS: Record<CentralKind, string> = {
  RISK: '#f4574d',
  OPPORTUNITY: '#37d6b0',
}

/**
 * EVENT nodes with max(riskScore, opportunityScore) >= threshold, strongest
 * first, capped. If none clear the threshold, fall back to the top 3 scoring
 * EVENT nodes (score > 0) so a young radar still has anchors.
 */
export function pickCentralNodes(
  nodes: RenderNode[],
  { threshold = CENTRAL_THRESHOLD, cap = CENTRAL_CAP } = {},
): CentralNode[] {
  const events = nodes
    .filter((n) => n.nodeType === 'EVENT')
    .map((n) => ({
      id: n.id,
      title: n.title,
      kind: (n.riskScore >= n.opportunityScore ? 'RISK' : 'OPPORTUNITY') as CentralKind,
      score: Math.max(n.riskScore, n.opportunityScore),
    }))
    .sort((a, b) => b.score - a.score)

  const qualifying = events.filter((e) => e.score >= threshold)
  if (qualifying.length > 0) return qualifying.slice(0, cap)
  return events.filter((e) => e.score > 0).slice(0, 3)
}

/**
 * Evidence depth per node: hops from the NEAREST central over undirected
 * edges (multi-source BFS). Centrals are depth 0; each degree of connected
 * evidence forms the next shell. Nodes unreachable from any central sit one
 * shell beyond the deepest reachable node.
 */
export function buildDepthMap(
  nodes: RenderNode[],
  edges: GraphEdgeData[],
  centralIds: string[],
): Map<string, number> {
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    if (!adjacency.has(edge.sourceNodeId)) adjacency.set(edge.sourceNodeId, [])
    if (!adjacency.has(edge.targetNodeId)) adjacency.set(edge.targetNodeId, [])
    adjacency.get(edge.sourceNodeId)!.push(edge.targetNodeId)
    adjacency.get(edge.targetNodeId)!.push(edge.sourceNodeId)
  }

  const depths = new Map<string, number>()
  const queue: string[] = []
  for (const id of centralIds) {
    depths.set(id, 0)
    queue.push(id)
  }
  let head = 0
  while (head < queue.length) {
    const current = queue[head++]
    const depth = depths.get(current)!
    for (const next of adjacency.get(current) ?? []) {
      if (!depths.has(next)) {
        depths.set(next, depth + 1)
        queue.push(next)
      }
    }
  }

  let maxDepth = 0
  for (const d of depths.values()) maxDepth = Math.max(maxDepth, d)
  const orphanDepth = maxDepth + 1
  for (const node of nodes) {
    if (!depths.has(node.id)) depths.set(node.id, orphanDepth)
  }
  return depths
}
