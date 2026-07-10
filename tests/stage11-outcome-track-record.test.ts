import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { computeTrackRecord, writeTrackRecordSnapshot } from '@/server/outcome/track-record'
import { resetDb } from './helpers'

const NOW = new Date('2026-07-10T12:00:00Z')

type Row = {
  subjectKind?: string
  scenarioType?: string | null
  predicted: number
  outcome?: string | null
  status?: string
  brierFirst?: number | null
  brierFinal?: number | null
  leadTimeDays?: number | null
  isFixture?: boolean
  eventType?: string
}

let seq = 0
async function makePrediction(row: Row) {
  seq++
  const y = row.outcome === 'HAPPENED' ? 1 : 0
  const gradeable = row.outcome && row.outcome !== 'UNRESOLVABLE'
  return prisma.outcomePrediction.create({
    data: {
      subjectKind: row.subjectKind ?? 'EVENT',
      eventCandidateId: `evt-${row.eventType ?? 'LAYOFF_SIGNAL'}-${seq}`,
      scenarioType: row.scenarioType ?? null,
      dedupeKey: `k-${seq}`,
      predictionText: `Fixture prediction ${seq} (${row.eventType ?? 'LAYOFF_SIGNAL'})`,
      predictedProbability: row.predicted,
      finalProbability: row.predicted,
      predictedAt: NOW,
      deadline: NOW,
      status: row.status ?? (row.outcome ? 'RESOLVED' : 'OPEN'),
      outcome: row.outcome ?? null,
      resolvedBy: row.outcome ? 'AUTO_EVIDENCE' : null,
      resolvedAt: row.outcome ? NOW : null,
      brierFirst: row.brierFirst !== undefined ? row.brierFirst : gradeable ? (row.predicted - y) ** 2 : null,
      brierFinal: row.brierFinal !== undefined ? row.brierFinal : gradeable ? (row.predicted - y) ** 2 : null,
      leadTimeDays: row.leadTimeDays ?? null,
      isFixture: row.isFixture ?? false,
    },
  })
}

describe('track record maths (Stage 11)', () => {
  beforeEach(resetDb)

  it('computes mean Brier, base rate, calibration and lead-time from hand-computed fixtures', async () => {
    await makePrediction({ predicted: 0.8, outcome: 'HAPPENED', leadTimeDays: 4 }) // brier 0.04
    await makePrediction({ predicted: 0.3, outcome: 'DID_NOT_HAPPEN' }) // brier 0.09
    await makePrediction({ predicted: 0.75, outcome: 'HAPPENED', leadTimeDays: null }) // brier 0.0625, before-mainstream
    await makePrediction({ predicted: 0.5, outcome: 'UNRESOLVABLE' }) // excluded from maths
    await makePrediction({ predicted: 0.9, outcome: 'HAPPENED', isFixture: true }) // fixture — excluded everywhere
    await makePrediction({ predicted: 0.6 }) // OPEN
    await makePrediction({ predicted: 0.6, status: 'PENDING_REVIEW' })

    const tr = await computeTrackRecord()
    expect(tr.counts.resolved).toBe(4) // includes UNRESOLVABLE, excludes fixture
    expect(tr.counts.happened).toBe(2)
    expect(tr.counts.unresolvable).toBe(1)
    expect(tr.counts.open).toBe(1)
    expect(tr.counts.pendingReview).toBe(1)
    expect(tr.meanBrierFirst).toBeCloseTo((0.04 + 0.09 + 0.0625) / 3, 10)
    expect(tr.baseRate).toBeCloseTo(2 / 3, 10)
    expect(tr.coinFlipBrier).toBe(0.25)

    // calibration: 0.8 and 0.75 in [0.7,0.8) and [0.8,0.9) buckets, 0.3 in [0.3,0.4)
    const b3 = tr.calibration.find((b) => b.lo === 0.3)!
    expect(b3.n).toBe(1)
    expect(b3.observedRate).toBe(0)
    const b8 = tr.calibration.find((b) => b.lo === 0.8)!
    expect(b8.n).toBe(1)
    expect(b8.observedRate).toBe(1)

    expect(tr.leadTime.meanDays).toBeCloseTo(4, 10) // only the non-null lead time
    expect(tr.leadTime.n).toBe(1)
    expect(tr.leadTime.beforeMainstreamCount).toBe(1)

    expect(tr.byEventType.LAYOFF_SIGNAL).toBeDefined()
  })

  it('scenario predictions aggregate separately from event predictions', async () => {
    await makePrediction({ predicted: 0.7, outcome: 'HAPPENED' })
    await makePrediction({ subjectKind: 'SCENARIO', scenarioType: 'BASE_CASE', predicted: 0.6, outcome: 'HAPPENED' })
    await makePrediction({ subjectKind: 'SCENARIO', scenarioType: 'REVERSAL', predicted: 0.2, outcome: 'DID_NOT_HAPPEN' })
    const tr = await computeTrackRecord()
    expect(tr.counts.resolved).toBe(1) // event-level only in headline counts
    expect(tr.scenario.n).toBe(2)
    expect(tr.scenario.meanBrierFirst).toBeCloseTo((0.16 + 0.04) / 2, 10)
  })

  it('writes a snapshot row per scan with the same numbers', async () => {
    await makePrediction({ predicted: 0.8, outcome: 'HAPPENED', leadTimeDays: 2 })
    await makePrediction({ predicted: 0.4, outcome: 'DID_NOT_HAPPEN' })
    const res = await writeTrackRecordSnapshot('scan-1')
    expect(res.errors).toEqual([])
    const snap = await prisma.trackRecordSnapshot.findFirstOrThrow({ where: { scanRunId: 'scan-1' } })
    expect(snap.resolvedCount).toBe(2)
    expect(snap.happenedCount).toBe(1)
    expect(snap.meanBrierFirst).toBeCloseTo((0.04 + 0.16) / 2, 10)
    expect(snap.meanLeadTimeDays).toBeCloseTo(2, 10)
    expect(JSON.parse(snap.calibrationJson).length).toBe(10)
  })

  it('returns honest nulls with nothing resolved', async () => {
    const tr = await computeTrackRecord()
    expect(tr.counts.resolved).toBe(0)
    expect(tr.meanBrierFirst).toBeNull()
    expect(tr.baseRate).toBeNull()
    expect(tr.leadTime.meanDays).toBeNull()
  })
})
