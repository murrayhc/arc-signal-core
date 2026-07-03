import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { validateLLMOutput } from '@/server/llm/validate'

describe('validateLLMOutput', () => {
  it('PASSED for clean grounded schema-valid text', () => {
    const schema = z.object({ summary: z.string() })
    const raw = JSON.stringify({ summary: 'Evidence EV-1 shows a hiring slowdown.' })
    const result = validateLLMOutput(raw, { schema, evidenceIds: ['EV-1'], requireGrounding: true })
    expect(result.validationStatus).toBe('PASSED')
    expect(result.schemaValid).toBe(true)
    expect(result.evidenceGrounded).toBe(true)
    expect(result.prohibitedLanguageDetected).toBe(false)
    expect(result.unsupportedClaimsDetected).toBe(false)
    expect(result.parsed).toEqual({ summary: 'Evidence EV-1 shows a hiring slowdown.' })
  })

  it('FAILED (prohibitedLanguageDetected) for text containing advice language', () => {
    const raw = 'you should buy this stock'
    const result = validateLLMOutput(raw, {})
    expect(result.validationStatus).toBe('FAILED')
    expect(result.prohibitedLanguageDetected).toBe(true)
  })

  it('FAILED (schemaValid false) for schema mismatch', () => {
    const schema = z.object({ summary: z.string() })
    const raw = JSON.stringify({ wrongField: 123 })
    const result = validateLLMOutput(raw, { schema })
    expect(result.validationStatus).toBe('FAILED')
    expect(result.schemaValid).toBe(false)
  })

  it('FAILED (evidenceGrounded false) when requireGrounding and no evidence id is present', () => {
    const raw = 'A general observation with no citations.'
    const result = validateLLMOutput(raw, { evidenceIds: ['EV-1', 'EV-2'], requireGrounding: true })
    expect(result.validationStatus).toBe('FAILED')
    expect(result.evidenceGrounded).toBe(false)
    expect(result.unsupportedClaimsDetected).toBe(true)
  })

  it('passes without a schema (schemaValid true) when no schema is provided', () => {
    const result = validateLLMOutput('plain safe text', {})
    expect(result.schemaValid).toBe(true)
    expect(result.validationStatus).toBe('PASSED')
  })
})
