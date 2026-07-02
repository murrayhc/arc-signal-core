'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ACTIONS = [
  { action: 'ESCALATE', label: 'Escalate', style: 'bg-rose-700 hover:bg-rose-600' },
  { action: 'ACTION', label: 'Action', style: 'bg-emerald-700 hover:bg-emerald-600' },
  { action: 'DISMISS', label: 'Dismiss', style: 'bg-slate-700 hover:bg-slate-600' },
] as const

export function OpportunityActions({ opportunityId }: { opportunityId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply(action: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) setError(`Action failed (HTTP ${res.status})`)
      else router.refresh()
    } catch {
      setError('Could not reach the API.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.action}
            disabled={busy}
            onClick={() => apply(a.action)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${a.style}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}
