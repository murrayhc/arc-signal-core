/**
 * Continuous-scan worker — the piece that makes "living radar" literally true.
 *
 * Ticks on an interval (default 5 minutes); on each tick, if any active
 * source is DUE (nextScanAt null or past), runs a dueOnly scan: only due
 * sources are fetched, everything downstream (claims → reliability → events
 * → consequence → graph) runs as normal. Per-source cadence and failure
 * backoff live on the Source rows (health.ts computeNextScanAt).
 *
 *   npm run worker            # default 5-minute tick
 *   WORKER_TICK_SECONDS=60 npm run worker
 *
 * Local-first: a plain long-running node process, no external cron, clean
 * SIGINT/SIGTERM shutdown. Overlap-safe: skips a tick while a scan is still
 * running.
 */
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'

const tickSeconds = Number(process.env.WORKER_TICK_SECONDS ?? 300)
let running = false
let stopped = false

async function tick(): Promise<void> {
  if (running || stopped) return
  running = true
  try {
    const due = await prisma.source.count({
      where: { isActive: true, OR: [{ nextScanAt: null }, { nextScanAt: { lte: new Date() } }] },
    })
    if (due === 0) {
      console.log(`[worker] ${new Date().toISOString()} nothing due`)
      return
    }
    console.log(`[worker] ${new Date().toISOString()} ${due} source(s) due — scanning`)
    const summary = await runFullScan({ scanType: 'SCHEDULED', dueOnly: true })
    console.log(
      `[worker] scan ${summary.scanRunId} ${summary.status}: ` +
        `${summary.counts.documentsFetched} doc(s), ${summary.counts.signalsCreated} signal(s) ` +
        `(${summary.counts.signalsQuarantined} quarantined), ` +
        `${summary.counts.eventCandidatesCreated} new / ${summary.counts.eventCandidatesUpdated} updated event(s), ` +
        `${summary.errors.length} error(s)`,
    )
  } catch (err) {
    console.error('[worker] tick failed:', err instanceof Error ? err.message : err)
  } finally {
    running = false
  }
}

async function main() {
  console.log(`[worker] starting — tick every ${tickSeconds}s, Ctrl-C to stop`)
  await tick() // immediate first pass
  const interval = setInterval(tick, tickSeconds * 1000)
  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received — draining`)
    stopped = true
    clearInterval(interval)
    // Give an in-flight scan a moment to finish before disconnecting.
    while (running) await new Promise((r) => setTimeout(r, 500))
    await prisma.$disconnect()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

void main()
