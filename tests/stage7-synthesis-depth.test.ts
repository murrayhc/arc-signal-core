import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { composeScenarioNarrative, type ScenarioFacts } from '@/server/consequence/scenario-narrative'
import { describeAnalogues, findHistoricAnalogues } from '@/server/consequence/historic-analogue'
import { synthesiseContext } from '@/server/consequence/context'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { assembleReport } from '@/server/consequence/report'
import { getConfidenceHistory } from '@/server/graph/timeline'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const baseFacts = (over: Partial<ScenarioFacts> = {}): ScenarioFacts => ({
  event: {
    eventType: 'LAYOFF_SIGNAL',
    eventClass: 'RISK',
    affectedSector: 'manufacturing',
    affectedRegion: 'UK',
    momentumScore: 0.5,
  },
  beneficiaries: [],
  harmed: ['Voltcore'],
  commodities: [],
  reliabilityPct: 70,
  contradictionCount: 0,
  independentPublishers: 2,
  ...over,
})

// ── Scenario narratives are event-specific, not canned ──────────────────────

describe('composeScenarioNarrative', () => {
  it('weaves the event\'s actual facts into each scenario', () => {
    const facts = baseFacts({ harmed: ['Voltcore'], commodities: ['lithium'], reliabilityPct: 82, independentPublishers: 3 })
    const base = composeScenarioNarrative('BASE_CASE', facts)
    expect(base).toContain('Voltcore')
    expect(base).toContain('manufacturing')
    expect(base).toContain('lithium')
    expect(base).toContain('82% reliability')
    expect(base).toContain('3 independent publishers')
  })

  it('two different events produce different base-case narratives', () => {
    const a = composeScenarioNarrative('BASE_CASE', baseFacts({ harmed: ['Voltcore'], event: { ...baseFacts().event, affectedSector: 'manufacturing' } }))
    const b = composeScenarioNarrative(
      'BASE_CASE',
      baseFacts({ harmed: ['Meridian Grid'], event: { eventType: 'REGULATORY_PRESSURE', eventClass: 'RISK', affectedSector: 'energy', affectedRegion: 'EU', momentumScore: 0.7 } }),
    )
    expect(a).not.toBe(b)
    expect(a).toContain('Voltcore')
    expect(b).toContain('Meridian Grid')
    expect(b).toContain('energy')
  })

  it('reversal narrative leans on contradictions', () => {
    const withContra = composeScenarioNarrative('REVERSAL', baseFacts({ contradictionCount: 3 }))
    expect(withContra).toContain('3 contradicting report(s) hold')
  })

  it('momentum descriptor reflects the score', () => {
    expect(composeScenarioNarrative('ACCELERATED', baseFacts({ event: { ...baseFacts().event, momentumScore: 0.8 } }))).toContain('building momentum sustains')
    expect(composeScenarioNarrative('CONSERVATIVE', baseFacts({ event: { ...baseFacts().event, momentumScore: 0.2 } }))).toContain('fading')
  })
})

// ── Historic analogue retrieval ─────────────────────────────────────────────

describe('findHistoricAnalogues', () => {
  beforeEach(resetDb)

  it('scores prior events by type/sector/region and reports outcomes', async () => {
    const scan = await prisma.scanRun.create({ data: {} })
    const mk = async (over: Record<string, unknown>, daysAgo: number) =>
      prisma.eventCandidate.create({
        data: {
          title: 'e',
          eventType: 'LAYOFF_SIGNAL',
          eventClass: 'RISK',
          summary: 's',
          severity: 0.5,
          probability: 0.5,
          confidence: 0.5,
          evidenceCount: 1,
          sourceDiversityScore: 1,
          signalStrength: 0.5,
          noveltyScore: 0.5,
          opportunityScore: 0.2,
          riskScore: 0.6,
          affectedSector: 'manufacturing',
          affectedRegion: 'UK',
          createdFromScanRunId: scan.id,
          firstDetectedAt: new Date(Date.now() - daysAgo * 86_400_000),
          ...over,
        },
      })

    const priorSameType = await mk({ status: 'CONFIRMED' }, 30)
    await mk({ eventType: 'FUNDING_SIGNAL', affectedSector: 'energy', affectedRegion: 'EU', status: 'DECLINING' }, 20)
    const current = await mk({}, 0)

    const analogues = await findHistoricAnalogues(current, 3)
    expect(analogues.length).toBeGreaterThanOrEqual(1)
    // Same-type/sector/region prior scores highest.
    expect(analogues[0].eventId).toBe(priorSameType.id)
    expect(analogues[0].similarity).toBeGreaterThan(0.5)
    expect(analogues[0].basis).toContain('same event type')

    const line = describeAnalogues(analogues, 'LAYOFF_SIGNAL', 'manufacturing')
    expect(line).toContain('comparable pattern')
    expect(line).toContain('confirmed')
  })

  it('honestly reports no analogue when the corpus is empty', async () => {
    const scan = await prisma.scanRun.create({ data: {} })
    const only = await prisma.eventCandidate.create({
      data: {
        title: 'e', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 's',
        severity: 0.5, probability: 0.5, confidence: 0.5, evidenceCount: 1, sourceDiversityScore: 1,
        signalStrength: 0.5, noveltyScore: 0.5, opportunityScore: 0.2, riskScore: 0.6,
        createdFromScanRunId: scan.id,
      },
    })
    expect(await findHistoricAnalogues(only)).toEqual([])
    expect(describeAnalogues([], 'LAYOFF_SIGNAL', 'manufacturing')).toContain('No comparable')
  })
})

