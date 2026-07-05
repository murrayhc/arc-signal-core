import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { traceLineage } from '@/server/evidence/lineage'
import { scoreReliability } from '@/server/evidence/reliability'
import { resetDb } from './helpers'
import { makeAtomicClaim, makeSource } from './factories'

const NOW = new Date('2026-06-25T00:00:00Z')
const d = (s: string) => new Date(`${s}T09:00:00Z`)

async function buildCanonical(claimText: string) {
  return prisma.canonicalClaim.create({
    data: {
      claimText,
      normalisedClaimText: claimText.toLowerCase(),
      claimType: 'LAYOFF_SIGNAL',
      firstSeenAt: d('2026-06-20'),
      status: 'ACTIVE',
      repeatCount: 1,
    },
  })
}

describe('scoreReliability', () => {
  beforeEach(resetDb)

  it('scores independent corroboration above wide copying', async () => {
    // A: origin + two near-verbatim copies.
    const sA = [await makeSource({ category: 'NEWS' }), await makeSource({ category: 'NEWS' }), await makeSource({ category: 'NEWS' })]
    const canA = await buildCanonical('Voltcore will cut 400 jobs at its Manchester plant')
    await makeAtomicClaim({ canonicalClaimId: canA.id, sourceId: sA[0].id, claimText: 'Voltcore will cut 400 jobs at its Manchester plant', eventDate: d('2026-06-20'), specificityScore: 0.8 })
    await makeAtomicClaim({ canonicalClaimId: canA.id, sourceId: sA[1].id, claimText: 'Voltcore will cut 400 jobs at its Manchester plant, sources said', eventDate: d('2026-06-21'), specificityScore: 0.8 })
    await makeAtomicClaim({ canonicalClaimId: canA.id, sourceId: sA[2].id, claimText: 'Voltcore will cut 400 jobs at its Manchester plant, reports say', eventDate: d('2026-06-21'), specificityScore: 0.8 })
    await traceLineage(canA.id)
    const { result: rA } = await scoreReliability(canA.id, { now: NOW })

    // B: origin + two independently worded reports.
    const sB = [await makeSource({ category: 'NEWS' }), await makeSource({ category: 'NEWS' }), await makeSource({ category: 'NEWS' })]
    const canB = await buildCanonical('Voltcore will cut 400 jobs at its Manchester plant')
    await makeAtomicClaim({ canonicalClaimId: canB.id, sourceId: sB[0].id, claimText: 'Voltcore will cut 400 jobs at its Manchester plant', eventDate: d('2026-06-20'), specificityScore: 0.8 })
    await makeAtomicClaim({ canonicalClaimId: canB.id, sourceId: sB[1].id, claimText: 'Manchester battery maker Voltcore is shedding 400 roles', eventDate: d('2026-06-21'), specificityScore: 0.8 })
    await makeAtomicClaim({ canonicalClaimId: canB.id, sourceId: sB[2].id, claimText: 'Voltcore confirms 400 role reduction at its Manchester site', eventDate: d('2026-06-21'), specificityScore: 0.8 })
    await traceLineage(canB.id)
    const { result: rB } = await scoreReliability(canB.id, { now: NOW })

    expect(rB.reliabilityScore).toBeGreaterThan(rA.reliabilityScore)
    expect(rA.dimensions.copyLoopRisk).toBeGreaterThan(0)
    expect(rB.dimensions.copyLoopRisk).toBe(0)
    expect(rB.reasoningSummary.length).toBeGreaterThan(0)
    expect(rA.reasoningSummary.length).toBeGreaterThan(0)
  })

  it('lowers reliability when a contradiction is present', async () => {
    async function threeIndependent(withContradiction: boolean) {
      const s = [
        await makeSource({ category: 'NEWS' }),
        await makeSource({ category: 'NEWS' }),
        await makeSource({ category: 'NEWS' }),
        await makeSource({ category: 'NEWS' }),
      ]
      const can = await buildCanonical('Voltcore will cut 400 jobs at its Manchester plant')
      await makeAtomicClaim({ canonicalClaimId: can.id, sourceId: s[0].id, claimText: 'Voltcore will cut 400 jobs at its Manchester plant', eventDate: d('2026-06-20'), specificityScore: 0.8 })
      await makeAtomicClaim({ canonicalClaimId: can.id, sourceId: s[1].id, claimText: 'Manchester battery maker Voltcore is shedding 400 roles', eventDate: d('2026-06-21'), specificityScore: 0.8 })
      await makeAtomicClaim({ canonicalClaimId: can.id, sourceId: s[2].id, claimText: 'Voltcore confirms 400 role reduction at its Manchester site', eventDate: d('2026-06-21'), specificityScore: 0.8 })
      if (withContradiction) {
        await makeAtomicClaim({ canonicalClaimId: can.id, sourceId: s[3].id, claimText: 'Voltcore denies it will cut any jobs', eventDate: d('2026-06-22'), specificityScore: 0.6 })
      }
      await traceLineage(can.id)
      return (await scoreReliability(can.id, { now: NOW })).result
    }
    const clean = await threeIndependent(false)
    const disputed = await threeIndependent(true)
    expect(disputed.reliabilityScore).toBeLessThan(clean.reliabilityScore)
    expect(disputed.evidenceAgainst.length).toBeGreaterThan(0)
  })

  it('does not call a single official source WEAK, but does call a single news source WEAK', async () => {
    const official = await makeSource({ category: 'OFFICIAL', accessMethod: 'RSS' })
    const canD = await buildCanonical('The regulator fined Voltcore 5 million pounds')
    await makeAtomicClaim({ canonicalClaimId: canD.id, sourceId: official.id, claimText: 'The regulator fined Voltcore 5 million pounds', eventDate: d('2026-06-20'), specificityScore: 0.8 })
    await traceLineage(canD.id)
    const { result: rD } = await scoreReliability(canD.id, { now: NOW })
    expect(rD.factualityLabel).not.toBe('WEAK_SINGLE_SOURCE')

    const news = await makeSource({ category: 'NEWS' })
    const canE = await buildCanonical('Voltcore is planning a restructure')
    await makeAtomicClaim({ canonicalClaimId: canE.id, sourceId: news.id, claimText: 'Voltcore is planning a restructure', eventDate: d('2026-06-20'), specificityScore: 0.5 })
    await traceLineage(canE.id)
    const { result: rE } = await scoreReliability(canE.id, { now: NOW })
    expect(rE.factualityLabel).toBe('WEAK_SINGLE_SOURCE')
  })
})
