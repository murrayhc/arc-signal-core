import type { CompanyImpact, EventContextSynthesis, FutureScenario } from '@prisma/client'
import { prisma } from '@/server/db'
import { SCENARIO_TYPES, type ScenarioType } from '@/shared/enums'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import type { ConsequenceError } from './types'

const pct = (n: number) => `${Math.round(n * 100)}%`
const round2 = (n: number) => Math.round(n * 100) / 100
const humanType = (t: string) => t.replace(/_/g, ' ').toLowerCase()

const BENEFICIARY_TYPES = new Set(['BENEFICIARY', 'MIXED'])
const HARMED_TYPES = new Set(['HARMED', 'MIXED', 'EXPOSED'])

const SCENARIO_SUMMARIES: Record<ScenarioType, string> = {
  CONSERVATIVE:
    'If the pattern stalls or proves narrow, effects likely stay contained to the named party and its immediate context.',
  BASE_CASE:
    'If the pattern continues at its current pace, the named exposures and category beneficiaries below are the most likely to be affected.',
  ACCELERATED:
    'If the pattern intensifies, category-level exposure could widen across the sector; treat this as a watch scenario, not a projection.',
  REVERSAL:
    'If contradicting evidence holds or the situation reverses, the assessment weakens and named parties may be unaffected.',
  LOW_CONFIDENCE:
    'Evidence is currently too thin to project a path; monitor for stronger signals before drawing any conclusions.',
}

