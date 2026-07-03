'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Client-side interrogation search bar. Submitting navigates to
 * `/interrogate?q=<encoded>` — the `/interrogate` page itself does the
 * actual query. Kept dumb on purpose: no client-side fetch, no state beyond
 * the input value, so it works identically wherever it's mounted (dashboard
 * header, top of `/interrogate` itself).
 */
export function SearchBar({ initialQuery = '' }: { initialQuery?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    router.push(`/interrogate?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full items-center gap-2" role="search">
      <label htmlFor="archlight-search" className="sr-only">
        Interrogate the graph
      </label>
      <input
        id="archlight-search"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Interrogate a company, sector, commodity, ticker or theme…"
        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-sky-600 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-md bg-sky-700 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-600"
      >
        Interrogate
      </button>
    </form>
  )
}
