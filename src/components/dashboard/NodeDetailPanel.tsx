'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { GraphEdgeData, GraphNodeData } from '@/server/services/graph'
import type { EventDetail } from '@/server/services/events'
import { brainColor } from './brain-model'
import { Eyebrow, Meter, pct } from './chrome'
import { useSelection } from './SelectionProvider'

type Neighbourhood = {
  node: GraphNodeData
  neighbours: GraphNodeData[]
  edges: GraphEdgeData[]
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{title}</h3>
      <div className="mt-1 text-xs leading-relaxed text-ink-dim">{children}</div>
    </div>
  )
}

/**
 * The selection detail panel (brief §15). Renders its server-rendered fallback
 * (Top Risks) until a node is selected in the Brain; then swaps to the node's
 * evidence view. Every section is fed by persisted, guard-cleaned fields —
 * sections without real data simply do not render.
 */
export function NodeDetailPanel({ children }: { children: React.ReactNode }) {
  const { selectedId, clear } = useSelection()
  const [detail, setDetail] = useState<Neighbourhood | null>(null)
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setEvent(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setEvent(null)
    fetch(`/api/graph/node/${selectedId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then(async (data: Neighbourhood) => {
        if (cancelled) return
        setDetail(data)
        if (data.node.nodeType === 'EVENT') {
          // Isolated: an event-detail failure degrades to the node-only view —
          // it must not surface as a panel-level "could not load" error when
          // the node detail has already rendered.
          try {
            const res = await fetch(`/api/events/${data.node.refId}`)
            if (!cancelled && res.ok) setEvent((await res.json()) as EventDetail)
          } catch {
            /* node-only view */
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load node detail.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  if (!selectedId) return <>{children}</>

  const node = detail?.node
  const primaryRO = event?.riskOpportunities[0] ?? null
  const raises = event?.triggerConditions.filter((t) => t.direction === 'RAISES') ?? []
  const lowers = event?.triggerConditions.filter((t) => t.direction === 'LOWERS') ?? []

  return (
    <section className="flex h-full flex-col border border-line bg-abyss/60">
      <div className="flex items-center justify-between gap-2 border-b border-line/70 px-3 py-2">
        <Eyebrow accent="text-violet">Node intelligence</Eyebrow>
        <button
          onClick={clear}
          className="border border-line px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-faint transition hover:border-line-bright hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        >
          Close ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3 py-3">
        {loading && <p className="font-data text-xs text-ink-faint">Tracing evidence…</p>}
        {error && <p className="text-xs text-risk">{error}</p>}

        {node && !loading && (
          <>
            <div>
              <p className="flex flex-wrap items-center gap-1.5">
                <span
                  className="px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: brainColor(node.nodeType), border: `1px solid ${brainColor(node.nodeType)}55` }}
                >
                  {node.nodeType.replace(/_/g, ' ')}
                </span>
                {node.isFixture && (
                  <span className="border border-warn/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-warn">
                    Fixture
                  </span>
                )}
              </p>
              <p className="mt-1.5 text-sm font-semibold leading-snug text-ink">{node.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {(
                [
                  ['Confidence', node.confidence, 'bg-signal'],
                  ['Impact', node.impactScore, 'bg-ink-dim'],
                  ['Risk pressure', node.riskScore, 'bg-risk'],
                  ['Opportunity', node.opportunityScore, 'bg-gold'],
                ] as const
              ).map(([label, value, bar]) => (
                <div key={label}>
                  <p className="flex items-baseline justify-between">
                    <span className="text-[9px] uppercase tracking-wider text-ink-faint">{label}</span>
                    <span className="font-data text-[11px] text-ink-dim">{pct(value)}</span>
                  </p>
                  <Meter value={value} barClass={bar} className="mt-0.5" />
                </div>
              ))}
            </div>

            {(event?.event.summary ?? node.summary) && (
              <Section title="What is happening">{event?.event.summary ?? node.summary}</Section>
            )}

            {primaryRO?.explanation && <Section title="Why it matters">{primaryRO.explanation}</Section>}
            {primaryRO?.riskLogic && <Section title="Risk logic">{primaryRO.riskLogic}</Section>}
            {primaryRO?.opportunityLogic && (
              <Section title="Opportunity logic">{primaryRO.opportunityLogic}</Section>
            )}

            {event && (
              <Section title="Source diversity">
                <span className="font-data">{event.event.evidenceCount}</span> evidence items ·
                diversity <span className="font-data">{pct(event.event.sourceDiversityScore)}</span>
                {event.evidenceAgainst.length > 0 && (
                  <>
                    {' '}
                    · <span className="text-warn">{event.evidenceAgainst.length} against</span>
                  </>
                )}
              </Section>
            )}

            {detail && detail.edges.length > 0 && (
              <Section title="Evidence chain">
                <ul className="space-y-1">
                  {detail.edges.slice(0, 8).map((edge) => {
                    const otherId = edge.sourceNodeId === node.id ? edge.targetNodeId : edge.sourceNodeId
                    const other = detail.neighbours.find((n) => n.id === otherId)
                    return (
                      <li key={edge.id} className="border-l pl-2" style={{ borderColor: `${brainColor(other?.nodeType ?? '')}66` }}>
                        <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                          {edge.edgeType.replace(/_/g, ' ')}
                        </span>{' '}
                        {other?.title ?? otherId}
                      </li>
                    )
                  })}
                  {detail.edges.length > 8 && (
                    <li className="text-[10px] text-ink-faint">+ {detail.edges.length - 8} more connections</li>
                  )}
                </ul>
              </Section>
            )}

            {raises.length > 0 && (
              <Section title="What could raise confidence">
                <ul className="list-inside list-disc space-y-0.5">
                  {raises.slice(0, 3).map((t, i) => (
                    <li key={i}>{t.conditionText}</li>
                  ))}
                </ul>
              </Section>
            )}
            {(lowers.length > 0 || (event?.dataGaps.length ?? 0) > 0) && (
              <Section title="What could lower confidence">
                <ul className="list-inside list-disc space-y-0.5">
                  {lowers.slice(0, 3).map((t, i) => (
                    <li key={i}>{t.conditionText}</li>
                  ))}
                  {event?.dataGaps.slice(0, 2).map((gap, i) => (
                    <li key={`gap-${i}`}>
                      Open data gap: {gap.title}
                      {gap.suggestedSourceCategory ? ` (watch ${gap.suggestedSourceCategory.replace(/_/g, ' ').toLowerCase()} sources)` : ''}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {event && event.suggestedQuestions.length > 0 && (
              <Section title="Worth investigating">
                <ul className="list-inside list-disc space-y-0.5">
                  {event.suggestedQuestions.slice(0, 3).map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </Section>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {node.nodeType === 'EVENT' && (
                <Link
                  href={`/events/${node.refId}`}
                  className="border border-signal/50 bg-signal/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-signal transition hover:bg-signal/20"
                >
                  Open evidence arc →
                </Link>
              )}
              {node.nodeType === 'OPPORTUNITY' && (
                <Link
                  href={`/opportunities/${node.refId}`}
                  className="border border-gold/50 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gold transition hover:bg-gold/20"
                >
                  Open opportunity →
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
