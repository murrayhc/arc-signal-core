import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { fnv1a64, hammingDistance, isNearDuplicate, simhash64 } from '@/server/evidence/fingerprint'
import { deriveIndependenceGroup, registrableDomain } from '@/server/evidence/independence'
import { traceLineage } from '@/server/evidence/lineage'
import { scoreReliability } from '@/server/evidence/reliability'
import { resetDb } from './helpers'
import { makeAtomicClaim, makeDocument, makeSource } from './factories'

// ── Pure: fingerprinting ────────────────────────────────────────────────────

describe('simhash fingerprinting', () => {
  const ARTICLE =
    'Voltcore, the Manchester battery maker, will cut 400 jobs at its main plant as energy costs ' +
    'rise and consumer demand weakens across the sector. Union representatives said talks begin next week. ' +
    'The company employs 2,300 people across three UK sites and reported falling margins last quarter.'

  it('is deterministic and stable', () => {
    expect(simhash64(ARTICLE)).toBe(simhash64(ARTICLE))
    expect(fnv1a64('abc')).toBe(fnv1a64('abc'))
    expect(simhash64(ARTICLE)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('treats reworded syndications of the same article as near-duplicates', () => {
    const light = ARTICLE.replace('will cut 400 jobs', 'is to cut 400 jobs').replace(
      'talks begin next week',
      'talks start next week',
    )
    const heavy = ARTICLE.replace(
      'will cut 400 jobs at its main plant',
      'plans to eliminate 400 positions at its flagship factory',
    ).replace('Union representatives said', 'Union officials confirmed')
    const a = simhash64(ARTICLE)!
    expect(isNearDuplicate(a, simhash64(light)!)).toBe(true)
    expect(isNearDuplicate(a, simhash64(heavy)!)).toBe(true)
  })

  it('keeps genuinely different articles apart — including a DIFFERENT article on the SAME story', () => {
    // The hard negative: same story, same entities, independently written.
    // This must NOT read as a copy — it is exactly what independent
    // corroboration looks like.
    const sameStoryIndependent =
      'Battery manufacturer Voltcore is planning significant redundancies at Manchester operations, ' +
      'with hundreds of positions at risk according to people familiar with the matter. Rising energy ' +
      'prices have squeezed margins across UK manufacturing, and unions are preparing for consultation.'
    const unrelated =
      'Regulators opened a procurement inquiry into cloud hosting contracts across government departments, ' +
      'citing pricing concerns raised by smaller suppliers. A report is expected in the autumn covering ' +
      'framework agreements, subcontracting arrangements and exit costs for public bodies.'
    const a = simhash64(ARTICLE)!
    expect(isNearDuplicate(a, simhash64(sameStoryIndependent)!)).toBe(false)
    expect(isNearDuplicate(a, simhash64(unrelated)!)).toBe(false)
    expect(hammingDistance(a, simhash64(unrelated)!)).toBeGreaterThan(20)
  })

  it('returns null for empty text and never matches on missing fingerprints', () => {
    expect(simhash64('')).toBeNull()
    expect(isNearDuplicate(null, 'abcdef0123456789')).toBe(false)
  })
})

// ── Pure: publisher independence groups ─────────────────────────────────────

describe('publisher independence groups', () => {
  it('derives the registrable domain, collapsing subdomains and multi-part TLDs', () => {
    expect(registrableDomain('https://feeds.bbci.co.uk/news/business/rss.xml')).toBe('bbci.co.uk')
    expect(registrableDomain('https://www.reuters.com/business/')).toBe('reuters.com')
    expect(registrableDomain('https://find-tender.service.gov.uk/feed')).toBe('service.gov.uk')
  })

  it('groups same-publisher feeds together and different publishers apart', () => {
    const a = deriveIndependenceGroup('https://feeds.bbci.co.uk/news/business/rss.xml', 'BBC Business')
    const b = deriveIndependenceGroup('https://feeds.bbci.co.uk/news/technology/rss.xml', 'BBC Tech')
    const c = deriveIndependenceGroup('https://www.reuters.com/rss', 'Reuters')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('falls back to a name-derived group for URL-less and fixture sources', () => {
    expect(deriveIndependenceGroup(null, 'Fixture Wire A')).toBe('name:fixture-wire-a')
    expect(deriveIndependenceGroup('fixtures/fixture-feed-a.json', 'Fixture Wire A')).toBe('name:fixture-wire-a')
  })
})

// ── DB-backed: lineage + reliability with the new maths ─────────────────────

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

describe('independence counted in publisher groups', () => {
  beforeEach(resetDb)

  it('two same-publisher feeds count as ONE independent publisher; different publishers count separately', async () => {
    // Same publisher, two feeds (same independence group), differently worded.
    const samePub = await makeCanonical('Voltcore will cut 400 jobs at its Manchester plant')
    const bbcBiz = await makeSource({ url: 'https://feeds.bbci.co.uk/news/business/rss.xml', independenceGroup: 'bbci.co.uk' })
    const bbcTech = await makeSource({ url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', independenceGroup: 'bbci.co.uk' })
    await makeAtomicClaim({
      canonicalClaimId: samePub.id,
      sourceId: bbcBiz.id,
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      eventDate: new Date('2026-06-20T09:00:00Z'),
    })
    await makeAtomicClaim({
      canonicalClaimId: samePub.id,
      sourceId: bbcTech.id,
      claimText: 'Manchester battery maker Voltcore is shedding 400 roles',
      eventDate: new Date('2026-06-22T09:00:00Z'),
    })
    await traceLineage(samePub.id)
    const same = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: samePub.id } })
    expect(same.independentSourceCount).toBe(1)

    // Different publishers, same wording split.
    const diffPub = await makeCanonical('Voltcore will cut 400 jobs at its Manchester plant')
    const bbc = await makeSource({ independenceGroup: 'bbci.co.uk' })
    const reuters = await makeSource({ independenceGroup: 'reuters.com' })
    await makeAtomicClaim({
      canonicalClaimId: diffPub.id,
      sourceId: bbc.id,
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      eventDate: new Date('2026-06-20T09:00:00Z'),
    })
    await makeAtomicClaim({
      canonicalClaimId: diffPub.id,
      sourceId: reuters.id,
      claimText: 'Manchester battery maker Voltcore is shedding 400 roles',
      eventDate: new Date('2026-06-22T09:00:00Z'),
    })
    await traceLineage(diffPub.id)
    const diff = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: diffPub.id } })
    expect(diff.independentSourceCount).toBe(2)

    // The maths must reward genuine independence: two publishers beat one.
    const { result: sameScore } = await scoreReliability(samePub.id)
    const { result: diffScore } = await scoreReliability(diffPub.id)
    expect(diffScore.reliabilityScore).toBeGreaterThan(sameScore.reliabilityScore)
  })
})

describe('document-level syndication detection (simhash)', () => {
  beforeEach(resetDb)

  it('flags a lightly reworded copy of the SAME article as LIKELY_COPY even when the extracted claims differ', async () => {
    const body =
      'Voltcore, the Manchester battery maker, will cut 400 jobs at its main plant as energy costs rise ' +
      'and consumer demand weakens across the sector. Union representatives said talks begin next week.'
    const rewordedBody = body
      .replace('will cut 400 jobs', 'is to cut 400 jobs')
      .replace('talks begin next week', 'talks start next week')

    const srcA = await makeSource({ independenceGroup: 'outlet-a.com' })
    const srcB = await makeSource({ independenceGroup: 'outlet-b.com' })
    const docA = await makeDocument(srcA.id, { rawContent: body })
    const docB = await makeDocument(srcB.id, { rawContent: rewordedBody })

    const canonical = await makeCanonical('Voltcore will cut 400 jobs at its main plant')
    await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: srcA.id,
      documentId: docA.id,
      claimText: 'Voltcore will cut 400 jobs at its main plant as energy costs rise',
      eventDate: new Date('2026-06-20T09:00:00Z'),
    })
    // Claim wording deliberately rewritten far enough that the sentence-level
    // Jaccard blend alone would NOT call it a copy — the document fingerprint must.
    await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: srcB.id,
      documentId: docB.id,
      claimText: 'Battery firm to shed hundreds of roles amid rising costs, union says',
      eventDate: new Date('2026-06-20T15:00:00Z'),
    })

    await traceLineage(canonical.id)
    const rows = await prisma.claimLineage.findMany({ where: { canonicalClaimId: canonical.id } })
    const byDoc = new Map(rows.map((r) => [r.documentId, r]))
    expect(byDoc.get(docB.id)?.relationToOrigin).toBe('LIKELY_COPY')
    expect(byDoc.get(docB.id)?.isLikelyCopy).toBe(true)
  })
})

