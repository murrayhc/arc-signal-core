'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const QUERY_TYPES = [
  'Company',
  'Commodity',
  'Ticker',
  'Instrument',
  'Sector',
  'Region',
  'Theme',
] as const

/**
 * The upgraded interrogation entry point. Same contract as the original
 * SearchBar — submit navigates to /interrogate?q=… where the classifier and
 * graph-evidence answer live. Market-shaped queries get context only, never
 * advice (enforced server-side by the interrogation service).
 */
export function CommandBar() {
  const router = useRouter()
  const [value, setValue] = useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    router.push(`/interrogate?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form onSubmit={handleSubmit} role="search" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-64 flex-1 items-center gap-2 border border-line bg-abyss/80 px-3 py-2 transition focus-within:border-signal/60">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-faint">
          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <label htmlFor="cc-interrogate" className="sr-only">
          Interrogate the intelligence graph
        </label>
        <input
          id="cc-interrogate"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search companies, commodities, tickers, sectors, signals…"
          className="w-full bg-transparent font-data text-xs text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <button
          type="submit"
          className="shrink-0 border border-signal/50 bg-signal/10 px-3 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-signal transition hover:bg-signal/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        >
          Interrogate
        </button>
      </div>
      <p aria-hidden className="hidden shrink-0 items-center gap-1 text-[9px] uppercase tracking-wider text-ink-faint xl:flex">
        {QUERY_TYPES.map((t, i) => (
          <span key={t} className="flex items-center gap-1">
            {i > 0 && <span className="text-line-bright">·</span>}
            {t}
          </span>
        ))}
      </p>
    </form>
  )
}
