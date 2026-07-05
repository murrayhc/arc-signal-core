import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import {
  getEntityImpactPathways,
  getEventBeneficiaries,
  getEventCompanyImpacts,
  getEventHarmed,
} from '@/server/services/consequence'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const LAYOFF_BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'

describe('consequence read service', () => {
  beforeEach(resetDb)

  it('splits beneficiaries and harmed by impact type, with array views', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)

    const all = await getEventCompanyImpacts(event.id)
    expect(all.length).toBeGreaterThan(0)
    expect(Array.isArray(all[0].evidenceIds)).toBe(true)
    expect(Array.isArray(all[0].watchSignals)).toBe(true)

    const beneficiaries = await getEventBeneficiaries(event.id)
    expect(beneficiaries.length).toBeGreaterThan(0)
    expect(beneficiaries.every((v) => v.impactType === 'BENEFICIARY' || v.impactType === 'MIXED')).toBe(true)

    const harmed = await getEventHarmed(event.id)
    expect(harmed.every((v) => ['HARMED', 'MIXED', 'EXPOSED'].includes(v.impactType))).toBe(true)
    expect(harmed.some((v) => v.companyName.toLowerCase().includes('voltcore'))).toBe(true)
  })

  it("returns an entity's impact pathways", async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    const entity = await prisma.entity.findFirstOrThrow({ where: { name: 'Voltcore' } })
    const pathways = await getEntityImpactPathways(entity.id)
    expect(pathways.length).toBeGreaterThan(0)
    expect(pathways[0].impactPathway.length).toBeGreaterThan(0)
  })
})
