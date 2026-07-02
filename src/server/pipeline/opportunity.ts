import type { EventCandidate, OpportunityCard, RevenueLens } from '@prisma/client'
import { prisma } from '@/server/db'
import type { OpportunityType } from '@/shared/enums'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import type { PipelineError } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const STICKY = ['ESCALATED', 'DISMISSED', 'ACTIONED']

const TYPE_MAP: Record<string, { primary: OpportunityType; alternates: OpportunityType[] }> = {
  LAYOFF_SIGNAL: { primary: 'TALENT_ACQUISITION', alternates: ['CRISIS_SUPPORT', 'ADVISORY'] },
  HIRING_SLOWDOWN: { primary: 'TALENT_ACQUISITION', alternates: ['ADVISORY'] },
  EXECUTIVE_EXIT: { primary: 'HIRING', alternates: ['ADVISORY'] },
  EXECUTIVE_HIRE: { primary: 'SALES', alternates: ['PARTNERSHIP'] },
  HIRING_ACCELERATION: { primary: 'SALES', alternates: ['CONTENT'] },
  FUNDING_SIGNAL: { primary: 'SALES', alternates: ['PARTNERSHIP'] },
  CASH_PRESSURE: { primary: 'ADVISORY', alternates: ['M_AND_A', 'CRISIS_SUPPORT'] },
  LEGAL_PRESSURE: { primary: 'ADVISORY', alternates: ['CRISIS_SUPPORT'] },
  REGULATORY_PRESSURE: { primary: 'COMPLIANCE', alternates: ['ADVISORY'] },
  PROCUREMENT_INCREASE: { primary: 'PROCUREMENT', alternates: ['SALES', 'MARKET_ENTRY'] },
  DEMAND_SPIKE: { primary: 'SALES', alternates: ['PRODUCT_GAP', 'MARKET_ENTRY'] },
  SUPPLY_CHAIN_PRESSURE: { primary: 'COMPETITOR_DISPLACEMENT', alternates: ['PARTNERSHIP'] },
  PRODUCT_MOMENTUM: { primary: 'PARTNERSHIP', alternates: ['CONTENT'] },
}

export function mapEventToOpportunity(eventType: string) {
  return TYPE_MAP[eventType] ?? { primary: 'CONTENT' as OpportunityType, alternates: [] }
}

