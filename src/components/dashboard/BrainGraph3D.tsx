'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import * as THREE from 'three'
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import type { GraphEdgeData, RenderNode } from '@/server/services/graph'
import { CENTRAL_COLORS, brainColor, type CentralNode } from './brain-model'

// Standalone 3D build (the umbrella react-force-graph bundles VR/AR and
// crashes on a missing global AFRAME).
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false })

type GraphLink = { source: string; target: string; edge: GraphEdgeData }
type SimNode = RenderNode & { x?: number; y?: number; z?: number; fx?: number; fy?: number; fz?: number }

const STALE_COLOR = new THREE.Color('#5a6b8c')

// Staggered callout directions so adjacent centrals' info boxes never stack.
const CALLOUT_DIRECTIONS = [
  new THREE.Vector3(18, 14, 0),
  new THREE.Vector3(-18, 14, 0),
  new THREE.Vector3(18, -14, 0),
  new THREE.Vector3(-18, -14, 0),
  new THREE.Vector3(0, 20, 0),
  new THREE.Vector3(0, -20, 0),
]

/** Deterministic 0..1 phase per node so central pulses don't beat in sync. */
function pulsePhase(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
  return h / 997
}

/**
 * The interactive 3D node mesh. Central nodes (real high-risk / high-
 * opportunity events) sit pinned on an inner ring — red for risk, green for
 * opportunity — with a pulsing halo and a lead line out to an info box that
 * names them. Sub-nodes (the evidence chain) hang off them in shells: link
 * distance grows with BFS depth from the nearest central, so signals, claims,
 * documents and sources radiate outward by degree.
 */
