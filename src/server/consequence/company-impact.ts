import type { AtomicClaim, CompanyImpact, EventCandidate } from '@prisma/client'
import { prisma } from '@/server/db'
import type { ImpactType } from '@/shared/enums'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import type { ConsequenceError } from './types'
import { CLAIM_TYPE_WORDS, impactTypeFor, isLikelyOrganisation, watchSignalsForClaimType } from './watch-signals'

const LOW_CONFIDENCE = 0.4
/** Category impacts are inferential (sector/relationship), never a specific
 *  named company — so they carry a deliberately low, watch-level confidence. */
const CATEGORY_CONFIDENCE = 0.3

function parseArr(json: string): string[] {
  try {
    const j = JSON.parse(json)
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

type CategoryImpact = {
  companyName: string
  impactType: ImpactType
  impactPathway: string
  watchSignals: string[]
  evidenceIds: string[]
}

function cat(
  companyName: string,
  impactType: ImpactType,
  impactPathway: string,
  watchSignals: string[],
  evidenceIds: string[],
): CategoryImpact {
  return { companyName, impactType, impactPathway, watchSignals, evidenceIds }
}

/** Category-level (never a fabricated specific company) impacts inferred from the
 *  event's claim types and class. Names a category, always clearly labelled. */
function buildCategoryImpacts(event: EventCandidate, claimTypes: string[], evidenceIds: string[]): CategoryImpact[] {
  const s = event.affectedSector ?? 'the affected sector'
  const has = (t: string) => claimTypes.includes(t)
  const cats: CategoryImpact[] = []

  if (has('REGULATORY_PRESSURE')) {
    cats.push(cat(`Regulated firms in ${s} (category)`, 'EXPOSED', `Firms in ${s} under the same regulatory pressure may face comparable exposure; this is a category-level inference, not a specific company. Monitor for confirming detail.`, ['new regulator statements', 'sector compliance actions'], evidenceIds))
  }
  if (has('COMMODITY_PRESSURE')) {
    cats.push(cat(`Commodity-exposed firms in ${s} (category)`, 'EXPOSED', `Firms in ${s} exposed to the same commodity could feel comparable cost or supply pressure; category-level inference only. Investigate specific exposure before acting.`, ['commodity price and supply updates', 'export restrictions'], evidenceIds))
  }
  if (has('SUPPLY_CHAIN_PRESSURE')) {
    cats.push(cat(`Suppliers and buyers in ${s} (category)`, 'EXPOSED', `Suppliers and buyers linked to ${s} may face knock-on disruption; category-level inference only.`, ['supplier disruption reports', 'lead-time changes'], evidenceIds))
  }
  if (has('PROCUREMENT_ACTIVITY') || has('DEMAND_SIGNAL') || event.eventClass === 'OPPORTUNITY') {
    cats.push(cat(`Suppliers to ${s} buyers (category)`, 'BENEFICIARY', `Suppliers serving buyers in ${s} could be positioned to benefit if this activity continues; category-level inference only. Investigate specific fit before acting.`, ['new tender awards', 'framework listings', 'hiring activity'], evidenceIds))
  }
  if (event.eventClass === 'RISK') {
    cats.push(cat(`Competing firms in ${s} (category)`, 'BENEFICIARY', `Firms competing in ${s} could see shifting conditions and may be positioned to gain if this pressure on the named party persists; category-level inference, no specific company named. Investigate before acting.`, ['sector share shifts', 'competitor announcements'], evidenceIds))
    cats.push(cat(`Suppliers to firms in ${s} (category)`, 'EXPOSED', `Suppliers dependent on firms in ${s} may face reduced demand if retrenchment continues; category-level inference only.`, ['order-book updates', 'supplier disclosures'], evidenceIds))
  }
  if (cats.length === 0) {
    cats.push(cat(`Firms in ${s} (category)`, 'WATCH_ONLY', `Firms in ${s} may be indirectly affected; category-level watch inference only.`, ['further sector reporting'], evidenceIds))
  }
  return cats.slice(0, 4)
}

/** Resolves the companies and categories an event affects. Named companies come
 *  ONLY from organisations that appear in the event's evidence; everything else
 *  is a clearly-labelled category. Never invents a specific company. Populates
 *  the Entity table for named organisations. Every string is advice-guarded. */
export async function resolveCompanyImpacts(
  eventCandidateId: string,
): Promise<{ impacts: CompanyImpact[]; errors: ConsequenceError[] }> {
  const errors: ConsequenceError[] = []
  const event = await prisma.eventCandidate.findUnique({ where: { id: eventCandidateId } })
  if (!event) {
    return { impacts: [], errors: [{ stage: 'company-impact', message: `Event ${eventCandidateId} not found`, eventCandidateId }] }
  }

  const canonicalIds = await canonicalIdsForEvent(eventCandidateId)
  const canonicals = canonicalIds.length
    ? await prisma.canonicalClaim.findMany({ where: { id: { in: canonicalIds } } })
    : []
  const atomics = canonicalIds.length
    ? await prisma.atomicClaim.findMany({ where: { canonicalClaimId: { in: canonicalIds } } })
    : []

  const claimTypes = [...new Set(canonicals.map((c) => c.claimType))]
  const maxReliability = canonicals.reduce((m, c) => Math.max(m, c.reliabilityScore), 0)
  const allEvidenceIds = [...new Set(atomics.map((a) => a.id))]

  // Idempotent re-run.
  await prisma.companyImpact.deleteMany({ where: { eventCandidateId } })
  const impacts: CompanyImpact[] = []

  // Named organisations from the evidence.
  const orgToAtomics = new Map<string, AtomicClaim[]>()
  for (const a of atomics) {
    for (const name of parseArr(a.entitiesJson)) {
      if (!isLikelyOrganisation(name)) continue
      orgToAtomics.set(name, [...(orgToAtomics.get(name) ?? []), a])
    }
  }

  for (const [name, orgAtomics] of orgToAtomics) {
    try {
      const evidenceIds = [...new Set([...orgAtomics.map((a) => a.id), ...orgAtomics.map((a) => a.sourceId)])]
      const reliability = maxReliability
      const impactType = impactTypeFor(event.eventClass, claimTypes, reliability)
      const words = claimTypes.map((t) => CLAIM_TYPE_WORDS[t] ?? 'a development').join(', ')
      const sourceCount = new Set(orgAtomics.map((a) => a.sourceId)).size
      const pathway =
        `${name} is named because it appears in the evidence for this event (${words}), ` +
        `reported across ${sourceCount} source(s) at evidence reliability ${Math.round(reliability * 100)}%. ` +
        `It may be ${impactType.toLowerCase().replace(/_/g, ' ')} as the situation develops; verify against primary sources.`
      assertNoAdviceLanguage(pathway, 'CompanyImpact.impactPathway')

      const entity = await prisma.entity.upsert({
        where: { name },
        create: { name, entityType: 'ORGANISATION', sector: event.affectedSector, region: event.affectedRegion },
        update: {},
      })
      const lowConfidence = reliability < LOW_CONFIDENCE
      impacts.push(
        await prisma.companyImpact.create({
          data: {
            eventCandidateId,
            entityId: entity.id,
            companyName: name,
            impactType,
            impactPathway: pathway,
            confidence: reliability,
            evidenceIdsJson: JSON.stringify(evidenceIds),
            riskScore: event.riskScore,
            opportunityScore: event.opportunityScore,
            watchSignalsJson: JSON.stringify(watchSignalsForClaimType(claimTypes[0] ?? 'UNKNOWN')),
            metadataJson: JSON.stringify({ lowConfidence, level: 'NAMED' }),
          },
        }),
      )
    } catch (err) {
      errors.push({ stage: 'company-impact', message: err instanceof Error ? err.message : String(err), eventCandidateId })
    }
  }

  // Category-level impacts (never a fabricated company).
  for (const c of buildCategoryImpacts(event, claimTypes, allEvidenceIds)) {
    try {
      assertNoAdviceLanguage(c.impactPathway, 'CompanyImpact.impactPathway(category)')
      impacts.push(
        await prisma.companyImpact.create({
          data: {
            eventCandidateId,
            entityId: null,
            companyName: c.companyName,
            impactType: c.impactType,
            impactPathway: c.impactPathway,
            confidence: CATEGORY_CONFIDENCE,
            evidenceIdsJson: JSON.stringify(c.evidenceIds),
            riskScore: event.riskScore,
            opportunityScore: event.opportunityScore,
            watchSignalsJson: JSON.stringify(c.watchSignals),
            metadataJson: JSON.stringify({ lowConfidence: true, level: 'CATEGORY' }),
          },
        }),
      )
    } catch (err) {
      errors.push({ stage: 'company-impact', message: err instanceof Error ? err.message : String(err), eventCandidateId })
    }
  }

  return { impacts, errors }
}
