import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { classifyEvents } from '@/server/pipeline/classify'
import { resetDb } from '../helpers'

async function makeEvent(overrides: Record<string, unknown> = {}) {
  const scanRun = await prisma.scanRun.create({ data: {} })
  return prisma.eventCandidate.create({
    data: {
      title: 'Layoff pressure — technology (UK)',
      eventType: 'LAYOFF_SIGNAL',
      eventClass: 'RISK',
      summary: 'test',
      severity: 0.8,
      probability: 0.8,
      confidence: 0.85,
      evidenceCount: 2,
      sourceDiversityScore: 1,
      signalStrength: 0.8,
      noveltyScore: 0.9,
      opportunityScore: 0.2,
      riskScore: 0.75,
      createdFromScanRunId: scanRun.id,
      isFixture: true,
      ...overrides,
    },
  })
}

describe('classifyEvents', () => {
  beforeEach(resetDb)

  it('classifies a layoff risk event with dual risk/opportunity logic', async () => {
    const event = await makeEvent()
    const { riskOpportunities, errors } = await classifyEvents([event])
    expect(errors).toHaveLength(0)
    expect(riskOpportunities).toHaveLength(1)
    const ro = riskOpportunities[0]
    expect(ro.eventCandidateId).toBe(event.id)
    expect(ro.type).toBe('RISK')
    expect(ro.riskLogic).toContain('stress')
    expect(ro.opportunityLogic.toLowerCase()).toContain('talent')
    const questions = JSON.parse(ro.questionsJson) as string[]
    expect(questions.length).toBeGreaterThanOrEqual(7)
    expect(questions).toContain('What changed in the last seven days?')
  })

  it('classifies opportunity events', async () => {
    const event = await makeEvent({
      eventType: 'PROCUREMENT_INCREASE',
      eventClass: 'OPPORTUNITY',
      riskScore: 0.2,
      opportunityScore: 0.75,
    })
    const { riskOpportunities } = await classifyEvents([event])
    expect(riskOpportunities[0].type).toBe('OPPORTUNITY')
    expect(riskOpportunities[0].opportunityLogic.toLowerCase()).toContain('demand')
  })

  it('uses generic logic for event types without a specific rule, and keeps WATCH type', async () => {
    const event = await makeEvent({ eventType: 'MACRO_PRESSURE', eventClass: 'WATCH', confidence: 0.4 })
    const { riskOpportunities } = await classifyEvents([event])
    expect(riskOpportunities[0].type).toBe('WATCH')
    expect(riskOpportunities[0].riskLogic.length).toBeGreaterThan(20)
    expect(riskOpportunities[0].opportunityLogic.length).toBeGreaterThan(20)
  })
})
