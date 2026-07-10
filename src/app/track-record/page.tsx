import Link from 'next/link'
import { getTrackRecord } from '@/server/services/outcome'

export const dynamic = 'force-dynamic'

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`)
const num = (n: number | null, dp = 3) => (n == null ? '—' : n.toFixed(dp))
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')

const OUTCOME_STYLES: Record<string, string> = {
  HAPPENED: 'text-teal-300 border-teal-800',
  DID_NOT_HAPPEN: 'text-rose-300 border-rose-800',
  UNRESOLVABLE: 'text-slate-400 border-slate-700',
}

export default async function TrackRecordPage() {
  const { record, recent, snapshots } = await getTrackRecord()
  const graded = record.counts.resolved - record.counts.unresolvable

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">
        ← Dashboard
      </Link>
      <h1 className="mt-3 text-xl font-bold">Verified Track Record</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Every prediction is frozen the moment it is made — probability, deadline, evidence — and graded against what
        actually happened. Nothing here is estimated after the fact: each verdict traces to the evidence that settled it.
      </p>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Resolved" value={String(record.counts.resolved)} sub={`${record.counts.open} open · ${record.counts.pendingReview} in review`} />
        <Stat label="Happened" value={pct(record.baseRate)} sub={`${record.counts.happened} of ${graded} graded`} />
        <Stat
          label="Accuracy (Brier)"
          value={num(record.meanBrierFirst)}
          sub={`coin-flip ${record.coinFlipBrier.toFixed(2)} — lower is better`}
        />
        <Stat label="Mean lead time" value={record.leadTime.meanDays == null ? '—' : `${record.leadTime.meanDays.toFixed(1)}d`} sub={`over ${record.leadTime.n} event(s)`} />
        <Stat label="Before mainstream" value={String(record.leadTime.beforeMainstreamCount)} sub="never covered by press" />
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Calibration</h2>
        <p className="mt-1 text-xs text-slate-500">Of everything predicted at a stated probability, how much actually happened.</p>
        {graded === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No resolved predictions yet — the ledger settles as deadlines arrive.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Stated</th>
                <th className="py-2 pr-4">Predictions</th>
                <th className="py-2 pr-4">Mean stated</th>
                <th className="py-2 pr-4">Observed</th>
              </tr>
            </thead>
            <tbody>
              {record.calibration
                .filter((b) => b.n > 0)
                .map((b) => (
                  <tr key={b.lo} className="border-b border-slate-800/60 text-slate-300">
                    <td className="py-2 pr-4">
                      {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%
                    </td>
                    <td className="py-2 pr-4">{b.n}</td>
                    <td className="py-2 pr-4">{pct(b.meanPredicted)}</td>
                    <td className="py-2 pr-4">{pct(b.observedRate)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Recent resolutions</h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing resolved yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {recent.map((r) => (
              <li key={r.id} className="rounded border border-slate-800 bg-slate-900/40 p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
                  <span className={`rounded border px-1.5 py-0.5 ${OUTCOME_STYLES[r.outcome ?? ''] ?? 'text-slate-400 border-slate-700'}`}>
                    {(r.outcome ?? 'OPEN').replace(/_/g, ' ').toLowerCase()}
                  </span>
                  <span>{r.subjectKind === 'SCENARIO' ? `scenario · ${r.scenarioType?.replace(/_/g, ' ').toLowerCase()}` : 'event'}</span>
                  <span>{day(r.resolvedAt)}</span>
                  {r.leadTimeDays != null && <span className="text-teal-400">lead {r.leadTimeDays.toFixed(1)}d</span>}
                  {r.brierFirst != null && <span>brier {r.brierFirst.toFixed(3)}</span>}
                </div>
                <p className="mt-1 text-sm text-slate-200">{r.predictionText}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Predicted {pct(r.predictedProbability)} → final {pct(r.finalProbability)}. {r.resolutionRationale}
                </p>
                <a href={`/events/${r.eventCandidateId}`} className="mt-1 inline-block text-[11px] text-teal-400 underline hover:text-teal-300">
                  View event →
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Record over time</h2>
        {snapshots.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Snapshots are written at the end of every scan.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Scan date</th>
                <th className="py-2 pr-4">Resolved</th>
                <th className="py-2 pr-4">Mean Brier</th>
                <th className="py-2 pr-4">Mean lead</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.createdAt} className="border-b border-slate-800/60 text-slate-300">
                  <td className="py-2 pr-4">{day(s.createdAt)}</td>
                  <td className="py-2 pr-4">{s.resolvedCount}</td>
                  <td className="py-2 pr-4">{num(s.meanBrierFirst)}</td>
                  <td className="py-2 pr-4">{s.meanLeadTimeDays == null ? '—' : `${s.meanLeadTimeDays.toFixed(1)}d`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  )
}
