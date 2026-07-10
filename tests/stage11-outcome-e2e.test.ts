import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { resetDb } from './helpers'

describe('outcome resolution end-to-end (Stage 11)', () => {
  beforeEach(resetDb)

  it('a full fixture scan freezes prediction receipts; a re-scan never duplicates or mutates them', async () => {
    await runSeed({ includeLive: false })
    const first = await runFullScan()
    expect(first.counts.predictionsCreated).toBeGreaterThan(0)

    const events = await prisma.eventCandidate.findMany()
    for (const event of events) {
      const row = await prisma.outcomePrediction.findFirst({
        where: { eventCandidateId: event.id, subjectKind: 'EVENT' },
      })
      expect(row, `event ${event.title} has a frozen EVENT prediction`).not.toBeNull()
      expect(row!.isFixture).toBe(event.isFixture) // fixture flag propagates end-to-end
    }
    const frozen = await prisma.outcomePrediction.findMany({ orderBy: { dedupeKey: 'asc' } })

    const second = await runFullScan()
    expect(second.counts.predictionsCreated).toBe(0) // idempotent — no receipt duplication
    const after = await prisma.outcomePrediction.findMany({ orderBy: { dedupeKey: 'asc' } })
    expect(after.map((r) => r.id)).toEqual(frozen.map((r) => r.id))
    expect(after.map((r) => r.predictedProbability)).toEqual(frozen.map((r) => r.predictedProbability))
    expect(after.map((r) => r.predictedAt.getTime())).toEqual(frozen.map((r) => r.predictedAt.getTime()))
  })
})
