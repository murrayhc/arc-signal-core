import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { assembleReport } from '@/server/consequence/report'
import { getEventDeepReport } from '@/server/services/consequence'
import { resetDb } from './helpers'

async function seedFixtureSource(name: string, url: string) {
  return prisma.source.create({
    data: { name, category: 'NEWS', accessMethod: 'FIXTURE', url, isFixture: true, collectorStatus: 'FUNCTIONAL' },
  })
}

describe('deep commercial consequence (end-to-end)', () => {
  beforeEach(resetDb)

  it('a scanned event yields named impacts, context, scenarios, positioning and an advice-clean report', async () => {
    await seedFixtureSource('Wire X', 'fixtures/evidence-depth/voltcore-origin.json')
    await seedFixtureSource('Wire X2', 'fixtures/evidence-depth/voltcore-copy.json')
    await seedFixtureSource('Outlet Y', 'fixtures/evidence-depth/voltcore-independent.json')
    await prisma.revenueLens.create({
      data: { name: 'E2E Lens', userType: 'GENERAL', riskAppetite: 'MEDIUM', active: true, isDefault: true },
    })

    const summary = await runFullScan()
    expect(summary.status).not.toBe('FAILED')

    const event = await prisma.eventCandidate.findFirstOrThrow()
    const deep = await getEventDeepReport(event.id)

    // (1) a detected event produces company impacts
    expect(deep.companies.length).toBeGreaterThan(0)

    // (2) beneficiary companies are named with evidence
    expect(deep.beneficiaries.length).toBeGreaterThan(0)
    expect(deep.beneficiaries.every((b) => Array.isArray(b.evidenceIds))).toBe(true)

    // (3) harmed companies are named with evidence — incl. the named subject
    expect(deep.harmed.length).toBeGreaterThan(0)
    const voltcore = deep.companies.find((c) => c.companyName.toLowerCase().includes('voltcore'))
    expect(voltcore).toBeTruthy()
    expect(voltcore!.evidenceIds.length).toBeGreaterThan(0)

    // (4) low-confidence company impact is labelled
    expect(deep.companies.some((c) => c.lowConfidence)).toBe(true)

    // (5,6) historic + present context are generated
    expect(deep.context).not.toBeNull()
    expect(deep.context!.historicContext.length).toBeGreaterThan(0)
    expect(deep.context!.presentContext.length).toBeGreaterThan(0)

    // (7) future scenarios are generated
    expect(deep.scenarios).toHaveLength(5)
    expect(deep.context!.futureContext.length).toBeGreaterThan(0)

    // (8) strategic positioning examples are generated
    expect(deep.positioning.length).toBeGreaterThan(0)

    // (9) the event API returns deep output
    expect(summary.counts.companyImpactsCreated).toBeGreaterThan(0)
    expect(summary.counts.futureScenariosCreated).toBeGreaterThan(0)

    // (10) forbidden financial-advice language is never produced
    const report = await assembleReport(event.id, 'EXECUTIVE_BRIEF')
    const texts = [
      ...deep.companies.map((c) => c.impactPathway),
      deep.context!.historicContext,
      deep.context!.presentContext,
      deep.context!.futureContext,
      ...deep.scenarios.map((s) => s.summary),
      ...deep.positioning.flatMap((p) => [p.howItCouldBeUsed, p.whyItMayMatter, p.positioningAngle]),
      report!.markdown,
    ]
    for (const t of texts) expect(findAdviceLanguage(t)).toEqual([])
  })
})
