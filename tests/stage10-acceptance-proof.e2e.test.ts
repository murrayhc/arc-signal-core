import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { assembleReport } from '@/server/consequence/report'
import { getEventArc } from '@/server/services/graph'
import { getConfidenceHistory } from '@/server/graph/timeline'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { REPORT_TYPES } from '@/shared/enums'
import { resetDb } from './helpers'

/**
 * The claude-fable-5 acceptance scenario, end to end, as pinned proofs.
 * Two halves of the brief's promise:
 *  A. a genuinely DISPUTED claim is traced, tested, caught, withheld from
 *     output, and queued for review — never silently shipped;
 *  B. a CORROBORATED claim drives a named-exposure event with lineage,
 *     reliability-weighted confidence, differentiated reports and forward
 *     scenarios — all deterministic, all guard-clean.
 */

async function seedFixtureSource(name: string, url: string, group: string) {
  return prisma.source.create({
    data: {
      name,
      category: 'NEWS',
      accessMethod: 'FIXTURE',
      url,
      isFixture: true,
      collectorStatus: 'FUNCTIONAL',
      independenceGroup: group,
    },
  })
}

async function seedLens() {
  await prisma.revenueLens.create({
    data: { name: 'Acceptance Lens', userType: 'GENERAL', riskAppetite: 'MEDIUM', active: true, isDefault: true },
  })
}

