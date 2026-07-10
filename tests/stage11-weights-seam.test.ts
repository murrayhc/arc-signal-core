import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { DEFAULT_WEIGHTS, clearWeightsCache, getActiveWeights } from '@/server/evidence/weights'
import { assessReliability, scoreReliability } from '@/server/evidence/reliability'
import { resetDb } from './helpers'
import { makeAtomicClaim, makeCanonicalClaim, makeDocument, makeLineage, makeSource } from './factories'

describe('active-weights seam (Stage 11)', () => {
  beforeEach(async () => {
    await resetDb()
    clearWeightsCache()
  })

  it('returns defaults with no applied suggestion (deterministic invariant)', async () => {
    expect(await getActiveWeights()).toEqual(DEFAULT_WEIGHTS)
    expect(DEFAULT_WEIGHTS).toEqual({
      authority: 0.26,
      independence: 0.28,
      support: 0.12,
      specificity: 0.14,
      freshness: 0.12,
      originTrace: 0.08,
    })
  })

  it('a SUGGESTED (unapplied) suggestion changes nothing; APPLIED takes effect', async () => {
    const weights = { ...DEFAULT_WEIGHTS, authority: 0.31, independence: 0.23 }
    const s = await prisma.reliabilityWeightSuggestion.create({
      data: {
        scanRunId: 'x',
        basedOnResolvedCount: 30,
        currentWeightsJson: JSON.stringify(DEFAULT_WEIGHTS),
        suggestedWeightsJson: JSON.stringify(weights),
        expectedBrierImprovement: 0.01,
      },
    })
    clearWeightsCache()
    expect(await getActiveWeights()).toEqual(DEFAULT_WEIGHTS) // owner-gated
    await prisma.reliabilityWeightSuggestion.update({
      where: { id: s.id },
      data: { status: 'APPLIED', appliedAt: new Date() },
    })
    clearWeightsCache()
    expect(await getActiveWeights()).toEqual(weights)
  })

  it('malformed applied weights fall back to defaults', async () => {
    await prisma.reliabilityWeightSuggestion.create({
      data: {
        scanRunId: 'x',
        basedOnResolvedCount: 30,
        currentWeightsJson: '{}',
        suggestedWeightsJson: '{"authority": "not-a-number"}',
        expectedBrierImprovement: 0.01,
        status: 'APPLIED',
        appliedAt: new Date(),
      },
    })
    clearWeightsCache()
    expect(await getActiveWeights()).toEqual(DEFAULT_WEIGHTS)
  })

  it('assessReliability computes without persisting; scoreReliability persists the same result', async () => {
    const source = await makeSource({ category: 'REGULATOR' })
    const doc = await makeDocument(source.id)
    const canonical = await makeCanonicalClaim()
    await makeAtomicClaim({ documentId: doc.id, sourceId: source.id, canonicalClaimId: canonical.id })
    await makeLineage(canonical.id, source.id, doc.id, { relationToOrigin: 'ORIGIN_CANDIDATE', publishedAt: new Date() })

    const before = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: canonical.id } })
    const assessed = await assessReliability(canonical.id)
    const after = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: canonical.id } })
    expect(after.reliabilityScore).toBe(before.reliabilityScore) // no write
    expect(after.factualityLabel).toBe(before.factualityLabel)

    const scored = await scoreReliability(canonical.id)
    expect(scored.result.reliabilityScore).toBeCloseTo(assessed.result.reliabilityScore, 10)
    expect(scored.result.factualityLabel).toBe(assessed.result.factualityLabel)
    const persisted = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: canonical.id } })
    expect(persisted.reliabilityScore).toBeCloseTo(assessed.result.reliabilityScore, 10)
  })
})
