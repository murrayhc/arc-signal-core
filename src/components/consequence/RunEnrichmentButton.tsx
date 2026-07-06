'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Result = {
  status: 'ENRICHED' | 'DORMANT' | 'COOLDOWN'
  impactsEnriched: number
  contextEnriched: boolean
  skipped: number
}

export function RunEnrichmentButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<Result | null>(null)

  async function run() {
    setState('running')
    try {
      const res = await fetch(`/api/events/${eventId}/enrich`, { method: 'POST' })
      if (!res.ok) throw new Error('bad status')
      setResult(await res.json())
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
        {state === 'running' ? 'Enhancing…' : 'Enhance with AI'}
      </button>
      {state === 'done' && result?.status === 'DORMANT' && (
        <p className="mt-2 text-xs text-slate-400">
          AI is off — set an API key and enable a model config to enable enrichment.
        </p>
      )}
      {state === 'done' && result?.status === 'COOLDOWN' && (
        <p className="mt-2 text-xs text-slate-400">Already enhanced recently — try again later.</p>
      )}
      {state === 'done' && result?.status === 'ENRICHED' && (
        <p className="mt-2 text-xs text-slate-400">
          Enhanced {result.impactsEnriched} company rationale(s)
          {result.contextEnriched ? ' + context narrative' : ''}
          {result.skipped ? ` · ${result.skipped} left deterministic` : ''}.
        </p>
      )}
      {state === 'error' && <p className="mt-2 text-xs text-rose-400">Enhancement failed to start.</p>}
    </div>
  )
}
