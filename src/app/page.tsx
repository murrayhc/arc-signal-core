import Link from 'next/link'
import { getDashboardData } from '@/server/services/dashboard'
import { getLiveGraph } from '@/server/services/graph'
import { listWatchMarkets } from '@/server/watch/service'
import { EventCard } from '@/components/EventCard'
import { OpportunityCard } from '@/components/OpportunityCard'
import { InboxList } from '@/components/InboxList'
import { RunScanButton } from '@/components/RunScanButton'
import { SearchBar } from '@/components/SearchBar'
import { FixtureBadge } from '@/components/badges'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [data, liveGraph, watchMarkets] = await Promise.all([
    getDashboardData(),
    getLiveGraph(),
    listWatchMarkets(),
  ])
  const hasEvents = data.inbox.length > 0
  // "Open graph replay" jumps straight to the most recently updated event's replay panel — the
  // most useful default target when there's no single event already selected on the dashboard.
  const replayTarget = data.inbox[0] ? `/events/${data.inbox[0].eventId}#graph-replay` : '/graph'

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Archlight — Live Intelligence Dashboard</h1>
          {data.lastScan ? (
            <p className="mt-1 text-sm text-slate-400">
              Last scan {new Date(data.lastScan.startedAt).toLocaleString('en-GB')} ·{' '}
              {data.lastScan.status.replace(/_/g, ' ')} · {data.lastScan.documentsFetched} documents ·{' '}
              {data.lastScan.eventCandidatesCreated} new events
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-400">No scans yet.</p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/lenses"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500"
          >
            Create revenue lens
          </Link>
          <Link
            href="/watch"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500"
          >
            Create watch market
          </Link>
          <Link
            href={replayTarget}
            className="rounded-md border border-sky-700/60 bg-sky-950/40 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-900/40"
          >
            Open graph replay
          </Link>
          <RunScanButton />
        </div>
      </header>

      {data.lastScan && data.lastScan.errors.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-600/50 bg-amber-950/40 p-3 text-xs text-amber-300">
          <p className="font-semibold">Last scan recorded {data.lastScan.errors.length} issue(s):</p>
          <ul className="mt-1 list-inside list-disc">
            {data.lastScan.errors.slice(0, 5).map((e, i) => (
              <li key={i}>[{e.stage}] {e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {data.lastScan && data.lastScan.warnings.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {data.lastScan.warnings.length} expected skip(s):{' '}
          {data.lastScan.warnings.slice(0, 3).map((w) => w.message).join(' · ')}
        </p>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'New events', value: data.counts.newEvents },
          { label: 'Rising', value: data.counts.rising },
          { label: 'High confidence', value: data.counts.highConfidence },
          { label: 'Watch items', value: data.counts.watch },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center">
        <div className="sm:flex-1">
          <SearchBar />
        </div>
        <Link
          href="/graph"
          className="flex shrink-0 items-center gap-2 rounded-md border border-sky-700/60 bg-sky-950/40 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-900/40"
        >
          Open the living graph →
          <span className="text-slate-400">
            {liveGraph.graphStats.nodeCount} nodes · {liveGraph.graphStats.edgeCount} edges
          </span>
        </Link>
      </section>

      {!hasEvents ? (
        <section className="mt-10 rounded-lg border border-dashed border-slate-700 p-10 text-center">
          <h2 className="text-lg font-semibold">No scan data yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            The radar has not detected any events because no scan has produced data. Click{' '}
            <span className="font-semibold text-slate-200">Run scan</span> to collect from the
            configured sources and detect emerging risk and opportunity events.
          </p>
        </section>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="text-lg font-semibold text-rose-300">Live Risk Radar</h2>
            {data.riskRadar.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No risk events detected.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.riskRadar.map((card) => <EventCard key={card.eventId} card={card} />)}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-emerald-300">Opportunity Signals</h2>
            {data.opportunitySignals.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No opportunity events detected.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.opportunitySignals.map((card) => <EventCard key={card.eventId} card={card} />)}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold text-emerald-300">Opportunity Radar</h2>
            {data.opportunityRadar.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No commercial opportunities detected.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.opportunityRadar.map((card) => <OpportunityCard key={card.id} card={card} />)}
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-lg font-semibold">Emerging Event Inbox</h2>
            <div className="mt-3">
              <InboxList items={data.inbox} />
            </div>
          </section>
        </>
      )}

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Watch Markets</h2>
          <Link href="/watch" className="text-xs text-slate-400 underline hover:text-slate-200">
            Manage watch markets →
          </Link>
        </div>
        {watchMarkets.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No watch markets yet. Create one to track a sector, region or theme ahead of a
            fully-formed opportunity.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {watchMarkets.map((m) => (
              <Link
                key={m.id}
                href="/watch"
                className="flex items-center gap-2 rounded-md border border-amber-800/60 bg-amber-950/20 px-3 py-1.5 text-xs text-amber-200 hover:border-amber-600"
              >
                {m.name}
                {!m.active && <span className="text-amber-500">(inactive)</span>}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Source Coverage</h2>
          <div className="flex items-center gap-3">
            <Link href="/scans" className="text-xs text-slate-400 underline hover:text-slate-200">
              Scan history
            </Link>
            <Link href="/admin/sources" className="text-xs text-slate-400 underline hover:text-slate-200">
              Source admin
            </Link>
            <Link href="/graph" className="text-xs text-slate-400 underline hover:text-slate-200">
              Graph stats
            </Link>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  s.healthStatus === 'HEALTHY'
                    ? 'bg-emerald-500'
                    : s.healthStatus === 'DEGRADED'
                      ? 'bg-amber-500'
                      : s.healthStatus === 'FAILING'
                        ? 'bg-rose-500'
                        : s.healthStatus === 'UNSUPPORTED'
                          ? 'bg-slate-600'
                          : 'bg-slate-700'
                }`}
              />
              <span className="text-slate-300">{s.name}</span>
              {s.isFixture && <FixtureBadge />}
              {s.collectorStatus !== 'FUNCTIONAL' && (
                <span className="text-slate-500">unsupported</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
