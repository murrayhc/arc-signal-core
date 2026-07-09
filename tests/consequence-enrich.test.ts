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

/** Evidence ids arrive in the prompt as "- [<id>] <claim text>" lines — a
 *  grounded fake cites them back, exactly as a well-behaved model must. */
function evidenceIdsFromPrompt(prompt: string): string[] {
  return [...prompt.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])
}

/** Task-aware fake. Values may be literal strings (returned as-is — used for
 *  bad-output tests) or 'GROUNDED' to emit schema-valid JSON citing the
 *  evidence ids found in the request prompt. */
function fake(byTask: Record<string, string>): LLMProvider {
  return {
    name: 'fake',
    async generate(req: LLMRequest) {
      const spec = byTask[req.taskType] ?? ''
      if (spec !== 'GROUNDED') return { text: spec, tokensIn: 1, tokensOut: 1 }
      const ids = evidenceIdsFromPrompt(req.prompt)
      const text =
        req.taskType === 'COMPANY_IMPACT_ANALYSIS'
          ? JSON.stringify({
              rationale: 'Voltcore may face pressure as the situation develops; verify against primary sources.',
              citedEvidenceIds: ids.slice(0, 1),
            })
          : JSON.stringify({
              historic: 'Prior comparable layoffs in the sector resolved slowly.',
              present: 'Voltcore is currently the named exposed party.',
              future: 'Watch for confirming reports before drawing conclusions.',
              executive: 'A layoff signal at Voltcore that a supplier or recruiter may wish to monitor.',
              citedEvidenceIds: ids.slice(0, 1),
            })
      return { text, tokensIn: 1, tokensOut: 1 }
    },
  }
}

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
      COMPANY_IMPACT_ANALYSIS: 'GROUNDED',
      PRESENT_CONTEXT: 'GROUNDED',
    })
    const res = await enrichEventConsequence(event.id, { provider })

    expect(res.status).toBe('ENRICHED')
    expect(res.contextEnriched).toBe(true)
    expect(res.impactsEnriched).toBeGreaterThan(0)

    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    expect(named?.llmRationale).toContain('Voltcore')
    // The stored rationale is the PARSED prose, not the raw JSON envelope.
    expect(named?.llmRationale).not.toContain('citedEvidenceIds')
    expect(named?.enrichedByLLMRunId).toBeTruthy()

    const ctx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId: event.id } })
    const narrative = JSON.parse(ctx!.llmNarrativeJson!)
    expect(narrative.executive).toContain('Voltcore')
    expect(narrative.citedEvidenceIds.length).toBeGreaterThan(0)
    for (const s of Object.values(narrative)) {
      if (typeof s === 'string') expect(findAdviceLanguage(s)).toEqual([])
    }
  })

  it('rejects an output that cites none of the supplied evidence ids (ungrounded)', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    // Schema-valid, advice-clean — but cites a fabricated evidence id.
    const ungrounded = JSON.stringify({
      rationale: 'Voltcore may face pressure; verify against primary sources.',
      citedEvidenceIds: ['fabricated-id-000'],
    })
    const res = await enrichEventConsequence(event.id, {
      provider: fake({ COMPANY_IMPACT_ANALYSIS: ungrounded, PRESENT_CONTEXT: 'not json' }),
    })
    expect(res.impactsEnriched).toBe(0)
    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    expect(named?.llmRationale).toBeNull()
  })

  it('does NOT enrich category-level impacts (entityId null)', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    await enrichEventConsequence(event.id, {
      provider: fake({ COMPANY_IMPACT_ANALYSIS: 'GROUNDED', PRESENT_CONTEXT: 'GROUNDED' }),
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
