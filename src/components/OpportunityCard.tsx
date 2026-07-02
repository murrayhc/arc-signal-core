import Link from 'next/link'
import type { OpportunityCardData } from '@/server/services/opportunities'
import { FixtureBadge, StatusBadge, pct } from './badges'

export function OpportunityCard({ card }: { card: OpportunityCardData }) {
  return (
    <Link
      href={`/opportunities/${card.id}`}
      className="block rounded-lg border border-slate-800 bg-slate-900 p-4 transition hover:border-slate-600"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-100">{card.title}</h3>
        <div className="flex shrink-0 gap-1">
          <span className="rounded border border-emerald-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
            {card.opportunityType.replace(/_/g, ' ')}
          </span>
          {card.isFixture && <FixtureBadge />}
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-slate-400">
        <span className="text-slate-500">Buyer pain: </span>
        {card.buyerPain}
      </p>
      <p className="mt-1 line-clamp-2 text-xs text-slate-400">
        <span className="text-slate-500">Suggested offer: </span>
        {card.suggestedOffer}
      </p>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <div><dt className="text-slate-500">Value</dt><dd className="font-mono text-emerald-300">{pct(card.commercialValueScore)}</dd></div>
        <div><dt className="text-slate-500">Urgency</dt><dd className="font-mono text-slate-200">{pct(card.urgencyScore)}</dd></div>
        <div><dt className="text-slate-500">Confidence</dt><dd className="font-mono text-slate-200">{pct(card.confidence)}</dd></div>
        <div><dt className="text-slate-500">Evidence</dt><dd className="font-mono text-slate-200">{pct(card.evidenceScore)}</dd></div>
      </dl>
      <p className="mt-2 line-clamp-1 text-xs text-slate-400">
        <span className="text-slate-500">Next best action: </span>
        {card.nextBestAction}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <StatusBadge status={card.status} />
        <span className="text-[10px] text-slate-500">
          updated {new Date(card.updatedAt).toLocaleString('en-GB')}
        </span>
      </div>
    </Link>
  )
}
