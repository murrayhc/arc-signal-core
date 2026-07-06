import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { runConsequenceSynthesis } from '@/server/consequence/consequence-pipeline'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

async function seedFixtureSource(name: string, url: string) {
  return prisma.source.create({
    data: { name, category: 'NEWS', accessMethod: 'FIXTURE', url, isFixture: true, collectorStatus: 'FUNCTIONAL' },
  })
}

describe('runConsequenceSynthesis', () => {
  beforeEach(resetDb)

  it('produces company impacts, one synthesis and five scenarios per event', async () => {
    const { event } = await makeEventGraph('Voltcore is cutting 400 jobs at its Manchester plant.', { eventClass: 'RISK', sector: 'manufacturing' })
    const { counts, errors } = await runConsequenceSynthesis([event])
    expect(errors).toHaveLength(0)
    expect(counts.companyImpactsCreated).toBeGreaterThan(0)
    expect(counts.contextSynthesesCreated).toBe(1)
    expect(counts.futureScenariosCreated).toBe(5)
  })
})

describe('consequence wiring in the full scan', () => {
  beforeEach(resetDb)

  it('a full scan populates the consequence counters and never crashes', async () => {
    await seedFixtureSource('Wire X', 'fixtures/evidence-depth/voltcore-origin.json')
    await seedFixtureSource('Wire X2', 'fixtures/evidence-depth/voltcore-copy.json')
    await seedFixtureSource('Outlet Y', 'fixtures/evidence-depth/voltcore-independent.json')
    await prisma.revenueLens.create({
      data: { name: 'E2E Lens', userType: 'GENERAL', riskAppetite: 'MEDIUM', active: true, isDefault: true },
    })

    const summary = await runFullScan()
    expect(summary.status).not.toBe('FAILED')
    expect(summary.counts.futureScenariosCreated).toBeGreaterThan(0)
    expect(summary.counts.companyImpactsCreated).toBeGreaterThan(0)
    expect(summary.counts.contextSynthesesCreated).toBeGreaterThan(0)
    // the impacts are joined to a real event
    expect(await prisma.companyImpact.count()).toBe(summary.counts.companyImpactsCreated)
  })
})
