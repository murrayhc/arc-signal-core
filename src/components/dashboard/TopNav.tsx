import Link from 'next/link'
import { RunScan } from './RunScan'
import { Wordmark, pct } from './chrome'

/**
 * Command-centre top bar. Nav links point ONLY at routes that exist — nothing
 * here 404s. The former floating actions (create lens / create watch market)
 * live in the Create menu; Run scan stays prominent on the right.
 */

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/graph', label: 'Living Map' },
  { href: '/interrogate', label: 'Interrogate' },
  { href: '/scans', label: 'Scans' },
  { href: '/watch', label: 'Watchlist' },
  { href: '/portfolio', label: 'Portfolio' },
]

export function TopNav({
  issueCount,
  meanConfidence,
  modelConfigured,
}: {
  issueCount: number
  meanConfidence: number | null
  modelConfigured: boolean
}) {
  return (
    <header className="relative z-30 flex h-12 items-center gap-4 border-b border-line bg-void/80 px-4 backdrop-blur-sm">
      <Link href="/" className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal">
        <Wordmark />
        <span className="leading-none">
          <span className="block font-display text-sm font-semibold tracking-[0.28em] text-ink">
            ARCHLIGHT
          </span>
          <span className="mt-0.5 block font-display text-[8px] font-medium uppercase tracking-[0.3em] text-ink-faint">
            Live intelligence engine
          </span>
        </span>
      </Link>

      <nav aria-label="Primary" className="ml-6 hidden items-center gap-1 md:flex">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-2.5 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${
              item.href === '/'
                ? 'border-b border-signal text-ink'
                : 'text-ink-dim hover:text-ink'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {/* System / model readout — honest about dormancy */}
        <div className="hidden items-center gap-3 border-r border-line pr-3 lg:flex">
          <p className="text-right leading-none">
            <span className="block font-data text-xs font-semibold text-ink">
              {meanConfidence === null ? '—' : pct(meanConfidence)}
            </span>
            <span className="block text-[9px] uppercase tracking-wider text-ink-faint">
              System confidence
            </span>
          </p>
          <p className="text-right leading-none">
            <span className={`block font-data text-xs font-semibold ${modelConfigured ? 'text-violet' : 'text-ink-faint'}`}>
              {modelConfigured ? 'ACTIVE' : 'DORMANT'}
            </span>
            <span className="block text-[9px] uppercase tracking-wider text-ink-faint">LLM layer</span>
          </p>
        </div>

        {/* Alerts: real issue count from the last scan, linked to the detail module */}
        <a
          href="#scan-status"
          className={`flex items-center gap-1.5 border px-2 py-1 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal ${
            issueCount > 0
              ? 'border-warn/50 text-warn hover:bg-warn/10'
              : 'border-line text-ink-faint hover:text-ink-dim'
          }`}
        >
          <svg viewBox="0 0 16 16" fill="none" aria-hidden className="h-3 w-3">
            <path d="M8 2a4 4 0 0 0-4 4v3l-1.2 2h10.4L12 9V6a4 4 0 0 0-4-4Z" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span className="font-data">{issueCount}</span>
          <span className="sr-only">scan issues — view detail</span>
        </a>

        {/* Create menu: the preserved lens / watch-market actions */}
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 border border-line px-2.5 py-1 text-[11px] text-ink-dim transition hover:border-line-bright hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="text-signal">+</span> Create
          </summary>
          <div className="absolute right-0 top-full z-40 mt-1 w-44 border border-line bg-abyss py-1 shadow-xl shadow-black/50">
            <Link href="/lenses" className="block px-3 py-1.5 text-xs text-ink-dim hover:bg-line/40 hover:text-ink">
              Revenue lens
            </Link>
            <Link href="/watch" className="block px-3 py-1.5 text-xs text-ink-dim hover:bg-line/40 hover:text-ink">
              Watch market
            </Link>
          </div>
        </details>

        <RunScan />
      </div>
    </header>
  )
}
