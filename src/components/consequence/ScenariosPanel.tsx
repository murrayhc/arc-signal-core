import type { EventDeepReport } from '@/server/services/consequence'

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      <p className="mt-1 text-slate-300">{body}</p>
    </div>
  )
}

export function ScenariosPanel({
  context,
  scenarios,
}: {
  context: EventDeepReport['context']
  scenarios: EventDeepReport['scenarios']
}) {
  return (
    <div className="space-y-4 text-sm">
      {context ? (
        <>
          <Block title="Historic context" body={context.historicContext} />
          <Block title="Present context" body={context.presentContext} />
          <Block title="Future context" body={context.futureContext} />
        </>
      ) : (
        <p className="text-sm text-slate-500">Context has not been synthesised for this event yet.</p>
      )}

      {scenarios.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Future scenario paths</h3>
          <ul className="mt-2 space-y-2">
            {scenarios.map((s, i) => (
              <li key={i} className="rounded-md border border-slate-800 bg-slate-900 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200">{s.title}</span>
                  <span className="text-xs text-slate-500">{Math.round(s.confidence * 100)}%</span>
                </div>
                <p className="mt-1 text-slate-300">{s.summary}</p>
                {s.confirmingSignals.length > 0 && (
                  <p className="mt-1 text-xs text-emerald-400/80">Confirms if: {s.confirmingSignals.join(' · ')}</p>
                )}
                {s.weakeningSignals.length > 0 && (
                  <p className="mt-0.5 text-xs text-rose-400/80">Weakens if: {s.weakeningSignals.join(' · ')}</p>
                )}
                {(s.likelyBeneficiaries.length > 0 || s.likelyHarmedParties.length > 0) && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    {s.likelyBeneficiaries.length > 0 && <>Benefits: {s.likelyBeneficiaries.join(', ')}. </>}
                    {s.likelyHarmedParties.length > 0 && <>Exposed: {s.likelyHarmedParties.join(', ')}.</>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
