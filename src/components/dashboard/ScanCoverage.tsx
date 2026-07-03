import type { SourceStatus } from '@/server/services/dashboard'
import type { ScanCounters } from '@/server/services/command-centre'
import { Eyebrow, Panel, healthDotClass } from './chrome'

/**
 * Live scanning bars: the pipeline's real per-stage throughput from the last
 * ScanRun, plus coverage by actual source category. No aspirational channels —
 * only stages and categories that exist in the data.
 */
export function ScanCoverage({
  counters,
  sources,
}: {
  counters: ScanCounters | null
  sources: SourceStatus[]
}) {
  const stages: { label: string; value: number }[] = counters
    ? [
        { label: 'Sources scanned', value: counters.sourcesScanned },
        { label: 'Documents', value: counters.documentsFetched },
        { label: 'Claims', value: counters.claimsExtracted },
        { label: 'Signals', value: counters.signalsCreated },
        { label: 'Clusters', value: counters.clustersCreated },
        { label: 'Events', value: counters.eventCandidatesCreated + counters.eventCandidatesUpdated },
        { label: 'Opportunity cards', value: counters.opportunityCardsCreated },
        { label: 'Graph upserts', value: counters.graphNodesUpserted + counters.graphEdgesUpserted },
      ]
    : []
  const max = Math.max(1, ...stages.map((s) => s.value))

  const byCategory = new Map<string, { total: number; healthy: number }>()
  for (const source of sources) {
    const category = source.category.replace(/_/g, ' ').toLowerCase()
    const group = byCategory.get(category) ?? { total: 0, healthy: 0 }
    group.total += 1
    if (source.healthStatus === 'HEALTHY') group.healthy += 1
    byCategory.set(category, group)
  }

  return (
    <Panel className="flex flex-col">
      <div className="border-b border-line/70 px-3 py-2">
        <Eyebrow accent="text-signal" live={counters !== null}>
          Scan coverage
        </Eyebrow>
      </div>
      <div className="space-y-1.5 px-3 py-2.5">
        {counters === null ? (
          <p className="text-xs text-ink-faint">No scan throughput yet — run a scan.</p>
        ) : (
          stages.map((stage) => (
            <div key={stage.label} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-[9px] uppercase tracking-wider text-ink-faint">
                {stage.label}
              </span>
              <div aria-hidden className="h-1 flex-1 bg-line/50">
                <div
                  className="h-full bg-signal/70"
                  style={{ width: `${Math.max(2, Math.round((stage.value / max) * 100))}%` }}
                />
              </div>
              <span className="w-8 shrink-0 text-right font-data text-[10px] text-ink-dim">
                {stage.value}
              </span>
            </div>
          ))
        )}
      </div>
      {byCategory.size > 0 && (
        <div className="border-t border-line/50 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-ink-faint">Coverage by source category</p>
          <ul className="mt-1.5 space-y-1">
            {[...byCategory.entries()].map(([category, group]) => (
              <li key={category} className="flex items-center gap-2 text-[10px] text-ink-dim">
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    group.healthy === group.total ? 'bg-teal' : group.healthy > 0 ? 'bg-warn' : 'bg-risk'
                  }`}
                />
                <span className="capitalize">{category}</span>
                <span className="ml-auto font-data text-ink-faint">
                  {group.healthy}/{group.total} healthy
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

/** Compact source strip used in the secondary drawer — preserves the old
 *  per-source health view with fixture labelling. */
export function SourceStrip({ sources }: { sources: SourceStatus[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <span key={s.id} className="flex items-center gap-1.5 border border-line bg-abyss/60 px-2 py-1 text-[10px] text-ink-dim">
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${healthDotClass(s.healthStatus)}`} />
          {s.name}
          {s.isFixture && <span className="font-semibold uppercase text-warn">fixture</span>}
          {s.collectorStatus !== 'FUNCTIONAL' && <span className="text-ink-faint">unsupported</span>}
        </span>
      ))}
    </div>
  )
}
