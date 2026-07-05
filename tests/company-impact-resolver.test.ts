import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { IMPACT_TYPES } from '@/shared/enums'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const LAYOFF_BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'

describe('resolveCompanyImpacts', () => {
  beforeEach(resetDb)

  it('names an organisation from evidence with a pathway, evidence ids and an Entity', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing', region: 'UK' })
    const { impacts, errors } = await resolveCompanyImpacts(event.id)
    expect(errors).toHaveLength(0)

    const voltcore = impacts.find((i) => i.companyName.toLowerCase().includes('voltcore'))
    expect(voltcore).toBeTruthy()
    expect(voltcore!.impactPathway.length).toBeGreaterThan(0)
    expect(JSON.parse(voltcore!.evidenceIdsJson).length).toBeGreaterThan(0)
    expect(IMPACT_TYPES as readonly string[]).toContain(voltcore!.impactType)

    const entity = await prisma.entity.findFirst({ where: { name: 'Voltcore' } })
    expect(entity).not.toBeNull()
    expect(voltcore!.entityId).toBe(entity!.id)
  })

  it('does not turn a place into a company', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    const { impacts } = await resolveCompanyImpacts(event.id)
    expect(impacts.some((i) => i.companyName.toLowerCase() === 'manchester')).toBe(false)
  })

  it('emits a clearly-labelled, low-confidence category impact (never a fabricated company)', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    const { impacts } = await resolveCompanyImpacts(event.id)
    const category = impacts.find((i) => i.entityId === null)
    expect(category).toBeTruthy()
    expect(category!.companyName).toContain('(category)')
    expect(JSON.parse(category!.metadataJson).lowConfidence).toBe(true)
  })

  it('produces no financial-advice language in any pathway', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    const { impacts } = await resolveCompanyImpacts(event.id)
    for (const i of impacts) expect(findAdviceLanguage(i.impactPathway)).toEqual([])
  })
})
