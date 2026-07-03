import Link from 'next/link'
import { getLLMAudit } from '@/server/services/playbook'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  SUCCEEDED: 'text-emerald-400',
  REJECTED_VALIDATION: 'text-amber-400',
  FAILED: 'text-rose-400',
  SKIPPED_NO_PROVIDER: 'text-slate-500',
}

export default async function LLMAuditPage() {
  const { configs, runs } = await getLLMAudit(30)

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">LLM Orchestration Audit (read-only)</h1>
      <p className="mt-1 text-sm text-slate-400">
        Multi-model routing is dormant by default — no API key means every task runs the deterministic
        path only. This page never displays an API key or any secret; it shows routing metadata and
        the audit trail of attempted LLM runs and their validation outcomes.
      </p>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Provider configs</h2>
        {configs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No provider configs seeded.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Provider</th>
                <th className="py-2 pr-4">Model</th>
                <th className="py-2 pr-4">Enabled</th>
                <th className="py-2 pr-4">Cost tier</th>
                <th className="py-2 pr-4">Latency tier</th>
                <th className="py-2 pr-4">Task types</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id} className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-slate-200">{c.providerName}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-400">{c.modelName}</td>
                  <td className="py-2 pr-4">
                    <span className={c.enabled ? 'text-emerald-400' : 'text-slate-500'}>
                      {c.enabled ? 'enabled' : 'dormant'}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-400">{c.costTier}</td>
                  <td className="py-2 pr-4 text-slate-400">{c.latencyTier}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">{c.taskTypes.join(', ') || 'none'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Recent LLM runs ({runs.length})</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No LLM runs recorded yet — orchestration is dormant (no active provider).
          </p>
        ) : (
          <table className="mt-3 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Task</th>
                <th className="py-2 pr-4">Provider / model</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Tokens (in/out)</th>
                <th className="py-2 pr-4">Cost</th>
                <th className="py-2 pr-4">Latency</th>
                <th className="py-2 pr-4">Validation</th>
                <th className="py-2 pr-4">When</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-xs text-slate-300">{r.taskType.replace(/_/g, ' ')}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-slate-400">
                    {r.provider} / {r.model}
                  </td>
                  <td className={`py-2 pr-4 text-xs font-semibold ${STATUS_STYLES[r.status] ?? 'text-slate-400'}`}>
                    {r.status.replace(/_/g, ' ')}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-400">
                    {r.tokenCountInput} / {r.tokenCountOutput}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-400">£{r.estimatedCost.toFixed(4)}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">{r.latencyMs}ms</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">
                    {r.validation ? (
                      <span className={r.validation.validationStatus === 'PASSED' ? 'text-emerald-400' : 'text-rose-400'}>
                        {r.validation.validationStatus}
                      </span>
                    ) : (
                      <span className="text-slate-500">n/a</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-500">{new Date(r.createdAt).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="mt-10 border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500">
          Dormant configs are safe by design — no key means no network call, ever. This page reflects
          live routing/audit state, not fixture data.
        </p>
      </footer>
    </main>
  )
}
