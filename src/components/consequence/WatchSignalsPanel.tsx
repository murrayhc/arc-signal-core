export type TriggerView = { direction: string; conditionText: string; probabilityImpact: number }

export function WatchSignalsPanel({
  watchSignals,
  triggers,
}: {
  watchSignals: string[]
  triggers: TriggerView[]
}) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Watch signals</h3>
        {watchSignals.length ? (
          <ul className="mt-1 list-inside list-disc text-slate-300">
            {watchSignals.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-slate-500">No watch signals derived yet.</p>
        )}
      </div>

      {triggers.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Trigger conditions</h3>
          <ul className="mt-1 space-y-1">
            {triggers.map((t, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`font-mono text-xs ${t.direction === 'RAISES' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {t.direction === 'RAISES' ? '▲' : '▼'} {t.probabilityImpact > 0 ? '+' : ''}
                  {t.probabilityImpact}
                </span>
                <span className="text-slate-300">{t.conditionText}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
