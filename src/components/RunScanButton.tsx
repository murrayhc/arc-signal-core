'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RunScanButton() {
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
      if (!res.ok) {
        setError(body.error ?? `Scan failed (HTTP ${res.status})`)
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
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={runScan}
        disabled={running}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {running ? 'Scanning…' : 'Run scan'}
      </button>
      {message && <p className="text-xs text-emerald-400">{message}</p>}
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}
