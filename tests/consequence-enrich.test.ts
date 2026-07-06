import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import type { LLMProvider, LLMRequest } from '@/server/llm/types'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { synthesiseContext } from '@/server/consequence/context'
import { enrichEventConsequence } from '@/server/consequence/enrich'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'

/** Task-aware fake: rationale = plain prose; context = JSON narrative. */
function fake(byTask: Record<string, string>): LLMProvider {
  return {
    name: 'fake',
    async generate(req: LLMRequest) {
      return { text: byTask[req.taskType] ?? '', tokensIn: 1, tokensOut: 1 }
    },
  }
}

const GOOD_CONTEXT = JSON.stringify({
  historic: 'Prior comparable layoffs in the sector resolved slowly.',
  present: 'Voltcore is currently the named exposed party.',
  future: 'Watch for confirming reports before drawing conclusions.',
  executive: 'A layoff signal at Voltcore that a supplier or recruiter may wish to monitor.',
})

async function seedDeterministic(eventId: string) {
  await resolveCompanyImpacts(eventId)
  await synthesiseContext(eventId)
}

describe('enrichEventConsequence', () => {
  beforeEach(resetDb)

  it('writes llmRationale on named-org impacts and llmNarrativeJson on context', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    const provider = fake({
      COMPANY_IMPACT_ANALYSIS: 'Voltcore may face pressure as the situation develops; verify against primary sources.',
      PRESENT_CONTEXT: GOOD_CONTEXT,
    })
    const res = await enrichEventConsequence(event.id, { provider })

    expect(res.status).toBe('ENRICHED')
    expect(res.contextEnriched).toBe(true)
    expect(res.impactsEnriched).toBeGreaterThan(0)

    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    expect(named?.llmRationale).toContain('Voltcore')
    expect(named?.enrichedByLLMRunId).toBeTruthy()

    const ctx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId: event.id } })
    expect(JSON.parse(ctx!.llmNarrativeJson!).executive).toContain('Voltcore')
    for (const s of Object.values(JSON.parse(ctx!.llmNarrativeJson!))) {
      expect(findAdviceLanguage(s as string)).toEqual([])
    }
  })

  it('does NOT enrich category-level impacts (entityId null)', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    await enrichEventConsequence(event.id, {
      provider: fake({ COMPANY_IMPACT_ANALYSIS: 'Some category prose.', PRESENT_CONTEXT: GOOD_CONTEXT }),
    })
    const category = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: null } })
    expect(category?.llmRationale).toBeNull()
  })

  it('falls back (no llm fields) when output is advice/invalid', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    const res = await enrichEventConsequence(event.id, {
      provider: fake({ COMPANY_IMPACT_ANALYSIS: 'You should buy Voltcore now.', PRESENT_CONTEXT: 'not json' }),
    })
    expect(res.impactsEnriched).toBe(0)
    expect(res.contextEnriched).toBe(false)
    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    expect(named?.llmRationale).toBeNull()
    const ctx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId: event.id } })
    expect(ctx?.llmNarrativeJson).toBeNull()
    expect(ctx?.presentContext).toContain('Voltcore') // deterministic prose intact
  })

  it('is a dormant no-op with no provider', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    const res = await enrichEventConsequence(event.id, { provider: null })
    expect(res.status).toBe('DORMANT')
    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    expect(named?.llmRationale).toBeNull()
  })
})