function parseJson(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function isEligible(event: EventCandidate, lens: RevenueLens | null): boolean {
  if (event.status === 'DISMISSED') return false
  if (lens && event.affectedSector && parseJson(lens.excludedSectorsJson).includes(event.affectedSector)) return false
  const mappable = TYPE_MAP[event.eventType] !== undefined
  if (!mappable && event.confidence < 0.45) return false
  return true
}

function lensFitFactor(event: EventCandidate, lens: RevenueLens | null): number {
  if (!lens || lens.isDefault) return 1
  const sectors = parseJson(lens.targetSectorsJson)
  const regions = parseJson(lens.targetRegionsJson)
  if (sectors.length === 0 && regions.length === 0) return 1
  const sectorMatch = event.affectedSector ? sectors.includes(event.affectedSector) : false
  const regionMatch = event.affectedRegion ? regions.includes(event.affectedRegion) : false
  if (sectorMatch) return 1
  if (regionMatch) return 0.7
  return 0.85
}

export function scoreOpportunity(event: EventCandidate, lens: RevenueLens | null) {
  const evidenceScore = round2(clamp01(event.sourceDiversityScore * (0.6 + 0.1 * Math.min(event.evidenceCount, 4))))
  const confidence = round2(clamp01(event.confidence * lensFitFactor(event, lens)))
  const urgencyScore = round2(clamp01(0.4 * event.probability + 0.4 * event.severity + 0.2 * event.noveltyScore))
  const lensValueSignal = 0.5 // averageDealSize bucket placeholder (default lens)
  const commercialValueScore = round2(
    clamp01(0.5 * Math.max(event.riskScore, event.opportunityScore) + 0.3 * lensValueSignal + 0.2 * urgencyScore),
  )
  const actionabilityScore = round2(
    clamp01(0.5 * confidence + 0.3 * evidenceScore + 0.2 * (event.primaryEntityId ? 1 : 0.5)),
  )
  return { evidenceScore, confidence, urgencyScore, commercialValueScore, actionabilityScore }
}

type Scores = ReturnType<typeof scoreOpportunity>

const SECTOR_FALLBACK = 'the affected sector'
const REGION_FALLBACK = 'the affected region'

type TextTemplate = {
  buyerPain: string
  likelyBuyers: string[]
  suggestedOffer: string
  opportunityLogic: string
  riskLogic: string
  nextBestAction: string
}

const TEXT_TEMPLATES: Record<OpportunityType, (sector: string, region: string) => TextTemplate> = {
  TALENT_ACQUISITION: (sector, region) => ({
    buyerPain: `Organisations in ${sector} may face pressure that releases experienced staff and disrupts teams in ${region}.`,
    likelyBuyers: ['Recruiters', 'Workforce consultancies', 'HR service providers'],
    suggestedOffer: `A recruiter or workforce partner could prepare interim, outplacement or redeployment support for affected ${sector} teams.`,
    opportunityLogic: `Watch for displaced talent in ${sector} (${region}) that may need placement support as the pressure develops.`,
    riskLogic: `The pattern could ease or reverse; monitor confirming signals before committing resource to this angle.`,
    nextBestAction: `Review which ${sector} employers may face similar pressure next.`,
  }),
  HIRING: (sector, region) => ({
    buyerPain: `Executive departures in ${sector} may leave a leadership gap that ${region} organisations need to fill.`,
    likelyBuyers: ['Executive search firms', 'Interim management providers'],
    suggestedOffer: `A search partner could prepare a shortlist or interim leadership option for the vacated role.`,
    opportunityLogic: `Watch for a follow-on hiring signal in ${sector} that may confirm the leadership gap is being addressed.`,
    riskLogic: `The exit may be a planned succession rather than a gap; investigate before assuming urgency.`,
    nextBestAction: `Review the entity's leadership bench and consider whether the gap may persist.`,
  }),
  SALES: (sector, region) => ({
    buyerPain: `Momentum in ${sector} (${region}) may signal budget available for suppliers who can move quickly.`,
    likelyBuyers: ['Solution vendors', 'Sales teams targeting growth accounts'],
    suggestedOffer: `A sales team could prepare a tailored proposal that aligns with the observed momentum in ${sector}.`,
    opportunityLogic: `Watch for corroborating demand signals in ${sector} before prioritising outreach.`,
    riskLogic: `Momentum signals may be short-lived; monitor for reversal before scaling commitment.`,
    nextBestAction: `Consider prioritising outreach to entities showing the same pattern in ${region}.`,
  }),
  PARTNERSHIP: (sector, region) => ({
    buyerPain: `Shifts in ${sector} may open a window for partners who can complement the affected capability in ${region}.`,
    likelyBuyers: ['Channel partners', 'Complementary solution providers'],
    suggestedOffer: `A partner-development team could prepare a joint proposition aligned with the emerging pattern in ${sector}.`,
    opportunityLogic: `Watch for aligned partners already active in ${sector} (${region}) who may benefit from coordination.`,
    riskLogic: `The alignment may be coincidental rather than durable; investigate before committing to a joint plan.`,
    nextBestAction: `Review potential partners active in ${sector} and consider a coordinated approach.`,
  }),
  PROCUREMENT: (sector, region) => ({
    buyerPain: `Rising procurement activity in ${sector} (${region}) may indicate buyers seeking new supplier relationships.`,
    likelyBuyers: ['Procurement teams', 'Supply chain vendors'],
    suggestedOffer: `A supplier could prepare a proposal that addresses the procurement pattern emerging in ${sector}.`,
    opportunityLogic: `Watch for repeat procurement signals in ${sector} that may confirm a sustained buying cycle.`,
    riskLogic: `A single procurement signal may not repeat; monitor before assuming a durable buying cycle.`,
    nextBestAction: `Review current supplier relationships in ${sector} and consider where gaps may exist.`,
  }),
  INVESTMENT_WATCH: (sector, region) => ({
    buyerPain: `Market context in ${sector} (${region}) may be useful background for teams tracking sector dynamics.`,
    likelyBuyers: ['Market analysts', 'Strategy teams'],
    suggestedOffer: `An analyst could prepare a market-context briefing on the observed pattern in ${sector}.`,
    opportunityLogic: `Watch this pattern as market context only; it is not a trading signal.`,
    riskLogic: `Market context can shift quickly; monitor for updates before drawing conclusions.`,
    nextBestAction: `Consider this as background context and review alongside other sector indicators.`,
  }),
  M_AND_A: (sector, region) => ({
    buyerPain: `Financial pressure in ${sector} (${region}) may create consolidation or restructuring interest.`,
    likelyBuyers: ['Corporate development teams', 'Advisory firms'],
    suggestedOffer: `An advisory team could prepare a preliminary review of consolidation options relevant to ${sector}.`,
    opportunityLogic: `Watch for further distress signals in ${sector} that may confirm restructuring interest.`,
    riskLogic: `Pressure may resolve without a transaction; investigate the underlying cause before proceeding.`,
    nextBestAction: `Review the entity's financial trajectory and consider whether the pattern persists.`,
  }),
  CONTENT: (sector, region) => ({
    buyerPain: `Stakeholders tracking ${sector} (${region}) may value a clear explanation of this developing pattern.`,
    likelyBuyers: ['Content and research teams', 'Market communicators'],
    suggestedOffer: `A content team could prepare an explainer or briefing on the pattern observed in ${sector}.`,
    opportunityLogic: `Watch how this pattern develops in ${sector} as a basis for timely commentary.`,
    riskLogic: `Early-stage patterns may not develop further; monitor before publishing firm conclusions.`,
    nextBestAction: `Consider drafting a briefing and review it against further evidence as it arrives.`,
  }),
  ADVISORY: (sector, region) => ({
    buyerPain: `Organisations in ${sector} (${region}) facing this pattern may value independent, structured perspectives.`,
    likelyBuyers: ['Advisory firms', 'Consultants'],
    suggestedOffer: `An advisory team could prepare a structured review of options available to affected ${sector} organisations.`,
    opportunityLogic: `Watch for organisations in ${sector} that may seek external perspectives as the pattern develops.`,
    riskLogic: `The pattern's severity may be overstated by early evidence; investigate further before engaging.`,
    nextBestAction: `Review which ${sector} organisations may benefit from a structured conversation.`,
  }),
  PRODUCT_GAP: (sector, region) => ({
    buyerPain: `Demand shifts in ${sector} (${region}) may expose a gap that existing products do not yet address.`,
    likelyBuyers: ['Product teams', 'Innovation groups'],
    suggestedOffer: `A product team could prepare a scoping exercise for the gap emerging in ${sector}.`,
    opportunityLogic: `Watch for repeated evidence of the same gap across ${sector} before committing product resource.`,
    riskLogic: `The gap may be narrow or temporary; investigate demand durability before building.`,
    nextBestAction: `Consider scoping a lightweight response and review demand signals as they accumulate.`,
  }),
  MARKET_ENTRY: (sector, region) => ({
    buyerPain: `Changing conditions in ${sector} (${region}) may lower the barrier for new entrants.`,
    likelyBuyers: ['Market-entry strategists', 'Business development teams'],
    suggestedOffer: `A strategy team could prepare a market-entry assessment focused on ${sector} in ${region}.`,
    opportunityLogic: `Watch for further signals confirming the shift before committing entry resource.`,
    riskLogic: `Entry barriers may re-form quickly; monitor the pattern before finalising a plan.`,
    nextBestAction: `Review the competitive landscape in ${sector} and consider a phased entry approach.`,
  }),
  COMPETITOR_DISPLACEMENT: (sector, region) => ({
    buyerPain: `Supply chain pressure in ${sector} (${region}) may weaken incumbent suppliers and open room for alternatives.`,
    likelyBuyers: ['Challenger suppliers', 'Sales teams targeting incumbents'],
    suggestedOffer: `A challenger supplier could prepare a proposal positioned around the incumbent's disrupted capacity in ${sector}.`,
    opportunityLogic: `Watch for confirmed incumbent disruption in ${sector} before approaching their buyers.`,
    riskLogic: `Incumbents may recover capacity quickly; investigate before assuming a lasting opening.`,
    nextBestAction: `Consider identifying the incumbent's key buyers in ${region} and review their alternatives.`,
  }),
  COMPLIANCE: (sector, region) => ({
    buyerPain: `Regulatory pressure in ${sector} (${region}) may require organisations to review compliance readiness.`,
    likelyBuyers: ['Compliance consultancies', 'Legal advisory teams'],
    suggestedOffer: `A compliance partner could prepare a readiness review for organisations affected in ${sector}.`,
    opportunityLogic: `Watch for enforcement activity in ${sector} that may confirm the scale of the requirement.`,
    riskLogic: `Regulatory scope may narrow before enforcement; investigate the current status before engaging.`,
    nextBestAction: `Review which ${sector} organisations may need a compliance readiness check.`,
  }),
  CRISIS_SUPPORT: (sector, region) => ({
    buyerPain: `Acute pressure in ${sector} (${region}) may leave organisations needing rapid, structured support.`,
    likelyBuyers: ['Crisis management consultancies', 'Turnaround specialists'],
    suggestedOffer: `A crisis-support team could prepare a rapid-response option for organisations under pressure in ${sector}.`,
    opportunityLogic: `Watch for escalation signals in ${sector} that may confirm the need for urgent support.`,
    riskLogic: `The situation may stabilise without external support; investigate severity before mobilising.`,
    nextBestAction: `Consider preparing a rapid-response outline and review it against how the situation develops.`,
  }),
}

function renderCardText(
  event: EventCandidate,
  primary: OpportunityType,
  alternates: OpportunityType[],
  scores: Scores,
): {
  title: string
  summary: string
  buyerPain: string
  likelyBuyersJson: string
  suggestedOffer: string
  opportunityLogic: string
  riskLogic: string
  nextBestAction: string
} {
  const sector = event.affectedSector ?? SECTOR_FALLBACK
  const region = event.affectedRegion ?? REGION_FALLBACK
  const template = (TEXT_TEMPLATES[primary] ?? TEXT_TEMPLATES.CONTENT)(sector, region)

  const title = `${event.title} — ${primary.replace(/_/g, ' ').toLowerCase()} angle`
  const alternateNote =
    alternates.length > 0
      ? ` Alternate angles to consider: ${alternates.join(', ').replace(/_/g, ' ').toLowerCase()}.`
      : ''
  const summary =
    `Derived from event "${event.title}" (${event.eventType}) in ${sector}, ${region}. ` +
    `Confidence ${scores.confidence.toFixed(2)}, commercial value ${scores.commercialValueScore.toFixed(2)}, ` +
    `urgency ${scores.urgencyScore.toFixed(2)}.${alternateNote}`

  const fields = {
    title,
    summary,
    buyerPain: template.buyerPain,
    likelyBuyersJson: JSON.stringify(template.likelyBuyers),
    suggestedOffer: template.suggestedOffer,
    opportunityLogic: template.opportunityLogic,
    riskLogic: template.riskLogic,
    nextBestAction: template.nextBestAction,
  }

  assertNoAdviceLanguage(fields.title, 'OpportunityCard.title')
  assertNoAdviceLanguage(fields.summary, 'OpportunityCard.summary')
  assertNoAdviceLanguage(fields.buyerPain, 'OpportunityCard.buyerPain')
  assertNoAdviceLanguage(fields.suggestedOffer, 'OpportunityCard.suggestedOffer')
  assertNoAdviceLanguage(fields.opportunityLogic, 'OpportunityCard.opportunityLogic')
  assertNoAdviceLanguage(fields.riskLogic, 'OpportunityCard.riskLogic')
  assertNoAdviceLanguage(fields.nextBestAction, 'OpportunityCard.nextBestAction')

  return fields
}

export async function generateOpportunities(
  events: EventCandidate[],
  lens: RevenueLens | null,
): Promise<{ created: OpportunityCard[]; updated: OpportunityCard[]; errors: PipelineError[] }> {
  const created: OpportunityCard[] = []
  const updated: OpportunityCard[] = []
  const errors: PipelineError[] = []

  for (const event of events) {
    try {
      if (!isEligible(event, lens)) continue

      const { primary, alternates } = mapEventToOpportunity(event.eventType)
      const scores = scoreOpportunity(event, lens)
      const text = renderCardText(event, primary, alternates, scores)
      const revenueLensId = lens?.id ?? null

      const existing = await prisma.opportunityCard.findFirst({
        where: { eventCandidateId: event.id, revenueLensId },
      })

      if (!existing) {
        const card = await prisma.opportunityCard.create({
          data: {
            eventCandidateId: event.id,
            revenueLensId,
            title: text.title,
            opportunityType: primary,
            summary: text.summary,
            buyerPain: text.buyerPain,
            likelyBuyersJson: text.likelyBuyersJson,
            affectedSectorsJson: JSON.stringify(event.affectedSector ? [event.affectedSector] : []),
            affectedRegionsJson: JSON.stringify(event.affectedRegion ? [event.affectedRegion] : []),
            suggestedOffer: text.suggestedOffer,
            urgencyScore: scores.urgencyScore,
            commercialValueScore: scores.commercialValueScore,
            confidence: scores.confidence,
            evidenceScore: scores.evidenceScore,
            actionabilityScore: scores.actionabilityScore,
            opportunityLogic: text.opportunityLogic,
            riskLogic: text.riskLogic,
            nextBestAction: text.nextBestAction,
            status: 'NEW',
            isFixture: event.isFixture,
          },
        })
        created.push(card)
        continue
      }

      const rising =
        scores.commercialValueScore > existing.commercialValueScore || scores.confidence > existing.confidence
      const status = STICKY.includes(existing.status) ? existing.status : rising ? 'RISING' : existing.status

      const card = await prisma.opportunityCard.update({
        where: { id: existing.id },
        data: {
          title: text.title,
          opportunityType: primary,
          summary: text.summary,
          buyerPain: text.buyerPain,
          likelyBuyersJson: text.likelyBuyersJson,
          affectedSectorsJson: JSON.stringify(event.affectedSector ? [event.affectedSector] : []),
          affectedRegionsJson: JSON.stringify(event.affectedRegion ? [event.affectedRegion] : []),
          suggestedOffer: text.suggestedOffer,
          urgencyScore: scores.urgencyScore,
          commercialValueScore: scores.commercialValueScore,
          confidence: scores.confidence,
          evidenceScore: scores.evidenceScore,
          actionabilityScore: scores.actionabilityScore,
          opportunityLogic: text.opportunityLogic,
          riskLogic: text.riskLogic,
          nextBestAction: text.nextBestAction,
          status,
          isFixture: event.isFixture,
        },
      })
      updated.push(card)
    } catch (err) {
      errors.push({ stage: 'opportunity', sourceId: event.id, message: err instanceof Error ? err.message : String(err) })
    }
  }

  return { created, updated, errors }
}
