import type { EventContextSynthesis, FutureScenario } from '@prisma/client'
import { prisma } from '@/server/db'
import { SCENARIO_TYPES, type ScenarioType } from '@/shared/enums'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import type { ConsequenceError } from './types'
import { describeAnalogues, findHistoricAnalogues } from './historic-analogue'
import { composeScenarioNarrative, type ScenarioFacts } from './scenario-narrative'

const pct = (n: number) => `${Math.round(n * 100)}%`
const round2 = (n: number) => Math.round(n * 100) / 100

const BENEFICIARY_TYPES = new Set(['BENEFICIARY', 'MIXED'])
const HARMED_TYPES = new Set(['HARMED', 'MIXED', 'EXPOSED'])

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

  // ── Historic (analogue retrieval over Archlight's own event corpus) ──
  // Scored by type + sector + region + named-entity overlap, not just an
  // exact eventType match — so a layoff at a shared supplier surfaces even
  // when the event type differs.
  const analogues = await findHistoricAnalogues(event, 3)
  const historicContext = describeAnalogues(analogues, event.eventType, event.affectedSector)

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

  // Facts fed to the per-scenario narrative composer — the event's ACTUAL
  // exposures, corroboration and momentum, so scenarios read event-specific.
  const commodities = parseArr(event.commoditiesJson)
  const maxIndependent = canonicals.reduce((m, c) => Math.max(m, c.independentSourceCount), 0)
  const scenarioFacts: ScenarioFacts = {
    event: {
      eventType: event.eventType,
      eventClass: event.eventClass,
      affectedSector: event.affectedSector,
      affectedRegion: event.affectedRegion,
      momentumScore: event.momentumScore,
    },
    beneficiaries,
    harmed,
    commodities,
    reliabilityPct: Math.round(maxReliability * 100),
    contradictionCount,
    independentPublishers: maxIndependent,
  }

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
      // Event-specific narrative (not a canned per-type string).
      const summary = composeScenarioNarrative(scenarioType, scenarioFacts)
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
