import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { synthesiseContext } from '@/server/consequence/context'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const LAYOFF_BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'

describe('synthesiseContext', () => {
  beforeEach(resetDb)

  it('generates present/historic/future context and 5 advice-clean scenarios', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    const { synthesis, scenarios, errors } = await synthesiseContext(event.id)

    expect(errors).toHaveLength(0)
    expect(synthesis).toBeTruthy()
    expect(synthesis!.presentContext.length).toBeGreaterThan(0)
    expect(synthesis!.historicContext.length).toBeGreaterThan(0)
    expect(synthesis!.futureContext.length).toBeGreaterThan(0)

    expect(scenarios).toHaveLength(5)
    expect(new Set(scenarios.map((s) => s.scenarioType)).size).toBe(5)
    for (const s of scenarios) {
      expect(JSON.parse(s.confirmingSignalsJson).length).toBeGreaterThan(0)
      expect(JSON.parse(s.weakeningSignalsJson).length).toBeGreaterThan(0)
      expect(findAdviceLanguage(s.summary)).toEqual([])
    }
    for (const text of [synthesis!.presentContext, synthesis!.historicContext, synthesis!.futureContext]) {
      expect(findAdviceLanguage(text)).toEqual([])
    }
  })

  it('is honest when no prior comparable pattern exists', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    const { synthesis } = await synthesiseContext(event.id)
    expect(synthesis!.historicContext.toLowerCase()).toContain('no prior')
  })

  it('raises REVERSAL scenario confidence when contradictions are present', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    const cids = await canonicalIdsForEvent(event.id)
    await prisma.canonicalClaim.updateMany({ where: { id: { in: cids } }, data: { contradictionCount: 2 } })
    const { scenarios } = await synthesiseContext(event.id)
    const reversal = scenarios.find((s) => s.scenarioType === 'REVERSAL')!
    const accelerated = scenarios.find((s) => s.scenarioType === 'ACCELERATED')!
    expect(reversal.confidence).toBeGreaterThanOrEqual(accelerated.confidence)
  })
})
