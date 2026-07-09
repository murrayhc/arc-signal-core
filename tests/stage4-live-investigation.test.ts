import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runInvestigation } from '@/server/evidence/investigation-loop'
import { buildGdeltSearchUrl, GdeltSearchAdapter } from '@/server/evidence/search/gdelt'
import {
  enabledAdapterNames,
  getActiveSearchAdapters,
  type SearchAdapter,
  type SearchDoc,
} from '@/server/evidence/search/registry'
import { resetDb } from './helpers'
import { makeAtomicClaim } from './factories'

async function makeCanonicalWithAtomic() {
  const canonical = await prisma.canonicalClaim.create({
    data: {
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      normalisedClaimText: 'voltcore cut 400 jobs manchester plant',
      claimType: 'LAYOFF_SIGNAL',
      status: 'ACTIVE',
      repeatCount: 1,
    },
  })
  await makeAtomicClaim({
    canonicalClaimId: canonical.id,
    claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
    claimType: 'LAYOFF_SIGNAL',
  })
  return canonical
}

function fakeAdapter(opts: {
  name: string
  sourceType?: string
  onSearch?: () => void
  docs?: (call: number) => SearchDoc[]
}): SearchAdapter {
  let call = 0
  return {
    name: opts.name,
    sourceType: opts.sourceType,
    status: () => 'CONFIGURED',
    async search() {
      call++
      opts.onSearch?.()
      return opts.docs ? opts.docs(call) : []
    },
  }
}

// ── Registry activation semantics ───────────────────────────────────────────

describe('search adapter registry activation', () => {
  afterEach(() => {
    delete process.env.SEARCH_ADAPTERS
  })

  it('is dormant by default under test — no test hits the network implicitly', () => {
    expect(enabledAdapterNames()).toEqual([])
    expect(getActiveSearchAdapters()).toEqual([])
  })

  it('SEARCH_ADAPTERS=gdelt activates the GDELT adapter', () => {
    process.env.SEARCH_ADAPTERS = 'gdelt'
    const active = getActiveSearchAdapters()
    expect(active).toHaveLength(1)
    expect(active[0].name).toBe('gdelt')
    expect(active[0].sourceType).toBe('AGGREGATOR')
  })

  it('SEARCH_ADAPTERS="" (explicit empty) disables everything', () => {
    process.env.SEARCH_ADAPTERS = ''
    expect(getActiveSearchAdapters()).toEqual([])
  })

  it('GDELT adapter reports CONFIGURED (keyless) and builds bounded query URLs', () => {
    expect(GdeltSearchAdapter.status()).toBe('CONFIGURED')
    const url = buildGdeltSearchUrl('who benefits from "Voltcore layoffs"? (origin)', 500)
    expect(url).toContain('api.gdeltproject.org/api/v2/doc/doc')
    expect(url).toContain('maxrecords=75') // clamped
    expect(url).not.toContain('%3F') // '?' stripped from the query text
  })
})

// ── Enforced limits (audit R4) ──────────────────────────────────────────────

