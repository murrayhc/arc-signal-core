import type { CompanyImpact, StrategicPositioningExample } from '@prisma/client'
import { prisma } from '@/server/db'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import type { ConsequenceError } from './types'

const pct = (n: number) => `${Math.round(n * 100)}%`

const ROLE_LABEL: Record<string, string> = {
  SALES: 'sales team',
  PROCUREMENT: 'procurement team',
  INVESTOR_RESEARCHER: 'investor researcher',
  CONSULTANT: 'consultant',
  RECRUITER: 'recruiter',
  SUPPLIER: 'supplier',
  OPERATOR: 'operator',
  FOUNDER: 'founder',
  ANALYST: 'analyst',
  PUBLIC_SECTOR: 'public sector team',
  RISK_MANAGER: 'risk manager',
}

/** Which user roles a positioning example is drawn for, by impact type. */
const IMPACT_ROLES: Record<string, string[]> = {
  BENEFICIARY: ['SALES', 'SUPPLIER', 'FOUNDER'],
  MIXED: ['ANALYST', 'CONSULTANT'],
  HARMED: ['RISK_MANAGER', 'CONSULTANT'],
  EXPOSED: ['RISK_MANAGER', 'PROCUREMENT'],
  WATCH_ONLY: ['ANALYST'],
  UNKNOWN: ['ANALYST'],
}

const CONSTRAINTS = 'Strategic positioning example, not investment advice; verify against primary sources and confirm specifics before acting.'
const MAX_PER_EVENT = 12

function renderPositioning(
  impact: CompanyImpact,
  role: string,
  sector: string,
): Omit<StrategicPositioningExample, 'id' | 'createdAt' | 'updatedAt'> {
  const label = ROLE_LABEL[role] ?? 'team'
  const opportunityLeaning = impact.impactType === 'BENEFICIARY' || impact.impactType === 'MIXED'
  const framing = opportunityLeaning ? 'a potential opportunity' : 'a potential exposure'
  const evidenceCount = (() => {
    try {
      const j = JSON.parse(impact.evidenceIdsJson)
      return Array.isArray(j) ? j.length : 0
    } catch {
      return 0
    }
  })()

  const title = `${impact.companyName} — ${label} positioning`
  const positioningAngle = `A ${label} could treat ${impact.companyName} as ${framing} to monitor in ${sector}.`
  const howItCouldBeUsed = `A ${label} might monitor ${impact.companyName}, prepare relevant material, and investigate the specifics before acting on this ${sector} signal.`
  const whyItMayMatter = `The current evidence suggests ${impact.companyName} may be ${impact.impactType.toLowerCase().replace(/_/g, ' ')} as this ${sector} pattern develops; watch for confirming or weakening signals before drawing conclusions.`
  const evidenceSummary = `Based on the company-impact assessment (confidence ${pct(impact.confidence)}) drawn from ${evidenceCount} evidence id(s).`

  for (const [field, text] of [
    ['title', title],
    ['positioningAngle', positioningAngle],
    ['howItCouldBeUsed', howItCouldBeUsed],
    ['whyItMayMatter', whyItMayMatter],
    ['evidenceSummary', evidenceSummary],
  ] as const) {
    assertNoAdviceLanguage(text, `StrategicPositioningExample.${field}`)
  }

  return {
    eventCandidateId: impact.eventCandidateId as string,
    opportunityCardId: null,
    evidenceArcId: null,
    companyImpactId: impact.id,
    revenueLensId: null,
    title,
    userType: role,
    positioningAngle,
    howItCouldBeUsed,
    whyItMayMatter,
    evidenceSummary,
    confidence: impact.confidence,
    constraints: CONSTRAINTS,
    isFixture: false,
  }
}

/** Generates strategic positioning examples from an event's company impacts (one
 *  per relevant user role), in could/may/might language, each advice-guarded and
 *  linked via companyImpactId. Regenerates only impact-based rows — the existing
 *  opportunity-card positioning (companyImpactId null) is untouched. */
export async function generatePositioningFromImpacts(
  eventCandidateId: string,
): Promise<{ created: StrategicPositioningExample[]; errors: ConsequenceError[] }> {
  const errors: ConsequenceError[] = []
  const event = await prisma.eventCandidate.findUnique({ where: { id: eventCandidateId } })
  if (!event) {
    return { created: [], errors: [{ stage: 'positioning', message: `Event ${eventCandidateId} not found`, eventCandidateId }] }
  }
  const sector = event.affectedSector ?? 'the affected sector'
  const impacts = await prisma.companyImpact.findMany({ where: { eventCandidateId }, orderBy: { confidence: 'desc' } })

  // Idempotent: clear only impact-based positioning (leave opportunity-card rows).
  await prisma.strategicPositioningExample.deleteMany({ where: { eventCandidateId, companyImpactId: { not: null } } })

  const created: StrategicPositioningExample[] = []
  for (const impact of impacts) {
    if (!impact.eventCandidateId) continue
    const roles = IMPACT_ROLES[impact.impactType] ?? ['ANALYST']
    for (const role of roles) {
      if (created.length >= MAX_PER_EVENT) break
      try {
        created.push(await prisma.strategicPositioningExample.create({ data: renderPositioning(impact, role, sector) }))
      } catch (err) {
        errors.push({ stage: 'positioning', message: err instanceof Error ? err.message : String(err), eventCandidateId })
      }
    }
  }

  return { created, errors }
}
