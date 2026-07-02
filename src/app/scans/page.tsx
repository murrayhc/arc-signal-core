import Link from 'next/link'
import { getScanHistory } from '@/server/services/scans'
import { StatusBadge } from '@/components/badges'

export const dynamic = 'force-dynamic'

export default async function ScansPage() {
  const runs = await getScanHistory()
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">Scan History</h1>
      <p className="mt-1 text-sm text-slate-400">Every scan run, newest first — the radar&apos;s audit trail.</p>
      {runs.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">No scans yet. Run one from the dashboard.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-700 uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3">Started</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Sources</th>
                <th className="py-2 pr-3">Docs</th>
                <th className="py-2 pr-3">Claims</th>
                <th className="py-2 pr-3">Signals</th>
                <th className="py-2 pr-3">Clusters</th>
                <th className="py-2 pr-3">Events new</th>
                <th className="py-2 pr-3">Events updated</th>
                <th className="py-2 pr-3">Errors</th>
                <th className="py-2 pr-3">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-slate-800 text-slate-300">
                  <td className="py-2 pr-3">{new Date(r.startedAt).toLocaleString('en-GB')}</td>
                  <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                  <td className="py-2 pr-3">{r.sourcesScanned} scanned · {r.sourcesSkipped} skipped</td>
                  <td className="py-2 pr-3">{r.documentsFetched}</td>
                  <td className="py-2 pr-3">{r.claimsExtracted}</td>
                  <td className="py-2 pr-3">{r.signalsCreated}</td>
                  <td className="py-2 pr-3">{r.clustersCreated}</td>
                  <td className="py-2 pr-3">{r.eventCandidatesCreated}</td>
                  <td className="py-2 pr-3">{r.eventCandidatesUpdated}</td>
                  <td className={`py-2 pr-3 ${r.errorCount > 0 ? 'text-rose-400' : ''}`}>{r.errorCount}</td>
                  <td className="py-2 pr-3 text-slate-500">{r.warningCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
