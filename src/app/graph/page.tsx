import Link from 'next/link'
import { getGraphForRender } from '@/server/services/graph'
import { getOpportunityRadar } from '@/server/services/opportunities'
import { prisma } from '@/server/db'
import { GraphExplorer } from '@/components/GraphExplorer'

export const dynamic = 'force-dynamic'

const BOTTOM_STRIP_COUNT = 5

async function getBottomStripData() {
  const [latestEventRows, opportunityCards, contradictionArcs] = await Promise.all([
    prisma.eventCandidate.findMany({
      orderBy: { lastUpdatedAt: 'desc' },
      take: BOTTOM_STRIP_COUNT,
      select: { id: true, title: true, eventClass: true },
    }),
    getOpportunityRadar(),
    prisma.evidenceArc.findMany({
      where: { chainClass: 'CONTRADICTED' },
      orderBy: { updatedAt: 'desc' },
      take: BOTTOM_STRIP_COUNT,
      select: { id: true, title: true },
    }),
  ])

  return {
    latestEvents: latestEventRows,
    latestOpportunities: opportunityCards.slice(0, BOTTOM_STRIP_COUNT).map((o) => ({ id: o.id, title: o.title })),
    latestContradictions: contradictionArcs,
  }
}

export default async function GraphPage() {
  const [graph, bottomStrip] = await Promise.all([getGraphForRender(), getBottomStripData()])

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Living Intelligence Graph</h1>
          <p className="mt-1 text-sm text-slate-400">
            The projected node/edge graph behind every event, signal, and evidence arc.
          </p>
        </div>
        <form action="/interrogate" method="get" className="flex items-center gap-2">
          <input
            type="text"
            name="q"
            placeholder="Ask the graph…"
            aria-label="Search the graph"
            className="w-56 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600"
          >
            Interrogate
          </button>
        </form>
      </div>

      <GraphExplorer
        initialNodes={graph.nodes}
        initialEdges={graph.edges}
        latestEvents={bottomStrip.latestEvents.map((e) => ({ id: e.id, title: e.title, eventClass: e.eventClass }))}
        latestOpportunities={bottomStrip.latestOpportunities}
        latestContradictions={bottomStrip.latestContradictions}
      />
    </main>
  )
}
