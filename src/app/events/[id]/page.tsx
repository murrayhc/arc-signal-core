import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getEventDetail } from '@/server/services/events'
import type { EvidenceItem } from '@/server/services/events'
import { getOpportunitiesForEvent } from '@/server/services/opportunities'
import { EventActions } from '@/components/EventActions'
import { ClassBadge, FixtureBadge, StatusBadge, pct } from '@/components/badges'

export const dynamic = 'force-dynamic'

function EvidenceRow({ item }: { item: EvidenceItem }) {
  return (
    <li className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
      <p className="text-slate-200">“{item.claimText}”</p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{item.claimType.replace(/_/g, ' ')}</span>
        <span>· confidence {pct(item.confidence)}</span>
        {item.needsReview && <span className="text-amber-400">· flagged for review</span>}
        <span>· {item.date ? new Date(item.date).toLocaleDateString('en-GB') : 'undated'}</span>
        <span>
          · <a className="underline hover:text-slate-300" href={item.documentUrl}>{item.documentTitle}</a>{' '}
          ({item.sourceName})
        </span>
        {item.isFixture && <FixtureBadge />}
      </p>
    </li>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-slate-200">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  )
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getEventDetail(id)
  if (!detail) notFound()
  const { event } = detail
  const opportunities = await getOpportunitiesForEvent(event.id)

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/" className="text-xs text-slate-400 underline hover:text-slate-200">← Dashboard</Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{event.title}</h1>
            <ClassBadge eventClass={event.eventClass} />
            <StatusBadge status={event.status} />
            {event.isFixture && <FixtureBadge />}
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {event.eventType.replace(/_/g, ' ')} · {event.affectedSector ?? 'cross-sector'}
            {event.affectedRegion ? ` · ${event.affectedRegion}` : ''} ·{' '}
            {event.primaryEntity ? event.primaryEntity.name : 'no primary entity — pattern-level event'}
          </p>
        </div>
        <EventActions eventId={event.id} />
      </header>

      <section className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
        {[
          { label: 'Probability', value: pct(event.probability) },
          { label: 'Confidence', value: pct(event.confidence) },
          { label: 'Severity', value: pct(event.severity) },
          { label: 'Risk', value: pct(event.riskScore) },
          { label: 'Opportunity', value: pct(event.opportunityScore) },
          { label: 'Src diversity', value: pct(event.sourceDiversityScore) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
            <p className="font-mono text-lg font-bold">{stat.value}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{stat.label}</p>
          </div>
        ))}
      </section>

      <Section title="Summary">
        <p className="text-sm leading-relaxed text-slate-300">{event.summary}</p>
      </Section>

      {detail.riskOpportunities.map((ro, i) => (
        <div key={i} className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-4">
            <h3 className="text-sm font-semibold text-rose-300">Risk logic</h3>
            <p className="mt-1 text-sm text-slate-300">{ro.riskLogic}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4">
            <h3 className="text-sm font-semibold text-emerald-300">Opportunity logic</h3>
            <p className="mt-1 text-sm text-slate-300">{ro.opportunityLogic}</p>
          </div>
        </div>
      ))}

      <Section title={`Evidence timeline (${detail.evidence.length} claims)`}>
        {detail.evidence.length === 0 ? (
          <p className="text-sm text-slate-500">No evidence collected for this event.</p>
        ) : (
          <ul className="space-y-2">{detail.evidence.map((e) => <EvidenceRow key={e.claimId} item={e} />)}</ul>
        )}
      </Section>

      <Section title="Evidence against">
        {detail.evidenceAgainst.length === 0 ? (
          <p className="text-sm text-slate-500">
            No countervailing evidence collected yet — see data gaps below.
          </p>
        ) : (
          <ul className="space-y-2">{detail.evidenceAgainst.map((e) => <EvidenceRow key={e.claimId} item={e} />)}</ul>
        )}
      </Section>

      <Section title="Signal clusters">
        <ul className="space-y-2">
          {detail.clusters.map((c) => (
            <li key={c.id} className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
              <p className="font-semibold text-slate-200">{c.title}</p>
              <p className="mt-1 text-xs text-slate-400">{c.explanation}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Related entities">
        {detail.relatedEntities.length === 0 && !event.primaryEntity ? (
          <p className="text-sm text-slate-500">
            No entities resolved — this event is tracked at {event.affectedSector ?? 'pattern'} level.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-sm">
            {event.primaryEntity && (
              <li className="rounded-md bg-slate-800 px-2 py-1">{event.primaryEntity.name} (primary)</li>
            )}
            {detail.relatedEntities.map((e) => (
              <li key={e.id} className="rounded-md bg-slate-800 px-2 py-1">{e.name}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Data gaps (${detail.dataGaps.length})`}>
        {detail.dataGaps.length === 0 ? (
          <p className="text-sm text-slate-500">No data gaps recorded.</p>
        ) : (
          <ul className="space-y-2">
            {detail.dataGaps.map((g, i) => (
              <li key={i} className="rounded-md border border-amber-900/50 bg-amber-950/20 p-3 text-sm">
                <p className="font-semibold text-amber-300">
                  {g.title} <span className="font-normal text-amber-500">({g.severity}, {g.impactOnConfidence} confidence)</span>
                </p>
                <p className="mt-1 text-xs text-slate-400">{g.description} Suggested source category: {g.suggestedSourceCategory}.</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Trigger conditions">
        <ul className="space-y-2">
          {detail.triggerConditions.map((t, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
              <span className={`mt-0.5 font-mono text-xs ${t.direction === 'RAISES' ? 'text-rose-400' : 'text-emerald-400'}`}>
                {t.direction === 'RAISES' ? '▲' : '▼'} {t.probabilityImpact > 0 ? '+' : ''}{t.probabilityImpact}
              </span>
              <span className="text-slate-300">{t.conditionText}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Suggested interrogation questions">
        <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
          {detail.suggestedQuestions.map((q, i) => <li key={i}>{q}</li>)}
        </ul>
      </Section>

      <Section title="Opportunities & positioning">
        {opportunities.length === 0 ? (
          <p className="text-sm text-slate-500">No commercial opportunities derived from this event yet.</p>
        ) : (
          <ul className="space-y-2">
            {opportunities.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/opportunities/${o.id}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900 p-3 text-sm transition hover:border-slate-600"
                >
                  <span className="text-slate-200">{o.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                    {o.opportunityType.replace(/_/g, ' ')} · value {pct(o.commercialValueScore)}
                    {o.isFixture && <FixtureBadge />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  )
}
