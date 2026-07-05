import type { EventEvidenceDepth } from '@/server/services/evidence-depth'
import { RunInvestigationButton } from './RunInvestigationButton'

const LABEL_STYLES: Record<string, string> = {
  STRONGLY_SUPPORTED: 'text-emerald-300',
  SUPPORTED: 'text-emerald-400',
  WEAK_SINGLE_SOURCE: 'text-amber-400',
  RECYCLED: 'text-amber-400',
  STALE: 'text-slate-400',
  CONTRADICTED: 'text-rose-400',
  UNVERIFIED: 'text-slate-400',
  NEEDS_REVIEW: 'text-amber-400',
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'source'
  }
}

function label(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase()
}

export function EvidenceDepthPanel({ depth, eventId }: { depth: EventEvidenceDepth; eventId: string }) {
  if (!depth.hasDepth) {
    return (
      <div className="rounded-md border border-slate-800 bg-slate-900 p-4 text-sm text-slate-400">
        <p>Deep investigation has not run for this event yet.</p>
        <RunInvestigationButton eventId={eventId} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-2 text-xs text-slate-400">
        <span>{depth.claims.length} tracked claim(s)</span>
        <span>· {depth.supportingCount} supporting source(s)</span>
        <span>· {depth.contradictingCount} contradicting</span>
        <span>· {depth.queries.length} follow-up quer{depth.queries.length === 1 ? 'y' : 'ies'}</span>
      </div>

      <ul className="space-y-2">
        {depth.claims.map((c) => (
          <li key={c.id} className="rounded-md border border-slate-800 bg-slate-900 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-mono text-xs ${LABEL_STYLES[c.factualityLabel] ?? 'text-slate-400'}`}>
                {label(c.factualityLabel)}
              </span>
              <span className="text-xs text-slate-500">reliability {(c.reliabilityScore * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-1 text-slate-200">“{c.claimText}”</p>
            <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
              <span>{c.independentSourceCount} independent source(s)</span>
              {c.copiedSourceCount > 0 && <span className="text-amber-400">· {c.copiedSourceCount} likely copy(ies)</span>}
              {c.contradictionCount > 0 && <span className="text-rose-400">· {c.contradictionCount} contradiction(s)</span>}
              {c.originCandidateUrl && (
                <span>
                  · origin:{' '}
                  <a className="underline hover:text-slate-300" href={c.originCandidateUrl}>
                    {safeHost(c.originCandidateUrl)}
                  </a>
                </span>
              )}
            </p>
            {c.lineage.length > 0 && (
              <ul className="mt-2 space-y-1 border-l border-slate-800 pl-3 text-xs text-slate-500">
                {c.lineage.map((l, i) => (
                  <li key={i}>
                    <span className={l.relationToOrigin === 'CONTRADICTION' ? 'text-rose-400' : l.isLikelyCopy ? 'text-amber-400' : 'text-slate-400'}>
                      {label(l.relationToOrigin)}
                    </span>
                    {l.url && (
                      <>
                        {' · '}
                        <a className="underline hover:text-slate-300" href={l.url}>
                          {safeHost(l.url)}
                        </a>
                      </>
                    )}
                    {l.publishedAt && <> · {new Date(l.publishedAt).toLocaleDateString('en-GB')}</>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {depth.atomicFacts.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Atomic facts</h3>
          <ul className="mt-1 space-y-1 text-sm text-slate-300">
            {depth.atomicFacts.slice(0, 20).map((f) => (
              <li key={f.id} className="flex gap-2">
                <span className={`font-mono text-[10px] ${LABEL_STYLES[f.factualityLabel] ?? 'text-slate-500'}`}>
                  {label(f.factualityLabel)}
                </span>
                <span>“{f.claimText}”</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {depth.gaps.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Evidence gaps</h3>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-300/80">
            {depth.gaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      )}

      {depth.queries.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Follow-up investigation queries</h3>
          <ul className="mt-1 space-y-1 text-sm text-slate-300">
            {depth.queries.map((q, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-slate-500">{label(q.queryClass)}</span>
                <span>{q.queryText}</span>
                {q.status === 'SKIPPED_NO_ADAPTER' && (
                  <span className="text-[10px] text-slate-600">(pending a search connector)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <RunInvestigationButton eventId={eventId} />
    </div>
  )
}
