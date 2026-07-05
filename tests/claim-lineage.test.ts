import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { traceLineage } from '@/server/evidence/lineage'
import { resetDb } from './helpers'
import { makeAtomicClaim } from './factories'

async function makeCanonical(claimText: string) {
  return prisma.canonicalClaim.create({
    data: {
      claimText,
      normalisedClaimText: claimText.toLowerCase(),
      claimType: 'LAYOFF_SIGNAL',
      firstSeenAt: new Date('2026-06-20T09:00:00Z'),
      status: 'ACTIVE',
      repeatCount: 1,
    },
  })
}

describe('traceLineage', () => {
  beforeEach(resetDb)

  it('classifies origin, copy and independent support; copies do not count as independent', async () => {
    const canonical = await makeCanonical('Voltcore will cut 400 jobs at its Manchester plant')
    const origin = await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: 'source-1',
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      eventDate: new Date('2026-06-20T09:00:00Z'),
    })
    const copy = await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: 'source-2',
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant, sources said',
      eventDate: new Date('2026-06-21T09:00:00Z'),
    })
    const independent = await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: 'source-3',
      claimText: 'Manchester battery maker Voltcore is shedding 400 roles',
      eventDate: new Date('2026-06-22T09:00:00Z'),
    })

    const { lineage } = await traceLineage(canonical.id)
    expect(lineage).toHaveLength(3)

    const byDoc = new Map(lineage.map((l) => [l.documentId, l]))
    expect(byDoc.get(origin.documentId)?.relationToOrigin).toBe('ORIGIN_CANDIDATE')
    expect(byDoc.get(copy.documentId)?.relationToOrigin).toBe('LIKELY_COPY')
    expect(byDoc.get(copy.documentId)?.isLikelyCopy).toBe(true)
    expect(byDoc.get(independent.documentId)?.relationToOrigin).toBe('INDEPENDENT_SUPPORT')

    const reloaded = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: canonical.id } })
    // origin (source-1) + independent (source-3) = 2; the copy (source-2) is excluded.
    expect(reloaded.independentSourceCount).toBe(2)

    const cluster = await prisma.claimCluster.findUniqueOrThrow({ where: { canonicalClaimId: canonical.id } })
    expect(cluster.copiedSourceCount).toBe(1)
    expect(cluster.sourceCount).toBe(3)
  })

  it('marks a contradicting report and counts it', async () => {
    const canonical = await makeCanonical('Voltcore will cut 400 jobs')
    await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: 'source-1',
      claimText: 'Voltcore will cut 400 jobs',
      eventDate: new Date('2026-06-20T09:00:00Z'),
    })
    await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: 'source-2',
      claimText: 'Voltcore denies it will cut any jobs',
      eventDate: new Date('2026-06-22T09:00:00Z'),
    })

    await traceLineage(canonical.id)
    const reloaded = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: canonical.id } })
    expect(reloaded.contradictionCount).toBe(1)
    const contra = await prisma.claimLineage.findFirst({
      where: { canonicalClaimId: canonical.id, relationToOrigin: 'CONTRADICTION' },
    })
    expect(contra).not.toBeNull()
  })
})
