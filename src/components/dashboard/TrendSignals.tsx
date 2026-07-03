import type { TrendSignalData } from '@/server/services/command-centre'
import { Eyebrow, Meter, Panel, pct } from './chrome'

/**
 * Rising and falling themes from real SignalClusters: strength ranks the row,
 * novelty ≥ 0.6 earns the RISING chip. Nothing synthesised.
 */
export function TrendSignals({ trends }: { trends: TrendSignalData[] }) {
  return (
    <Panel id="trend-signals" className="flex flex-col">
      <div className="border-b border-line/70 px-3 py-2">
        <Eyebrow accent="text-teal" live={trends.length > 0}>
          Trend signals
        </Eyebrow>
      </div>
      {trends.length === 0 ? (
        <p className="px-3 py-4 text-xs text-ink-faint">
          No signal clusters yet — themes appear here once scans derive clustered signals.
        </p>
      ) : (
        <ul className="divide-y divide-line/40 px-3 py-1">
          {trends.map((trend) => (
            <li key={trend.id} className="py-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-[11px] text-ink">{trend.title}</p>
                <span className="flex shrink-0 items-center gap-1.5">
                  {trend.novelty >= 0.6 && (
                    <span className="border border-teal/60 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-teal">
                      Rising
                    </span>
                  )}
                  {trend.isFixture && (
                    <span className="border border-warn/60 px-1 py-px text-[8px] font-semibold uppercase tracking-wider text-warn">
                      Fixture
                    </span>
                  )}
                  <span className="font-data text-[10px] text-ink-dim">{pct(trend.strength)}</span>
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <Meter value={trend.strength} barClass="bg-teal/80" className="flex-1" />
                <span className="shrink-0 text-[8px] uppercase tracking-wider text-ink-faint">
                  {trend.sector ?? trend.clusterType.replace(/_/g, ' ')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