describe('copy-burst manipulation risk', () => {
  beforeEach(resetDb)

  async function burstShape(hoursApart: number[]) {
    const canonical = await makeCanonical('Voltcore will cut 400 jobs at its Manchester plant')
    const originAt = new Date('2026-06-20T09:00:00Z')
    const origin = await makeSource({ independenceGroup: 'origin.com' })
    await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: origin.id,
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      eventDate: originAt,
    })
    for (const [i, hours] of hoursApart.entries()) {
      const src = await makeSource({ independenceGroup: `copier-${i}.com` })
      await makeAtomicClaim({
        canonicalClaimId: canonical.id,
        sourceId: src.id,
        // Near-verbatim → LIKELY_COPY via the sentence-level threshold.
        claimText: 'Voltcore will cut 400 jobs at its Manchester plant, sources said',
        eventDate: new Date(originAt.getTime() + hours * 60 * 60 * 1000),
      })
    }
    await traceLineage(canonical.id)
    return canonical
  }

  it('a tight burst of copies raises manipulation risk and lowers reliability; a single copy does not', async () => {
    const burst = await burstShape([2, 5, 9]) // three copies inside 48h
    const burstCluster = await prisma.claimCluster.findUniqueOrThrow({ where: { canonicalClaimId: burst.id } })
    expect(burstCluster.manipulationRiskScore).toBeGreaterThan(0.3)

    const single = await burstShape([2]) // one syndicated pickup = normal news flow
    const singleCluster = await prisma.claimCluster.findUniqueOrThrow({ where: { canonicalClaimId: single.id } })
    expect(singleCluster.manipulationRiskScore).toBe(0)

    const { result: burstScore } = await scoreReliability(burst.id)
    const { result: singleScore } = await scoreReliability(single.id)
    expect(burstScore.dimensions.manipulationRisk).toBeGreaterThan(0.3)
    expect(burstScore.warnings.join(' ')).toContain('coordinated amplification')
    // Both have exactly one independent publisher; the burst must score LOWER.
    expect(burstScore.reliabilityScore).toBeLessThan(singleScore.reliabilityScore)
  })
})

