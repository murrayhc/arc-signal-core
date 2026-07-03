import type { EvidenceArcData, EvidenceArcStepData } from '@/server/services/graph'
import { ChainClassBadge, FixtureBadge, NodeTypeChip, pct } from '@/components/badges'

function degreeLabel(degree: number): string {
  return degree === 1 ? '1 degree out' : `${degree} degrees out`
}

/**
 * Renders an EvidenceArc (chainClass, summary, score tiles, steps grouped by
 * degree) or an empty state when the event has no arc yet (not scanned/synced).
 */
export function EvidenceArc({ arc, steps }: { arc: EvidenceArcData | null; steps: EvidenceArcStepData[] }) {
  if (!arc) {
    return (
      <p className="text-sm text-slate-500">
        No evidence arc yet — this event has not been through a graph sync.
      </p>
    )
  }

  const stepsByDegree = new Map<number, EvidenceArcStepData[]>()
  for (const step of steps) {
    const bucket = stepsByDegree.get(step.degree) ?? []
    bucket.push(step)
    stepsByDegree.set(step.degree, bucket)
  }
  const degrees = [...stepsByDegree.keys()].sort((a, b) => a - b)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <ChainClassBadge chainClass={arc.chainClass} />
        {arc.isFixture && <FixtureBadge />}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{arc.summary}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'True potential', value: arc.truePotentialScore },
          { label: 'Confidence', value: arc.confidence },
          { label: 'Source diversity', value: arc.sourceDiversity },
          { label: 'Contradiction', value: arc.contradictionScore },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
            <p className="font-mono text-lg font-bold">{pct(tile.value)}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{tile.label}</p>
          </div>
        ))}
      </div>

      {degrees.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No neighbouring nodes reached during traversal.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {degrees.map((degree) => (
            <div key={degree}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {degreeLabel(degree)}
              </h3>
              <ul className="mt-2 space-y-2">
                {(stepsByDegree.get(degree) ?? []).map((step, i) => (
                  <li
                    key={`${degree}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-slate-800 bg-slate-900 p-3 text-sm"
                  >
                    <NodeTypeChip nodeType={step.nodeType} />
                    <span className="text-slate-200">{step.nodeTitle}</span>
                    <span className="text-xs text-slate-500">
                      · {step.relationshipType.replace(/_/g, ' ').toLowerCase()} · confidence {pct(step.confidence)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
