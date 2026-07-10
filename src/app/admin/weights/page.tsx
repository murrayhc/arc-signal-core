import Link from 'next/link'
import { prisma } from '@/server/db'
import { DEFAULT_WEIGHTS, getActiveWeights, clearWeightsCache } from '@/server/evidence/weights'
import { WeightSuggestionActions } from '@/components/WeightSuggestionActions'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  SUGGESTED: 'text-amber-300',
  APPLIED: 'text-teal-300',
  DISMISSED: 'text-slate-500',
}

export default async function WeightsAdminPage() {
  clearWeightsCache() // admin page always shows the live DB truth
  const [active, suggestions] = await Promise.all([
    getActiveWeights(),
    prisma.reliabilityWeightSuggestion.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
  ])
  const usingDefaults = JSON.stringify(active) === JSON.stringify(DEFAULT_WEIGHTS)
  const keys = Object.keys(DEFAULT_WEIGHTS) as (keyof typeof DEFAULT_WEIGHTS)[]

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">
        ← Dashboard
      </Link>
      <h1 className="mt-3 text-xl font-bold">Reliability Weights (owner-gated)</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Once enough predictions have resolved, each scan backtests whether different reliability weights were more
        predictive of realised outcomes and stores a suggestion here. Suggestions never apply themselves. Applying one
        changes how FUTURE scans score evidence; dismissing the applied row restores the defaults exactly.
      </p>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-slate-200">
          Active weights {usingDefaults ? '(defaults)' : '(applied suggestion)'}
        </h2>
        <table className="mt-3 w-full max-w-md border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-4">Dimension</th>
              <th className="py-2 pr-4">Default</th>
              <th className="py-2 pr-4">Active</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-b border-slate-800/60 text-slate-300">
                <td className="py-2 pr-4">{k}</td>
                <td className="py-2 pr-4">{DEFAULT_WEIGHTS[k].toFixed(3)}</td>
                <td className={`py-2 pr-4 ${active[k] !== DEFAULT_WEIGHTS[k] ? 'text-teal-300' : ''}`}>{active[k].toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Suggestions</h2>
        {suggestions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            None yet — suggestions form once 30+ real predictions have resolved and a materially better weighting exists.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {suggestions.map((s) => {
              const current = JSON.parse(s.currentWeightsJson) as Record<string, number>
              const suggested = JSON.parse(s.suggestedWeightsJson) as Record<string, number>
              const rationale = JSON.parse(s.rationaleJson) as string[]
              return (
                <li key={s.id} className="rounded border border-slate-800 bg-slate-900/40 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500">
                      <span className={STATUS_STYLES[s.status] ?? ''}>{s.status.toLowerCase()}</span>
                      <span className="ml-2">based on {s.basedOnResolvedCount} resolved outcome(s)</span>
                      <span className="ml-2">expected Brier improvement {s.expectedBrierImprovement.toFixed(4)}</span>
                    </div>
                    <WeightSuggestionActions suggestionId={s.id} status={s.status} />
                  </div>
                  <table className="mt-2 w-full max-w-md border-collapse text-left text-xs text-slate-400">
                    <tbody>
                      {Object.keys(suggested).map((k) => (
                        <tr key={k}>
                          <td className="py-0.5 pr-4">{k}</td>
                          <td className="py-0.5 pr-4">{(current[k] ?? 0).toFixed(3)}</td>
                          <td className={`py-0.5 pr-4 ${suggested[k] !== current[k] ? 'text-teal-300' : ''}`}>
                            → {(suggested[k] ?? 0).toFixed(3)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rationale.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed text-slate-400">
                      {rationale.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
