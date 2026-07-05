import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import type { LLMProvider } from '@/server/llm/types'
import { generateQueriesForCanonical } from '@/server/evidence/investigation-query'
import { resetDb } from './helpers'
import { makeAtomicClaim } from './factories'

function fakeProvider(text: string): LLMProvider {
  return { name: 'fake', async generate() { return { text, tokensIn: 5, tokensOut: 5 } } }
}

async function commodityCanonical() {
  const canonical = await prisma.canonicalClaim.create({
    data: {
      claimText: 'Battery Corp faces a lithium shortage in Europe',
      normalisedClaimText: 'battery corp lithium shortage europe',
      claimType: 'COMMODITY_PRESSURE',
      status: 'ACTIVE',
      repeatCount: 1,
    },
  })
  await makeAtomicClaim({
    canonicalClaimId: canonical.id,
    claimType: 'COMMODITY_PRESSURE',
    claimText: 'Battery Corp faces a lithium shortage in Europe',
    entitiesJson: JSON.stringify(['Battery Corp']),
    sectorsJson: JSON.stringify(['energy']),
    regionsJson: JSON.stringify(['EU']),
    commoditiesJson: JSON.stringify(['lithium']),
  })
  return canonical
}

describe('generateQueriesForCanonical', () => {
  beforeEach(resetDb)

  it('covers all 8 query classes with specific, token-preserving, deduped, capped queries', async () => {
    const canonical = await commodityCanonical()
    const queries = await generateQueriesForCanonical(canonical.id)

    expect(new Set(queries.map((q) => q.queryClass)).size).toBe(8)
    expect(queries.length).toBeLessThanOrEqual(12)
    // deduped
    expect(new Set(queries.map((q) => q.queryText.toLowerCase())).size).toBe(queries.length)
    // every query preserves at least one entity/sector/region/commodity token
    for (const q of queries) {
      const t = q.queryText.toLowerCase()
      expect(t.includes('battery corp') || t.includes('energy') || t.includes('eu') || t.includes('lithium')).toBe(true)
    }
    // persisted with status GENERATED
    const persisted = await prisma.investigationQuery.findMany({ where: { canonicalClaimId: canonical.id } })
    expect(persisted).toHaveLength(queries.length)
    expect(persisted.every((q) => q.status === 'GENERATED')).toBe(true)
  })

  it('uses injected LLM provider queries when available', async () => {
    const canonical = await commodityCanonical()
    const provider = fakeProvider(
      JSON.stringify({ queries: [{ queryText: 'battery corp lithium europe origin source', queryClass: 'ORIGIN_TRACE' }] }),
    )
    const queries = await generateQueriesForCanonical(canonical.id, { provider })
    expect(queries.some((q) => q.queryText === 'battery corp lithium europe origin source')).toBe(true)
  })
})
