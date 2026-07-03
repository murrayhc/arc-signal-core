'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Command-centre restyle of the Run scan action. Same contract as the original
 * RunScanButton (POST /api/scans/run, refresh on success) with a live scanning
 * state that reads as the engine spinning up rather than a disabled button.
 */
export function RunScan() {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runScan() {
    setRunning(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/scans/run', { method: 'POST' })
      const body = await res.json()
      if (!res.ok || body.status === 'FAILED') {
        setError(body.error ?? body.message ?? `Scan failed (HTTP ${res.status})`)
      } else {
        setMessage(body.message)
        router.refresh()
      }
    } catch {
      setError('Could not reach the scan API. Is the server running?')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="relative flex flex-col items-end">
      <button
        onClick={runScan}
        disabled={running}
        className="flex items-center gap-2 whitespace-nowrap border border-signal/60 bg-signal/15 px-4 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-signal transition hover:bg-signal/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal disabled:cursor-wait"
      >
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-signal ${running ? 'cc-live' : ''}`} />
        {running ? 'Scanning' : 'Run scan'}
      </button>
      {message && (
        <p className="absolute right-0 top-full z-20 mt-1 max-w-64 border border-line bg-abyss px-2 py-1 text-right text-[11px] text-teal">
          {message}
        </p>
      )}
      {error && (
        <p className="absolute right-0 top-full z-20 mt-1 max-w-64 border border-risk/40 bg-abyss px-2 py-1 text-right text-[11px] text-risk">
          {error}
        </p>
      )}
    </div>
  )
}
