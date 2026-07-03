'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ForceGraph } from '@/components/ForceGraph'
import { NodeTypeChip, FixtureBadge, pct } from '@/components/badges'
import type { GraphEdgeData, GraphNodeData, RenderNode } from '@/server/services/graph'

const NODE_TYPE_OPTIONS = [
  'EVENT',
  'SECTOR',
  'REGION',
  'SIGNAL',
  'CLAIM',
  'DOCUMENT',
  'SOURCE',
  'OPPORTUNITY',
  'POSITIONING',
  'DATA_GAP',
]

export type GraphExplorerProps = {
  initialNodes: RenderNode[]
  initialEdges: GraphEdgeData[]
  latestEvents: { id: string; title: string; eventClass: string }[]
  latestOpportunities: { id: string; title: string }[]
  latestContradictions: { id: string; title: string }[]
}

type Filters = {
  nodeTypes: string[]
  sector: string
  region: string
  minConfidence: number
  riskOnly: boolean
  opportunityOnly: boolean
}

const DEFAULT_FILTERS: Filters = {
  nodeTypes: [],
  sector: '',
  region: '',
  minConfidence: 0,
  riskOnly: false,
  opportunityOnly: false,
}

type NodeDetail = {
  node: GraphNodeData
  neighbours: GraphNodeData[]
  edges: GraphEdgeData[]
}

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams()
  if (filters.nodeTypes.length > 0) params.set('nodeTypes', filters.nodeTypes.join(','))
  if (filters.sector.trim()) params.set('sector', filters.sector.trim())
  if (filters.region.trim()) params.set('region', filters.region.trim())
  if (filters.minConfidence > 0) params.set('minConfidence', String(filters.minConfidence))
  if (filters.riskOnly) params.set('riskOnly', 'true')
  if (filters.opportunityOnly) params.set('opportunityOnly', 'true')
  return params.toString()
}

