'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { GraphEdgeData, RenderNode } from '@/server/services/graph'
import { CENTRAL_COLORS, brainColor, type CentralNode } from './brain-model'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

type GraphLink = { source: string; target: string; edge: GraphEdgeData }
type SimNode = RenderNode & { x?: number; y?: number }

const SQUARE_MARKERS = new Set(['CONTRADICTION', 'DATA_GAP'])

/**
 * Canvas fallback for machines without WebGL (and the explicit 2D mode).
 * Carries the same semantic contract as the 3D mesh: red/green central
 * cores that pulse, with lead lines to info boxes; sub-nodes dim as their
 * evidence goes stale.
 */
export function BrainGraph2D({
  nodes,
  edges,
  centrals,
  selectedId,
  onSelect,
  onClear,
}: {
  nodes: RenderNode[]
  edges: GraphEdgeData[]
  centrals: CentralNode[]
  selectedId: string | null
  onSelect: (nodeId: string) => void
  onClear: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  // Read inside the per-frame canvas draw so the selected node's card follows
  // selection without rebuilding the graph props.
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [mounted])

  const centralById = useMemo(() => new Map(centrals.map((c) => [c.id, c])), [centrals])

  const graphData = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id))
    const links: GraphLink[] = edges
      .filter((e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId))
      .map((e) => ({ source: e.sourceNodeId, target: e.targetNodeId, edge: e }))
    return { nodes: nodes.map((n) => ({ ...n })), links }
  }, [nodes, edges])

  if (!mounted || !size) {
    return (
      <div ref={containerRef} className="h-full w-full">
        <p className="flex h-full items-center justify-center font-data text-xs text-ink-faint">
          Initialising node mesh…
        </p>
      </div>
    )
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const props: any = {
    graphData,
    width: size.width,
    height: size.height,
    backgroundColor: 'rgba(0,0,0,0)',
    nodeId: 'id',
    nodeVal: (n: SimNode) => n.val,
    nodeLabel: (n: SimNode) => `${n.title} — ${n.group.replace(/_/g, ' ').toLowerCase()}`,
    linkSource: 'source',
    linkTarget: 'target',
    linkLabel: (l: GraphLink) => l.edge.label || l.edge.edgeType.replace(/_/g, ' ').toLowerCase(),
    linkColor: (l: GraphLink) => {
      const c = Math.max(0, Math.min(1, l.edge.confidence))
      return l.edge.edgeType === 'CONTRADICTS'
        ? `rgba(244, 87, 77, ${0.25 + 0.45 * c})`
        : `rgba(85, 169, 255, ${0.08 + 0.42 * c})`
    },
    linkLineDash: (l: GraphLink) => (l.edge.edgeType === 'CONTRADICTS' ? [2, 2] : null),
    linkWidth: (l: GraphLink) => 0.4 + l.edge.weight,
    onNodeClick: (n: SimNode) => onSelect(n.id),
    onBackgroundClick: () => onClear(),
    nodeCanvasObject: (node: SimNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const central = centralById.get(node.id)

      if (central) {
        const color = CENTRAL_COLORS[central.kind]
        const r = 4 + Math.sqrt(node.val) * 1.6

        ctx.save()
        // Pulse ring (skipped under reduced motion).
        if (!reducedMotion) {
          const p = (performance.now() / 1600 + node.id.charCodeAt(0) / 97) % 1
          ctx.globalAlpha = 0.45 * (1 - p)
          ctx.strokeStyle = color
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(x, y, r + 2 + p * 7, 0, 2 * Math.PI)
          ctx.stroke()
        }
        // Core.
        ctx.globalAlpha = 1
        ctx.shadowColor = color
        ctx.shadowBlur = 14
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, r, 0, 2 * Math.PI)
        ctx.fill()
        ctx.shadowBlur = 0

        // Lead line + info box — only for the selected central, so cards never
        // pile up over the mesh (selecting also opens the node detail panel).
        if (node.id === selectedIdRef.current) {
          const s = 1 / globalScale
          const off = 26 * s
          const bx = x + off
          const by = y - off
          ctx.strokeStyle = color
          ctx.globalAlpha = 0.7
          ctx.lineWidth = s
          ctx.beginPath()
          ctx.moveTo(x + r * 0.7, y - r * 0.7)
          ctx.lineTo(bx, by)
          ctx.stroke()

          const kindText = `${central.kind === 'RISK' ? 'HIGH RISK' : 'HIGH OPPORTUNITY'} · ${Math.round(central.score * 100)}%`
          const title = central.title.length > 30 ? `${central.title.slice(0, 29)}…` : central.title
          ctx.font = `600 ${9 * s}px "IBM Plex Mono", monospace`
          const kindWidth = ctx.measureText(kindText).width
          ctx.font = `${10 * s}px "IBM Plex Sans", sans-serif`
          const titleWidth = ctx.measureText(title).width
          const pad = 5 * s
          const boxW = Math.max(kindWidth, titleWidth) + pad * 2
          const boxH = 26 * s

          ctx.globalAlpha = 0.92
          ctx.fillStyle = '#0b1222'
          ctx.fillRect(bx, by - boxH, boxW, boxH)
          ctx.globalAlpha = 1
          ctx.strokeStyle = color
          ctx.strokeRect(bx, by - boxH, boxW, boxH)
          ctx.fillStyle = color
          ctx.font = `600 ${9 * s}px "IBM Plex Mono", monospace`
          ctx.fillText(kindText, bx + pad, by - boxH + 10 * s)
          ctx.fillStyle = '#e8eef9'
          ctx.font = `${10 * s}px "IBM Plex Sans", sans-serif`
          ctx.fillText(title, bx + pad, by - boxH + 21 * s)
        }
        ctx.restore()
        return
      }

      const r = 1.6 + Math.sqrt(node.val) * 1.7
      const baseColor = brainColor(node.group)
      const glowColor =
        node.riskScore > 0.35 && node.riskScore >= node.opportunityScore
          ? '#f4574d'
          : node.opportunityScore > 0.35
            ? '#e3b341'
            : baseColor
      const intensity = Math.max(node.riskScore, node.opportunityScore, node.impactScore)

      ctx.save()
      // Stale evidence dims; fresh evidence is fully lit.
      ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, Math.min(1, node.freshnessScore))
      ctx.shadowColor = glowColor
      ctx.shadowBlur = 3 + 9 * intensity
      ctx.fillStyle = baseColor
      ctx.beginPath()
      ctx.arc(x, y, r, 0, 2 * Math.PI)
      ctx.fill()
      ctx.shadowBlur = 0

      if (!reducedMotion && node.freshnessScore >= 0.85) {
        const phase = (Date.now() / 1200 + node.id.charCodeAt(node.id.length - 1)) % 1
        ctx.globalAlpha = 0.4 * (1 - phase)
        ctx.strokeStyle = glowColor
        ctx.lineWidth = 0.6
        ctx.beginPath()
        ctx.arc(x, y, r + 1.5 + phase * 5, 0, 2 * Math.PI)
        ctx.stroke()
      }

      // Contradictions / data gaps keep the established square-ring marker.
      if (SQUARE_MARKERS.has(node.group)) {
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = brainColor(node.group)
        ctx.lineWidth = 0.8
        ctx.strokeRect(x - r - 2, y - r - 2, (r + 2) * 2, (r + 2) * 2)
      }
      ctx.restore()
    },
    nodePointerAreaPaint: (node: SimNode, color: string, ctx: CanvasRenderingContext2D) => {
      const base = centralById.has(node.id) ? 4 + Math.sqrt(node.val) * 1.6 : 1.6 + Math.sqrt(node.val) * 1.7
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, base + 3, 0, 2 * Math.PI)
      ctx.fill()
    },
    // Reduced motion: settle the layout synchronously, then hold still.
    warmupTicks: reducedMotion ? 90 : undefined,
    cooldownTicks: reducedMotion ? 0 : undefined,
    autoPauseRedraw: reducedMotion,
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph2D {...props} />
    </div>
  )
}
