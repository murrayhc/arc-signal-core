import type { CompanyImpact } from '@prisma/client'
import { prisma } from '@/server/db'
import type { CompanyImpactView } from '@/server/consequence/types'

function parseArr(json: string): string[] {
  try {
    const j = JSON.parse(json)
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function toView(i: CompanyImpact): CompanyImpactView {
  let lowConfidence = false
  try {
    lowConfidence = !!(JSON.parse(i.metadataJson) as { lowConfidence?: boolean })?.lowConfidence
  } catch {
    lowConfidence = false
  }
  return {
    id: i.id,
    companyName: i.companyName,
    impactType: i.impactType,
    confidence: i.confidence,
    impactPathway: i.impactPathway,
    evidenceIds: parseArr(i.evidenceIdsJson),
    watchSignals: parseArr(i.watchSignalsJson),
    riskScore: i.riskScore,
    opportunityScore: i.opportunityScore,
    entityId: i.entityId,
    lowConfidence,
    lastUpdated: i.updatedAt.toISOString(),
  }
}

const BENEFICIARY_TYPES = new Set(['BENEFICIARY', 'MIXED'])
const HARMED_TYPES = new Set(['HARMED', 'MIXED', 'EXPOSED'])

export async function getEventCompanyImpacts(eventCandidateId: string): Promise<CompanyImpactView[]> {
  const rows = await prisma.companyImpact.findMany({
    where: { eventCandidateId },
    orderBy: [{ confidence: 'desc' }, { createdAt: 'asc' }],
  })
  return rows.map(toView)
}

export async function getEventBeneficiaries(eventCandidateId: string): Promise<CompanyImpactView[]> {
  return (await getEventCompanyImpacts(eventCandidateId)).filter((v) => BENEFICIARY_TYPES.has(v.impactType))
}

export async function getEventHarmed(eventCandidateId: string): Promise<CompanyImpactView[]> {
  return (await getEventCompanyImpacts(eventCandidateId)).filter((v) => HARMED_TYPES.has(v.impactType))
}

export async function getEntityImpactPathways(entityId: string): Promise<CompanyImpactView[]> {
  const rows = await prisma.companyImpact.findMany({
    where: { entityId },
    orderBy: { updatedAt: 'desc' },
  })
  return rows.map(toView)
}