export function GraphExplorer({
  initialNodes,
  initialEdges,
  latestEvents,
  latestOpportunities,
  latestContradictions,
}: GraphExplorerProps) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [nodes, setNodes] = useState<RenderNode[]>(initialNodes)
  const [edges, setEdges] = useState<GraphEdgeData[]>(initialEdges)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'3d' | '2d'>('3d')
  const [paused, setPaused] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    const query = buildQuery(filters)
    let cancelled = false
    setLoading(true)
    fetch(`/api/graph/render${query ? `?${query}` : ''}`)
      .then((res) => res.json())
      .then((data: { nodes: RenderNode[]; edges: GraphEdgeData[] }) => {
        if (cancelled) return
        setNodes(data.nodes)
        setEdges(data.edges)
      })
      .catch(() => {
        // Leave the last-known nodes/edges in place on fetch failure.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.nodeTypes.join(','),
    filters.sector,
    filters.region,
    filters.minConfidence,
    filters.riskOnly,
    filters.opportunityOnly,
  ])

  const handleSelect = useCallback((nodeId: string) => {
    setSelectedId(nodeId)
    setDetailError(null)
    setDetailLoading(true)
    fetch(`/api/graph/node/${nodeId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: NodeDetail) => setDetail(data))
      .catch(() => setDetailError('Could not load node detail.'))
      .finally(() => setDetailLoading(false))
  }, [])

  function toggleNodeType(nodeType: string) {
    setFilters((prev) => ({
      ...prev,
      nodeTypes: prev.nodeTypes.includes(nodeType)
        ? prev.nodeTypes.filter((t) => t !== nodeType)
        : [...prev.nodeTypes, nodeType],
    }))
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Interactive — drag to explore; toggle 2D or pause for reduced motion.
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === '3d' ? '2d' : '3d')}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            {mode === '3d' ? 'Switch to 2D' : 'Switch to 3D'}
          </button>
          <button
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[16rem_1fr_18rem]">
        {/* Left filter panel */}
        <aside className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filters</h2>

          <fieldset className="mt-3">
            <legend className="text-xs font-medium text-slate-400">Node types</legend>
            <div className="mt-2 space-y-1">
              {NODE_TYPE_OPTIONS.map((nodeType) => (
                <label key={nodeType} className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={filters.nodeTypes.includes(nodeType)}
                    onChange={() => toggleNodeType(nodeType)}
                    className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800"
                  />
                  {nodeType.replace(/_/g, ' ')}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4">
            <label htmlFor="graph-filter-sector" className="text-xs font-medium text-slate-400">
              Sector
            </label>
            <input
              id="graph-filter-sector"
              type="text"
              value={filters.sector}
              onChange={(e) => setFilters((prev) => ({ ...prev, sector: e.target.value }))}
              placeholder="e.g. energy"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500"
            />
          </div>

          <div className="mt-3">
            <label htmlFor="graph-filter-region" className="text-xs font-medium text-slate-400">
              Region
            </label>
            <input
              id="graph-filter-region"
              type="text"
              value={filters.region}
              onChange={(e) => setFilters((prev) => ({ ...prev, region: e.target.value }))}
              placeholder="e.g. emea"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500"
            />
          </div>

          <div className="mt-3">
            <label htmlFor="graph-filter-confidence" className="text-xs font-medium text-slate-400">
              Min confidence: {pct(filters.minConfidence)}
            </label>
            <input
              id="graph-filter-confidence"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={filters.minConfidence}
              onChange={(e) => setFilters((prev) => ({ ...prev, minConfidence: Number(e.target.value) }))}
              className="mt-1 w-full"
            />
          </div>

          <div className="mt-4 space-y-1">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={filters.riskOnly}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    riskOnly: e.target.checked,
                    opportunityOnly: e.target.checked ? false : prev.opportunityOnly,
                  }))
                }
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800"
              />
              Risk only
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={filters.opportunityOnly}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    opportunityOnly: e.target.checked,
                    riskOnly: e.target.checked ? false : prev.riskOnly,
                  }))
                }
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800"
              />
              Opportunity only
            </label>
          </div>

          {loading && <p className="mt-3 text-xs text-slate-500">Refreshing graph…</p>}
        </aside>

        {/* Centre canvas */}
        <div className="min-h-[24rem]">
          <ForceGraph nodes={nodes} edges={edges} mode={mode} paused={paused} onSelect={handleSelect} />
        </div>

        {/* Right detail panel */}
        <aside className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Node detail</h2>
          {!selectedId && <p className="mt-2 text-xs text-slate-500">Select a node to inspect it.</p>}
          {detailLoading && <p className="mt-2 text-xs text-slate-500">Loading…</p>}
          {detailError && <p className="mt-2 text-xs text-rose-400">{detailError}</p>}
          {detail && !detailLoading && (
            <div className="mt-2 space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <NodeTypeChip nodeType={detail.node.nodeType} />
                  {detail.node.isFixture && <FixtureBadge />}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-200">{detail.node.title}</p>
                {detail.node.summary && (
                  <p className="mt-1 text-xs text-slate-400">{detail.node.summary}</p>
                )}
                {detail.node.nodeType === 'EVENT' && (
                  <Link
                    href={`/events/${detail.node.refId}`}
                    className="mt-1 inline-block text-xs text-sky-400 underline hover:text-sky-300"
                  >
                    View event →
                  </Link>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-slate-800 bg-slate-950 p-2 text-center">
                  <p className="font-mono font-bold text-slate-200">{pct(detail.node.confidence)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Confidence</p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 p-2 text-center">
                  <p className="font-mono font-bold text-slate-200">{pct(detail.node.impactScore)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Impact</p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 p-2 text-center">
                  <p className="font-mono font-bold text-rose-400">{pct(detail.node.riskScore)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Risk</p>
                </div>
                <div className="rounded border border-slate-800 bg-slate-950 p-2 text-center">
                  <p className="font-mono font-bold text-emerald-400">{pct(detail.node.opportunityScore)}</p>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Opportunity</p>
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Incident edges ({detail.edges.length})
                </h3>
                {detail.edges.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500">No incident edges.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {detail.edges.map((edge) => {
                      const otherId =
                        edge.sourceNodeId === selectedId ? edge.targetNodeId : edge.sourceNodeId
                      const other = detail.neighbours.find((n) => n.id === otherId)
                      return (
                        <li key={edge.id} className="rounded border border-slate-800 bg-slate-950 p-2 text-xs">
                          <span className="text-slate-400">{edge.edgeType.replace(/_/g, ' ')}</span>{' '}
                          <span className="text-slate-200">{other?.title ?? otherId}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Bottom strip: latest events / opportunities / contradictions */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Latest events</h3>
          <ul className="mt-2 space-y-1">
            {latestEvents.length === 0 && <li className="text-xs text-slate-500">None yet.</li>}
            {latestEvents.map((event) => (
              <li key={event.id} className="text-xs">
                <Link href={`/events/${event.id}`} className="text-slate-300 underline hover:text-slate-100">
                  {event.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Latest opportunities
          </h3>
          <ul className="mt-2 space-y-1">
            {latestOpportunities.length === 0 && <li className="text-xs text-slate-500">None yet.</li>}
            {latestOpportunities.map((opp) => (
              <li key={opp.id} className="text-xs">
                <Link href={`/opportunities/${opp.id}`} className="text-slate-300 underline hover:text-slate-100">
                  {opp.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Latest contradictions
          </h3>
          <ul className="mt-2 space-y-1">
            {latestContradictions.length === 0 && <li className="text-xs text-slate-500">None yet.</li>}
            {latestContradictions.map((c) => (
              <li key={c.id} className="text-xs text-slate-300">
                {c.title}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Accessible fallback: works without WebGL/canvas support */}
      <details className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500">
          Node list (accessible fallback, {nodes.length} node{nodes.length === 1 ? '' : 's'})
        </summary>
        <ul className="mt-3 space-y-2">
          {nodes.map((node) => (
            <li
              key={node.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950 p-2 text-xs"
            >
              <button
                onClick={() => handleSelect(node.id)}
                className="flex items-center gap-2 text-left hover:underline"
              >
                <NodeTypeChip nodeType={node.nodeType} />
                <span className="text-slate-200">{node.title}</span>
                {node.isFixture && <FixtureBadge />}
              </button>
              <span className="shrink-0 text-slate-500">
                impact {pct(node.impactScore)} · confidence {pct(node.confidence)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
