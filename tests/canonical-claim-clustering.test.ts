import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { assignCanonicalClaims } from '@/server/evidence/canonical'
import { resetDb } from './helpers'
import { makeAtomicClaim } from './factories'

describe('assignCanonicalClaims', () => {
  beforeEach(resetDb)

  it('merges near-identical claims about the same entity into one canonical claim', async () => {
    const a1 = await makeAtomicClaim({
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      entitiesJson: JSON.stringify(['Voltcore']),
      eventDate: new Date('2026-06-20T09:00:00Z'),
    })
    const a2 = await makeAtomicClaim({
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant, sources said',
      entitiesJson: JSON.stringify(['Voltcore']),
      eventDate: new Date('2026-06-21T09:00:00Z'),
    })
    const { created } = await assignCanonicalClaims([a1, a2])
    expect(created).toHaveLength(1)
    expect(await prisma.canonicalClaim.count()).toBe(1)
    const canonical = await prisma.canonicalClaim.findFirstOrThrow()
    expect(canonical.repeatCount).toBe(2)
    const linked = await prisma.atomicClaim.findMany({ where: { canonicalClaimId: canonical.id } })
    expect(linked).toHaveLength(2)
  })

  it('merges an independently worded report of the same event about the same entity', async () => {
    const a1 = await makeAtomicClaim({
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      entitiesJson: JSON.stringify(['Voltcore']),
      eventDate: new Date('2026-06-20T09:00:00Z'),
    })
    const a2 = await makeAtomicClaim({
      claimText: 'Manchester battery maker Voltcore is shedding 400 roles',
      entitiesJson: JSON.stringify(['Voltcore']),
      eventDate: new Date('2026-06-21T09:00:00Z'),
    })
    const { created } = await assignCanonicalClaims([a1, a2])
    expect(created).toHaveLength(1)
    const canonical = await prisma.canonicalClaim.findFirstOrThrow()
    expect(canonical.repeatCount).toBe(2)
  })

  it('never merges claims about different named entities', async () => {
    const a1 = await makeAtomicClaim({ claimText: 'Voltcore will cut 400 jobs', entitiesJson: JSON.stringify(['Voltcore']) })
    const a2 = await makeAtomicClaim({ claimText: 'Globex will cut 400 jobs', entitiesJson: JSON.stringify(['Globex']) })
    const { created } = await assignCanonicalClaims([a1, a2])
    expect(created).toHaveLength(2)
    expect(await prisma.canonicalClaim.count()).toBe(2)
  })

  it('keeps unrelated claims of the same type separate', async () => {
    const a1 = await makeAtomicClaim({ claimText: 'Voltcore will cut 400 jobs in Manchester', entitiesJson: JSON.stringify(['Voltcore']) })
    const a2 = await makeAtomicClaim({
      claimText: 'Sunrise Foods is making redundancies after a poor harvest',
      entitiesJson: JSON.stringify(['Sunrise Foods']),
    })
    const { created } = await assignCanonicalClaims([a1, a2])
    expect(created).toHaveLength(2)
  })

  it('creates one ClaimCluster per canonical claim', async () => {
    const a1 = await makeAtomicClaim({ claimText: 'Voltcore will cut 400 jobs', entitiesJson: JSON.stringify(['Voltcore']) })
    const { created } = await assignCanonicalClaims([a1])
    const cluster = await prisma.claimCluster.findUnique({ where: { canonicalClaimId: created[0].id } })
    expect(cluster).not.toBeNull()
    expect(cluster?.sourceCount).toBeGreaterThanOrEqual(1)
  })
})
