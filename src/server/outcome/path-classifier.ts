import type { OutcomePath, PredictionOutcome, ResolutionMethod, ScenarioType } from '@/shared/enums'
import { SUSTAINED_MIN_DISTINCT_DAYS, WIDENED_MIN_NEW_ENTITIES } from './constants'
import type { EvidenceDelta } from './evidence-window'

/**
 * Which path did reality take? Classified from observable post-prediction
 * deltas over the full window — which is why scenarios grade at the deadline
 * (an early "happened" can still widen later), except REVERSED, which is
 * terminal the moment contradiction kills the event.
 */
export function classifyPath(
  outcome: PredictionOutcome,
  resolvedBy: ResolutionMethod,
  delta: EvidenceDelta,
): OutcomePath | null {
  if (outcome === 'UNRESOLVABLE') return null
  if (outcome === 'DID_NOT_HAPPEN') {
    if (resolvedBy === 'AUTO_EVIDENCE') return 'REVERSED' // died by contradiction
    return delta.newContradictions > 0 ? 'REVERSED' : 'NONE' // quiet deadline / review
  }
  // HAPPENED — contained, sustained, or widened, judged over the window.
  if (delta.newEntityCount >= WIDENED_MIN_NEW_ENTITIES) return 'WIDENED'
  if (delta.newSupportDays >= SUSTAINED_MIN_DISTINCT_DAYS) return 'SUSTAINED'
  return 'CONTAINED'
}

/** The scenario each path vindicates. NONE vindicates nothing. */
const PATH_TO_SCENARIO: Record<Exclude<OutcomePath, 'NONE'>, ScenarioType> = {
  REVERSED: 'REVERSAL',
  CONTAINED: 'CONSERVATIVE',
  SUSTAINED: 'BASE_CASE',
  WIDENED: 'ACCELERATED',
}

export function scenarioMatchesPath(scenarioType: string, path: OutcomePath): boolean {
  if (path === 'NONE') return false
  return PATH_TO_SCENARIO[path] === scenarioType
}