describe('claude-fable-5 acceptance proof (cross-stage e2e)', () => {
  beforeEach(resetDb)

  it('A: a disputed claim (two independent denials) is caught, withheld from events, and queued', async () => {
    await seedFixtureSource('Wire X', 'fixtures/evidence-depth/voltcore-origin.json', 'wire-x.test')
    await seedFixtureSource('Wire X syndication', 'fixtures/evidence-depth/voltcore-copy.json', 'wire-x.test')
    await seedFixtureSource('Outlet Z', 'fixtures/evidence-depth/voltcore-contradiction.json', 'outlet-z.test')
    await seedFixtureSource('Outlet W', 'fixtures/evidence-depth/voltcore-contradiction-2.json', 'outlet-w.test')
    await seedLens()

    const scan = await runFullScan()
    expect(scan.status).not.toBe('FAILED')

    // The claim was traced, and the two independent denials are on record.
    const layoff = await prisma.canonicalClaim.findFirstOrThrow({ where: { claimType: 'LAYOFF_SIGNAL' } })
    expect(layoff.contradictionCount).toBeGreaterThanOrEqual(2)
    // Heavy contradiction ⇒ CONTRADICTED factuality ⇒ withheld from events.
    expect(layoff.factualityLabel).toBe('CONTRADICTED')

    // The disputed claim did NOT silently ship as a layoff event...
    const layoffEvents = await prisma.eventCandidate.count({ where: { eventType: 'LAYOFF_SIGNAL' } })
    expect(layoffEvents).toBe(0)
    // ...it was QUARANTINED and reported.
    expect(scan.counts.signalsQuarantined).toBeGreaterThanOrEqual(1)
    const reviews = await prisma.reviewItem.findMany()
    expect(reviews.some((r) => r.itemType === 'QUARANTINED_CLAIM')).toBe(true)

    // The scan stayed guard-clean throughout.
    const impacts = await prisma.companyImpact.findMany()
    for (const i of impacts) expect(findAdviceLanguage(i.impactPathway)).toEqual([])
  })

  it('B: a corroborated claim drives a named-exposure event with lineage, differentiated reports and scenarios — guard-clean', async () => {
    // Origin + same-publisher syndication (not independent) + an
    // independently-worded report from a DIFFERENT publisher. No contradiction.
    await seedFixtureSource('Wire X', 'fixtures/evidence-depth/voltcore-origin.json', 'wire-x.test')
    await seedFixtureSource('Wire X syndication', 'fixtures/evidence-depth/voltcore-copy.json', 'wire-x.test')
    await seedFixtureSource('Outlet Y', 'fixtures/evidence-depth/voltcore-independent.json', 'outlet-y.test')
    await seedLens()

    const scan = await runFullScan()
    expect(scan.status).not.toBe('FAILED')

    // ── Stage 1: lineage traced; the same-publisher copy is NOT independent ──
    const layoff = await prisma.canonicalClaim.findFirstOrThrow({ where: { claimType: 'LAYOFF_SIGNAL' } })
    const lineage = await prisma.claimLineage.findMany({ where: { canonicalClaimId: layoff.id } })
    expect(lineage.some((l) => l.relationToOrigin === 'ORIGIN_CANDIDATE')).toBe(true)
    // 2 publishers, 3 documents → independence counts publishers, not rows.
    expect(layoff.independentSourceCount).toBeLessThan(lineage.length)

    // ── Stage 2: an event exists, its signals linked to the evidence layer ──
    const event = await prisma.eventCandidate.findFirstOrThrow({ where: { eventType: 'LAYOFF_SIGNAL' } })
    const linkedSignals = await prisma.signal.count({ where: { canonicalClaimId: { not: null } } })
    expect(linkedSignals).toBeGreaterThan(0)

    // ── Stage 5: named exposure comes only from resolved evidence entities ──
    const impacts = await prisma.companyImpact.findMany({ where: { eventCandidateId: event.id } })
    const named = impacts.filter((i) => i.entityId)
    expect(named.some((i) => i.companyName.toLowerCase().includes('voltcore'))).toBe(true)
    expect(impacts.some((i) => !i.entityId)).toBe(true) // category-level inference too
    for (const i of named) {
      expect(i.companyName.toLowerCase()).not.toBe('manchester')
      expect(i.companyName.toLowerCase()).not.toContain('chief executive')
    }

    // ── Stage 7: scenarios are event-specific; reports genuinely differ ──
    const scenarios = await prisma.futureScenario.findMany({ where: { eventCandidateId: event.id } })
    expect(scenarios).toHaveLength(5)
    expect(scenarios.some((s) => s.summary.toLowerCase().includes('voltcore'))).toBe(true)
    const sales = await assembleReport(event.id, 'SALES_OPPORTUNITY_BRIEF')
    const risk = await assembleReport(event.id, 'RISK_BRIEF')
    expect(sales!.markdown).not.toBe(risk!.markdown)
    expect((sales!.sections.orderedSections as string[])[1]).toBe('beneficiaries')
    expect((risk!.sections.orderedSections as string[])[1]).toBe('harmed')

    // ── Stage 9: the arc is cached (no write-on-GET) with a real composite ──
    const arc = await getEventArc(event.id)
    const arcRows = await prisma.evidenceArc.count()
    await getEventArc(event.id) // second read must not rewrite
    expect(await prisma.evidenceArc.count()).toBe(arcRows)
    expect(arc!.arc.truePotentialScore).toBeGreaterThanOrEqual(0)
    expect(arc!.arc.truePotentialScore).toBeLessThanOrEqual(1)
    expect(['RISING', 'FALLING', 'FLAT']).toContain((await getConfidenceHistory(event.id)).net)

    // ── ZERO guard violations across every generated surface ──
    const reports = await Promise.all(REPORT_TYPES.map((t) => assembleReport(event.id, t)))
    for (const report of reports) expect(findAdviceLanguage(report!.markdown), report!.reportType).toEqual([])
    for (const s of scenarios) expect(findAdviceLanguage(s.summary), s.scenarioType).toEqual([])
    for (const i of impacts) expect(findAdviceLanguage(i.impactPathway)).toEqual([])
    const positioning = await prisma.strategicPositioningExample.findMany()
    for (const p of positioning) {
      expect(findAdviceLanguage(`${p.title} ${p.howItCouldBeUsed} ${p.whyItMayMatter}`)).toEqual([])
    }

    // ── The scan never made a live LLM call (deterministic invariant holds) ──
    expect(await prisma.lLMRun.count({ where: { status: 'SUCCEEDED' } })).toBe(0)
  })
})
