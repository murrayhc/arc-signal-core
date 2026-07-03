import Link from 'next/link'
import { getLiveGraph } from '@/server/services/graph'
import { NodeTypeChip, pct } from '@/components/badges'

export const dynamic = 'force-dynamic'

const TOP_NODE_COUNT = 30

export default async function GraphPage() {
  const data = await getLiveGraph()
  const topNodes = [...data.nodes]
    .sort((a, b) => b.impactScore + b.freshnessScore - (a.impactScore + a.freshnessScore))
    .slice(0, TOP_NODE_COUNT)

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">Living Intelligence Graph</h1>
      <p className="mt-1 text-sm text-slate-400">
        The projected node/edge graph behind every event, signal, and evidence arc.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Interactive 3D view arrives in the next phase.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Nodes', value: String(data.graphStats.nodeCount) },
          { label: 'Edges', value: String(data.graphStats.edgeCount) },
          { label: 'Active events', value: String(data.activeEventCount) },
          { label: 'Risks', value: String(data.riskCount) },
          { label: 'Opportunities', value: String(data.opportunityCount) },
          { label: 'High uncertainty', value: String(data.highUncertaintyCount) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
            <p className="font-mono text-lg font-bold">{stat.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Node types</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(data.graphStats.byType)
            .sort((a, b) => b[1] - a[1])
            .map(([nodeType, count]) => (
              <div
                key={nodeType}
                className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs"
              >
                <NodeTypeChip nodeType={nodeType} />
                <span className="text-slate-300">{count}</span>
              </div>
            ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">
          Top {topNodes.length} nodes by impact + freshness
        </h2>
        {topNodes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No graph nodes yet — run a scan to populate the graph.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {topNodes.map((node) => (
              <li
                key={node.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900 p-3 text-sm"
              >
                <span className="flex items-center gap-2">
                  <NodeTypeChip nodeType={node.nodeType} />
                  <span className="text-slate-200">{node.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                  impact {pct(node.impactScore)} · freshness {pct(node.freshnessScore)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
