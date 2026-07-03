'use client'

import { useState } from 'react'

export function SaveToPortfolioButton({ opportunityCardId }: { opportunityCardId: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function handleSave() {
    setState('busy')
    setMessage(null)
    try {
      const res = await fetch('/api/portfolio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opportunityCardId }),
      })
      const body = await res.json()
      if (!res.ok) {
        setState('error')
        setMessage(body.error ?? `Save failed (HTTP ${res.status})`)
        return
      }
      setState('saved')
      setMessage(res.status === 201 ? 'Saved to portfolio.' : 'Already in portfolio.')
    } catch {
      setState('error')
      setMessage('Could not reach the portfolio API.')
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSave}
        disabled={state === 'busy' || state === 'saved'}
        className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state === 'busy' ? 'Saving…' : state === 'saved' ? 'Saved to portfolio' : 'Save to portfolio'}
      </button>
      {message && (
        <p className={`text-xs ${state === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>{message}</p>
      )}
    </div>
  )
}
