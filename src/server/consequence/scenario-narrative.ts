import type { EventCandidate } from '@prisma/client'
import type { ScenarioType } from '@/shared/enums'

/**
 * Event-specific scenario narratives. The old five canned strings gave every
 * event the same five sentences; these compose the event's ACTUAL facts —
 * named parties, sector, exposures, momentum, contradictions — into each
 * scenario, so two different layoffs read differently. Deterministic string
 * composition (not templated boilerplate, not a model): the facts are the
 * variable, the framing is fixed and non-advisory.
 */

export type ScenarioFacts = {
  event: Pick<EventCandidate, 'eventType' | 'eventClass' | 'affectedSector' | 'affectedRegion' | 'momentumScore'>
  beneficiaries: string[]
  harmed: string[]
  commodities: string[]
  reliabilityPct: number
  contradictionCount: number
  independentPublishers: number
}

const humanType = (t: string) => t.replace(/_/g, ' ').toLowerCase()

function partiesClause(facts: ScenarioFacts): string {
  const harmed = facts.harmed.slice(0, 3)
  const bens = facts.beneficiaries.slice(0, 3)
  const bits: string[] = []
  if (harmed.length) bits.push(`the exposure on ${harmed.join(', ')}`)
  if (bens.length) bits.push(`potential positioning for ${bens.join(', ')}`)
  if (bits.length === 0) return 'the category-level exposures below'
  return bits.join(' and ')
}

function scopeClause(facts: ScenarioFacts): string {
  const s = facts.event.affectedSector ?? 'the affected sector'
  const r = facts.event.affectedRegion ? ` in ${facts.event.affectedRegion}` : ''
  const c = facts.commodities.length ? `, with ${facts.commodities.slice(0, 3).join('/')} exposure` : ''
  return `${s}${r}${c}`
}

/** Momentum descriptor from the persisted 0.5-neutral momentum score. */
function momentumWord(momentum: number): string {
  if (momentum >= 0.65) return 'building'
  if (momentum <= 0.35) return 'fading'
  return 'steady'
}

/** Composes the narrative for one scenario from the event's own facts. */
export function composeScenarioNarrative(scenarioType: ScenarioType, facts: ScenarioFacts): string {
  const kind = humanType(facts.event.eventType)
  const scope = scopeClause(facts)
  const parties = partiesClause(facts)
  const momentum = momentumWord(facts.event.momentumScore)
  const corroboration =
    facts.independentPublishers >= 2
      ? `${facts.independentPublishers} independent publishers`
      : 'a single publisher so far'

  switch (scenarioType) {
    case 'CONSERVATIVE':
      return (
        `Conservative: if this ${kind} pattern in ${scope} stalls or proves narrow, effects likely stay contained to ${parties}. ` +
        `Momentum currently looks ${momentum}; at ${facts.reliabilityPct}% reliability across ${corroboration}, treat a contained outcome as plausible.`
      )
    case 'BASE_CASE':
      return (
        `Base case: if the ${kind} pattern in ${scope} continues at its current, ${momentum} pace, ${parties} are the most likely to be affected. ` +
        `This rests on ${corroboration} at ${facts.reliabilityPct}% reliability${facts.contradictionCount > 0 ? `, against ${facts.contradictionCount} contradicting report(s)` : ''}.`
      )
    case 'ACCELERATED':
      return (
        `Accelerated: if this ${kind} pattern intensifies, category-level exposure could widen across ${scope} beyond ${parties}. ` +
        `Watch whether ${momentum === 'building' ? 'the building momentum sustains' : 'momentum turns upward'} and whether further independent publishers corroborate — this is a watch scenario, not a projection.`
      )
    case 'REVERSAL':
      return (
        `Reversal: if the ${facts.contradictionCount > 0 ? `${facts.contradictionCount} contradicting report(s) hold` : 'situation reverses or the claim is disputed'}, the assessment weakens and ${parties} may be unaffected. ` +
        `A reversal becomes more credible the more the ${kind} claim in ${scope} fails to recur or is denied by primary sources.`
      )
    case 'LOW_CONFIDENCE':
      return (
        `Low confidence: evidence for this ${kind} pattern in ${scope} is currently thin (${facts.reliabilityPct}% reliability, ${corroboration}). ` +
        `Monitor for stronger, independently sourced signals before drawing any conclusion about ${parties}.`
      )
  }
}
