import Link from 'next/link'
import type { FeedCardData } from '@/server/services/dashboard'
import { ClassBadge, FixtureBadge, StatusBadge, pct } from './badges'

export function EventCard({ card }: { card: FeedCardData }) {
  return (
    <Link
      href={`/events/${card.eventId}`}
      className="block rounded-lg border border-slate-800 bg-slate-900 p-4 transition hover:border-slate-600"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">{card.title}</h3>
        <div className="flex shrink-0 gap-1">
          <ClassBadge eventClass={card.eventClass} />
          {card.isFixture && <FixtureBadge />}
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {card.eventType.replace(/_/g, ' ')} · {card.sector ?? 'cross-sector'}
        {card.region ? ` · ${card.region}` : ''}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-slate-500">Confidence</dt><dd className="font-mono text-slate-200">{pct(card.confidence)}</dd></div>
        <div><dt className="text-slate-500">Severity</dt><dd className="font-mono text-slate-200">{pct(card.severity)}</dd></div>
        <div><dt className="text-slate-500">Probability</dt><dd className="font-mono text-slate-200">{pct(card.probability)}</dd></div>
        <div><dt className="text-slate-500">Risk</dt><dd className="font-mono text-rose-300">{pct(card.riskScore)}</dd></div>
        <div><dt className="text-slate-500">Opportunity</dt><dd className="font-mono text-emerald-300">{pct(card.opportunityScore)}</dd></div>
        <div><dt className="text-slate-500">Evidence</dt><dd className="font-mono text-slate-200">{card.evidenceCount} · div {pct(card.sourceDiversityScore)}</dd></div>
      </dl>
      {card.whyItMatters && card.eventClass === 'OPPORTUNITY' && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-400">
          <span className="text-slate-500">Why this matters: </span>
          {card.whyItMatters}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <StatusBadge status={card.status} />
        <span className="text-[10px] text-slate-500">
          updated {new Date(card.lastUpdatedAt).toLocaleString('en-GB')}
        </span>
      </div>
    </Link>
  )
}
