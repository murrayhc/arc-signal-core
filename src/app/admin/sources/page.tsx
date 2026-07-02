import Link from 'next/link'
import { getDashboardData } from '@/server/services/dashboard'
import { FixtureBadge } from '@/components/badges'

export const dynamic = 'force-dynamic'

export default async function SourcesAdminPage() {
  const { sources } = await getDashboardData()
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">Source Registry (read-only)</h1>
      <p className="mt-1 text-sm text-slate-400">
        Support layer only — event discovery is the product surface. A source is only scannable
        when a compatible collector exists.
      </p>
      <table className="mt-6 w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
            <th className="py-2 pr-4">Source</th>
            <th className="py-2 pr-4">Category</th>
            <th className="py-2 pr-4">Access</th>
            <th className="py-2 pr-4">Collector</th>
            <th className="py-2 pr-4">Last run</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id} className="border-b border-slate-800">
              <td className="py-2 pr-4">
                <span className="flex items-center gap-2 text-slate-200">
                  {s.name} {s.isFixture && <FixtureBadge />}
                </span>
              </td>
              <td className="py-2 pr-4 text-slate-400">{s.category}</td>
              <td className="py-2 pr-4 font-mono text-xs text-slate-400">{s.accessMethod}</td>
              <td className="py-2 pr-4">
                <span className={s.collectorStatus === 'FUNCTIONAL' ? 'text-emerald-400' : 'text-amber-400'}>
                  {s.collectorStatus}
                </span>
              </td>
              <td className="py-2 pr-4 text-xs text-slate-400">
                {s.lastRunStatus ?? 'never run'}
                {s.lastRunAt ? ` · ${new Date(s.lastRunAt).toLocaleString('en-GB')}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
