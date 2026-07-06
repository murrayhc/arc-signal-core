import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

describe('ai-enrichment schema columns', () => {
  beforeEach(resetDb)

  it('persists llmRationale + enrichedByLLMRunId on CompanyImpact', async () => {
    const { event } = await makeEventGraph('Voltcore is cutting 400 jobs.', { eventClass: 'RISK' })
    const impact = await prisma.companyImpact.create({
      data: {
        eventCandidateId: event.id,
        companyName: 'Voltcore',
        impactType: 'HARMED',
        impactPathway: 'deterministic',
        confidence: 0.5,
        evidenceIdsJson: '[]',
        riskScore: 0.7,
        opportunityScore: 0.3,
        watchSignalsJson: '[]',
        metadataJson: '{}',
        llmRationale: 'AI-written why.',
        enrichedByLLMRunId: 'run_abc',
      },
    })
    expect(impact.llmRationale).toBe('AI-written why.')
    expect(impact.enrichedByLLMRunId).toBe('run_abc')
  })

  it('persists llmNarrativeJson + enrichedByLLMRunId on EventContextSynthesis', async () => {
    const { event } = await makeEventGraph('Voltcore is cutting 400 jobs.', { eventClass: 'RISK' })
    const ctx = await prisma.eventContextSynthesis.create({
      data: {
        eventCandidateId: event.id,
        historicContext: 'h',
        presentContext: 'p',
        futureContext: 'f',
        confidence: 0.5,
        evidenceIdsJson: '[]',
        llmNarrativeJson: JSON.stringify({ historic: 'H', present: 'P', future: 'F', executive: 'E' }),
        enrichedByLLMRunId: 'run_xyz',
      },
    })
    expect(JSON.parse(ctx.llmNarrativeJson!).executive).toBe('E')
  })
})
