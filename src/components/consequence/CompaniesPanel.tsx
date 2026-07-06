import type { CompanyImpactView } from '@/server/consequence/types'

const TYPE_STYLE: Record<string, string> = {
  BENEFICIARY: 'text-emerald-300',
  HARMED: 'text-rose-300',
  MIXED: 'text-amber-300',
  EXPOSED: 'text-amber-400',
  WATCH_ONLY: 'text-slate-400',
  UNKNOWN: 'text-slate-400',
}

function ImpactCard({ i }: { i: CompanyImpactView }) {
  return (
    <li className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-100">{i.companyName}</span>
        <span className={`font-mono text-xs ${TYPE_STYLE[i.impactType] ?? 'text-slate-400'}`}>
          {i.impactType.replace(/_/g, ' ').toLowerCase()}
        </span>
        <span className="text-xs text-slate-500">
          confidence {Math.round(i.confidence * 100)}%{i.lowConfidence ? ' · low' : ''}
        </span>
        {i.entityId && (
          <a href={`/entities/${i.entityId}`} className="text-[10px] text-slate-500 underline hover:text-slate-300">
            entity
          </a>
        )}
      </div>
      <p className="mt-1 text-slate-300">{i.impactPathway}</p>
      {i.watchSignals.length > 0 && <p className="mt-1 text-xs text-slate-500">Watch: {i.watchSignals.join(' · ')}</p>}
      <p className="mt-1 text-[10px] text-slate-600">evidence: {i.evidenceIds.length} id(s)</p>
    </li>
  )
}

export function CompaniesPanel({
  beneficiaries,
  harmed,
  companies,
}: {
  beneficiaries: CompanyImpactView[]
  harmed: CompanyImpactView[]
  companies: CompanyImpactView[]
}) {
  if (companies.length === 0) {
    return <p className="text-sm text-slate-500">No company impacts have been resolved for this event yet.</p>
  }
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Who may benefit ({beneficiaries.length})</h3>
        {beneficiaries.length ? (
          <ul className="mt-2 space-y-2">{beneficiaries.map((i) => <ImpactCard key={i.id} i={i} />)}</ul>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No specific beneficiary identified in the evidence.</p>
        )}
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-400">Who may be harmed or exposed ({harmed.length})</h3>
        {harmed.length ? (
          <ul className="mt-2 space-y-2">{harmed.map((i) => <ImpactCard key={i.id} i={i} />)}</ul>
        ) : (
          <p className="mt-1 text-sm text-slate-500">No specific harmed party identified in the evidence.</p>
        )}
      </div>
      <p className="text-[10px] text-slate-600">
        Named companies come only from an event&apos;s evidence; categories are labelled inferences, never specific companies.
      </p>
    </div>
  )
}
