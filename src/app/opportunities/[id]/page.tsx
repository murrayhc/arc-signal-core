import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getOpportunityDetail } from '@/server/services/opportunities'
import { OpportunityActions } from '@/components/OpportunityActions'
import { FixtureBadge, StatusBadge, pct } from '@/components/badges'

export const dynamic = 'force-dynamic'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-slate-200">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getOpportunityDetail(id)
  if (!detail) notFound()
  const { card, event, positioning } = detail

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{card.title}</h1>
            <span className="rounded border border-emerald-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
              {card.opportunityType.replace(/_/g, ' ')}
            </span>
            <StatusBadge status={card.status} />
            {card.isFixture && <FixtureBadge />}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {card.affectedSectors.join(', ') || 'cross-sector'}
            {card.affectedRegions.length > 0 ? ` · ${card.affectedRegions.join(', ')}` : ''} · from{' '}
            <Link href={`/events/${event.id}`} className="underline hover:text-slate-200">
              {event.title}
            </Link>
          </p>
        </div>
        <OpportunityActions opportunityId={card.id} />
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: 'Commercial value', value: pct(card.commercialValueScore) },
          { label: 'Urgency', value: pct(card.urgencyScore) },
          { label: 'Confidence', value: pct(card.confidence) },
          { label: 'Evidence', value: pct(card.evidenceScore) },
          { label: 'Actionability', value: pct(card.actionabilityScore) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
            <p className="font-mono text-lg font-bold">{stat.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{stat.label}</p>
          </div>
        ))}
      </section>

      <Section title="Summary">
        <p className="text-sm leading-relaxed text-slate-300">{card.summary}</p>
      </Section>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
          <h3 className="text-sm font-semibold text-emerald-300">Opportunity logic</h3>
          <p className="mt-1 text-sm text-slate-300">{card.opportunityLogic}</p>
        </div>
        <div className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-4">
          <h3 className="text-sm font-semibold text-rose-300">Risk logic</h3>
          <p className="mt-1 text-sm text-slate-300">{card.riskLogic}</p>
        </div>
      </div>

      <Section title="Buyer pain">
        <p className="text-sm leading-relaxed text-slate-300">{card.buyerPain}</p>
      </Section>

      <Section title="Suggested offer">
        <p className="text-sm leading-relaxed text-slate-300">{card.suggestedOffer}</p>
      </Section>

      <Section title="Likely buyers">
        {card.likelyBuyers.length === 0 ? (
          <p className="text-sm text-slate-500">No likely buyers identified.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {card.likelyBuyers.map((b, i) => (
              <li key={i} className="rounded-md bg-slate-800 px-2 py-1">{b}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Strategic positioning examples (${positioning.length})`}>
        {positioning.length === 0 ? (
          <p className="text-sm text-slate-500">No positioning examples generated for this opportunity.</p>
        ) : (
          <ul className="space-y-3">
            {positioning.map((p) => (
              <li key={p.id} className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded border border-sky-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-400">
                    {p.userType.replace(/_/g, ' ')}
                  </span>
                  {p.isFixture && <FixtureBadge />}
                </div>
                <p className="mt-2 text-slate-200">{p.howItCouldBeUsed}</p>
                <p className="mt-1 text-xs text-slate-400">{p.whyItMayMatter}</p>
                <p className="mt-1 text-xs text-slate-500">{p.evidenceSummary}</p>
                <p className="mt-2 text-[11px] italic text-slate-500">{p.constraints}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <footer className="mt-10 border-t border-slate-800 pt-4">
        <p className="text-xs text-slate-500">
          This view provides public market context and strategic interpretation examples. It does not
          provide personal investment advice, portfolio advice, or buy, sell or hold recommendations.
        </p>
      </footer>
    </main>
  )
}
