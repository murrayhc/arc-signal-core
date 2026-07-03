import Link from 'next/link'
import type { FeedCardData } from '@/server/services/dashboard'
import { Eyebrow, Meter, Panel, pct, timeUk } from './chrome'

function severityTag(severity: number): { label: string; className: string } {
  if (severity >= 0.7) return { label: 'Severe', className: 'border-risk/60 text-risk' }
  if (severity >= 0.45) return { label: 'Elevated', className: 'border-warn/60 text-warn' }
  return { label: 'Watch', className: 'border-ink-faint/50 text-ink-dim' }
}

/**
 * Ranked risk pressure feed (right column). Fed by the existing RISK_RADAR
 * dashboard feed — severity, probability and scores are real event fields.
 */
export function TopRisks({ risks }: { risks: FeedCardData[] }) {
  return (
    <Panel id="top-risks" className="flex h-full flex-col">
      <div className="border-b border-line/70 px-3 py-2">
        <Eyebrow accent="text-risk" live={risks.length > 0}>
          Top Risks
        </Eyebrow>
      </div>
      {risks.length === 0 ? (
        <p className="px-3 py-4 text-xs text-ink-faint">
          No risk events detected. Risk pressure appears here as scans surface qualifying events.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-line/50 overflow-y-auto">
          {risks.slice(0, 7).map((risk) => {
            const tag = severityTag(risk.severity)
            return (
              <li key={risk.eventId}>
                <Link
                  href={`/events/${risk.eventId}`}
                  className="block px-3 py-2.5 transition hover:bg-risk/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-risk"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-medium text-ink">{risk.title}</p>
                    <span className="shrink-0 font-data text-xs font-semibold text-risk">
                      {pct(risk.riskScore)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] uppercase tracking-wider text-ink-faint">
                    {risk.eventType.replace(/_/g, ' ')}
                    {risk.sector ? ` · ${risk.sector}` : ''}
                    {risk.region ? ` · ${risk.region}` : ''}
                  </p>
                  <Meter value={risk.riskScore} barClass="bg-risk" className="mt-1.5" />
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] uppercase tracking-wider text-ink-faint">
                    <span>
                      impact <span className="font-data text-ink-dim">{pct(risk.severity)}</span>
                    </span>
                    <span>
                      probability <span className="font-data text-ink-dim">{pct(risk.probability)}</span>
                    </span>
                    <span className={`ml-auto border px-1.5 py-0.5 font-semibold ${tag.className}`}>{tag.label}</span>
                    {risk.isFixture && (
                      <span className="border border-warn/60 px-1.5 py-0.5 font-semibold text-warn">Fixture</span>
                    )}
                  </div>
                  <p className="mt-1 text-[9px] text-ink-faint">updated {timeUk(risk.lastUpdatedAt)}</p>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
