'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PortfolioItemData } from '@/server/portfolio/service'
import { PORTFOLIO_STATUSES } from '@/shared/enums'

type CardMeta = { title: string; opportunityType: string | null }

type EditState = {
  status: string
  owner: string
  nextAction: string
  deadline: string
}

function itemToEdit(item: PortfolioItemData): EditState {
  return {
    status: item.status,
    owner: item.owner ?? '',
    nextAction: item.nextAction ?? '',
    // deadline is stored as an ISO string; <input type="date"> wants YYYY-MM-DD
    deadline: item.deadline ? item.deadline.slice(0, 10) : '',
  }
}

const FILTERS = ['ALL', ...PORTFOLIO_STATUSES] as const

export function PortfolioManager({
  initialItems,
  cardTitles,
}: {
  initialItems: PortfolioItemData[]
  cardTitles: Record<string, CardMeta>
}) {
  const [items, setItems] = useState<PortfolioItemData[]>(initialItems)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('ALL')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState>({ status: 'NEW', owner: '', nextAction: '', deadline: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const visible = items.filter((item) => filter === 'ALL' || item.status === filter)

  function startEdit(item: PortfolioItemData) {
    setEditingId(item.id)
    setEdit(itemToEdit(item))
    setError(null)
  }

  async function handleSave(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/portfolio/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: edit.status,
          owner: edit.owner.trim().length > 0 ? edit.owner.trim() : null,
          nextAction: edit.nextAction.trim().length > 0 ? edit.nextAction.trim() : null,
          deadline: edit.deadline.length > 0 ? new Date(edit.deadline).toISOString() : null,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `Update failed (HTTP ${res.status})`)
        return
      }
      setItems((prev) => prev.map((i) => (i.id === id ? body : i)))
      setEditingId(null)
    } catch {
      setError('Could not reach the portfolio API.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
              filter === f
                ? 'border-slate-300 bg-slate-200 text-slate-900'
                : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-rose-800/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          {items.length === 0
            ? 'No opportunities saved to the portfolio yet. Use "Save to portfolio" on an opportunity page to add one.'
            : 'No portfolio items match this filter.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((item) => {
            const meta = cardTitles[item.opportunityCardId]
            return (
              <li key={item.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/opportunities/${item.opportunityCardId}`}
                      className="text-sm font-semibold text-slate-100 underline-offset-2 hover:underline"
                    >
                      {meta?.title ?? item.opportunityCardId}
                    </Link>
                    {meta?.opportunityType && (
                      <p className="mt-1 text-xs text-slate-400">{meta.opportunityType.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-300">
                    {item.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div><dt className="text-slate-500">Evidence strength</dt><dd className="font-mono text-slate-200">{Math.round(item.evidenceStrength * 100)}%</dd></div>
                  <div><dt className="text-slate-500">Buyer clarity</dt><dd className="font-mono text-slate-200">{Math.round(item.buyerClarity * 100)}%</dd></div>
                  <div><dt className="text-slate-500">Owner</dt><dd className="text-slate-200">{item.owner ?? '—'}</dd></div>
                  <div><dt className="text-slate-500">Deadline</dt><dd className="text-slate-200">{item.deadline ? new Date(item.deadline).toLocaleDateString('en-GB') : '—'}</dd></div>
                </dl>
                {item.nextAction && (
                  <p className="mt-2 text-xs text-slate-400">
                    <span className="text-slate-500">Next action: </span>
                    {item.nextAction}
                  </p>
                )}

                {editingId === item.id ? (
                  <div className="mt-3 grid gap-3 rounded-md border border-slate-800 bg-slate-950 p-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs text-slate-400">
                      Status
                      <select
                        value={edit.status}
                        onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
                      >
                        {PORTFOLIO_STATUSES.map((s) => (
                          <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-400">
                      Owner
                      <input
                        value={edit.owner}
                        onChange={(e) => setEdit({ ...edit, owner: e.target.value })}
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
                      Next action
                      <input
                        value={edit.nextAction}
                        onChange={(e) => setEdit({ ...edit, nextAction: e.target.value })}
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-slate-400">
                      Deadline
                      <input
                        type="date"
                        value={edit.deadline}
                        onChange={(e) => setEdit({ ...edit, deadline: e.target.value })}
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <button
                        onClick={() => handleSave(item.id)}
                        disabled={busy}
                        className="rounded-md bg-sky-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="rounded-md bg-slate-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(item)}
                    className="mt-3 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
                  >
                    Update
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
