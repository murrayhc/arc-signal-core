import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { traceLineage } from '@/server/evidence/lineage'
import { scoreReliability } from '@/server/evidence/reliability'
import { getEventEvidenceDepth } from '@/server/services/evidence-depth'
import { resetDb } from './helpers'
import { makeAtomicClaim, makeSource } from './factories'

const NOW = new Date('2026-06-25T00:00:00Z')

async function seedFixtureSource(name: string, url: string) {
  return prisma.source.create({
    data: { name, category: 'NEWS', accessMethod: 'FIXTURE', url, isFixture: true, collectorStatus: 'FUNCTIONAL' },
  })
}

describe('evidence depth pipeline (end-to-end)', () => {
  beforeEach(resetDb)

  it('collects, extracts, clusters, traces lineage, scores reliability, and exposes deep evidence', async () => {
    // Four different outlets: origin, near-verbatim copy, independent report, contradiction.
    await seedFixtureSource('Wire X', 'fixtures/evidence-depth/voltcore-origin.json')
    await seedFixtureSource('Wire X2', 'fixtures/evidence-depth/voltcore-copy.json')
    await seedFixtureSource('Outlet Y', 'fixtures/evidence-depth/voltcore-independent.json')
    await seedFixtureSource('Outlet Z', 'fixtures/evidence-depth/voltcore-contradiction.json')
    await prisma.revenueLens.create({
      data: { name: 'E2E Lens', userType: 'GENERAL', riskAppetite: 'MEDIUM', active: true, isDefault: true },
    })

    const summary = await runFullScan()
    expect(summary.status).not.toBe('FAILED')

    // (1) multiple source documents collected
    expect(summary.counts.documentsFetched).toBeGreaterThanOrEqual(4)
    expect(await prisma.document.count()).toBeGreaterThanOrEqual(4)

    // (2) atomic claims extracted
    expect(summary.counts.atomicClaimsExtracted).toBeGreaterThanOrEqual(4)

    // (3) canonical claims created
    expect(summary.counts.canonicalClaimsCreated).toBeGreaterThanOrEqual(1)

    // (4) the four reports cluster into ONE canonical layoff claim
    const layoffCanonicals = await prisma.canonicalClaim.findMany({ where: { claimType: 'LAYOFF_SIGNAL' } })
    expect(layoffCanonicals).toHaveLength(1)
    const canonical = layoffCanonicals[0]
    expect(canonical.repeatCount).toBeGreaterThanOrEqual(4)

    const cluster = await prisma.claimCluster.findUniqueOrThrow({ where: { canonicalClaimId: canonical.id } })

    // (5) copied reporting does NOT inflate confidence: the copy is detected and
    // excluded from the independent-source count.
    expect(cluster.copiedSourceCount).toBeGreaterThanOrEqual(1)
    expect(canonical.independentSourceCount).toBe(2) // origin + independent only (copy & contradiction excluded)

    // (8) lineage records created, covering all relation types
    const lineage = await prisma.claimLineage.findMany({ where: { canonicalClaimId: canonical.id } })
    const relations = new Set(lineage.map((l) => l.relationToOrigin))
    expect(relations.has('ORIGIN_CANDIDATE')).toBe(true)
    expect(relations.has('LIKELY_COPY')).toBe(true)
    expect(relations.has('INDEPENDENT_SUPPORT')).toBe(true)
    expect(relations.has('CONTRADICTION')).toBe(true)

    // (9) follow-up queries generated
    expect(summary.counts.investigationQueriesGenerated).toBeGreaterThan(0)
    expect(await prisma.investigationQuery.count({ where: { canonicalClaimId: canonical.id } })).toBeGreaterThan(0)

    // (10) the event API returns deep evidence data
    const event = await prisma.eventCandidate.findFirst()
    expect(event).not.toBeNull()
    const depth = await getEventEvidenceDepth(event!.id)
    expect(depth.hasDepth).toBe(true)
    if (depth.hasDepth) {
      expect(depth.claims.some((c) => c.id === canonical.id)).toBe(true)
      expect(depth.contradictingCount).toBeGreaterThanOrEqual(1)
    }

    // (7) contradictions reduce reliability: removing the contradiction raises the score.
    const withContradiction = (await scoreReliability(canonical.id, { now: NOW })).result.reliabilityScore
    await prisma.claimLineage.deleteMany({ where: { canonicalClaimId: canonical.id, relationToOrigin: 'CONTRADICTION' } })
    const withoutContradiction = (await scoreReliability(canonical.id, { now: NOW })).result.reliabilityScore
    expect(withoutContradiction).toBeGreaterThan(withContradiction)

    // (6) independent support increases reliability: two independent sources beat a
    // single-source claim of equal authority. Isolate independence by also dropping
    // the copy, leaving origin + independent.
    await prisma.claimLineage.deleteMany({ where: { canonicalClaimId: canonical.id, relationToOrigin: 'LIKELY_COPY' } })
    const twoIndependent = (await scoreReliability(canonical.id, { now: NOW })).result.reliabilityScore

    const soloSource = await makeSource({ category: 'NEWS' })
    const solo = await prisma.canonicalClaim.create({
      data: {
        claimText: 'Zephyr Ltd will cut 90 jobs at its Leeds depot',
        normalisedClaimText: 'zephyr ltd cut 90 jobs leeds depot',
        claimType: 'LAYOFF_SIGNAL',
        firstSeenAt: new Date('2026-06-20T09:00:00Z'),
        status: 'ACTIVE',
        repeatCount: 1,
      },
    })
    await makeAtomicClaim({
      canonicalClaimId: solo.id,
      sourceId: soloSource.id,
      claimText: 'Zephyr Ltd will cut 90 jobs at its Leeds depot',
      eventDate: new Date('2026-06-20T09:00:00Z'),
      specificityScore: 0.8,
    })
    await traceLineage(solo.id)
    const soloScore = (await scoreReliability(solo.id, { now: NOW })).result.reliabilityScore

    expect(twoIndependent).toBeGreaterThan(soloScore)
  })
})
