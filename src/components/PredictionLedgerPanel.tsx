import type { EventPrediction } from '@/server/services/outcome'

const pct = (n: number) => `${Math.round(n * 100)}%`
const day = (iso: string) => iso.slice(0, 10)

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'text-amber-300 border-amber-800',
  PENDING_REVIEW: 'text-amber-300 border-amber-800',
  RESOLVED: 'text-slate-300 border-slate-700',
}
const OUTCOME_STYLES: Record<string, string> = {
  HAPPENED: 'text-teal-300 border-teal-800',
  DID_NOT_HAPPEN: 'text-rose-300 border-rose-800',
  UNRESOLVABLE: 'text-slate-400 border-slate-700',
}

/** The event's frozen prediction receipts: what was predicted, at what
 *  probability, by when — and how each settled. Server-rendered, read-only. */
export function PredictionLedgerPanel({ predictions }: { predictions: EventPrediction[] }) {
  if (predictions.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No prediction receipts yet — they freeze on the first scan after the event forms.
      </p>
    )
  }
  return (
    <ul className="space-y-3">
      {predictions.map((p) => {
        const badge =
          p.status === 'RESOLVED'
            ? { text: (p.outcome ?? '').replace(/_/g, ' ').toLowerCase(), style: OUTCOME_STYLES[p.outcome ?? ''] ?? '' }
            : { text: p.status === 'PENDING_REVIEW' ? 'awaiting verdict' : 'open', style: STATUS_STYLES[p.status] ?? '' }
        return (
          <li key={p.id} className="rounded border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
              <span className={`rounded border px-1.5 py-0.5 ${badge.style}`}>{badge.text}</span>
              <span>{p.subjectKind === 'SCENARIO' ? `scenario · ${p.scenarioType?.replace(/_/g, ' ').toLowerCase()}` : 'event'}</span>
              <span>deadline {day(p.deadline)}</span>
              {p.leadTimeDays != null && <span className="text-teal-400">lead {p.leadTimeDays.toFixed(1)}d</span>}
            </div>
            <p className="mt-1 text-sm text-slate-200">{p.predictionText}</p>
            <p className="mt-1 text-xs text-slate-400">
              Frozen at {pct(p.predictedProbability)}
              {p.finalProbability !== p.predictedProbability ? ` → now ${pct(p.finalProbability)}` : ''}
              {p.observedPath ? ` · observed path: ${p.observedPath.toLowerCase()}` : ''}
            </p>
            {p.resolutionRationale && <p className="mt-1 text-xs leading-relaxed text-slate-400">{p.resolutionRationale}</p>}
          </li>
        )
      })}
    </ul>
  )
}
