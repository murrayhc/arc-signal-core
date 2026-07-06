import Link from 'next/link'
import type { OpportunityCardData } from '@/server/services/opportunities'
import type { EventConsequenceSummary } from '@/server/services/consequence'
import { Eyebrow, Meter, Panel, pct } from './chrome'
import { ConsequenceIndicators } from './ConsequenceIndicators'

function potentialTag(score: number): { label: string; className: string } {
  if (score >= 0.7) return { label: 'High potential', className: 'border-gold/60 text-gold' }
  if (score >= 0.5) return { label: 'Moderate', className: 'border-ink-faint/60 text-ink-dim' }
  return { label: 'Early', className: 'border-ink-faint/40 text-ink-faint' }
}

/**
 * Ranked commercial-opportunity feed (left column). Ordering and every figure
 * come straight from the opportunity engine's persisted, guard-cleaned cards.
 */
export function ActiveOpportunities({ cards, summaries }: { cards: OpportunityCardData[]; summaries?: Record<string, EventConsequenceSummary> }) {
  return (
    <Panel id="active-opportunities" className="flex h-full flex-col">
      <div className="border-b border-line/70 px-3 py-2">
        <Eyebrow accent="text-gold" live={cards.length > 0}>
          Active Opportunities
        </Eyebrow>
      </div>
      {cards.length === 0 ? (
        <p className="px-3 py-4 text-xs text-ink-faint">
          No commercial openings detected yet. Opportunities appear here when scanned events carry
          a qualifying commercial reading.
        </p>
      ) : (
        <ol className="min-h-0 flex-1 divide-y divide-line/50 overflow-y-auto">
          {cards.slice(0, 7).map((card, i) => {
            const tag = potentialTag(card.commercialValueScore)
            return (
              <li key={card.id}>
                <Link
                  href={`/opportunities/${card.id}`}
                  className="block px-3 py-2.5 transition hover:bg-gold/5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex min-w-0 items-baseline gap-1.5">
                      <span className="font-data text-[10px] text-ink-faint">{String(i + 1).padStart(2, '0')}</span>
                      <span className="truncate text-xs font-medium text-ink">{card.title}</span>
                    </p>
                    <span className="shrink-0 font-data text-xs font-semibold text-gold">
                      {pct(card.commercialValueScore)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] uppercase tracking-wider text-ink-faint">
                    {card.opportunityType.replace(/_/g, ' ')}
                    {card.affectedSectors[0] ? ` · ${card.affectedSectors[0]}` : ''}
                    {card.affectedRegions[0] ? ` · ${card.affectedRegions[0]}` : ''}
                  </p>
                  <Meter value={card.commercialValueScore} barClass="bg-gold" className="mt-1.5" />
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] uppercase tracking-wider text-ink-faint">
                    <span>
                      urgency <span className="font-data text-ink-dim">{pct(card.urgencyScore)}</span>
                    </span>
                    <span>
                      confidence <span className="font-data text-ink-dim">{pct(card.confidence)}</span>
                    </span>
                    <span className={`ml-auto border px-1.5 py-0.5 font-semibold ${tag.className}`}>{tag.label}</span>
                    {card.isFixture && (
                      <span className="border border-warn/60 px-1.5 py-0.5 font-semibold text-warn">Fixture</span>
                    )}
                  </div>
                  <ConsequenceIndicators s={summaries?.[card.eventId]} />
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
