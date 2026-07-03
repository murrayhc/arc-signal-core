import { POSITIONING_USER_TYPES, RISK_APPETITES } from '@/shared/enums'

export type LensFormState = {
  name: string
  description: string
  userType: string
  targetSectors: string
  targetRegions: string
  offerTypes: string
  buyerPersonas: string
  averageDealSize: string
  salesCycle: string
  excludedSectors: string
  riskAppetite: string
  isDefault: boolean
}

export const EMPTY_LENS_FORM: LensFormState = {
  name: '',
  description: '',
  userType: 'GENERAL',
  targetSectors: '',
  targetRegions: '',
  offerTypes: '',
  buyerPersonas: '',
  averageDealSize: '',
  salesCycle: '',
  excludedSectors: '',
  riskAppetite: 'MEDIUM',
  isDefault: false,
}

/** The create/edit form body for a Revenue Lens. Controlled — the caller owns all form state. */
export function LensForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  busy,
  submitLabel,
}: {
  form: LensFormState
  onChange: (next: LensFormState) => void
  onSubmit: () => void
  onCancel?: () => void
  busy: boolean
  submitLabel: string
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
        Name
        <input
          required
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
        Description
        <input
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        User type
        <select
          value={form.userType}
          onChange={(e) => onChange({ ...form, userType: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        >
          {POSITIONING_USER_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Risk appetite
        <select
          value={form.riskAppetite}
          onChange={(e) => onChange({ ...form, riskAppetite: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        >
          {RISK_APPETITES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Target sectors (comma-separated)
        <input
          value={form.targetSectors}
          onChange={(e) => onChange({ ...form, targetSectors: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Target regions (comma-separated)
        <input
          value={form.targetRegions}
          onChange={(e) => onChange({ ...form, targetRegions: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Offer types (comma-separated)
        <input
          value={form.offerTypes}
          onChange={(e) => onChange({ ...form, offerTypes: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Buyer personas (comma-separated)
        <input
          value={form.buyerPersonas}
          onChange={(e) => onChange({ ...form, buyerPersonas: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Average deal size (e.g. £50k, £10k-£50k)
        <input
          value={form.averageDealSize}
          onChange={(e) => onChange({ ...form, averageDealSize: e.target.value })}
          placeholder="GBP — leave blank for the default 0.5 value band"
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-sky-600 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Sales cycle
        <input
          value={form.salesCycle}
          onChange={(e) => onChange({ ...form, salesCycle: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-400 sm:col-span-2">
        Excluded sectors (comma-separated)
        <input
          value={form.excludedSectors}
          onChange={(e) => onChange({ ...form, excludedSectors: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-sky-600 focus:outline-none"
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-slate-400 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => onChange({ ...form, isDefault: e.target.checked })}
          className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-950"
        />
        Make this the default lens (clears the default flag on any other lens)
      </label>

      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-sky-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-slate-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
