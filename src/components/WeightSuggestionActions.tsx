'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/** Apply / dismiss buttons for a weight suggestion — the owner gate itself. */
export function WeightSuggestionActions({ suggestionId, status }: { suggestionId: string; status: string }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function act(action: 'APPLY' | 'DISMISS') {
    setBusy(true)
    try {
      const res = await fetch(`/api/weights/${suggestionId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2">
      {status === 'SUGGESTED' && (
        <button
          onClick={() => act('APPLY')}
          disabled={busy}
          className="rounded border border-teal-700 px-2 py-1 text-[11px] text-teal-300 hover:bg-teal-950 disabled:opacity-50"
        >
          Apply
        </button>
      )}
      {status !== 'DISMISSED' && (
        <button
          onClick={() => act('DISMISS')}
          disabled={busy}
          className="rounded border border-rose-800 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950 disabled:opacity-50"
        >
          {status === 'APPLIED' ? 'Dismiss (restore defaults)' : 'Dismiss'}
        </button>
      )}
    </div>
  )
}
