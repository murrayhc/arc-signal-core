import type { EventCandidate, OpportunityCard, RevenueLens, StrategicPositioningExample } from '@prisma/client'
import { prisma } from '@/server/db'
import type { OpportunityType, PositioningUserType } from '@/shared/enums'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import type { PipelineError } from './types'

export type OpportunityCardWithEvent = OpportunityCard & { eventCandidate: EventCandidate }

const CONSTRAINTS_TEXT = 'Strategic positioning example, not investment advice; verify against primary sources.'

const USER_TYPE_MAP: Record<string, PositioningUserType[]> = {
  TALENT_ACQUISITION: ['RECRUITER'],
  HIRING: ['RECRUITER'],
  PROCUREMENT: ['PROCUREMENT', 'SUPPLIER'],
  SALES: ['SUPPLIER'],
  PARTNERSHIP: ['SUPPLIER'],
  COMPLIANCE: ['ADVISOR'],
  ADVISORY: ['ADVISOR'],
  PRODUCT_GAP: ['PRODUCT_TEAM'],
  MARKET_ENTRY: ['SUPPLIER'],
  COMPETITOR_DISPLACEMENT: ['SUPPLIER'],
  M_AND_A: ['ADVISOR'],
  CRISIS_SUPPORT: ['ADVISOR'],
  INVESTMENT_WATCH: ['INVESTOR_WATCH'],
  CONTENT: ['ANALYST', 'GENERAL'],
}

const DEFAULT_USER_TYPES: PositioningUserType[] = ['ANALYST', 'GENERAL']

export function opportunityTypeToUserTypes(t: OpportunityType): PositioningUserType[] {
  return USER_TYPE_MAP[t] ?? DEFAULT_USER_TYPES
}

type UserTypeTemplate = {
  angle: (sector: string, region: string) => string
  howItCouldBeUsed: (sector: string, region: string) => string
  whyItMayMatter: (sector: string, region: string) => string
}

const SECTOR_FALLBACK = 'the affected sector'
const REGION_FALLBACK = 'the affected region'

const USER_TYPE_TEMPLATES: Record<PositioningUserType, UserTypeTemplate> = {
  RECRUITER: {
    angle: (sector, region) =>
      `A recruiter could position this as a talent-availability watch point in ${sector} (${region}).`,
    howItCouldBeUsed: (sector) =>
      `A recruiter might review which ${sector} candidates could become available and prepare an outreach shortlist.`,
    whyItMayMatter: (sector, region) =>
      `Talent movement in ${sector} (${region}) could shift candidate availability; monitor before committing search resource.`,
  },
  SUPPLIER: {
    angle: (sector, region) =>
      `A supplier could position this as a demand-shift watch point in ${sector} (${region}).`,
    howItCouldBeUsed: (sector) =>
      `A supplier might prepare a tailored proposal and review buyer priorities emerging in ${sector}.`,
    whyItMayMatter: (sector, region) =>
      `Buyer priorities in ${sector} (${region}) could change quickly; compare this pattern against prior cycles before committing resource.`,
  },
  PROCUREMENT: {
    angle: (sector, region) =>
      `A procurement team could position this as a supplier-relationship watch point in ${sector} (${region}).`,
    howItCouldBeUsed: (sector) =>
      `A procurement team might review current supplier relationships in ${sector} and consider where alternatives could help.`,
    whyItMayMatter: (sector, region) =>
      `Procurement conditions in ${sector} (${region}) may not persist; investigate before adjusting supplier strategy.`,
  },
  PRODUCT_TEAM: {
    angle: (sector, region) =>
      `A product team could position this as a gap-scoping watch point in ${sector} (${region}).`,
    howItCouldBeUsed: (sector) =>
      `A product team might prepare a lightweight scoping exercise for the gap emerging in ${sector}.`,
    whyItMayMatter: (sector, region) =>
      `Demand for a fix in ${sector} (${region}) could be narrow or temporary; investigate durability before building.`,
  },
  INVESTOR_WATCH: {
    angle: (sector, region) =>
      `An investor-watch team could position this as sector-context, not a trading signal, for ${sector} (${region}).`,
    howItCouldBeUsed: (sector) =>
      `An analyst might prepare a market-context briefing on the pattern developing in ${sector}.`,
    whyItMayMatter: (sector, region) =>
      `Conditions in ${sector} (${region}) could change; monitor alongside other sector indicators before drawing conclusions.`,
  },
  ADVISOR: {
    angle: (sector, region) =>
      `An advisor could position this as a structured-review watch point for organisations in ${sector} (${region}).`,
    howItCouldBeUsed: (sector) =>
      `An advisor might prepare a structured review of options for organisations affected in ${sector}.`,
    whyItMayMatter: (sector, region) =>
      `The situation in ${sector} (${region}) could evolve; investigate current status before engaging.`,
  },
  ANALYST: {
    angle: (sector, region) =>
      `An analyst could position this as a pattern worth tracking in ${sector} (${region}).`,
    howItCouldBeUsed: (sector) =>
      `An analyst might prepare a briefing note and review it as further evidence about ${sector} arrives.`,
    whyItMayMatter: (sector, region) =>
      `This pattern in ${sector} (${region}) is early-stage; monitor before treating it as settled.`,
  },
  GENERAL: {
    angle: (sector, region) =>
      `A general audience could consider this a pattern worth watching in ${sector} (${region}).`,
    howItCouldBeUsed: (sector) =>
      `A reader might consider how this pattern in ${sector} relates to their own context and review further updates.`,
    whyItMayMatter: (sector, region) =>
      `This pattern in ${sector} (${region}) may or may not persist; watch for confirming or contradicting evidence.`,
  },
}

