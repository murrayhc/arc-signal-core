import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runInvestigation } from '@/server/evidence/investigation-loop'
import type { SearchAdapter } from '@/server/evidence/search/registry'
import { resetDb } from './helpers'
import { makeAtomicClaim } from './factories'

async function targetCanonical() {
  const canonical = await prisma.canonicalClaim.create({
    data: {
      claimText: 'Voltcore will cut 400 jobs in Manchester',
      normalisedClaimText: 'voltcore cut 400 jobs manchester',
      claimType: 'LAYOFF_SIGNAL',
      status: 'ACTIVE',
      repeatCount: 1,
    },
  })
  await makeAtomicClaim({ canonicalClaimId: canonical.id, entitiesJson: JSON.stringify(['Voltcore']) })
  return canonical
}

describe('runInvestigation', () => {
  beforeEach(resetDb)

  it('is dormant-safe: generates queries, marks them skipped, adds no documents', async () => {
    const canonical = await targetCanonical()
    const summary = await runInvestigation({ canonicalClaimId: canonical.id })
    expect(summary.stoppedReason).toBe('NO_ADAPTER_CONFIGURED')
    expect(summary.documentsAdded).toBe(0)
    expect(summary.adaptersTried).toBe(0)
    expect(summary.queriesGenerated).toBeGreaterThan(0)
    const queries = await prisma.investigationQuery.findMany({ where: { canonicalClaimId: canonical.id } })
    expect(queries.length).toBeGreaterThan(0)
    expect(queries.every((q) => q.status === 'SKIPPED_NO_ADAPTER')).toBe(true)
  })

  it('ingests new evidence with an injected adapter, processing each document only once', async () => {
    const canonical = await targetCanonical()
    let calls = 0
    const adapter: SearchAdapter = {
      name: 'fake',
      status: () => 'CONFIGURED',
      async search() {
        calls++
        return [{ url: 'https://news.test/globex-cuts', title: 'Globex cuts jobs', content: 'Globex will cut 250 jobs at its Leeds factory.' }]
      },
    }
    const summary = await runInvestigation(
      { canonicalClaimId: canonical.id },
      { adapters: [adapter], limits: { maxDepth: 3, maxQueriesPerClaim: 4, maxDocumentsPerQuery: 5 } },
    )
    expect(calls).toBeGreaterThan(0)
    expect(summary.documentsAdded).toBe(1) // the repeated url is ingested once, never re-processed
    expect(summary.stoppedReason).not.toBe('NO_ADAPTER_CONFIGURED')
    expect(await prisma.canonicalClaim.count()).toBeGreaterThanOrEqual(2)
  })

  it('records a failing adapter without crashing the run', async () => {
    const canonical = await targetCanonical()
    const adapter: SearchAdapter = {
      name: 'boom',
      status: () => 'CONFIGURED',
      async search() {
        throw new Error('adapter exploded')
      },
    }
    const summary = await runInvestigation({ canonicalClaimId: canonical.id }, { adapters: [adapter] })
    expect(summary.documentsAdded).toBe(0)
    expect(summary.adaptersTried).toBe(1)
  })
})
