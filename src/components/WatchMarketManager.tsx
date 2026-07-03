'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { WatchMarketData, ResolvedWatchMarket } from '@/server/watch/service'

type FormState = {
  name: string
  description: string
  sectors: string
  regions: string
  themes: string
  queryTerms: string
}

const EMPTY_FORM: FormState = { name: '', description: '', sectors: '', regions: '', themes: '', queryTerms: '' }

function fromCsv(csv: string): string[] {
  return csv.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
}

function formToPayload(form: FormState) {
  return {
    name: form.name,
    description: form.description.trim().length > 0 ? form.description.trim() : null,
    sectors: fromCsv(form.sectors),
    regions: fromCsv(form.regions),
    themes: fromCsv(form.themes),
    queryTerms: fromCsv(form.queryTerms),
  }
}

export function WatchMarketManager({ initialMarkets }: { initialMarkets: WatchMarketData[] }) {
  const [markets, setMarkets] = useState<WatchMarketData[]>(initialMarkets)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const [resolved, setResolved] = useState<ResolvedWatchMarket | null>(null)
  const [resolving, setResolving] = useState(false)

  async function refresh() {
    const res = await fetch('/api/watch')
    if (res.ok) setMarkets(await res.json())
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/watch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(formToPayload(form)),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `Create failed (HTTP ${res.status})`)
        return
      }
      setForm(EMPTY_FORM)
      setCreating(false)
      await refresh()
    } catch {
      setError('Could not reach the watch market API.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/watch/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Delete failed (HTTP ${res.status})`)
        return
      }
      if (resolvedId === id) {
        setResolvedId(null)
        setResolved(null)
      }
      await refresh()
    } catch {
      setError('Could not reach the watch market API.')
    } finally {
      setBusy(false)
    }
  }

  async function handleResolve(id: string) {
    setResolving(true)
    setError(null)
    setResolvedId(id)
    try {
      const res = await fetch(`/api/watch/${id}?resolve=1`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `Resolve failed (HTTP ${res.status})`)
        setResolved(null)
        return
      }
      setResolved(body)
    } catch {
      setError('Could not reach the watch market API.')
      setResolved(null)
    } finally {
      setResolving(false)
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">{markets.length} watch market{markets.length === 1 ? '' : 's'}</h2>
        {!creating && (
          <button
            onClick={() => {
              setCreating(true)
              setForm(EMPTY_FORM)
              setError(null)
            }}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
          >
            + Create watch market
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-md border border-rose-800/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleCreate()
          }}
          className="mt-3 grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
            Description
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Sectors (comma-separated)
            <input
              value={form.sectors}
              onChange={(e) => setForm({ ...form, sectors: e.target.value })}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Regions (comma-separated)
            <input
              value={form.regions}
              onChange={(e) => setForm({ ...form, regions: e.target.value })}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Themes (comma-separated)
            <input
              value={form.themes}
              onChange={(e) => setForm({ ...form, themes: e.target.value })}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-400">
            Query terms (comma-separated)
            <input
              value={form.queryTerms}
              onChange={(e) => setForm({ ...form, queryTerms: e.target.value })}
              className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-sky-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Create watch market'}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-md bg-slate-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {markets.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No watch markets yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {markets.map((market) => (
            <li key={market.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{market.name}</h3>
                    {!market.active && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  {market.description && <p className="mt-1 text-xs text-slate-400">{market.description}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleResolve(market.id)}
                    disabled={resolving}
                    className="rounded-md bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {resolving && resolvedId === market.id ? 'Resolving…' : 'Resolve'}
                  </button>
                  <button
                    onClick={() => handleDelete(market.id)}
                    disabled={busy}
                    className="rounded-md bg-rose-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                <span>Sectors: {market.sectors.length > 0 ? market.sectors.join(', ') : 'any'}</span>
                <span>Regions: {market.regions.length > 0 ? market.regions.join(', ') : 'any'}</span>
                <span>Themes: {market.themes.length > 0 ? market.themes.join(', ') : 'any'}</span>
                <span>Query terms: {market.queryTerms.length > 0 ? market.queryTerms.join(', ') : 'any'}</span>
              </div>

              {resolvedId === market.id && resolved && (
                <div className="mt-4 rounded-md border border-slate-800 bg-slate-950 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Resolved: {resolved.events.length} event{resolved.events.length === 1 ? '' : 's'} ·{' '}
                    {resolved.opportunities.length} opportunit{resolved.opportunities.length === 1 ? 'y' : 'ies'}
                  </p>
                  {resolved.events.length === 0 && resolved.opportunities.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500">
                      No matches for this market&apos;s scope yet — an empty or unmatched scope never fabricates a
                      result.
                    </p>
                  ) : (
                    <>
                      {resolved.events.length > 0 && (
                        <ul className="mt-2 space-y-1.5">
                          {resolved.events.map((e) => (
                            <li key={e.id}>
                              <Link
                                href={`/events/${e.id}`}
                                className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs transition hover:border-slate-600"
                              >
                                <span className="text-slate-200">{e.title}</span>
                                <span className="shrink-0 text-slate-500">
                                  {e.eventClass} · {e.sector ?? 'cross-sector'}
                                  {e.region ? ` · ${e.region}` : ''}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      {resolved.opportunities.length > 0 && (
                        <ul className="mt-2 space-y-1.5">
                          {resolved.opportunities.map((o) => (
                            <li key={o.id}>
                              <Link
                                href={`/opportunities/${o.id}`}
                                className="flex items-center justify-between gap-2 rounded-md border border-emerald-900/60 bg-emerald-950/20 px-2.5 py-1.5 text-xs transition hover:border-emerald-700"
                              >
                                <span className="text-slate-200">{o.title}</span>
                                <span className="shrink-0 text-slate-500">{o.opportunityType.replace(/_/g, ' ')}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
