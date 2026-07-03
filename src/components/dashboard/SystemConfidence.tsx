import { Eyebrow, Panel, pct } from './chrome'

/** Semicircular confidence dial — pure SVG, stroke length ∝ value. */
function Dial({ value }: { value: number }) {
  const radius = 34
  const circumference = Math.PI * radius
  return (
    <svg viewBox="0 0 84 48" className="h-16 w-28" aria-hidden>
      <path
        d="M 8 44 A 34 34 0 0 1 76 44"
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M 8 44 A 34 34 0 0 1 76 44"
        fill="none"
        stroke="var(--color-signal)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${circumference * Math.max(0, Math.min(1, value))} ${circumference}`}
      />
      <text
        x="42"
        y="42"
        textAnchor="middle"
        fill="var(--color-ink)"
        style={{ font: '600 13px var(--font-plex-mono, monospace)' }}
      >
        {pct(value)}
      </text>
    </svg>
  )
}

/**
 * System confidence: mean event confidence (the dial), plus the honest state
 * of every layer — sources, deterministic model, dormant LLM and market data.
 */
export function SystemConfidence({
  meanConfidence,
  highConfidenceShare,
  eventCount,
  healthySources,
  totalSources,
  llmConfigured,
  marketConfigured,
  lastScanStatus,
}: {
  meanConfidence: number | null
  highConfidenceShare: number | null
  eventCount: number
  healthySources: number
  totalSources: number
  llmConfigured: boolean
  marketConfigured: boolean
  lastScanStatus: string | null
}) {
  const rows: { label: string; value: string; tone?: string }[] = [
    {
      label: 'High-confidence events',
      value: highConfidenceShare === null ? '—' : pct(highConfidenceShare),
    },
    { label: 'Events tracked', value: String(eventCount) },
    {
      label: 'Source coverage',
      value: `${healthySources}/${totalSources}`,
      tone: healthySources === totalSources ? 'text-teal' : 'text-warn',
    },
    {
      label: 'Last scan',
      value: lastScanStatus ? lastScanStatus.replace(/_/g, ' ').toLowerCase() : 'none',
    },
    { label: 'Deterministic engine', value: 'active', tone: 'text-teal' },
    {
      label: 'LLM interpretation',
      value: llmConfigured ? 'active' : 'dormant',
      tone: llmConfigured ? 'text-violet' : undefined,
    },
    {
      label: 'Market data',
      value: marketConfigured ? 'active' : 'not configured',
      tone: marketConfigured ? 'text-teal' : undefined,
    },
  ]

  return (
    <Panel className="flex flex-col">
      <div className="border-b border-line/70 px-3 py-2">
        <Eyebrow accent="text-signal">System confidence</Eyebrow>
      </div>
      <div className="flex items-center justify-center pt-2">
        {meanConfidence === null ? (
          <p className="py-4 text-xs text-ink-faint">No events yet.</p>
        ) : (
          <Dial value={meanConfidence} />
        )}
      </div>
      <dl className="space-y-1 px-3 pb-2.5 pt-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2 text-[10px]">
            <dt className="uppercase tracking-wider text-ink-faint">{row.label}</dt>
            <dd className={`font-data ${row.tone ?? 'text-ink-dim'}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  )
}