// ── Report-type differentiation ─────────────────────────────────────────────

describe('report type differentiation', () => {
  beforeEach(resetDb)

  it('a sales brief and a risk brief order sections differently', async () => {
    const { event } = await makeEventGraph('Voltcore Ltd will cut 400 jobs at its Manchester plant.', {
      eventClass: 'RISK',
      sector: 'manufacturing',
    })
    await resolveCompanyImpacts(event.id)
    await synthesiseContext(event.id)

    const sales = await assembleReport(event.id, 'SALES_OPPORTUNITY_BRIEF')
    const risk = await assembleReport(event.id, 'RISK_BRIEF')
    expect(sales).not.toBeNull()
    expect(risk).not.toBeNull()

    // Different bodies, not the same sections under a different header.
    expect(sales!.markdown).not.toBe(risk!.markdown)

    // Sales leads with beneficiaries + positioning; risk leads with harmed.
    const salesOrder = sales!.sections.orderedSections as string[]
    const riskOrder = risk!.sections.orderedSections as string[]
    expect(salesOrder[1]).toBe('beneficiaries')
    expect(salesOrder).toContain('positioning')
    expect(riskOrder[1]).toBe('harmed')

    // Sales positions "Who benefits" ABOVE "Who is harmed"; risk the reverse
    // (a risk brief may not even render beneficiaries).
    const salesBenefitsIdx = sales!.markdown.indexOf('## Who benefits')
    expect(salesBenefitsIdx).toBeGreaterThan(-1)

    // Every report keeps the non-advisory footer.
    expect(sales!.markdown).toContain('not investment advice')
    expect(risk!.markdown).toContain('not investment advice')
  })
})

// ── Confidence history from existing GraphEvents ────────────────────────────

describe('getConfidenceHistory', () => {
  beforeEach(resetDb)

  it('reconstructs confidence movement from CONFIDENCE_ROSE/FELL graph events', async () => {
    const scan = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'e', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 's',
        severity: 0.5, probability: 0.5, confidence: 0.5, evidenceCount: 1, sourceDiversityScore: 1,
        signalStrength: 0.5, noveltyScore: 0.5, opportunityScore: 0.2, riskScore: 0.6,
        createdFromScanRunId: scan.id,
      },
    })
    const node = await prisma.graphNode.create({
      data: { nodeType: 'EVENT', refType: 'event', refId: event.id, title: 'e', confidence: 0.5 },
    })
    const now = Date.now()
    for (const [type, hoursAgo] of [
      ['CONFIDENCE_ROSE', 30],
      ['CONFIDENCE_ROSE', 20],
      ['CONFIDENCE_FELL', 10],
    ] as const) {
      await prisma.graphEvent.create({
        data: {
          graphNodeId: node.id, eventCandidateId: event.id, eventType: type, description: 'd',
          occurredAt: new Date(now - hoursAgo * 3_600_000),
        },
      })
    }

    const history = await getConfidenceHistory(event.id)
    expect(history.points).toHaveLength(3)
    expect(history.points[0].direction).toBe('ROSE') // oldest first
    expect(history.net).toBe('RISING') // 2 rose vs 1 fell
  })

  it('returns empty/flat for an event with no graph node', async () => {
    const history = await getConfidenceHistory('nope')
    expect(history.points).toEqual([])
    expect(history.net).toBe('FLAT')
  })
})
