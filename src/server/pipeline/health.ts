import { prisma } from '@/server/db'
import type { PipelineError } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

export type SourceOutcome = {
  sourceId: string
  outcome: 'SUCCESS' | 'FAILED' | 'SKIPPED_UNSUPPORTED'
  documentsStored: number
  /** Present on FAILED: the fetch/collect error, persisted (truncated) on
   *  SourceHealth.notes so per-source failure detail survives past the scan. */
  errorMessage?: string
}

const MAX_ERROR_NOTE_LENGTH = 300

export async function updateSourceHealth(
  outcomes: SourceOutcome[],
): Promise<{ errors: PipelineError[] }> {
  const errors: PipelineError[] = []
  for (const o of outcomes) {
    try {
      const existing = await prisma.sourceHealth.findUnique({ where: { sourceId: o.sourceId } })
      let data: Record<string, unknown>
      if (o.outcome === 'SUCCESS') {
        // A source that has never produced a document can never be HEALTHY.
        const everProduced = o.documentsStored > 0 || existing?.status === 'HEALTHY'
        data = {
          status: everProduced ? 'HEALTHY' : 'DEGRADED',
          healthScore: everProduced ? 1 : 0.5,
          failureCount: 0,
          lastSuccessfulFetchAt: new Date(),
          documentsStoredLastRun: o.documentsStored,
          notes: everProduced ? null : 'Fetch succeeded but has not produced any documents yet.',
        }
      } else if (o.outcome === 'FAILED') {
        const failureCount = (existing?.failureCount ?? 0) + 1
        data = {
          status: failureCount >= 2 ? 'FAILING' : 'DEGRADED',
          healthScore: Math.max(0, round2(1 - 0.34 * failureCount)),
          failureCount,
          lastFailedFetchAt: new Date(),
          documentsStoredLastRun: 0,
          // Keep the failure reason on the health row — an operator looking at
          // a DEGRADED source should not have to dig through ScanRun.errorsJson.
          notes: o.errorMessage ? `Last failure: ${o.errorMessage.slice(0, MAX_ERROR_NOTE_LENGTH)}` : null,
        }
      } else {
        data = {
          status: 'UNSUPPORTED',
          healthScore: 0,
          documentsStoredLastRun: 0,
          notes: 'No compatible collector.',
        }
      }
      await prisma.sourceHealth.upsert({
        where: { sourceId: o.sourceId },
        create: { sourceId: o.sourceId, ...data },
        update: data,
      })
    } catch (err) {
      errors.push({
        stage: 'health',
        sourceId: o.sourceId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { errors }
}
