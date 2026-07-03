import type { ZodSchema } from 'zod'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import type { ValidationStatus } from '@/shared/enums'

export type ValidateOptions = {
  schema?: ZodSchema<unknown>
  evidenceIds?: string[]
  requireGrounding?: boolean
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
  const { schema, evidenceIds = [], requireGrounding = false } = opts
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
  const prohibitedLanguageDetected = adviceMatches.length > 0
  if (prohibitedLanguageDetected) notes.push(`Prohibited language detected: ${adviceMatches.join('; ')}`)

  const evidenceGrounded = !requireGrounding || evidenceIds.some((id) => raw.includes(id))
  const unsupportedClaimsDetected = requireGrounding && !evidenceGrounded
  if (unsupportedClaimsDetected) notes.push('Output could not be grounded in any supplied evidence id.')

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