function parseArr(json: string): string[] {
  try {
    const j = JSON.parse(json)
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Deterministic historic/present/future synthesis for an event, grounded in its
 *  own evidence and company impacts. Produces five future scenarios with
 *  confirming/weakening watch signals. Advice-guarded; LLM assist is dormant. */
export async function synthesiseContext(
  eventCandidateId: string,
): Promise<{ synthesis: EventContextSynthesis | null; scenarios: FutureScenario[]; errors: ConsequenceError[] }> {
  const errors: ConsequenceError[] = []
  const event = await prisma.eventCandidate.findUnique({ where: { id: eventCandidateId } })
  if (!event) {
    return { synthesis: null, scenarios: [], errors: [{ stage: 'context', message: `Event ${eventCandidateId} not found`, eventCandidateId }] }
  }

  const canonicalIds = await canonicalIdsForEvent(eventCandidateId)
  const canonicals = canonicalIds.length ? await prisma.canonicalClaim.findMany({ where: { id: { in: canonicalIds } } }) : []
  const impacts = await prisma.companyImpact.findMany({ where: { eventCandidateId } })
  const triggers = await prisma.triggerCondition.findMany({ where: { eventCandidateId } })

  const maxReliability = canonicals.reduce((m, c) => Math.max(m, c.reliabilityScore), 0)
  const contradictionCount = canonicals.reduce((n, c) => n + c.contradictionCount, 0)
  const strongest = [...canonicals].sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0]
  const weakest = [...canonicals].sort((a, b) => a.reliabilityScore - b.reliabilityScore)[0]

  const beneficiaries = impacts.filter((i) => BENEFICIARY_TYPES.has(i.impactType)).map((i) => i.companyName)
  const harmed = impacts.filter((i) => HARMED_TYPES.has(i.impactType)).map((i) => i.companyName)

  // ── Present ──
  const presentContext =
    `Now: this event rests on ${event.evidenceCount} piece(s) of evidence at overall reliability ${pct(maxReliability)}. ` +
    (strongest ? `Strongest claim: "${strongest.claimText.slice(0, 120)}". ` : '') +
    (weakest && canonicals.length > 1 ? `Weakest claim: "${weakest.claimText.slice(0, 120)}". ` : '') +
    (contradictionCount > 0 ? `${contradictionCount} contradicting report(s) are on record. ` : 'No contradicting reports are on record. ') +
    `Currently exposed: ${harmed.length ? harmed.join(', ') : 'no specific named party'}.`

  // ── Historic (over Archlight's own prior events) ──
  const priors = await prisma.eventCandidate.findMany({
    where: { eventType: event.eventType, id: { not: event.id }, firstDetectedAt: { lt: event.firstDetectedAt } },
    orderBy: { firstDetectedAt: 'desc' },
    take: 5,
  })
  const historicContext =
    priors.length === 0
      ? `No prior comparable ${humanType(event.eventType)} pattern is recorded in Archlight's history${event.affectedSector ? ` for ${event.affectedSector}` : ''}.`
      : `Archlight has recorded ${priors.length} prior ${humanType(event.eventType)} pattern(s)${event.affectedSector ? ` in ${event.affectedSector}` : ''}. ` +
        `The most recent is currently ${priors[0].status.toLowerCase()} (risk ${pct(priors[0].riskScore)}, opportunity ${pct(priors[0].opportunityScore)}). ` +
        `Compare this event's early signals against how those developed.`

  // ── Future ──
  const futureContext =
    `Ahead: five scenario paths are outlined, from conservative to reversal, each with confirming and weakening watch signals. ` +
    `This is scenario context grounded in the evidence above — not a projection and not advice.`

  // Confirming/weakening signal sets.
  const triggerConfirm = triggers.filter((t) => t.direction === 'RAISES').map((t) => t.conditionText)
  const triggerWeaken = triggers.filter((t) => t.direction === 'LOWERS').map((t) => t.conditionText)
  const impactWatch = [...new Set(impacts.flatMap((i) => parseArr(i.watchSignalsJson)))]
  const confirming = [...new Set([...triggerConfirm, ...impactWatch])].slice(0, 6)
  const confirmingSet = confirming.length ? confirming : ['further corroborating reports', 'additional independent sources']
  const weakeningSet = [
    ...new Set([...triggerWeaken, 'credible contradicting reports', 'primary sources dispute the claim', 'the pattern does not recur']),
  ].slice(0, 6)

  const base = event.confidence * (0.5 + 0.5 * maxReliability)
  const contra = Math.min(1, contradictionCount / 2)
  const confidences: Record<ScenarioType, number> = {
    BASE_CASE: round2(base),
    CONSERVATIVE: round2(base * 0.85),
    ACCELERATED: round2(base * 0.6),
    REVERSAL: round2(0.15 + 0.6 * contra),
    LOW_CONFIDENCE: 0.2,
  }

  const evidenceIds = [...new Set([...canonicalIds])]

  // Persist synthesis + scenarios (idempotent).
  let synthesis: EventContextSynthesis | null = null
  const scenarios: FutureScenario[] = []
  try {
    assertNoAdviceLanguage(presentContext, 'EventContextSynthesis.presentContext')
    assertNoAdviceLanguage(historicContext, 'EventContextSynthesis.historicContext')
    assertNoAdviceLanguage(futureContext, 'EventContextSynthesis.futureContext')

    synthesis = await prisma.eventContextSynthesis.upsert({
      where: { eventCandidateId },
      create: { eventCandidateId, historicContext, presentContext, futureContext, confidence: round2(base), evidenceIdsJson: JSON.stringify(evidenceIds) },
      update: { historicContext, presentContext, futureContext, confidence: round2(base), evidenceIdsJson: JSON.stringify(evidenceIds) },
    })

    await prisma.futureScenario.deleteMany({ where: { eventCandidateId } })
    for (const scenarioType of SCENARIO_TYPES) {
      const summary = SCENARIO_SUMMARIES[scenarioType]
      const title = `${scenarioType.replace(/_/g, ' ').toLowerCase()} scenario`
      // A reversal is confirmed by contradicting evidence — swap the sets.
      const confirmingSignals = scenarioType === 'REVERSAL' ? weakeningSet : confirmingSet
      const weakeningSignals = scenarioType === 'REVERSAL' ? confirmingSet : weakeningSet
      assertNoAdviceLanguage(summary, `FutureScenario.summary(${scenarioType})`)
      scenarios.push(
        await prisma.futureScenario.create({
          data: {
            eventCandidateId,
            scenarioType,
            title,
            summary,
            confirmingSignalsJson: JSON.stringify(confirmingSignals),
            weakeningSignalsJson: JSON.stringify(weakeningSignals),
            likelyBeneficiariesJson: JSON.stringify(scenarioType === 'REVERSAL' ? [] : beneficiaries),
            likelyHarmedPartiesJson: JSON.stringify(scenarioType === 'REVERSAL' ? [] : harmed),
            confidence: confidences[scenarioType],
          },
        }),
      )
    }
  } catch (err) {
    errors.push({ stage: 'context', message: err instanceof Error ? err.message : String(err), eventCandidateId })
  }

  return { synthesis, scenarios, errors }
}