export function BrainGraph3D({
  nodes,
  edges,
  centrals,
  depths,
  onSelect,
  onClear,
}: {
  nodes: RenderNode[]
  edges: GraphEdgeData[]
  centrals: CentralNode[]
  depths: Map<string, number>
  onSelect: (nodeId: string) => void
  onClear: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)
  // Central-node halos, keyed by node id, mutated by the pulse loop.
  const halosRef = useRef(new Map<string, { halo: THREE.Mesh; phase: number }>())

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

  const centralById = useMemo(
    () => new Map(centrals.map((c, index) => [c.id, { ...c, index }])),
    [centrals],
  )
  // One camera fit per dataset, once the layout has settled.
  const fittedRef = useRef(false)

  const graphData = useMemo(() => {
    halosRef.current.clear()
    fittedRef.current = false
    const nodeIds = new Set(nodes.map((n) => n.id))
    const links: GraphLink[] = edges
      .filter((e) => nodeIds.has(e.sourceNodeId) && nodeIds.has(e.targetNodeId))
      .map((e) => ({ source: e.sourceNodeId, target: e.targetNodeId, edge: e }))

    // Edge-less nodes have nothing tethering them — the charge force would
    // fling them arbitrarily far and wreck the camera framing. Pin them on a
    // deterministic outer dust shell instead (still real, still clickable).
    const linkedIds = new Set<string>()
    for (const l of links) {
      linkedIds.add(l.source)
      linkedIds.add(l.target)
    }

    // Clone nodes (the simulation mutates them) and pin centrals on an inner
    // horizontal ring so the mesh anchors around them — wide enough that
    // their callout boxes never fight for the same screen space.
    const ringRadius = centrals.length <= 1 ? 0 : 34 + 13 * centrals.length
    const dustRadius = ringRadius + 120
    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    let orphanIndex = 0
    const orphanCount = Math.max(1, nodes.filter((n) => !linkedIds.has(n.id)).length)

    const cloned: SimNode[] = nodes.map((n) => {
      const clone: SimNode = { ...n }
      const centralIndex = centrals.findIndex((c) => c.id === n.id)
      if (centralIndex >= 0) {
        // Tilted ring with a STRONG y-component: y-separation survives the
        // camera's yaw auto-rotation, so central callouts never re-stack as
        // the mesh turns (x/z alone would project onto one screen column).
        const angle = (2 * Math.PI * centralIndex) / centrals.length
        clone.fx = Math.cos(angle) * ringRadius
        clone.fy = Math.sin(angle) * ringRadius * 0.8
        clone.fz = Math.sin(angle) * ringRadius * 0.35
      } else if (!linkedIds.has(n.id)) {
        // Golden-spiral sphere distribution — even, deterministic dust.
        const i = orphanIndex++
        const y = 1 - (2 * (i + 0.5)) / orphanCount
        const r = Math.sqrt(Math.max(0, 1 - y * y))
        const theta = goldenAngle * i
        clone.fx = Math.cos(theta) * r * dustRadius
        clone.fy = y * dustRadius * 0.6
        clone.fz = Math.sin(theta) * r * dustRadius
      }
      return clone
    })
    return { nodes: cloned, links, linkedIds }
  }, [nodes, edges, centrals])

  // CSS2D layer for the callout info boxes (client-only construction).
  const extraRenderers = useMemo(() => (mounted ? [new CSS2DRenderer()] : []), [mounted])

  // Evidence shells: link distance grows with depth from the nearest central.
  // Reheat ONLY when the data/shape changes — anything else (resize, motion
  // preference) must not restart the simulation and delay the camera fit.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const linkForce = fg.d3Force('link')
    if (linkForce) {
      linkForce.distance((link: { source: SimNode | string; target: SimNode | string }) => {
        const sId = typeof link.source === 'string' ? link.source : link.source.id
        const tId = typeof link.target === 'string' ? link.target : link.target.id
        const depth = Math.max(depths.get(sId) ?? 1, depths.get(tId) ?? 1)
        return 14 + 13 * depth
      })
      fg.d3ReheatSimulation()
    }
    // Provisional camera fit while the layout is still settling, so the mesh
    // never sits tiny in the panel; the definitive fit runs on engine stop.
    const timer = setTimeout(() => {
      if (!fittedRef.current) {
        fgRef.current?.zoomToFit(400, 40, (n: SimNode) => graphData.linkedIds.has(n.id))
      }
    }, 3000)
    return () => clearTimeout(timer)
  }, [graphData, depths])

  // Slow idle rotation — the hologram turns until the user grabs it.
  useEffect(() => {
    const controls = fgRef.current?.controls?.()
    if (controls) {
      controls.autoRotate = !reducedMotion
      controls.autoRotateSpeed = 0.45
    }
  }, [reducedMotion, size])

  // The pulse: central halos breathe outward on a per-node phase.
  useEffect(() => {
    if (reducedMotion) return
    let raf = 0
    const tick = () => {
      const t = performance.now()
      for (const { halo, phase } of halosRef.current.values()) {
        const p = (t / 1600 + phase) % 1
        halo.scale.setScalar(1 + p * 1.1)
        const material = halo.material as THREE.MeshBasicMaterial
        material.opacity = 0.32 * (1 - p)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion, graphData])

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
    showNavInfo: false,
    enableNodeDrag: false,
    nodeId: 'id',
    nodeLabel: (n: SimNode) => `${n.title} — ${n.group.replace(/_/g, ' ').toLowerCase()}`,
    linkSource: 'source',
    linkTarget: 'target',
    linkLabel: (l: GraphLink) => l.edge.label || l.edge.edgeType.replace(/_/g, ' ').toLowerCase(),
    linkColor: (l: GraphLink) => {
      const c = Math.max(0, Math.min(1, l.edge.confidence))
      return l.edge.edgeType === 'CONTRADICTS'
        ? `rgba(244, 87, 77, ${0.45 + 0.4 * c})`
        : `rgba(85, 169, 255, ${0.18 + 0.5 * c})`
    },
    linkOpacity: 0.5,
    linkWidth: (l: GraphLink) => (l.edge.edgeType === 'CONTRADICTS' ? 1.2 : 0),
    onNodeClick: (n: SimNode) => onSelect(n.id),
    onBackgroundClick: () => onClear(),
    onEngineStop: () => {
      if (!fittedRef.current) {
        fittedRef.current = true
        // Frame the LINKED mesh — the outer dust shell must not zoom us out.
        fgRef.current?.zoomToFit(reducedMotion ? 0 : 600, 40, (n: SimNode) =>
          graphData.linkedIds.has(n.id),
        )
      }
    },
    extraRenderers,
    nodeThreeObject: (n: SimNode) => {
      const central = centralById.get(n.id)
      if (central) {
        const color = CENTRAL_COLORS[central.kind]
        // Callout extends radially OUTWARD from the mesh centre (the node's
        // pinned ring position is that direction), so boxes flee the crowd
        // instead of leaning into it. Fallback directions cover the
        // single-central case where the node sits at the origin.
        const pinned = new THREE.Vector3(n.fx ?? 0, n.fy ?? 0, n.fz ?? 0)
        const calloutOffset =
          pinned.lengthSq() > 1
            ? pinned.normalize().multiplyScalar(24)
            : CALLOUT_DIRECTIONS[central.index % CALLOUT_DIRECTIONS.length]
        const group = new THREE.Group()

        // Core: an emissive sphere in the semantic colour.
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(4.2, 24, 24),
          new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.65 }),
        )
        group.add(core)

        // Pulsing halo shell (animated by the rAF loop above).
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(5.2, 20, 20),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }),
        )
        group.add(halo)
        halosRef.current.set(n.id, { halo, phase: pulsePhase(n.id) })

        // Lead line out to the info box.
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          calloutOffset,
        ])
        group.add(
          new THREE.Line(
            lineGeometry,
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }),
          ),
        )

        // Info box: names the central node; click selects it. Built with
        // textContent only — node titles originate in scanned feed content,
        // so no markup path (innerHTML) is allowed here.
        const box = document.createElement('div')
        box.className = 'cursor-pointer border bg-abyss/90 px-2 py-1 backdrop-blur-sm max-w-52'
        box.style.borderColor = color
        box.style.pointerEvents = 'auto'
        const kindEl = document.createElement('p')
        kindEl.className = 'font-display text-[8px] font-semibold uppercase tracking-[0.2em]'
        kindEl.style.color = color
        kindEl.textContent = `${central.kind === 'RISK' ? 'High risk' : 'High opportunity'} · ${Math.round(central.score * 100)}%`
        const titleEl = document.createElement('p')
        titleEl.className = 'mt-0.5 truncate text-[10px] leading-tight text-ink'
        titleEl.textContent = central.title
        box.append(kindEl, titleEl)
        box.addEventListener('click', (e) => {
          e.stopPropagation()
          onSelect(n.id)
        })
        const label = new CSS2DObject(box)
        label.position.copy(calloutOffset)
        group.add(label)

        return group
      }

      // Sub-node: evidence-chain sphere — class colour faded toward slate as
      // freshness decays, shrinking slightly with shell depth.
      const depth = depths.get(n.id) ?? 1
      const radius = Math.max(1, 2.4 - depth * 0.28) + Math.sqrt(n.val) * 0.35
      const color = new THREE.Color(brainColor(n.group)).lerp(
        STALE_COLOR,
        (1 - Math.max(0, Math.min(1, n.freshnessScore))) * 0.6,
      )
      return new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 12),
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }),
      )
    },
    // The mesh settles quickly at this scale — a shorter cooldown means the
    // definitive camera fit (onEngineStop) lands sooner and CPU quiets down.
    cooldownTime: 8000,
    // Reduced motion: settle the layout synchronously, then hold still.
    warmupTicks: reducedMotion ? 90 : undefined,
    cooldownTicks: reducedMotion ? 0 : undefined,
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph3D ref={fgRef} {...props} />
    </div>
  )
}
