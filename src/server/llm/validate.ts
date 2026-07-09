import type { ZodSchema } from 'zod'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import type { ValidationStatus } from '@/shared/enums'

export type ValidateOptions = {
  schema?: ZodSchema<unknown>
  evidenceIds?: string[]
  requireGrounding?: boolean
  /** Minimum fraction of the supplied evidenceIds that must appear verbatim in
   *  the raw output for it to count as grounded (0..1). Only meaningful with
   *  requireGrounding. Default 0 preserves the base contract: at least ONE
   *  evidence id must always appear — the fraction tightens on top of that,
   *  it never loosens it. */
  minGroundedFraction?: number
  /** Additional caller-supplied prohibited-language checkers, run over the raw
   *  text alongside the base advice-language guard. Each checker returns the
   *  list of matched phrases (empty = clean). A non-empty result from ANY
   *  checker fails validation and folds into prohibitedLanguageDetected/notes —
   *  this is the single centralised rejection point, so callers never need a
   *  post-hoc check after runLLMTask has already returned SUCCEEDED. */
  extraCheckers?: Array<(raw: string) => string[]>
}

export type ValidationResult = {
  validationStatus: ValidationStatus
  schemaValid: boolean
  evidenceGrounded: boolean
  prohibitedLanguageDetected: boolean
  unsupportedClaimsDetected: boolean
  parsed?: unknown
  notes: string
}

/** Fail-closed output validator. Every gate defaults to the strict/failing
 *  side unless explicitly satisfied: no schema means schemaValid stays true
 *  (nothing to fail), but grounding, when required, must be demonstrated —
 *  never assumed. */
export function validateLLMOutput(raw: string, opts: ValidateOptions): ValidationResult {
  const { schema, evidenceIds = [], requireGrounding = false, minGroundedFraction = 0, extraCheckers = [] } = opts
  const notes: string[] = []

  let schemaValid = true
  let parsed: unknown
  if (schema) {
    const attempt = schema.safeParse(safeJsonParse(raw))
    schemaValid = attempt.success
    if (attempt.success) {
      parsed = attempt.data
    } else {
      notes.push(`Schema validation failed: ${attempt.error.issues.map((i) => i.message).join('; ')}`)
    }
  }

  const adviceMatches = findAdviceLanguage(raw)
  const extraMatches = extraCheckers.flatMap((check) => check(raw))
  const prohibitedLanguageDetected = adviceMatches.length > 0 || extraMatches.length > 0
  if (adviceMatches.length > 0) notes.push(`Prohibited language detected: ${adviceMatches.join('; ')}`)
  if (extraMatches.length > 0) notes.push(`Prohibited language detected: ${extraMatches.join('; ')}`)

  // Grounding: count how many supplied evidence ids the output actually cites.
  // Fail-closed: with requireGrounding, at least one id must appear AND the
  // cited fraction must meet the caller's bar. An empty evidence list can never
  // be grounded — callers must supply the ids they expect to be cited.
  const groundedCount = evidenceIds.filter((id) => raw.includes(id)).length
  const groundedFraction = evidenceIds.length > 0 ? groundedCount / evidenceIds.length : 0
  const evidenceGrounded = !requireGrounding || (groundedCount >= 1 && groundedFraction >= minGroundedFraction)
  const unsupportedClaimsDetected = requireGrounding && !evidenceGrounded
  if (unsupportedClaimsDetected) {
    notes.push(
      groundedCount === 0
        ? 'Output could not be grounded in any supplied evidence id.'
        : `Output cited ${groundedCount}/${evidenceIds.length} evidence ids — below the required fraction (${minGroundedFraction}).`,
    )
  } else if (requireGrounding) {
    notes.push(`Grounded in ${groundedCount}/${evidenceIds.length} supplied evidence ids.`)
  }

  const validationStatus: ValidationStatus =
    schemaValid && !prohibitedLanguageDetected && (!requireGrounding || evidenceGrounded) ? 'PASSED' : 'FAILED'

  return {
    validationStatus,
    schemaValid,
    evidenceGrounded,
    prohibitedLanguageDetected,
    unsupportedClaimsDetected,
    parsed,
    notes: notes.join(' '),
  }
}

/** Attempts JSON.parse for schema validation; if the raw text isn't JSON,
 *  falls back to the raw string so schema.safeParse can still fail cleanly
 *  rather than throwing. */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
