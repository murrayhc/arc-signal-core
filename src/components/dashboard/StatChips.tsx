import { pct } from './chrome'

/**
 * The old four hero stat-cards, demoted to a single instrument strip. Every
 * figure is a real count from the dashboard/graph services.
 */
export function StatChips({
  counts,
  opportunityCount,
  healthySources,
  totalSources,
  meanConfidence,
}: {
  counts: { newEvents: number; rising: number; highConfidence: number; watch: number }
  opportunityCount: number
  healthySources: number
  totalSources: number
  meanConfidence: number | null
}) {
  const chips: { label: string; value: string; accent?: string }[] = [
    { label: 'New events', value: String(counts.newEvents), accent: 'text-signal' },
    { label: 'Rising', value: String(counts.rising), accent: counts.rising > 0 ? 'text-teal' : undefined },
    { label: 'High confidence', value: String(counts.highConfidence) },
    { label: 'Watch items', value: String(counts.watch), accent: counts.watch > 0 ? 'text-warn' : undefined },
    { label: 'Opportunities', value: String(opportunityCount), accent: opportunityCount > 0 ? 'text-gold' : undefined },
    { label: 'Source health', value: `${healthySources}/${totalSources}` },
    { label: 'System confidence', value: meanConfidence === null ? '—' : pct(meanConfidence) },
  ]
  return (
    <dl className="flex flex-wrap items-center gap-x-0 gap-y-2 border border-line bg-abyss/40">
      {chips.map((chip, i) => (
        <div
          key={chip.label}
          className={`flex items-baseline gap-2 px-3 py-1.5 ${i > 0 ? 'border-l border-line' : ''}`}
        >
          <dd className={`font-data text-sm font-semibold ${chip.accent ?? 'text-ink'}`}>{chip.value}</dd>
          <dt className="text-[9px] uppercase tracking-wider text-ink-faint">{chip.label}</dt>
        </div>
      ))}
    </dl>
  )
}
