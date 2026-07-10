import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { freezePredictions, updateOpenFinalProbabilities } from '@/server/outcome/ledger'
import { synthesiseContext } from '@/server/consequence/context'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const NOW = new Date('2026-07-10T12:00:00Z')
const DAY_MS = 86_400_000

async function eventWithScenarios() {
  const { event } = await makeEventGraph('The company is cutting 500 jobs in Manchester.')
  await synthesiseContext(event.id)
  return event
}

describe('prediction ledger (Stage 11)', () => {
  beforeEach(resetDb)

  it('freezes 1 EVENT + 4 SCENARIO predictions per event; LOW_CONFIDENCE never graded', async () => {
    const event = await eventWithScenarios()
    const res = await freezePredictions([event], NOW)
    expect(res.errors).toEqual([])
    expect(res.created).toBe(5)
    const rows = await prisma.outcomePrediction.findMany({ where: { eventCandidateId: event.id } })
    expect(rows.filter((r) => r.subjectKind === 'EVENT')).toHaveLength(1)
    expect(
      rows
        .filter((r) => r.subjectKind === 'SCENARIO')
        .map((r) => r.scenarioType)
        .sort(),
    ).toEqual(['ACCELERATED', 'BASE_CASE', 'CONSERVATIVE', 'REVERSAL'])
    expect(rows.every((r) => r.status === 'OPEN')).toBe(true)
    // deadline default: firstDetectedAt + 90d (no timeWindowEnd on the factory event)
    const ev = rows.find((r) => r.subjectKind === 'EVENT')!
    const expected = new Date(event.firstDetectedAt.getTime() + 90 * DAY_MS)
    expect(Math.abs(ev.deadline.getTime() - expected.getTime())).toBeLessThan(1000)
    expect(ev.predictedProbability).toBe(event.probability)
  })

  it('uses timeWindowEnd + 7d grace when the event has a time window', async () => {
    const event = await eventWithScenarios()
    const windowEnd = new Date('2026-08-01T00:00:00Z')
    await prisma.eventCandidate.update({ where: { id: event.id }, data: { timeWindowEnd: windowEnd } })
    await freezePredictions([event], NOW)
    const ev = await prisma.outcomePrediction.findFirstOrThrow({
      where: { eventCandidateId: event.id, subjectKind: 'EVENT' },
    })
    expect(ev.deadline.getTime()).toBe(windowEnd.getTime() + 7 * DAY_MS)
  })

  it('is idempotent and immutable across re-freezes; scenario wipe cannot lose receipts', async () => {
    const event = await eventWithScenarios()
    await freezePredictions([event], NOW)
    const first = await prisma.outcomePrediction.findMany({ orderBy: { dedupeKey: 'asc' } })
    // A later scan bumps the probability and wipes/rebuilds the scenarios
    // (context.ts deleteMany) — the frozen receipts must not move.
    await prisma.eventCandidate.update({ where: { id: event.id }, data: { probability: 0.9 } })
    await synthesiseContext(event.id)
    const again = await freezePredictions([event], new Date(NOW.getTime() + DAY_MS))
    expect(again.created).toBe(0) // no duplicates
    const second = await prisma.outcomePrediction.findMany({ orderBy: { dedupeKey: 'asc' } })
    expect(second.map((r) => r.predictedProbability)).toEqual(first.map((r) => r.predictedProbability))
    expect(second.map((r) => r.predictedAt.getTime())).toEqual(first.map((r) => r.predictedAt.getTime()))
  })

  it('updateOpenFinalProbabilities tracks drift without touching the frozen value', async () => {
    const event = await eventWithScenarios()
    await freezePredictions([event], NOW)
    const frozen = await prisma.outcomePrediction.findFirstOrThrow({
      where: { eventCandidateId: event.id, subjectKind: 'EVENT' },
    })
    await prisma.eventCandidate.update({ where: { id: event.id }, data: { probability: 0.85 } })
    await synthesiseContext(event.id) // scenario confidences recomputed
    const res = await updateOpenFinalProbabilities()
    expect(res.errors).toEqual([])
    const ev = await prisma.outcomePrediction.findFirstOrThrow({
      where: { eventCandidateId: event.id, subjectKind: 'EVENT' },
    })
    expect(ev.finalProbability).toBe(0.85)
    expect(ev.predictedProbability).toBe(frozen.predictedProbability)
  })

  it('propagates isFixture and freezes a baseline + dimensions snapshot', async () => {
    const event = await eventWithScenarios()
    await prisma.eventCandidate.update({ where: { id: event.id }, data: { isFixture: true } })
    await freezePredictions([{ id: event.id }], NOW)
    const ev = await prisma.outcomePrediction.findFirstOrThrow({ where: { subjectKind: 'EVENT' } })
    expect(ev.isFixture).toBe(true)
    const baseline = JSON.parse(ev.baselineJson)
    expect(Array.isArray(baseline.groups)).toBe(true)
    expect(Array.isArray(baseline.entityIds)).toBe(true)
    expect(Array.isArray(baseline.supportDays)).toBe(true)
    expect(typeof baseline.contradictionCount).toBe('number')
    const dims = JSON.parse(ev.dimensionsJson)
    expect(typeof dims.authority).toBe('number')
    expect(JSON.parse(ev.evidenceIdsJson).length).toBeGreaterThan(0)
  })
})
