'use client'

import Link from 'next/link'
import type { GraphEdgeData, RenderNode } from '@/server/services/graph'
import { BrainGraph, brainColor } from './BrainGraph'
import { CornerBrackets, Eyebrow, pct } from './chrome'
import { useSelection } from './SelectionProvider'

const LEGEND_ORDER = [
  'EVENT',
  'SIGNAL',
  'CLAIM',
  'DOCUMENT',
  'SOURCE',
  'SECTOR',
  'REGION',
  'OPPORTUNITY',
  'POSITIONING',
  'COMMODITY',
  'INSTRUMENT',
  'DATA_GAP',
  'CONTRADICTION',
]

/**
 * The central product surface: the living intelligence graph, framed as an
 * instrument. The radar sweep rotates behind a transparent canvas; every
 * counter beside it is a real figure from the last scan or the graph itself.
 */
export function IntelligenceBrain({
  nodes,
  edges,
  byType,
  signalsLastScan,
  meanConfidence,
  lastScanAt,
}: {
  nodes: RenderNode[]
  edges: GraphEdgeData[]
  byType: Record<string, number>
  signalsLastScan: number | null
  meanConfidence: number | null
  lastScanAt: string | null
}) {
  const { select, clear } = useSelection()
  const empty = nodes.length === 0
  const legendGroups = LEGEND_ORDER.filter((g) => (byType[g] ?? 0) > 0)

  return (
    <div className="relative flex h-full min-h-[26rem] flex-col overflow-hidden border border-line bg-abyss/40">
      <CornerBrackets />

      {/* Instrument header */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-line/70 px-3 py-2">
        <Eyebrow accent="text-signal" live={!empty}>
          Archlight Intelligence Brain
        </Eyebrow>
        <div className="flex items-center gap-4 font-data text-[10px] text-ink-faint">
          <span>
            <span className="text-ink-dim">{nodes.length}</span> nodes
          </span>
          <span>
            <span className="text-ink-dim">{edges.length}</span> edges
          </span>
          {signalsLastScan !== null && (
            <span>
              <span className="text-ink-dim">{signalsLastScan}</span> signals / scan
            </span>
          )}
          <span>
            system confidence <span className="text-ink-dim">{meanConfidence === null ? '—' : pct(meanConfidence)}</span>
          </span>
          <span className={lastScanAt ? 'text-teal' : 'text-ink-faint'}>
            {lastScanAt ? 'LIVE' : 'IDLE'}
          </span>
        </div>
      </div>

      {/* Sweep behind, canvas above */}
      <div className="relative min-h-0 flex-1">
        <div aria-hidden className="cc-sweep absolute -inset-[35%] z-0" />
        <div
          aria-hidden
          className="absolute inset-0 z-0"
          style={{
            background:
              'radial-gradient(ellipse 55% 55% at 50% 50%, rgba(85,169,255,0.05), transparent 75%)',
          }}
        />
        {empty ? (
          <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-ink-dim">
              No intelligence yet
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-ink-faint">
              Run your first intelligence scan. Archlight will collect from the configured public
              sources, extract claims and signals, and project detected events into this living map.
            </p>
          </div>
        ) : (
          <div className="relative z-10 h-full">
            <BrainGraph nodes={nodes} edges={edges} onSelect={select} onClear={clear} />
          </div>
        )}
        <p className="sr-only">
          Interactive intelligence graph. Select a node to open its detail panel; full keyboard
          access to the same intelligence is available in the panels on this page and on the Living
          Map page.
        </p>
      </div>

      {/* Legend — only classes actually present in the projection */}
      {legendGroups.length > 0 && (
        <div className="relative z-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/70 px-3 py-1.5">
          {legendGroups.map((group) => (
            <span key={group} className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-ink-faint">
              <span
                aria-hidden
                className={group === 'CONTRADICTION' || group === 'DATA_GAP' ? '' : 'rounded-full'}
                style={{
                  width: 6,
                  height: 6,
                  backgroundColor: brainColor(group),
                  outline:
                    group === 'CONTRADICTION' || group === 'DATA_GAP'
                      ? `1px solid ${brainColor(group)}`
                      : undefined,
                  outlineOffset: 1,
                }}
              />
              {group.replace(/_/g, ' ')}
              <span className="font-data text-ink-faint/70">{byType[group]}</span>
            </span>
          ))}
          <Link
            href="/graph"
            className="ml-auto text-[10px] text-signal transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
          >
            Open full living map →
          </Link>
        </div>
      )}
    </div>
  )
}
