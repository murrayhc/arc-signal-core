'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { GraphEdgeData, RenderNode } from '@/server/services/graph'

// Standalone 2D build only (the umbrella react-force-graph bundles VR/AR and
// crashes on a missing global AFRAME). 2D canvas also lets the radar sweep
// show through a transparent background — WebGL 3D cannot.
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

type GraphLink = { source: string; target: string; edge: GraphEdgeData }
type SimNode = RenderNode & { x?: number; y?: number }

/** Node class → base dot colour. Every projected class has an entry. */
const CLASS_COLORS: Record<string, string> = {
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

const SQUARE_MARKERS = new Set(['CONTRADICTION', 'DATA_GAP'])

export function brainColor(group: string): string {
  return CLASS_COLORS[group] ?? '#8fa3c4'
}

/**
 * The living-map canvas. Every visual channel is driven by a real field:
 * dot size ← impact, opacity ← freshness (stale evidence dims), glow hue ←
 * dominant risk/opportunity score, edge brightness ← edge confidence,
 * contradiction edges ← dashed risk-red. Fresh nodes (freshness ≥ 0.85)
 * pulse unless the user prefers reduced motion.
 */
export function BrainGraph({
  nodes,
  edges,
  onSelect,
  onClear,
}: {
  nodes: RenderNode[]
  edges: GraphEdgeData[]
  onSelect: (nodeId: string) => void
  onClear: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // Mount gate: server HTML and first client render must match (hydration).
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // The canvas must fill the Brain panel exactly — measure the container.
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

  const graphData = useMemo(() => {
    const nodeIds = new Set(nodes.map((n) => n.id))
    const links: GraphLink[] = edges
      .filter((e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId))
      .map((e) => ({ source: e.sourceNodeId, target: e.targetNodeId, edge: e }))
    return { nodes, links }
  }, [nodes, edges])

  if (!mounted || !size) {
    return (
      <div ref={containerRef} className="h-full w-full">
        <p className="flex h-full items-center justify-center font-data text-xs text-ink-faint">
          Initialising living map…
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
    nodeCanvasObject: (node: SimNode, ctx: CanvasRenderingContext2D) => {
      const x = node.x ?? 0
      const y = node.y ?? 0
      const r = 1.6 + Math.sqrt(node.val) * 1.7
      const baseColor = brainColor(node.group)
      // Glow hue follows the dominant commercial reading of the node.
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

      // Fresh-node pulse: an expanding ring, time-driven (needs live redraw).
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
      const r = 1.6 + Math.sqrt(node.val) * 1.7 + 3
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI)
      ctx.fill()
    },
    // Reduced motion: lay out up front (warmup ticks run the force simulation
    // synchronously at default velocity decay), then hold still — zero cooldown
    // ticks means no animated settling. Overriding d3VelocityDecay to 1 here
    // would zero d3's position multiplier and freeze the initial spiral instead.
    warmupTicks: reducedMotion ? 90 : undefined,
    cooldownTicks: reducedMotion ? 0 : undefined,
    // The pulse needs continuous redraw; skip it entirely under reduced motion.
    autoPauseRedraw: reducedMotion,
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph2D {...props} />
    </div>
  )
}
