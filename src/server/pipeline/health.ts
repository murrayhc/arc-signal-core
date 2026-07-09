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

/** Deterministic per-source jitter in [0, 0.1) of the interval — spreads
 *  scheduled fetches without nondeterministic randomness. */
function jitterFraction(sourceId: string): number {
  let h = 0
  for (let i = 0; i < sourceId.length; i++) h = (h * 31 + sourceId.charCodeAt(i)) | 0
  return (Math.abs(h) % 100) / 1000
}

/** When a source is next due: its interval on success, exponential backoff
 *  (capped at 16×) on failure — a broken feed gets probed less and less
 *  often instead of hammering it every tick. */
export function computeNextScanAt(
  now: Date,
  sourceId: string,
  intervalMinutes: number,
  failureCount: number,
): Date {
  const backoff = failureCount > 0 ? Math.min(16, Math.pow(2, failureCount)) : 1
  const ms = intervalMinutes * 60_000 * backoff * (1 + jitterFraction(sourceId))
  return new Date(now.getTime() + Math.round(ms))
}

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
      // Schedule the next attempt: interval on success, backoff on failure.
      const src = await prisma.source.findUnique({
        where: { id: o.sourceId },
        select: { scanIntervalMinutes: true },
      })
      const failures = o.outcome === 'FAILED' ? Number(data.failureCount ?? 1) : 0
      await prisma.source.update({
        where: { id: o.sourceId },
        data: { nextScanAt: computeNextScanAt(new Date(), o.sourceId, src?.scanIntervalMinutes ?? 60, failures) },
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
