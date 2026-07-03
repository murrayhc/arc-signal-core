import Link from 'next/link'
import { Eyebrow, timeUk } from './chrome'

/**
 * Persistent left rail. Grouped by what the operator is doing (monitor /
 * commercial / system); every href is a real route or an on-page anchor.
 * The live status block at the bottom replaces the old page-level warning
 * banner as the system's first impression.
 */

type NavItem = { href: string; label: string; icon: React.ReactNode }

const stroke = { stroke: 'currentColor', strokeWidth: 1.3, fill: 'none' } as const

const MONITOR: NavItem[] = [
  { href: '/', label: 'Overview', icon: <rect x="2.5" y="2.5" width="11" height="11" {...stroke} /> },
  { href: '/graph', label: 'Living Map', icon: <g {...stroke}><circle cx="4" cy="12" r="1.5" /><circle cx="12" cy="4" r="1.5" /><circle cx="12" cy="12" r="1.5" /><path d="M5.3 11 10.7 5M5.5 12h5" /></g> },
  { href: '#trend-signals', label: 'Signals', icon: <path d="M2 12l3-4 3 2 3-6 3 4" {...stroke} /> },
  { href: '/scans', label: 'Scans', icon: <g {...stroke}><circle cx="8" cy="8" r="5.5" /><path d="M8 8l3.5-2" /></g> },
]

const COMMERCIAL: NavItem[] = [
  { href: '#active-opportunities', label: 'Opportunities', icon: <path d="M8 2l1.8 4.2L14 8l-4.2 1.8L8 14l-1.8-4.2L2 8l4.2-1.8Z" {...stroke} /> },
  { href: '#top-risks', label: 'Risks', icon: <g {...stroke}><path d="M8 2.5 14 13H2Z" /><path d="M8 7v3" /></g> },
  { href: '/watch', label: 'Watchlist', icon: <g {...stroke}><path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4Z" /><circle cx="8" cy="8" r="1.8" /></g> },
  { href: '/portfolio', label: 'Portfolio', icon: <g {...stroke}><rect x="2.5" y="5" width="11" height="8" /><path d="M6 5V3.5h4V5" /></g> },
  { href: '/lenses', label: 'Lenses', icon: <g {...stroke}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></g> },
]

const SYSTEM: NavItem[] = [
  { href: '/admin/sources', label: 'Data Hub', icon: <g {...stroke}><ellipse cx="8" cy="4" rx="5.5" ry="2" /><path d="M2.5 4v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4" /></g> },
  { href: '/admin/llm', label: 'Model', icon: <g {...stroke}><rect x="4" y="4" width="8" height="8" /><path d="M8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5" /></g> },
  { href: '/admin/market', label: 'Market data', icon: <g {...stroke}><path d="M2 13.5h12" /><path d="M4 13V9M8 13V6M12 13V3.5" /></g> },
]

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="px-3 pt-4">
      <Eyebrow>{title}</Eyebrow>
      <ul className="mt-1.5 space-y-0.5">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="group flex items-center gap-2.5 px-1.5 py-1 text-xs text-ink-dim transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
            >
              <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 shrink-0 text-ink-faint transition group-hover:text-signal">
                {item.icon}
              </svg>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SideNav({
  lastScan,
  activeSources,
  healthySources,
  totalSources,
}: {
  lastScan: { startedAt: string; status: string; errorCount: number } | null
  activeSources: number
  healthySources: number
  totalSources: number
}) {
  const scanHealthy = lastScan !== null && lastScan.errorCount === 0 && lastScan.status.startsWith('COMPLETED')
  return (
    <nav
      aria-label="Sections"
      className="hidden w-48 shrink-0 flex-col justify-between border-r border-line bg-void/60 lg:flex"
    >
      <div>
        <NavGroup title="Monitor" items={MONITOR} />
        <NavGroup title="Commercial" items={COMMERCIAL} />
        <NavGroup title="System" items={SYSTEM} />
      </div>

      {/* Live status block */}
      <div className="border-t border-line px-3 py-3 text-[10px] leading-relaxed text-ink-faint">
        <p className="flex items-center gap-1.5 text-ink-dim">
          <span aria-hidden className="cc-live h-1.5 w-1.5 rounded-full bg-teal" />
          System online
        </p>
        <p className="mt-1">
          Data feeds <span className="font-data text-ink-dim">{activeSources}</span> active
        </p>
        <p>
          Source health{' '}
          <span className="font-data text-ink-dim">
            {healthySources}/{totalSources}
          </span>{' '}
          healthy
        </p>
        {lastScan ? (
          <>
            <p>
              Last sync <span className="font-data text-ink-dim">{timeUk(lastScan.startedAt)}</span>
            </p>
            <p className={scanHealthy ? 'text-teal/80' : 'text-warn/90'}>
              Scan {scanHealthy ? 'clean' : `${lastScan.errorCount} issue${lastScan.errorCount === 1 ? '' : 's'}`}
            </p>
          </>
        ) : (
          <p>No scans yet</p>
        )}
      </div>
    </nav>
  )
}
