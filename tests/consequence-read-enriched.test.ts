import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { synthesiseContext } from '@/server/consequence/context'
import { getEventDeepReport } from '@/server/services/consequence'
import { assembleReport } from '@/server/consequence/report'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'

describe('read path surfaces enriched fields', () => {
  beforeEach(resetDb)

  it('deep report prefers llmRationale + llmNarrative and sets aiEnhanced', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    await synthesiseContext(event.id)
    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    await prisma.companyImpact.update({ where: { id: named!.id }, data: { llmRationale: 'AI rationale for Voltcore.', enrichedByLLMRunId: 'r1' } })
    await prisma.eventContextSynthesis.update({
      where: { eventCandidateId: event.id },
      data: { llmNarrativeJson: JSON.stringify({ historic: 'H', present: 'P', future: 'F', executive: 'E brief' }), enrichedByLLMRunId: 'r2' },
    })

    const report = await getEventDeepReport(event.id)
    const enriched = report.companies.find((c) => c.aiEnhanced)
    expect(enriched?.llmRationale).toBe('AI rationale for Voltcore.')
    expect(enriched?.impactPathway).toBe('AI rationale for Voltcore.')
    expect(report.context?.llmNarrative?.executive).toBe('E brief')

    const assembled = await assembleReport(event.id, 'EXECUTIVE_BRIEF')
    expect(assembled!.markdown).toContain('E brief') // executive narrative surfaced
  })

  it('unenriched event reports aiEnhanced=false, deterministic prose', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    await synthesiseContext(event.id)
    const report = await getEventDeepReport(event.id)
    expect(report.companies.every((c) => c.aiEnhanced === false)).toBe(true)
    expect(report.context?.llmNarrative ?? null).toBeNull()
  })
})
