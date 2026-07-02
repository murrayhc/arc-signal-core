import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'

export async function POST() {
  const running = await prisma.scanRun.findFirst({ where: { status: 'RUNNING' } })
  if (running) {
    return Response.json(
      { error: 'A scan is already running', scanRunId: running.id },
      { status: 409 },
    )
  }
  const summary = await runFullScan()
  return Response.json(summary, { status: 201 })
}
