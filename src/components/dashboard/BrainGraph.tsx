'use client'

import { useEffect, useMemo, useState } from 'react'
import type { GraphEdgeData, RenderNode } from '@/server/services/graph'
import { buildDepthMap, pickCentralNodes } from './brain-model'
import { BrainGraph2D } from './BrainGraph2D'
import { BrainGraph3D } from './BrainGraph3D'

/**
 * The living-map surface: an interactive 3D node mesh by default, with the
 * canvas renderer as the explicit 2D mode and the automatic fallback when
 * WebGL is unavailable. Both renderers share one semantic model — central
 * high-risk (red) / high-opportunity (green) event cores with pulsing halos
 * and callout info boxes, evidence sub-nodes radiating outward by degree.
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
  const [webglOk, setWebglOk] = useState<boolean | null>(null)
  const [mode, setMode] = useState<'3d' | '2d'>('3d')

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      setWebglOk(Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl')))
    } catch {
      setWebglOk(false)
    }
  }, [])

  const centrals = useMemo(() => pickCentralNodes(nodes), [nodes])
  const depths = useMemo(
    () => buildDepthMap(nodes, edges, centrals.map((c) => c.id)),
    [nodes, edges, centrals],
  )

  if (webglOk === null) {
    return (
      <p className="flex h-full items-center justify-center font-data text-xs text-ink-faint">
        Initialising node mesh…
      </p>
    )
  }

  const effectiveMode = webglOk ? mode : '2d'

  return (
    <div className="relative h-full w-full">
      {effectiveMode === '3d' ? (
        <BrainGraph3D
          nodes={nodes}
          edges={edges}
          centrals={centrals}
          depths={depths}
          onSelect={onSelect}
          onClear={onClear}
        />
      ) : (
        <BrainGraph2D
          nodes={nodes}
          edges={edges}
          centrals={centrals}
          onSelect={onSelect}
          onClear={onClear}
        />
      )}

      {/* Mode toggle — 3D offered only where WebGL exists */}
      <div className="absolute right-2 top-2 z-20 flex border border-line bg-void/80">
        {webglOk && (
          <button
            onClick={() => setMode('3d')}
            aria-pressed={effectiveMode === '3d'}
            className={`px-2 py-0.5 font-display text-[9px] font-semibold uppercase tracking-wider transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${
              effectiveMode === '3d' ? 'bg-signal/20 text-signal' : 'text-ink-faint hover:text-ink'
            }`}
          >
            3D
          </button>
        )}
        <button
          onClick={() => setMode('2d')}
          aria-pressed={effectiveMode === '2d'}
          className={`px-2 py-0.5 font-display text-[9px] font-semibold uppercase tracking-wider transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${
            effectiveMode === '2d' ? 'bg-signal/20 text-signal' : 'text-ink-faint hover:text-ink'
          }`}
        >
          2D
        </button>
      </div>

      {!webglOk && (
        <p className="absolute bottom-2 right-2 z-20 text-[9px] uppercase tracking-wider text-ink-faint">
          WebGL unavailable — 2D mode
        </p>
      )}
    </div>
  )
}