describe('origin confidence + factuality rollup', () => {
  beforeEach(resetDb)

  it('assigns per-relation origin confidence and rolls factuality onto the canonical claim', async () => {
    const canonical = await makeCanonical('Voltcore will cut 400 jobs at its Manchester plant')
    const s1 = await makeSource({ independenceGroup: 'a.com' })
    const s2 = await makeSource({ independenceGroup: 'b.com' })
    const s3 = await makeSource({ independenceGroup: 'c.com' })
    await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: s1.id,
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      eventDate: new Date('2026-06-20T09:00:00Z'),
    })
    await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: s2.id,
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant, sources said',
      eventDate: new Date('2026-06-21T09:00:00Z'),
    })
    await makeAtomicClaim({
      canonicalClaimId: canonical.id,
      sourceId: s3.id,
      claimText: 'Manchester battery maker Voltcore is shedding 400 roles',
      eventDate: new Date('2026-06-22T09:00:00Z'),
    })

    await traceLineage(canonical.id)
    const rows = await prisma.claimLineage.findMany({ where: { canonicalClaimId: canonical.id } })
    const origin = rows.find((r) => r.relationToOrigin === 'ORIGIN_CANDIDATE')!
    const copy = rows.find((r) => r.relationToOrigin === 'LIKELY_COPY')!
    const indep = rows.find((r) => r.relationToOrigin === 'INDEPENDENT_SUPPORT')!
    expect(origin.originConfidence).toBeGreaterThan(0.5)
    expect(copy.originConfidence).toBeGreaterThan(0) // no longer hardcoded 0
    expect(copy.originConfidence).toBeLessThan(0.1) // a copy is almost never the origin
    expect(indep.originConfidence).toBeGreaterThan(copy.originConfidence)

    const { result } = await scoreReliability(canonical.id)
    expect(result.dimensions.originTrace).toBeGreaterThan(0.5)

    // Factuality is rolled up onto the canonical claim, not frozen at extraction.
    const reloaded = await prisma.canonicalClaim.findUniqueOrThrow({ where: { id: canonical.id } })
    expect(reloaded.factualityLabel).toBe(result.factualityLabel)
    expect(reloaded.factualityLabel).not.toBe('UNVERIFIED')
  })
})
