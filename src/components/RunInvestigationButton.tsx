'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Summary = {
  stoppedReason: string
  queriesGenerated: number
  documentsAdded: number
  adaptersTried: number
}

export function RunInvestigationButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [summary, setSummary] = useState<Summary | null>(null)

  async function run() {
    setState('running')
    try {
      const res = await fetch(`/api/events/${eventId}/investigate`, { method: 'POST' })
      if (!res.ok) throw new Error('bad status')
      setSummary(await res.json())
      setState('done')
      router.refresh()
    } catch {
      setState('error')
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={state === 'running'}
        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
      >
        {state === 'running' ? 'Investigating…' : 'Run deeper investigation'}
      </button>
      {state === 'done' && summary && (
        <p className="mt-2 text-xs text-slate-400">
          {summary.queriesGenerated} follow-up quer{summary.queriesGenerated === 1 ? 'y' : 'ies'} generated ·{' '}
          {summary.documentsAdded} new document(s) ·{' '}
          {summary.stoppedReason === 'NO_ADAPTER_CONFIGURED'
            ? 'no search connector is configured yet — queries are logged for when one is enabled.'
            : `stopped: ${summary.stoppedReason.toLowerCase().replace(/_/g, ' ')}.`}
        </p>
      )}
      {state === 'error' && <p className="mt-2 text-xs text-rose-400">Investigation failed to start.</p>}
    </div>
  )
}
