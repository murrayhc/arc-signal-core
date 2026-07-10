import type { OutcomePrediction } from '@prisma/client'
import { prisma } from '@/server/db'
import { COIN_FLIP_BRIER } from './constants'
import type { OutcomeError } from './types'

/**
 * The verified track record — computed ONLY from resolved, non-fixture
 * predictions. Every number here is reproducible from ledger rows; nothing is
 * estimated. UNRESOLVABLE outcomes are counted but never graded.
 */

export type CalibrationBucket = {
  lo: number
  hi: number
  n: number
  meanPredicted: number | null
  observedRate: number | null
}

export type TrackRecord = {
  counts: { open: number; pendingReview: number; resolved: number; happened: number; unresolvable: number }
  meanBrierFirst: number | null
  meanBrierFinal: number | null
  baseRate: number | null
  coinFlipBrier: number
  calibration: CalibrationBucket[]
  leadTime: { meanDays: number | null; n: number; beforeMainstreamCount: number }
  byEventType: Record<string, { n: number; happened: number; meanBrierFirst: number | null }>
  scenario: { n: number; meanBrierFirst: number | null }
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function eventTypeOf(p: OutcomePrediction): string {
  // predictionText embeds the type: `Event "…" (TYPE) materialises by …`;
  // fall back to the id prefix used by tests when the pattern is absent.
  const m = p.predictionText.match(/\(([A-Z_]+)\)/)
  if (m) return m[1]
  const idm = p.eventCandidateId.match(/^evt-([A-Z_]+)/)
  return idm ? idm[1] : 'UNKNOWN'
}

function calibrationBuckets(graded: OutcomePrediction[]): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = []
  for (let i = 0; i < 10; i++) {
    const lo = i / 10
    const hi = i === 9 ? 1.000001 : (i + 1) / 10 // top bucket includes 1.0
    const rows = graded.filter((p) => p.predictedProbability >= lo && p.predictedProbability < hi)
    buckets.push({
      lo,
      hi: Math.min(hi, 1),
      n: rows.length,
      meanPredicted: mean(rows.map((r) => r.predictedProbability)),
      observedRate: rows.length ? rows.filter((r) => r.outcome === 'HAPPENED').length / rows.length : null,
    })
  }
  return buckets
}

export async function computeTrackRecord(): Promise<TrackRecord> {
  const rows = await prisma.outcomePrediction.findMany({ where: { isFixture: false } })
  const events = rows.filter((p) => p.subjectKind === 'EVENT')
  const scenarios = rows.filter((p) => p.subjectKind === 'SCENARIO')

  const resolved = events.filter((p) => p.status === 'RESOLVED')
  const graded = resolved.filter((p) => p.outcome !== 'UNRESOLVABLE')
  const happened = graded.filter((p) => p.outcome === 'HAPPENED')

  const byEventType: TrackRecord['byEventType'] = {}
  for (const p of graded) {
    const t = eventTypeOf(p)
    byEventType[t] = byEventType[t] ?? { n: 0, happened: 0, meanBrierFirst: null }
    byEventType[t].n++
    if (p.outcome === 'HAPPENED') byEventType[t].happened++
  }
  for (const t of Object.keys(byEventType)) {
    byEventType[t].meanBrierFirst = mean(
      graded.filter((p) => eventTypeOf(p) === t && p.brierFirst != null).map((p) => p.brierFirst as number),
    )
  }

  const leads = happened.map((p) => p.leadTimeDays).filter((x): x is number => x != null)
  const scenarioGraded = scenarios.filter((p) => p.status === 'RESOLVED' && p.outcome !== 'UNRESOLVABLE')

  return {
    counts: {
      open: events.filter((p) => p.status === 'OPEN').length,
      pendingReview: events.filter((p) => p.status === 'PENDING_REVIEW').length,
      resolved: resolved.length,
      happened: happened.length,
      unresolvable: resolved.length - graded.length,
    },
    meanBrierFirst: mean(graded.map((p) => p.brierFirst).filter((x): x is number => x != null)),
    meanBrierFinal: mean(graded.map((p) => p.brierFinal).filter((x): x is number => x != null)),
    baseRate: graded.length ? happened.length / graded.length : null,
    coinFlipBrier: COIN_FLIP_BRIER,
    calibration: calibrationBuckets(graded),
    leadTime: {
      meanDays: mean(leads),
      n: leads.length,
      // The flagship stat: events that HAPPENED and were NEVER covered by a
      // mainstream source at all — Archlight had them alone.
      beforeMainstreamCount: happened.filter((p) => p.leadTimeDays == null).length,
    },
    byEventType,
    scenario: {
      n: scenarioGraded.length,
      meanBrierFirst: mean(scenarioGraded.map((p) => p.brierFirst).filter((x): x is number => x != null)),
    },
  }
}

/** One summary row per scan so the dashboard can chart the record over time. */
export async function writeTrackRecordSnapshot(scanRunId: string): Promise<{ errors: OutcomeError[] }> {
  try {
    const tr = await computeTrackRecord()
    await prisma.trackRecordSnapshot.create({
      data: {
        scanRunId,
        resolvedCount: tr.counts.resolved,
        happenedCount: tr.counts.happened,
        pendingReviewCount: tr.counts.pendingReview,
        openCount: tr.counts.open,
        meanBrierFirst: tr.meanBrierFirst,
        meanBrierFinal: tr.meanBrierFinal,
        baseRate: tr.baseRate,
        calibrationJson: JSON.stringify(tr.calibration),
        meanLeadTimeDays: tr.leadTime.meanDays,
        beforeMainstreamCount: tr.leadTime.beforeMainstreamCount,
        byEventTypeJson: JSON.stringify(tr.byEventType),
      },
    })
    return { errors: [] }
  } catch (err) {
    return { errors: [{ stage: 'outcome:snapshot', message: err instanceof Error ? err.message : String(err) }] }
  }
}
