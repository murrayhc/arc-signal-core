import type { PlaybookData } from '@/server/services/playbook'

function GeneratedByBadge({ generatedBy }: { generatedBy: string }) {
  const isLlm = generatedBy === 'LLM'
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        isLlm ? 'border-sky-500/60 text-sky-400' : 'border-slate-500/60 text-slate-400'
      }`}
    >
      {isLlm ? 'AI-enriched' : 'Deterministic'}
    </span>
  )
}

/** Playbook section for /opportunities/[id]. `llmConfigured` reflects
 *  /api/llm/status's `configured` flag — when false, shows a note that AI
 *  enrichment is dormant and the playbook is deterministic-only. */
export function PlaybookPanel({
  playbook,
  llmConfigured,
}: {
  playbook: PlaybookData
  llmConfigured: boolean
}) {
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-200">Playbook</h2>
        <div className="flex items-center gap-2">
          <GeneratedByBadge generatedBy={playbook.generatedBy} />
          <a
            href={`/api/opportunities/${playbook.opportunityCardId}/playbook?format=md`}
            className="rounded border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
          >
            Export MD
          </a>
          <a
            href={`/api/opportunities/${playbook.opportunityCardId}/playbook?format=json`}
            className="rounded border border-slate-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400 hover:text-slate-200"
          >
            Export JSON
          </a>
        </div>
      </div>

      {!llmConfigured && (
        <p className="mt-2 rounded border border-amber-900/60 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
          AI enrichment not configured — deterministic playbook.
        </p>
      )}

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Target buyer</h3>
          <p className="mt-1 text-sm text-slate-300">{playbook.targetBuyer}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Offer angle</h3>
          <p className="mt-1 text-sm text-slate-300">{playbook.offerAngle}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-semibold text-slate-200">Pain</h3>
        <p className="mt-1 text-sm text-slate-300">{playbook.painStatement}</p>
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-semibold text-slate-200">Commercial hypothesis</h3>
        <p className="mt-1 text-sm text-slate-300">{playbook.commercialHypothesis}</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Discovery questions</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
            {playbook.discoveryQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Likely objections</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
            {playbook.likelyObjections.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <h3 className="text-sm font-semibold text-slate-200">Proof points</h3>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-300">
            {playbook.proofPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
        <h3 className="text-sm font-semibold text-emerald-300">First action</h3>
        <p className="mt-1 text-sm text-slate-300">{playbook.firstAction}</p>
      </div>
    </section>
  )
}
