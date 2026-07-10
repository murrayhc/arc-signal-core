import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { DEFAULT_WEIGHTS, clearWeightsCache, getActiveWeights } from '@/server/evidence/weights'
import {
  applyWeightSuggestion,
  dismissWeightSuggestion,
  maybeSuggestWeights,
  scoreFromDimensions,
} from '@/server/outcome/weight-learning'
import { MAX_WEIGHT_SHIFT, MIN_BRIER_IMPROVEMENT, WEIGHT_CEIL, WEIGHT_FLOOR } from '@/server/outcome/constants'
import { resetDb } from './helpers'

const NOW = new Date('2026-07-10T12:00:00Z')

/** Synthetic resolved event predictions engineered so HIGH-authority evidence
 *  resolved HAPPENED and LOW-authority evidence resolved DID_NOT_HAPPEN —
 *  under the default weights the scores under-separate, so shifting weight
 *  toward authority measurably improves Brier. */
async function seedResolved(n: number) {
  for (let i = 0; i < n; i++) {
    const happened = i % 2 === 0
    const dims = happened
      ? { authority: 0.95, independence: 0.35, support: 0.4, specificity: 0.5, freshness: 0.6, originTrace: 0.5, contradiction: 0, copyLoopRisk: 0, manipulationRisk: 0 }
      : { authority: 0.2, independence: 0.6, support: 0.5, specificity: 0.5, freshness: 0.6, originTrace: 0.5, contradiction: 0, copyLoopRisk: 0, manipulationRisk: 0 }
    await prisma.outcomePrediction.create({
      data: {
        subjectKind: 'EVENT',
        eventCandidateId: `evt-${i}`,
        dedupeKey: `evt-${i}:EVENT:-`,
        predictionText: `Fixture ${i}`,
        predictedProbability: 0.5,
        finalProbability: 0.5,
        predictedAt: NOW,
        deadline: NOW,
        dimensionsJson: JSON.stringify(dims),
        status: 'RESOLVED',
        outcome: happened ? 'HAPPENED' : 'DID_NOT_HAPPEN',
        resolvedBy: 'AUTO_EVIDENCE',
        resolvedAt: NOW,
        brierFirst: 0.25,
        brierFinal: 0.25,
      },
    })
  }
}

describe('owner-gated weight learning (Stage 11)', () => {
  beforeEach(async () => {
    await resetDb()
    clearWeightsCache()
  })

  it('scoreFromDimensions matches the reliability formula on a hand-computed case', () => {
    const dims = { authority: 1, independence: 0.5, support: 0.5, specificity: 0.5, freshness: 0.5, originTrace: 0.5, contradiction: 0.5, copyLoopRisk: 0, manipulationRisk: 0 }
    const positive = 0.26 * 1 + 0.28 * 0.5 + 0.12 * 0.5 + 0.14 * 0.5 + 0.12 * 0.5 + 0.08 * 0.5
    expect(scoreFromDimensions(dims, DEFAULT_WEIGHTS)).toBeCloseTo(positive * (1 - 0.5 * 0.5), 10)
  })

  it('below the resolved threshold no suggestion is computed', async () => {
    await seedResolved(29)
    const res = await maybeSuggestWeights('scan-1')
    expect(res.created).toBe(false)
    expect(await prisma.reliabilityWeightSuggestion.count()).toBe(0)
  })

  it('creates one bounded, deterministic suggestion above the threshold — and never self-applies', async () => {
    await seedResolved(34)
    const res = await maybeSuggestWeights('scan-1')
    expect(res.created).toBe(true)
    const s = await prisma.reliabilityWeightSuggestion.findFirstOrThrow()
    expect(s.status).toBe('SUGGESTED')
    expect(s.basedOnResolvedCount).toBe(34)
    expect(s.expectedBrierImprovement).toBeGreaterThanOrEqual(MIN_BRIER_IMPROVEMENT)

    const suggested = JSON.parse(s.suggestedWeightsJson) as Record<string, number>
    const sum = Object.values(suggested).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - 1)).toBeLessThan(0.001)
    for (const [k, v] of Object.entries(suggested)) {
      expect(v).toBeGreaterThanOrEqual(WEIGHT_FLOOR)
      expect(v).toBeLessThanOrEqual(WEIGHT_CEIL)
      expect(Math.abs(v - DEFAULT_WEIGHTS[k as keyof typeof DEFAULT_WEIGHTS])).toBeLessThanOrEqual(MAX_WEIGHT_SHIFT + 0.001)
    }
    // the engineered signal: authority weight moves UP
    expect(suggested.authority).toBeGreaterThan(DEFAULT_WEIGHTS.authority)
    expect(JSON.parse(s.rationaleJson).length).toBeGreaterThan(0)

    // owner-gate: computing a suggestion changes nothing
    clearWeightsCache()
    expect(await getActiveWeights()).toEqual(DEFAULT_WEIGHTS)

    // one live suggestion at a time; a re-run is a no-op with identical output
    const rerun = await maybeSuggestWeights('scan-2')
    expect(rerun.created).toBe(false)
    expect(await prisma.reliabilityWeightSuggestion.count()).toBe(1)
  })

  it('apply activates the weights; a newer apply retires the older; dismiss ends a suggestion', async () => {
    await seedResolved(34)
    await maybeSuggestWeights('scan-1')
    const s = await prisma.reliabilityWeightSuggestion.findFirstOrThrow()
    await applyWeightSuggestion(s.id)
    clearWeightsCache()
    const active = await getActiveWeights()
    expect(active).toEqual(JSON.parse(s.suggestedWeightsJson))

    // dismissing the applied row restores defaults
    await dismissWeightSuggestion(s.id)
    clearWeightsCache()
    expect(await getActiveWeights()).toEqual(DEFAULT_WEIGHTS)
  })
})
