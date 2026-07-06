import type { EventDeepReport } from '@/server/services/consequence'

export function PositioningPanel({ positioning }: { positioning: EventDeepReport['positioning'] }) {
  if (positioning.length === 0) {
    return <p className="text-sm text-slate-500">No strategic positioning examples have been generated for this event yet.</p>
  }
  return (
    <ul className="space-y-2 text-sm">
      {positioning.map((p) => (
        <li key={p.id} className="rounded-md border border-slate-800 bg-slate-900 p-3">
          <p className="font-semibold text-slate-200">{p.title}</p>
          <p className="mt-1 text-slate-300">
            <span className="text-slate-500">How it could be used: </span>
            {p.howItCouldBeUsed}
          </p>
          <p className="mt-1 text-slate-400">
            <span className="text-slate-500">Why it may matter: </span>
            {p.whyItMayMatter}
          </p>
          <p className="mt-1 text-xs text-slate-600">{p.constraints}</p>
        </li>
      ))}
    </ul>
  )
}
