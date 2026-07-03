import Link from 'next/link'
import type { DashboardData } from '@/server/services/dashboard'
import { timeUk } from './chrome'

/**
 * The scan outcome as a compact instrument line instead of a page-dominating
 * banner. Errors stay one click away (native <details>), warnings stay quieter,
 * full history stays linked. Anchored so the top-bar alert chip can jump here.
 */
export function ScanStatusCompact({ lastScan }: { lastScan: DashboardData['lastScan'] }) {
  if (!lastScan) {
    return (
      <p id="scan-status" className="text-[11px] text-ink-faint">
        No scans yet — run the first intelligence scan to populate the radar.
      </p>
    )
  }

  const issues = lastScan.errors.length
  const clean = issues === 0

  return (
    <div id="scan-status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      <span className={`flex items-center gap-1.5 ${clean ? 'text-teal' : 'text-warn'}`}>
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${clean ? 'bg-teal' : 'bg-warn'}`} />
        Scan {lastScan.status.replace(/_/g, ' ').toLowerCase()}
        {!clean && ` · ${issues} issue${issues === 1 ? '' : 's'}`}
      </span>
      <span className="font-data text-ink-faint">
        {timeUk(lastScan.startedAt)} · {lastScan.documentsFetched} documents ·{' '}
        {lastScan.eventCandidatesCreated} new events
      </span>
      {lastScan.warnings.length > 0 && (
        <span className="text-ink-faint">{lastScan.warnings.length} expected skips</span>
      )}
      {!clean && (
        <details className="relative">
          <summary className="cursor-pointer list-none text-warn underline decoration-warn/40 underline-offset-2 hover:text-ink [&::-webkit-details-marker]:hidden">
            View details
          </summary>
          <div className="absolute left-0 top-full z-30 mt-1 w-max max-w-96 border border-warn/40 bg-abyss p-2.5 shadow-xl shadow-black/50">
            <ul className="list-inside list-disc space-y-0.5 text-warn/90">
              {lastScan.errors.slice(0, 5).map((e, i) => (
                <li key={i}>
                  [{e.stage}] {e.message}
                </li>
              ))}
            </ul>
            {lastScan.warnings.length > 0 && (
              <p className="mt-1.5 text-ink-faint">
                Skips: {lastScan.warnings.slice(0, 3).map((w) => w.message).join(' · ')}
              </p>
            )}
            <Link href="/scans" className="mt-1.5 inline-block text-signal hover:underline">
              Scan history →
            </Link>
          </div>
        </details>
      )}
    </div>
  )
}