function renderExample(
  card: OpportunityCardWithEvent,
  event: EventCandidate,
  userType: PositioningUserType,
  lens: RevenueLens | null,
): Omit<StrategicPositioningExample, 'id' | 'createdAt' | 'updatedAt'> {
  const sector = event.affectedSector ?? SECTOR_FALLBACK
  const region = event.affectedRegion ?? REGION_FALLBACK
  const template = USER_TYPE_TEMPLATES[userType]

  const title = `${card.title} — ${userType.replace(/_/g, ' ').toLowerCase()} positioning`
  const positioningAngle = template.angle(sector, region)
  const howItCouldBeUsed = template.howItCouldBeUsed(sector, region)
  const whyItMayMatter = template.whyItMayMatter(sector, region)
  const evidenceSummary = `Based on ${event.evidenceCount} piece(s) of evidence across a source-diversity score of ${event.sourceDiversityScore.toFixed(2)} for "${event.title}".`
  const constraints = CONSTRAINTS_TEXT

  assertNoAdviceLanguage(title, 'StrategicPositioningExample.title')
  assertNoAdviceLanguage(positioningAngle, 'StrategicPositioningExample.positioningAngle')
  assertNoAdviceLanguage(howItCouldBeUsed, 'StrategicPositioningExample.howItCouldBeUsed')
  assertNoAdviceLanguage(whyItMayMatter, 'StrategicPositioningExample.whyItMayMatter')
  assertNoAdviceLanguage(evidenceSummary, 'StrategicPositioningExample.evidenceSummary')
  assertNoAdviceLanguage(constraints, 'StrategicPositioningExample.constraints')

  return {
    eventCandidateId: card.eventCandidateId,
    opportunityCardId: card.id,
    evidenceArcId: null,
    companyImpactId: null,
    revenueLensId: card.revenueLensId ?? lens?.id ?? null,
    title,
    userType,
    positioningAngle,
    howItCouldBeUsed,
    whyItMayMatter,
    evidenceSummary,
    confidence: card.confidence,
    constraints,
    isFixture: event.isFixture,
  }
}

export async function generatePositioning(
  cards: OpportunityCardWithEvent[],
  lens: RevenueLens | null,
): Promise<{ created: StrategicPositioningExample[]; errors: PipelineError[] }> {
  const created: StrategicPositioningExample[] = []
  const errors: PipelineError[] = []

  for (const card of cards) {
    try {
      const userTypes = opportunityTypeToUserTypes(card.opportunityType as OpportunityType).slice(0, 3)
      const specs = userTypes.map((userType) => renderExample(card, card.eventCandidate, userType, lens))

      await prisma.strategicPositioningExample.deleteMany({ where: { opportunityCardId: card.id } })

      for (const spec of specs) {
        created.push(await prisma.strategicPositioningExample.create({ data: spec }))
      }
    } catch (err) {
      errors.push({ stage: 'positioning', sourceId: card.id, message: err instanceof Error ? err.message : String(err) })
    }
  }

  return { created, errors }
}
