import { freshness } from '@/server/graph/builder'
import type { GraphEventType } from '@/shared/enums'

/** Window (days) beyond which a GraphEvent contributes nothing to momentum. */
export const MOMENTUM_WINDOW_DAYS = 21
/** Divisor that maps summed weighted contributions back onto a [0,1]-ish delta from 0.5. */
export const MOMENTUM_SCALE = 4

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** GraphEventTypes that raise momentum when recent. */
const POSITIVE: readonly GraphEventType[] = [
  'NEW_SOURCE',
  'SIGNAL_STRENGTHENED',
  'CONFIDENCE_ROSE',
  'OPPORTUNITY_GENERATED',
  'EVENT_ESCALATED',
  'CLAIM_REPEATED',
]

/** GraphEventTypes that lower momentum when recent. FIRST_DETECTED is deliberately absent (neutral). */
const NEGATIVE: readonly GraphEventType[] = ['CONFIDENCE_FELL', 'EVENT_COOLED', 'CONTRADICTION_DETECTED']

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / MS_PER_DAY
}

export type MomentumEvent = { eventType: GraphEventType | string; occurredAt: Date }

/**
 * Pure momentum score in [0,1], centred on 0.5 (no signal = neutral). Each GraphEvent
 * contributes a recency-weighted +1/-1 (POSITIVE/NEGATIVE types) or 0 (neutral, e.g.
 * FIRST_DETECTED), linearly decaying to 0 by MOMENTUM_WINDOW_DAYS. The summed
 * contribution is scaled by MOMENTUM_SCALE and added to the 0.5 baseline, then clamped.
 */
export function momentumScore(events: MomentumEvent[], now: Date): number {
  let raw = 0
  for (const event of events) {
    const d = daysBetween(now, event.occurredAt)
    const w = Math.max(0, 1 - d / MOMENTUM_WINDOW_DAYS)
    if (POSITIVE.includes(event.eventType as GraphEventType)) raw += w
    else if (NEGATIVE.includes(event.eventType as GraphEventType)) raw -= w
    // else neutral (e.g. FIRST_DETECTED): contributes 0.
  }
  return clamp01(0.5 + raw / MOMENTUM_SCALE)
}

/**
 * Confidence decay in [0,1]: how much confidence should be discounted given time since
 * the last supporting evidence. Fresh evidence -> ~0 decay; stale (>30d) -> ~0.9. A null
 * `lastSupportingAt` (unknown recency) uses builder's NULL_DATE_FRESHNESS (0.3) -> 0.7 decay.
 */
export function confidenceDecay(lastSupportingAt: Date | null, now: Date): number {
  return 1 - freshness(lastSupportingAt, now)
}

/** `base` confidence discounted by the same freshness factor used in confidenceDecay. Never exceeds `base`. */
export function decayedConfidence(base: number, lastSupportingAt: Date | null, now: Date): number {
  return base * freshness(lastSupportingAt, now)
}
