import type { MarketContext } from '@/server/interrogate/service'
import { FixtureBadge } from '@/components/badges'

/**
 * Renders a configured MarketContext: instrument or commodity profile, price
 * context (delayed label + native currency), and the guard-clean summary
 * note (which already folds in linked public events / sector signals /
 * contradictions from the graph evidence gathered server-side). Allowed
 * output only — instrument/commodity profile, price context as provided,
 * public events, sector signals, contradictions. No buy/sell/hold, no price
 * targets, no personal-investment framing anywhere in this component; the
 * summary itself is assertNoAdviceLanguage-checked before it ever reaches
 * here. Pure display — no client state, no `typeof window` branching, so
 * server and first client render always match.
 */
export function MarketContextPanel({ marketContext }: { marketContext: MarketContext }) {
  const { provider, delayed, instrument, commodity, quote, note } = marketContext

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Market context
        </h3>
        {provider && (
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {provider}
          </span>
        )}
        {delayed && (
          <span className="rounded border border-amber-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
            Delayed
          </span>
        )}
        {(instrument?.isFixture || commodity?.isFixture) && <FixtureBadge />}
      </div>

      {instrument && (
        <div className="mt-3 text-xs text-slate-300">
          <p className="font-medium text-slate-200">
            {instrument.name} ({instrument.symbol})
          </p>
          <p className="mt-1 text-slate-500">
            {instrument.instrumentType}
            {instrument.exchange ? ` · ${instrument.exchange}` : ''} · priced in {instrument.currency}
          </p>
          {quote && (
            <p className="mt-1 text-slate-500">
              Price context: {quote.price.toFixed(2)} {quote.currency}
              {quote.changePct !== null ? ` (${quote.changePct > 0 ? '+' : ''}${quote.changePct.toFixed(1)}% on the period)` : ''}
              {' · as of '}
              {new Date(quote.asOf).toLocaleString('en-GB')}
            </p>
          )}
        </div>
      )}

      {commodity && (
        <div className="mt-3 text-xs text-slate-300">
          <p className="font-medium text-slate-200">
            {commodity.name} ({commodity.category.toLowerCase()})
            {commodity.symbol ? ` · ${commodity.symbol}` : ''}
          </p>
          <p className="mt-1 text-slate-500">
            Key supply regions: {commodity.keySupplyRegions.length > 0 ? commodity.keySupplyRegions.join(', ') : 'none on record'}
          </p>
          <p className="mt-1 text-slate-500">
            Key demand sectors: {commodity.keyDemandSectors.length > 0 ? commodity.keyDemandSectors.join(', ') : 'none on record'}
          </p>
        </div>
      )}

      {note && <p className="mt-3 rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-400">{note}</p>}
    </section>
  )
}
