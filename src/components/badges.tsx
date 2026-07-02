export function FixtureBadge() {
  return (
    <span className="rounded border border-amber-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
      Fixture
    </span>
  )
}

const CLASS_STYLES: Record<string, string> = {
  RISK: 'border-rose-500/60 text-rose-400',
  OPPORTUNITY: 'border-emerald-500/60 text-emerald-400',
  MIXED: 'border-sky-500/60 text-sky-400',
  WATCH: 'border-amber-500/60 text-amber-400',
  UNKNOWN: 'border-slate-500/60 text-slate-400',
}

export function ClassBadge({ eventClass }: { eventClass: string }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CLASS_STYLES[eventClass] ?? CLASS_STYLES.UNKNOWN}`}
    >
      {eventClass}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-300">
      {status.replace(/_/g, ' ')}
    </span>
  )
}

export const pct = (n: number) => `${Math.round(n * 100)}%`
