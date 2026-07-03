import Link from 'next/link'
import type { InterrogationResult } from '@/server/interrogate/service'
import { QueryTypeChip, ClassBadge, pct } from '@/components/badges'
import { MiniSubgraph } from '@/components/MiniSubgraph'

/**
 * Renders one `interrogate(q)` result: the resolved query type + match count,
 * a small paused mini force-graph of the returned subgraph, and readable
 * panels for events/opportunities/contradictions/sources/positioning. When
 * `marketContextAvailable` is false (market-shaped query — TICKER, SHARE_PRICE,
 * INSTRUMENT, COMMODITY), shows a notice card plus the service's disclaimer
 * ahead of whatever graph evidence still exists. Every panel has an honest
 * empty state — nothing is invented when a list is empty.
 */
export function InterrogationResults({ result }: { result: InterrogationResult }) {
  const {
    query,
    queryType,
    matchedNodeCount,
    events,
    opportunities,
    contradictions,
    sources,
    positioning,
    subgraph,
    marketContextAvailable,
    disclaimer,
  } = result

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-slate-100">
          Results for &ldquo;{query}&rdquo;
        </h2>
        <QueryTypeChip queryType={queryType} />
        <span className="text-xs text-slate-500">
          {matchedNodeCount} matched node{matchedNodeCount === 1 ? '' : 's'}
        </span>
      </div>

      {!marketContextAvailable && (
        <div className="mt-4 rounded-md border border-amber-600/50 bg-amber-950/40 p-3 text-xs text-amber-300">
          <p className="font-semibold">
            Live market data is not configured. This view shows public-signal context only.
          </p>
          {disclaimer && <p className="mt-1 text-amber-400/90">{disclaimer}</p>}
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs text-slate-500">
          Subgraph preview — paused for a lightweight view. Visit{' '}
          <Link href="/graph" className="underline hover:text-slate-300">
            the living graph
          </Link>{' '}
          for the full interactive explorer.
        </p>
        <div className="mt-2 h-72">
          <MiniSubgraph nodes={subgraph.nodes} edges={subgraph.edges} />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Events ({events.length})
          </h3>
          {events.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">No matching events found.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {events.map((event) => (
                <li key={event.id} className="rounded border border-slate-800 bg-slate-950 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/events/${event.id}`}
                      className="font-medium text-slate-200 underline hover:text-slate-100"
                    >
                      {event.title}
                    </Link>
                    <ClassBadge eventClass={event.eventClass} />
                  </div>
                  <p className="mt-1 text-slate-500">
                    {event.sector ?? 'cross-sector'}
                    {event.region ? ` · ${event.region}` : ''} · confidence {pct(event.confidence)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Opportunities ({opportunities.length})
          </h3>
          {opportunities.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">No matching opportunities found.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {opportunities.map((opp) => (
                <li key={opp.id} className="rounded border border-slate-800 bg-slate-950 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/opportunities/${opp.id}`}
                      className="font-medium text-slate-200 underline hover:text-slate-100"
                    >
                      {opp.title}
                    </Link>
                    <span className="rounded border border-emerald-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      {opp.opportunityType.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-500">value {pct(opp.commercialValueScore)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Contradictions ({contradictions.length})
          </h3>
          {contradictions.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">No contradictions found.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {contradictions.map((c, i) => (
                <li key={i} className="rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
                  <span className="text-rose-400">{c.aTitle}</span> vs.{' '}
                  <span className="text-rose-400">{c.bTitle}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Sources ({sources.length})
          </h3>
          {sources.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">No sources reachable from this query.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {sources.map((s) => (
                <li key={s.id} className="rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 lg:col-span-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Positioning ({positioning.length})
          </h3>
          {positioning.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">No positioning examples found.</p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {positioning.map((p) => (
                <li key={p.id} className="rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-300">
                  <span className="text-slate-500">{p.userType.replace(/_/g, ' ')}: </span>
                  {p.title}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
