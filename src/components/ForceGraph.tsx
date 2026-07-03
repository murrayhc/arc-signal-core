'use client'

import { useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { GraphEdgeData, RenderNode } from '@/server/services/graph'

// react-force-graph wraps Three.js/WebGL — client-only. Both variants are named
// exports of the same bundled `react-force-graph` package, so we load one module
// and pick the named export per mode, still gated behind ssr:false.
const ForceGraph3D = dynamic(() => import('react-force-graph').then((m) => m.ForceGraph3D), { ssr: false })
const ForceGraph2D = dynamic(() => import('react-force-graph').then((m) => m.ForceGraph2D), { ssr: false })

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
  const graphData = useMemo(() => {
    const links: GraphLink[] = edges.map((edge) => ({
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

  // Guard for SSR: the browser-only WebGL/canvas globals aren't available on the server.
  if (typeof window === 'undefined') {
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
    // paused: stop the force simulation from ticking so the layout holds still (reduced motion).
    cooldownTicks: paused ? 0 : undefined,
    d3VelocityDecay: paused ? 1 : undefined,
    warmupTicks: paused ? 0 : undefined,
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
