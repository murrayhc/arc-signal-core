import { getEventReplay } from '@/server/graph/timeline'
import { MOMENTUM_WINDOW_DAYS } from '@/server/graph/momentum'
import { pct } from './badges'

const EVENT_TYPE_STYLES: Record<string, string> = {
  FIRST_DETECTED: 'border-sky-500/60 text-sky-400',
  NEW_SOURCE: 'border-emerald-500/60 text-emerald-400',
  CLAIM_REPEATED: 'border-emerald-500/60 text-emerald-400',
  SIGNAL_STRENGTHENED: 'border-emerald-500/60 text-emerald-400',
  CONFIDENCE_ROSE: 'border-emerald-500/60 text-emerald-400',
  OPPORTUNITY_GENERATED: 'border-emerald-500/60 text-emerald-400',
  EVENT_ESCALATED: 'border-rose-500/60 text-rose-400',
  CONTRADICTION_DETECTED: 'border-amber-500/60 text-amber-400',
  CONFIDENCE_FELL: 'border-amber-500/60 text-amber-400',
  EVENT_COOLED: 'border-slate-500/60 text-slate-400',
}

function momentumLabel(momentum: number): { label: string; style: string } {
  if (momentum > 0.6) return { label: 'Rising', style: 'text-emerald-300' }
  if (momentum < 0.4) return { label: 'Cooling', style: 'text-rose-300' }
  return { label: 'Neutral', style: 'text-slate-300' }
}

/**
 * The graph-event replay for one EventCandidate: ordered timeline, momentum/confidence-decay
 * scores, and any captured snapshots. Server component — reads `getEventReplay` directly, no
 * client fetch, so there is no `typeof window` branching and nothing to hydrate.
 */
export async function ReplayPanel({ eventCandidateId }: { eventCandidateId: string }) {
  const replay = await getEventReplay(eventCandidateId)

  if (!replay) {
    return (
      <p className="text-sm text-slate-500">
        No graph timeline recorded for this event yet — it may not have been graph-synced by a
        scan, or no state changes have been detected since it was first found.
      </p>
    )
  }

  const momentum = momentumLabel(replay.momentum)

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 text-center sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className={`font-mono text-lg font-bold ${momentum.style}`}>{pct(replay.momentum)}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            Momentum · {momentum.label}
          </p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className="font-mono text-lg font-bold text-slate-200">{pct(replay.confidenceDecay)}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Confidence decay</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className="font-mono text-lg font-bold text-slate-200">{pct(replay.freshness)}</p>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Freshness</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Momentum weighs each timeline event by recency over a {MOMENTUM_WINDOW_DAYS}-day window,
        centred on 0.5 (neutral). Confidence decay is 1 − freshness.
      </p>

      <ol className="mt-4 space-y-2 border-l border-slate-800 pl-4">
        {replay.timeline.map((event) => (
          <li key={event.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-600" />
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  EVENT_TYPE_STYLES[event.eventType] ?? 'border-slate-500/60 text-slate-400'
                }`}
              >
                {event.eventType.replace(/_/g, ' ')}
              </span>
              <span className="text-[11px] text-slate-500">
                {new Date(event.occurredAt).toLocaleString('en-GB')}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-slate-300">{event.description}</p>
          </li>
        ))}
      </ol>

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Captured snapshots ({replay.snapshots.length})
        </h3>
        {replay.snapshots.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">
            No snapshots captured yet — snapshots are taken on first detection and escalation.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {replay.snapshots.map((snapshot) => {
              const nodeCount = (JSON.parse(snapshot.nodesJson) as unknown[]).length
              const edgeCount = (JSON.parse(snapshot.edgesJson) as unknown[]).length
              return (
                <li
                  key={snapshot.id}
                  className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs"
                >
                  <span className="font-medium text-slate-300">{snapshot.snapshotType.replace(/_/g, ' ')}</span>
                  <span className="text-slate-500">
                    {nodeCount} nodes · {edgeCount} edges ·{' '}
                    {new Date(snapshot.createdAt).toLocaleString('en-GB')}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
