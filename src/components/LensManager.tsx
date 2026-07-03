'use client'

import { useState } from 'react'
import type { LensData } from '@/server/lens/service'
import { LensForm, EMPTY_LENS_FORM, type LensFormState } from './LensForm'

function toCsv(list: string[]): string {
  return list.join(', ')
}

function fromCsv(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function lensToForm(lens: LensData): LensFormState {
  return {
    name: lens.name,
    description: lens.description ?? '',
    userType: lens.userType,
    targetSectors: toCsv(lens.targetSectors),
    targetRegions: toCsv(lens.targetRegions),
    offerTypes: toCsv(lens.offerTypes),
    buyerPersonas: toCsv(lens.buyerPersonas),
    averageDealSize: lens.averageDealSize ?? '',
    salesCycle: lens.salesCycle ?? '',
    excludedSectors: toCsv(lens.excludedSectors),
    riskAppetite: lens.riskAppetite,
    isDefault: lens.isDefault,
  }
}

function formToPayload(form: LensFormState) {
  return {
    name: form.name,
    description: form.description.trim().length > 0 ? form.description.trim() : null,
    userType: form.userType,
    targetSectors: fromCsv(form.targetSectors),
    targetRegions: fromCsv(form.targetRegions),
    offerTypes: fromCsv(form.offerTypes),
    buyerPersonas: fromCsv(form.buyerPersonas),
    averageDealSize: form.averageDealSize.trim().length > 0 ? form.averageDealSize.trim() : null,
    salesCycle: form.salesCycle.trim().length > 0 ? form.salesCycle.trim() : null,
    excludedSectors: fromCsv(form.excludedSectors),
    riskAppetite: form.riskAppetite,
    isDefault: form.isDefault,
  }
}

export function LensManager({ initialLenses }: { initialLenses: LensData[] }) {
  const [lenses, setLenses] = useState<LensData[]>(initialLenses)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState<LensFormState>(EMPTY_LENS_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<LensFormState>(EMPTY_LENS_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const res = await fetch('/api/lenses')
    if (res.ok) setLenses(await res.json())
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/lenses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(formToPayload(createForm)),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `Create failed (HTTP ${res.status})`)
        return
      }
      setCreateForm(EMPTY_LENS_FORM)
      setCreating(false)
      await refresh()
    } catch {
      setError('Could not reach the lens API.')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(lens: LensData) {
    setEditingId(lens.id)
    setEditForm(lensToForm(lens))
    setError(null)
  }

  async function handleUpdate() {
    if (!editingId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/lenses/${editingId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(formToPayload(editForm)),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? `Update failed (HTTP ${res.status})`)
        return
      }
      setEditingId(null)
      await refresh()
    } catch {
      setError('Could not reach the lens API.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(lens: LensData) {
    if (lens.isDefault) {
      setError(
        `"${lens.name}" is the default lens. Make another lens the default first, then delete this one.`,
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/lenses/${lens.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `Delete failed (HTTP ${res.status})`)
        return
      }
      await refresh()
    } catch {
      setError('Could not reach the lens API.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">{lenses.length} lens{lenses.length === 1 ? '' : 'es'}</h2>
        {!creating && (
          <button
            onClick={() => {
              setCreating(true)
              setCreateForm(EMPTY_LENS_FORM)
              setError(null)
            }}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
          >
            + Create revenue lens
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 rounded-md border border-rose-800/60 bg-rose-950/30 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      )}

      {creating && (
        <div className="mt-3">
          <LensForm
            form={createForm}
            onChange={setCreateForm}
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
            busy={busy}
            submitLabel="Create lens"
          />
        </div>
      )}

      {lenses.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No revenue lenses yet. Scoring falls back to the neutral default weighting until one is
          created.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {lenses.map((lens) => (
            <li key={lens.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              {editingId === lens.id ? (
                <LensForm
                  form={editForm}
                  onChange={setEditForm}
                  onSubmit={handleUpdate}
                  onCancel={() => setEditingId(null)}
                  busy={busy}
                  submitLabel="Save changes"
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-100">{lens.name}</h3>
                        {lens.isDefault && (
                          <span className="rounded border border-sky-500/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-400">
                            Default
                          </span>
                        )}
                        {!lens.active && (
                          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                            Inactive
                          </span>
                        )}
                      </div>
                      {lens.description && <p className="mt-1 text-xs text-slate-400">{lens.description}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => startEdit(lens)}
                        className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(lens)}
                        disabled={busy}
                        title={lens.isDefault ? 'Reassign the default lens before deleting this one' : undefined}
                        className="rounded-md bg-rose-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div><dt className="text-slate-500">User type</dt><dd className="text-slate-200">{lens.userType.replace(/_/g, ' ')}</dd></div>
                    <div><dt className="text-slate-500">Risk appetite</dt><dd className="text-slate-200">{lens.riskAppetite}</dd></div>
                    <div><dt className="text-slate-500">Average deal size</dt><dd className="font-mono text-slate-200">{lens.averageDealSize ?? 'unset (neutral 0.5 band)'}</dd></div>
                    <div><dt className="text-slate-500">Sales cycle</dt><dd className="text-slate-200">{lens.salesCycle ?? '—'}</dd></div>
                  </dl>

                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                    <span>Sectors: {lens.targetSectors.length > 0 ? lens.targetSectors.join(', ') : 'any'}</span>
                    <span>Regions: {lens.targetRegions.length > 0 ? lens.targetRegions.join(', ') : 'any'}</span>
                    <span>Offers: {lens.offerTypes.length > 0 ? lens.offerTypes.join(', ') : 'any'}</span>
                    <span>Buyers: {lens.buyerPersonas.length > 0 ? lens.buyerPersonas.join(', ') : 'any'}</span>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
