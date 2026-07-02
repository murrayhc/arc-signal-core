import Link from 'next/link'
import { getDashboardData } from '@/server/services/dashboard'
import { EventCard } from '@/components/EventCard'
import { InboxList } from '@/components/InboxList'
import { RunScanButton } from '@/components/RunScanButton'
import { FixtureBadge } from '@/components/badges'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const data = await getDashboardData()
  const hasEvents = data.inbox.length > 0

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
        <RunScanButton />
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
            <h2 className="text-lg font-semibold text-emerald-300">Opportunity Radar</h2>
            {data.opportunityRadar.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No opportunity events detected.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {data.opportunityRadar.map((card) => <EventCard key={card.eventId} card={card} />)}
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
          <h2 className="text-lg font-semibold">Source Coverage</h2>
          <Link href="/admin/sources" className="text-xs text-slate-400 underline hover:text-slate-200">
            Source admin
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.sources.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs">
              <span
                className={`h-2 w-2 rounded-full ${
                  s.collectorStatus !== 'FUNCTIONAL'
                    ? 'bg-slate-600'
                    : s.lastRunStatus === 'SUCCESS'
                      ? 'bg-emerald-500'
                      : s.lastRunStatus === 'FAILED'
                        ? 'bg-rose-500'
                        : 'bg-amber-500'
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
