import Link from 'next/link'
import { Eyebrow, Panel } from './chrome'

type WatchMarketSummary = {
  id: string
  name: string
  active: boolean
  sectors: string[]
  regions: string[]
  themes: string[]
}

/**
 * Market focus: the operator's saved watch markets plus the market-data layer
 * status. When no provider is configured this says so plainly — no price, no
 * placeholder number, ever.
 */
export function MarketFocus({
  watchMarkets,
  marketConfigured,
  marketProvider,
}: {
  watchMarkets: WatchMarketSummary[]
  marketConfigured: boolean
  marketProvider: string | null
}) {
  return (
    <Panel className="flex flex-col">
      <div className="flex items-center justify-between border-b border-line/70 px-3 py-2">
        <Eyebrow accent="text-warn" live={watchMarkets.some((m) => m.active)}>
          Market focus
        </Eyebrow>
        <Link
          href="/watch"
          className="text-[10px] text-ink-faint transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        >
          Manage →
        </Link>
      </div>
      <div className="flex-1 px-3 py-2.5">
        {watchMarkets.length === 0 ? (
          <p className="text-xs text-ink-faint">
            No watch markets yet. Create one to track a sector, region or theme ahead of a
            fully-formed opportunity.
          </p>
        ) : (
          <ul className="space-y-2">
            {watchMarkets.slice(0, 4).map((market) => (
              <li key={market.id}>
                <Link
                  href="/watch"
                  className="block border border-line/70 px-2.5 py-2 transition hover:border-warn/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn"
                >
                  <p className="flex items-center gap-1.5 text-[11px] text-ink">
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full ${market.active ? 'cc-live bg-warn' : 'bg-ink-faint'}`}
                    />
                    {market.name}
                    {!market.active && <span className="text-[9px] uppercase text-ink-faint">inactive</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[9px] uppercase tracking-wider text-ink-faint">
                    {[...market.sectors, ...market.regions, ...market.themes].slice(0, 4).join(' · ') ||
                      'broad scope'}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="border-t border-line/50 px-3 py-2 text-[10px] text-ink-faint">
        {marketConfigured ? (
          <>
            Market data provider: <span className="font-data text-teal">{marketProvider}</span>
          </>
        ) : (
          <>Market provider not configured — market context shows graph evidence only.</>
        )}
      </p>
    </Panel>
  )
}