describe('investigation loop limits are enforced', () => {
  beforeEach(resetDb)

  it('maxRuntimeMs: an expired deadline stops the run with LIMIT before any adapter call', async () => {
    const canonical = await makeCanonicalWithAtomic()
    let called = 0
    const adapter = fakeAdapter({ name: 'never', onSearch: () => called++ })
    const summary = await runInvestigation(
      { canonicalClaimId: canonical.id },
      { adapters: [adapter], provider: null, limits: { maxDepth: 3, maxQueriesPerClaim: 4, maxDocumentsPerQuery: 5, maxRuntimeMs: -1 } },
    )
    expect(summary.stoppedReason).toBe('LIMIT')
    expect(called).toBe(0)
    expect(summary.queriesGenerated).toBeGreaterThan(0) // queries were generated, then the wall hit
  })

  it('maxCostBudget: adapter calls stop exactly at the budget', async () => {
    const canonical = await makeCanonicalWithAtomic()
    let calls = 0
    const adapter = fakeAdapter({ name: 'metered', onSearch: () => calls++ })
    const summary = await runInvestigation(
      { canonicalClaimId: canonical.id },
      {
        adapters: [adapter],
        provider: null,
        limits: { maxDepth: 3, maxQueriesPerClaim: 8, maxDocumentsPerQuery: 5, maxRuntimeMs: 60_000, maxCostBudget: 3 },
      },
    )
    expect(calls).toBe(3)
    expect(summary.stoppedReason).toBe('LIMIT')
  })

  it('allowedSourceTypes filters which adapters run; filtering out everything is LIMIT, not dormant', async () => {
    const canonical = await makeCanonicalWithAtomic()
    let news = 0
    let agg = 0
    const newsAdapter = fakeAdapter({ name: 'news', sourceType: 'NEWS', onSearch: () => news++ })
    const aggAdapter = fakeAdapter({ name: 'agg', sourceType: 'AGGREGATOR', onSearch: () => agg++ })

    await runInvestigation(
      { canonicalClaimId: canonical.id },
      {
        adapters: [newsAdapter, aggAdapter],
        provider: null,
        limits: { maxDepth: 1, maxQueriesPerClaim: 2, maxDocumentsPerQuery: 3, maxRuntimeMs: 60_000, maxCostBudget: 48, allowedSourceTypes: ['NEWS'] },
      },
    )
    expect(news).toBeGreaterThan(0)
    expect(agg).toBe(0)

    const summary = await runInvestigation(
      { canonicalClaimId: canonical.id },
      {
        adapters: [newsAdapter],
        provider: null,
        limits: { maxDepth: 1, maxQueriesPerClaim: 2, maxDocumentsPerQuery: 3, allowedSourceTypes: ['REGULATOR'] },
      },
    )
    // Adapters exist but none is allowed — that is a LIMIT outcome, not
    // "nothing is configured" (which would be a lie).
    expect(summary.stoppedReason).toBe('LIMIT')
  })
})

// ── Interrogate → investigate bridge ────────────────────────────────────────

describe('free-text investigation seed (interrogate bridge)', () => {
  beforeEach(resetDb)

  it('searches the term, ingests results into the evidence layer, then chases the produced claims', async () => {
    const adapter = fakeAdapter({
      name: 'seeded',
      sourceType: 'NEWS',
      docs: (call) =>
        call === 1
          ? [
              {
                url: 'https://outlet-a.example/voltcore',
                title: 'Voltcore to cut 400 jobs',
                content: 'Voltcore will cut 400 jobs at its Manchester plant as demand weakens.',
                publishedAt: new Date('2026-07-06T09:00:00Z'),
                sourceName: 'outlet-a.example',
              },
            ]
          : [],
    })
    const summary = await runInvestigation(
      { queryText: 'Voltcore layoffs' },
      { adapters: [adapter], provider: null, limits: { maxDepth: 2, maxQueriesPerClaim: 4, maxDocumentsPerQuery: 5, maxRuntimeMs: 60_000, maxCostBudget: 48 } },
    )
    expect(summary.target.queryText).toBe('Voltcore layoffs')
    expect(summary.documentsAdded).toBeGreaterThanOrEqual(1)
    expect(summary.queriesGenerated).toBeGreaterThan(0) // the seeded claims were then investigated
    // The seeded evidence became real canonical claims with lineage + reliability.
    expect(await prisma.canonicalClaim.count()).toBeGreaterThan(0)
    expect(await prisma.claimLineage.count()).toBeGreaterThan(0)
  })

  it('the API route stays dormant-honest with no adapter enabled', async () => {
    const { POST } = await import('@/app/api/interrogate/investigate/route')
    const res = await POST(
      new Request('http://local/api/interrogate/investigate', {
        method: 'POST',
        body: JSON.stringify({ query: 'lithium shortage' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stoppedReason).toBe('NO_ADAPTER_CONFIGURED')
    expect(body.documentsAdded).toBe(0)
  })
})
