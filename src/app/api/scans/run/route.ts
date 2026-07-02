import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'

const STALE_SCAN_MS = 10 * 60 * 1000

export async function POST() {
  const running = await prisma.scanRun.findFirst({ where: { status: 'RUNNING' } })
  if (running) {
    if (Date.now() - running.startedAt.getTime() < STALE_SCAN_MS) {
      return Response.json(
        { error: 'A scan is already running', scanRunId: running.id },
        { status: 409 },
      )
    }
    // A RUNNING row this old means the process died mid-scan; unblock the button.
    const staleErrors = [
      ...JSON.parse(running.errorsJson),
      { stage: 'orchestrator', message: 'Scan marked FAILED: stale RUNNING row (process likely restarted mid-scan)' },
    ]
    await prisma.scanRun.update({
      where: { id: running.id },
      data: { status: 'FAILED', completedAt: new Date(), errorsJson: JSON.stringify(staleErrors) },
    })
  }
  const summary = await runFullScan()
  return Response.json(summary, { status: summary.status === 'FAILED' ? 500 : 201 })
}
