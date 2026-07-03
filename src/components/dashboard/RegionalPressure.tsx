import type { RegionalPressureData } from '@/server/services/command-centre'
import { Eyebrow, Panel, pct } from './chrome'

/**
 * Broad regional context from real event aggregates: per region, the balance
 * of mean risk (red, leftward) against mean opportunity (gold, rightward).
 */
export function RegionalPressure({ regions }: { regions: RegionalPressureData[] }) {
  return (
    <Panel className="flex flex-col">
      <div className="border-b border-line/70 px-3 py-2">
        <Eyebrow accent="text-ink-dim" live={regions.length > 0}>
          Regional pressure
        </Eyebrow>
      </div>
      {regions.length === 0 ? (
        <p className="px-3 py-4 text-xs text-ink-faint">No regional attribution yet.</p>
      ) : (
        <ul className="divide-y divide-line/40 px-3 py-1">
          {regions.slice(0, 6).map((region) => (
            <li key={region.region} className="py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] text-ink">{region.region}</p>
                <p className="font-data text-[10px] text-ink-faint">
                  {region.eventCount} event{region.eventCount === 1 ? '' : 's'} · conf{' '}
                  {pct(region.avgConfidence)}
                </p>
              </div>
              {/* Split balance bar: risk pulls left, opportunity pulls right */}
              <div aria-hidden className="mt-1.5 flex h-1 items-stretch gap-px">
                <div className="flex flex-1 justify-end bg-line/40">
                  <div className="h-full bg-risk/80" style={{ width: `${Math.round(region.avgRisk * 100)}%` }} />
                </div>
                <div className="flex-1 bg-line/40">
                  <div className="h-full bg-gold/80" style={{ width: `${Math.round(region.avgOpportunity * 100)}%` }} />
                </div>
              </div>
              <div className="mt-0.5 flex justify-between text-[8px] uppercase tracking-wider text-ink-faint">
                <span>
                  risk <span className="font-data">{pct(region.avgRisk)}</span>
                </span>
                <span>
                  opportunity <span className="font-data">{pct(region.avgOpportunity)}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
