'use client'

import { useEffect, useState } from 'react'

export type TickerItem = {
  label: string
  value: string
  tone?: 'signal' | 'gold' | 'risk' | 'warn' | 'teal' | 'faint'
}

const TONE: Record<NonNullable<TickerItem['tone']>, string> = {
  signal: 'text-signal',
  gold: 'text-gold',
  risk: 'text-risk',
  warn: 'text-warn',
  teal: 'text-teal',
  faint: 'text-ink-faint',
}

/**
 * Bottom global-pulse strip. Items are built server-side from real data (top
 * signal movements, source health, provider status — including the honest
 * "not configured" placeholders). The clock is mount-gated: server and first
 * client render both show the placeholder, so hydration output matches.
 */
export function GlobalPulseTicker({ items }: { items: TickerItem[] }) {
  const [now, setNow] = useState<string | null>(null)

  useEffect(() => {
    const tick = () =>
      setNow(new Date().toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false }))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  function renderItems(hidden: boolean) {
    return (
      <span
        aria-hidden={hidden || undefined}
        className={`flex shrink-0 items-center ${hidden ? 'cc-ticker-dup' : ''}`}
      >
        {items.map((item, i) => (
          <span key={`${hidden ? 'b' : 'a'}-${i}`} className="flex shrink-0 items-center gap-1.5 px-5">
            <span className="text-[9px] uppercase tracking-wider text-ink-faint">{item.label}</span>
            <span className={`font-data text-[11px] ${TONE[item.tone ?? 'faint']}`}>{item.value}</span>
          </span>
        ))}
      </span>
    )
  }

  return (
    <footer className="relative z-30 flex h-8 items-center overflow-hidden border-t border-line bg-void/90">
      <p className="relative z-10 flex h-full shrink-0 items-center gap-2 border-r border-line bg-void px-3">
        <span aria-hidden className="cc-live h-1.5 w-1.5 rounded-full bg-signal" />
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.24em] text-ink-dim">
          Global pulse
        </span>
        <span className="font-data text-[11px] text-signal" suppressHydrationWarning>
          {now ?? '··:··:··'}
        </span>
        <span className="text-[9px] uppercase text-ink-faint">UTC</span>
      </p>
      {/* Viewport becomes horizontally scrollable (and the duplicate copy is
          hidden) under prefers-reduced-motion — see globals.css */}
      <div className="cc-ticker-viewport min-w-0 flex-1 overflow-hidden">
        <div className="cc-ticker-track flex w-max items-center whitespace-nowrap">
          {renderItems(false)}
          {renderItems(true)}
        </div>
      </div>
    </footer>
  )
}
