import type { CompanyImpact } from '@prisma/client'
import { prisma } from '@/server/db'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
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
    // Prefer the AI rationale for display when present; the deterministic
    // pathway remains the fallback.
    impactPathway: i.llmRationale ?? i.impactPathway,
    evidenceIds: parseArr(i.evidenceIdsJson),
    watchSignals: parseArr(i.watchSignalsJson),
    riskScore: i.riskScore,
    opportunityScore: i.opportunityScore,
    entityId: i.entityId,
    lowConfidence,
    llmRationale: i.llmRationale ?? null,
    aiEnhanced: !!i.llmRationale,
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

export type ScenarioView = {
  scenarioType: string
  title: string
  summary: string
  confidence: number
  confirmingSignals: string[]
  weakeningSignals: string[]
  likelyBeneficiaries: string[]
  likelyHarmedParties: string[]
}

export type PositioningView = {
  id: string
  title: string
  userType: string
  positioningAngle: string
  howItCouldBeUsed: string
  whyItMayMatter: string
  evidenceSummary: string
  confidence: number
  constraints: string
}

export type EventDeepReport = {
  companies: CompanyImpactView[]
  beneficiaries: CompanyImpactView[]
  harmed: CompanyImpactView[]
  context:
    | {
        historicContext: string
        presentContext: string
        futureContext: string
        confidence: number
        /** AI-written narrative when the event has been enriched; null otherwise. */
        llmNarrative: { historic: string; present: string; future: string; executive: string } | null
      }
    | null
  scenarios: ScenarioView[]
  positioning: PositioningView[]
  watchSignals: string[]
}

/** Parses a persisted llmNarrativeJson into the enriched narrative shape, or
 *  null if absent/malformed. */
function parseNarrative(
  json: string | null,
): { historic: string; present: string; future: string; executive: string } | null {
  if (!json) return null
  try {
    const j = JSON.parse(json)
    if (
      j &&
      typeof j.historic === 'string' &&
      typeof j.present === 'string' &&
      typeof j.future === 'string' &&
      typeof j.executive === 'string'
    ) {
      return { historic: j.historic, present: j.present, future: j.future, executive: j.executive }
    }
  } catch {
    /* fall through to null */
  }
  return null
}

function parseStrArr(json: string): string[] {
  try {
    const j = JSON.parse(json)
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Aggregates the commercial-consequence view for an event (companies, context,
 *  scenarios, impact positioning, watch signals) for the deep-report page. */
export async function getEventDeepReport(eventCandidateId: string): Promise<EventDeepReport> {
  const companies = await getEventCompanyImpacts(eventCandidateId)
  const beneficiaries = companies.filter((c) => BENEFICIARY_TYPES.has(c.impactType))
  const harmed = companies.filter((c) => HARMED_TYPES.has(c.impactType))

  const ctx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId } })
  const scenarioRows = await prisma.futureScenario.findMany({ where: { eventCandidateId }, orderBy: { confidence: 'desc' } })
  const positioningRows = await prisma.strategicPositioningExample.findMany({
    where: { eventCandidateId, companyImpactId: { not: null } },
    orderBy: { confidence: 'desc' },
  })

  const scenarios: ScenarioView[] = scenarioRows.map((s) => ({
    scenarioType: s.scenarioType,
    title: s.title,
    summary: s.summary,
    confidence: s.confidence,
    confirmingSignals: parseStrArr(s.confirmingSignalsJson),
    weakeningSignals: parseStrArr(s.weakeningSignalsJson),
    likelyBeneficiaries: parseStrArr(s.likelyBeneficiariesJson),
    likelyHarmedParties: parseStrArr(s.likelyHarmedPartiesJson),
  }))

  const watchSignals = [
    ...new Set([...scenarios.flatMap((s) => s.confirmingSignals), ...companies.flatMap((c) => c.watchSignals)]),
  ].slice(0, 12)

  return {
    companies,
    beneficiaries,
    harmed,
    context: ctx
      ? {
          historicContext: ctx.historicContext,
          presentContext: ctx.presentContext,
          futureContext: ctx.futureContext,
          confidence: ctx.confidence,
          llmNarrative: parseNarrative(ctx.llmNarrativeJson),
        }
      : null,
    scenarios,
    positioning: positioningRows.map((p) => ({
      id: p.id,
      title: p.title,
      userType: p.userType,
      positioningAngle: p.positioningAngle,
      howItCouldBeUsed: p.howItCouldBeUsed,
      whyItMayMatter: p.whyItMayMatter,
      evidenceSummary: p.evidenceSummary,
      confidence: p.confidence,
      constraints: p.constraints,
    })),
    watchSignals,
  }
}

export type EventConsequenceSummary = {
  evidenceDepthScore: number
  originTraced: boolean
  beneficiaries: number
  harmed: number
  contradictions: number
  scenarioPaths: number
  lastInvestigationAt: string | null
}

/** Compact per-event indicators for the dashboard cards (counts only). */
export async function getEventConsequenceSummary(eventCandidateId: string): Promise<EventConsequenceSummary> {
  const cids = await canonicalIdsForEvent(eventCandidateId)
  const canonicals = cids.length ? await prisma.canonicalClaim.findMany({ where: { id: { in: cids } } }) : []
  const evidenceDepthScore = canonicals.reduce((m, c) => Math.max(m, c.reliabilityScore), 0)
  const originTraced = canonicals.some((c) => !!c.originCandidateUrl)
  const contradictions = canonicals.reduce((n, c) => n + c.contradictionCount, 0)

  const companies = await prisma.companyImpact.findMany({ where: { eventCandidateId } })
  const beneficiaries = companies.filter((c) => BENEFICIARY_TYPES.has(c.impactType)).length
  const harmed = companies.filter((c) => HARMED_TYPES.has(c.impactType)).length
  const scenarioPaths = await prisma.futureScenario.count({ where: { eventCandidateId } })
  const ctx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId } })
  const lastInvestigationAt = ctx?.updatedAt.toISOString() ?? companies[0]?.updatedAt.toISOString() ?? null

  return { evidenceDepthScore, originTraced, beneficiaries, harmed, contradictions, scenarioPaths, lastInvestigationAt }
}

/** Batched compact summaries for a set of events (dashboard cards). */
export async function getConsequenceSummariesForEvents(
  eventIds: string[],
): Promise<Record<string, EventConsequenceSummary>> {
  const out: Record<string, EventConsequenceSummary> = {}
  for (const id of eventIds) out[id] = await getEventConsequenceSummary(id)
  return out
}
