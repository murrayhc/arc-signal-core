/** Outcome-Resolution Engine (Stage 11) thresholds — every number the engine
 *  uses to freeze, resolve, and learn lives here, pinned by the stage-11 tests. */

/** No timeWindowEnd on the event → deadline = firstDetectedAt + this. */
export const DEFAULT_HORIZON_DAYS = 90
/** Event has a timeWindowEnd → deadline = timeWindowEnd + this (coverage lag). */
export const DEADLINE_GRACE_DAYS = 7
/** A NEEDS_MORE_EVIDENCE review verdict reopens the prediction and pushes the
 *  deadline out by this much (a fresh review item forms at the new deadline). */
export const REVIEW_EXTENSION_DAYS = 30

/** Rule 1b: this many NEW independent publisher groups (with zero
 *  contradictions) auto-resolve an event prediction as HAPPENED. */
export const HAPPENED_MIN_NEW_GROUPS = 2
/** Rule 1a: a single NEW corroborating source at or above this authority
 *  (regulator/government/filing) auto-resolves as HAPPENED. */
export const PRIMARY_AUTHORITY_AT = 0.85
/** Rule 2: reliability below this WITH contradictions present counts as an
 *  evidence-driven DID_NOT_HAPPEN. */
export const RELIABILITY_COLLAPSE_BELOW = 0.25

/** Path WIDENED: at least this many new affected entities post-prediction. */
export const WIDENED_MIN_NEW_ENTITIES = 2
/** Path SUSTAINED: new corroboration on at least this many distinct UTC days. */
export const SUSTAINED_MIN_DISTINCT_DAYS = 2

/** Weight learning gates (owner-gated — suggestions never self-apply). */
export const MIN_RESOLVED_FOR_LEARNING = 30
export const MIN_BRIER_IMPROVEMENT = 0.005
export const WEIGHT_FLOOR = 0.05
export const WEIGHT_CEIL = 0.4
export const MAX_WEIGHT_SHIFT = 0.05

/** Brier benchmark: what always-guessing-50% scores. */
export const COIN_FLIP_BRIER = 0.25

/** Source categories counted as "mainstream coverage" for lead-time. */
export const MAINSTREAM_CATEGORIES = new Set(['NEWS', 'WIRE'])
