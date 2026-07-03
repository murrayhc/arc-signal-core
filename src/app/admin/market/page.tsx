import Link from 'next/link'
import { getMarketAudit } from '@/server/market/service'
import { FixtureBadge } from '@/components/badges'

export const dynamic = 'force-dynamic'

/**
 * Read-only status page for the market-data layer, mirroring /admin/llm:
 * provider configuration state (CONFIGURED / NOT_CONFIGURED, never the key),
 * the seeded fixture reference profiles (commodities + instruments, each
 * FixtureBadge-labelled — no live prices), and recent MarketSearchQuery
 * rows. The auditability/honesty surface for Stage 8.
 */
export default async function MarketAuditPage() {
  const { status, commodities, instruments, recentQueries } = await getMarketAudit(30)

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <h1 className="mt-3 text-xl font-bold">Market Data Audit (read-only)</h1>
      <p className="mt-1 text-sm text-slate-400">
        Market/commodity/instrument data is dormant by default — no API key means every lookup returns a
        clean not-configured empty state and no price is ever invented. This page never displays an API
        key or any secret; it shows provider status, seeded fixture reference profiles, and recent
        search queries.
      </p>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Provider status</h2>
        <p className="mt-2 text-sm">
          <span className={status.status === 'CONFIGURED' ? 'font-semibold text-emerald-400' : 'font-semibold text-slate-500'}>
            {status.status}
          </span>
          <span className="ml-3 text-xs text-slate-500">
            provider: {status.provider ?? 'none'} · delayed: {status.delayed ? 'yes' : 'no'}
          </span>
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Commodity reference profiles ({commodities.length})</h2>
        {commodities.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No commodity profiles seeded.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Category</th>
                <th className="py-2 pr-4">Supply regions</th>
                <th className="py-2 pr-4">Demand sectors</th>
                <th className="py-2 pr-4">Fixture</th>
              </tr>
            </thead>
            <tbody>
              {commodities.map((c) => (
                <tr key={c.name} className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-slate-200">{c.name}</td>
                  <td className="py-2 pr-4 text-slate-400">{c.category}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">{c.keySupplyRegions.join(', ') || 'none'}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">{c.keyDemandSectors.join(', ') || 'none'}</td>
                  <td className="py-2 pr-4">{c.isFixture && <FixtureBadge />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Instrument reference profiles ({instruments.length})</h2>
        {instruments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No instrument profiles seeded.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Symbol</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Exchange</th>
                <th className="py-2 pr-4">Currency</th>
                <th className="py-2 pr-4">Fixture</th>
              </tr>
            </thead>
            <tbody>
              {instruments.map((i) => (
                <tr key={`${i.provider}:${i.symbol}`} className="border-b border-slate-800">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-300">{i.symbol}</td>
                  <td className="py-2 pr-4 text-slate-200">{i.name}</td>
                  <td className="py-2 pr-4 text-slate-400">{i.instrumentType}</td>
                  <td className="py-2 pr-4 text-slate-400">{i.exchange ?? 'n/a'}</td>
                  <td className="py-2 pr-4 text-slate-400">{i.currency}</td>
                  <td className="py-2 pr-4">{i.isFixture && <FixtureBadge />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-slate-200">Recent market searches ({recentQueries.length})</h2>
        {recentQueries.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No market searches recorded yet.
          </p>
        ) : (
          <table className="mt-3 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Query</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Results</th>
                <th className="py-2 pr-4">When</th>
              </tr>
            </thead>
            <tbody>
              {recentQueries.map((q) => (
                <tr key={q.id} className="border-b border-slate-800">
                  <td className="py-2 pr-4 text-xs text-slate-300">{q.query}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">{q.queryType.replace(/_/g, ' ')}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400">{q.resultCount}</td>
                  <td className="py-2 pr-4 text-xs text-slate-500">{new Date(q.createdAt).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="mt-10 border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500">
          Dormant status is safe by design — no key means no network call, ever. Fixture reference
          profiles are labelled static context, not live prices. This page reflects live audit state,
          not invented data.
        </p>
      </footer>
    </main>
  )
}
