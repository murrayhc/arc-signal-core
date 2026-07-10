'use client'

import { useState } from 'react'

type ReviewItem = {
  id: string
  itemType: string
  status: string
  title: string
  reason: string
  severity: number
  eventCandidateId: string | null
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  QUARANTINED_CLAIM: 'Quarantined claim',
  LOW_CONFIDENCE_IMPACT: 'Low-confidence impact',
  AMBIGUOUS_ENTITY: 'Ambiguous entity',
  CONTRADICTION_SPIKE: 'Contradiction spike',
  MANIPULATION_ALERT: 'Manipulation alert',
  PREDICTION_RESOLUTION: 'Prediction verdict',
}

function severityColour(severity: number): string {
  if (severity >= 0.7) return 'text-rose-400'
  if (severity >= 0.5) return 'text-amber-300'
  return 'text-slate-400'
}

export function ReviewQueue({ initialItems }: { initialItems: ReviewItem[] }) {
  const [items, setItems] = useState<ReviewItem[]>(initialItems)
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(id: string, status: string, verdict?: string) {
    setBusy(id)
    try {
      const res = await fetch(`/api/review/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(verdict ? { status, verdict } : { status }),
      })
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id))
    } finally {
      setBusy(null)
    }
  }

  if (items.length === 0) {
    return <p className="mt-8 text-sm text-slate-500">Nothing pending review — the queue is clear.</p>
  }

  return (
    <ul className="mt-6 space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-slate-500">
                <span className="rounded bg-slate-800 px-1.5 py-0.5">{TYPE_LABELS[item.itemType] ?? item.itemType}</span>
                <span className={severityColour(item.severity)}>severity {item.severity.toFixed(2)}</span>
              </div>
              <h2 className="mt-1 text-sm font-semibold text-slate-200">{item.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.reason}</p>
              {item.eventCandidateId && (
                <a
                  href={`/events/${item.eventCandidateId}`}
                  className="mt-1 inline-block text-[11px] text-teal-400 underline hover:text-teal-300"
                >
                  View event →
                </a>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              {item.itemType === 'PREDICTION_RESOLUTION' ? (
                <>
                  <button
                    onClick={() => decide(item.id, 'APPROVED', 'HAPPENED')}
                    disabled={busy === item.id}
                    className="rounded border border-teal-700 px-2 py-1 text-[11px] text-teal-300 hover:bg-teal-950 disabled:opacity-50"
                  >
                    Happened
                  </button>
                  <button
                    onClick={() => decide(item.id, 'REJECTED', 'DID_NOT_HAPPEN')}
                    disabled={busy === item.id}
                    className="rounded border border-rose-800 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950 disabled:opacity-50"
                  >
                    Didn&apos;t happen
                  </button>
                  <button
                    onClick={() => decide(item.id, 'REJECTED', 'UNRESOLVABLE')}
                    disabled={busy === item.id}
                    className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Unresolvable
                  </button>
                  <button
                    onClick={() => decide(item.id, 'NEEDS_MORE_EVIDENCE')}
                    disabled={busy === item.id}
                    className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Needs more
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => decide(item.id, 'APPROVED')}
                    disabled={busy === item.id}
                    className="rounded border border-teal-700 px-2 py-1 text-[11px] text-teal-300 hover:bg-teal-950 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decide(item.id, 'REJECTED')}
                    disabled={busy === item.id}
                    className="rounded border border-rose-800 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => decide(item.id, 'NEEDS_MORE_EVIDENCE')}
                    disabled={busy === item.id}
                    className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    Needs more
                  </button>
                </>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
