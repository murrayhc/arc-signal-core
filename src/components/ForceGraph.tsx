'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import type { GraphEdgeData, RenderNode } from '@/server/services/graph'

// Three.js/WebGL + Canvas — client-only, loaded via ssr:false. We import the
// STANDALONE `react-force-graph-2d`/`-3d` packages (default exports), NOT the
// umbrella `react-force-graph`, because the umbrella also bundles the VR/AR
// variants which reference a global `AFRAME` at module load and crash the app.
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false })
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

export type RenderEdge = GraphEdgeData

type GraphLink = { source: string; target: string; edge: RenderEdge }

// next/dynamic erases react-force-graph's generic NodeObject<T> type params, so
// accessor callbacks arrive typed as the library's untyped default node shape.
// We know at runtime these are our RenderNode plus the simulation's injected
// x/y coordinates, so accessors accept that loose shape and are cast at the call site.
type SimNode = RenderNode & { x?: number; y?: number }

const DISTINCT_MARKER_TYPES = new Set(['CONTRADICTION', 'DATA_GAP'])

const GROUP_COLORS: Record<string, string> = {
  EVENT: '#38bdf8',
  SECTOR: '#a78bfa',
  REGION: '#34d399',
  SIGNAL: '#facc15',
  CLAIM: '#fb923c',
  DOCUMENT: '#94a3b8',
  SOURCE: '#64748b',
  OPPORTUNITY: '#4ade80',
  POSITIONING: '#22d3ee',
  DATA_GAP: '#f87171',
  CONTRADICTION: '#f43f5e',
}

function colorForGroup(group: string): string {
  return GROUP_COLORS[group] ?? '#94a3b8'
}

export function ForceGraph({
  nodes,
  edges,
  mode,
  paused,
  onSelect,
}: {
  nodes: RenderNode[]
  edges: RenderEdge[]
  mode: '3d' | '2d'
  paused: boolean
  onSelect: (nodeId: string) => void
}) {
  // Mount gate: the server and the FIRST client render must produce identical
  // HTML, so both show the placeholder; only after mount does the client swap in
  // the WebGL/canvas graph. Branching on `typeof window` here instead would make
  // server and client HTML differ → hydration mismatch crash (which is exactly
  // what happened when this component was rendered directly during SSR).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const graphData = useMemo(() => {
    // react-force-graph throws ("node not found") if a link references an id
    // absent from the node set — drop any dangling edge before handing it over.
    const nodeIds = new Set(nodes.map((n) => n.id))
    const links: GraphLink[] = edges
      .filter((edge) => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId))
      .map((edge) => ({
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        edge,
      }))
    return { nodes, links }
  }, [nodes, edges])

  if (nodes.length === 0) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-sm text-slate-500">
        No nodes match the current filters.
      </div>
    )
  }

  // Until mounted on the client, render the same placeholder the server did.
  if (!mounted) {
    return (
      <div className="flex h-full min-h-[24rem] items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-sm text-slate-500">
        Loading graph…
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const commonProps: any = {
    graphData,
    nodeId: 'id',
    nodeLabel: (node: SimNode) => node.title,
    nodeVal: (node: SimNode) => node.val,
    nodeColor: (node: SimNode) =>
      DISTINCT_MARKER_TYPES.has(node.group) ? '#f43f5e' : colorForGroup(node.group),
    linkSource: 'source',
    linkTarget: 'target',
    onNodeClick: (node: SimNode) => onSelect(node.id),
    // paused (reduced motion): run warmup ticks UP FRONT so nodes get laid out
    // before the first paint, then do zero cooldown ticks so there is no ongoing
    // animation. warmupTicks:0 here would leave nodes un-positioned and crash the
    // renderer ("cannot read x of undefined") when it draws links.
    warmupTicks: paused ? 80 : undefined,
    cooldownTicks: paused ? 0 : undefined,
    d3VelocityDecay: paused ? 1 : undefined,
  }

  return (
    <div className="h-full min-h-[24rem] w-full overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
      {mode === '3d' ? (
        <ForceGraph3D
          {...commonProps}
          nodeThreeObjectExtend={false}
          backgroundColor="#020617"
        />
      ) : (
        <ForceGraph2D
          {...commonProps}
          backgroundColor="#020617"
          linkColor={() => 'rgba(148, 163, 184, 0.35)'}
          nodeCanvasObjectMode={(node: SimNode) =>
            DISTINCT_MARKER_TYPES.has(node.group) ? 'before' : undefined
          }
          nodeCanvasObject={(node: SimNode, ctx: CanvasRenderingContext2D) => {
            if (!DISTINCT_MARKER_TYPES.has(node.group)) return
            const size = 4 + node.val
            ctx.save()
            ctx.strokeStyle = '#f43f5e'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            // Distinct marker: a square ring around contradiction/data-gap nodes,
            // set apart from the round dots used for every other node type.
            ctx.rect((node.x ?? 0) - size, (node.y ?? 0) - size, size * 2, size * 2)
            ctx.stroke()
            ctx.restore()
          }}
        />
      )}
    </div>
  )
}
