import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { generatePositioningFromImpacts } from '@/server/consequence/positioning'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const LAYOFF_BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'

describe('generatePositioningFromImpacts', () => {
  beforeEach(resetDb)

  it('creates impact-linked positioning with soft language and no advice', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    const { created, errors } = await generatePositioningFromImpacts(event.id)

    expect(errors).toHaveLength(0)
    expect(created.length).toBeGreaterThan(0)
    expect(created.every((p) => p.companyImpactId !== null)).toBe(true)
    for (const p of created) {
      expect(findAdviceLanguage(p.positioningAngle)).toEqual([])
      expect(findAdviceLanguage(p.howItCouldBeUsed)).toEqual([])
      expect(findAdviceLanguage(p.whyItMayMatter)).toEqual([])
    }
    expect(created.some((p) => /could|may|might|monitor|prepare|investigate|watch/i.test(p.howItCouldBeUsed))).toBe(true)
  })

  it('leaves opportunity-card positioning (companyImpactId null) untouched', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await prisma.strategicPositioningExample.create({
      data: {
        eventCandidateId: event.id,
        companyImpactId: null,
        title: 'opportunity-card positioning',
        userType: 'SUPPLIER',
        positioningAngle: 'a',
        howItCouldBeUsed: 'b',
        whyItMayMatter: 'c',
        evidenceSummary: 'd',
        confidence: 0.5,
        constraints: 'e',
      },
    })
    await resolveCompanyImpacts(event.id)
    await generatePositioningFromImpacts(event.id)
    const opportunityCardRow = await prisma.strategicPositioningExample.findFirst({
      where: { eventCandidateId: event.id, companyImpactId: null },
    })
    expect(opportunityCardRow).not.toBeNull()
  })
})
