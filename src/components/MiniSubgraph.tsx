'use client'

import { ForceGraph } from '@/components/ForceGraph'
import type { GraphEdgeData, RenderNode } from '@/server/services/graph'

/**
 * Thin client wrapper around `ForceGraph` for the `/interrogate` mini
 * subgraph preview: always 2D and paused (a lightweight static view, not a
 * running simulation), with a no-op select handler. Exists only because
 * event-handler props (like `onSelect`) can't be passed from a server
 * component straight into a client component — `InterrogationResults` stays
 * a server component and renders this instead.
 */
export function MiniSubgraph({ nodes, edges }: { nodes: RenderNode[]; edges: GraphEdgeData[] }) {
  return <ForceGraph nodes={nodes} edges={edges} mode="2d" paused onSelect={() => {}} />
}
