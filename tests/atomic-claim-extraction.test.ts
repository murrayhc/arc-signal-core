import { beforeEach, describe, expect, it } from 'vitest'
import { ATOMIC_CLAIM_TYPES } from '@/shared/enums'
import type { LLMProvider } from '@/server/llm/types'
import { extractAtomicClaims, extractAtomicClaimsFromText } from '@/server/evidence/extraction'
import { resetDb } from './helpers'
import { makeDocument, makeParsedDocument, makeSource } from './factories'

function fakeProvider(text: string): LLMProvider {
  return { name: 'fake', async generate() { return { text, tokensIn: 5, tokensOut: 5 } } }
}

describe('extractAtomicClaimsFromText (pure)', () => {
  it('breaks one document into multiple discrete claims', () => {
    const body =
      'Voltcore will cut 400 jobs at its Manchester plant. The regulator has opened an investigation into the firm.'
    const claims = extractAtomicClaimsFromText(body)
    expect(claims.length).toBeGreaterThanOrEqual(2)
    const types = claims.map((c) => c.claimType)
    expect(types).toContain('LAYOFF_SIGNAL')
    expect(types).toContain('REGULATORY_PRESSURE')
  })

  it('drops the generic COMPANY_STATEMENT when a specific type also matches', () => {
    const claims = extractAtomicClaimsFromText('Acme announced it will cut 300 jobs.')
    expect(claims).toHaveLength(1)
    expect(claims[0].claimType).toBe('LAYOFF_SIGNAL')
  })

  it('scores a numeric claim as more specific than a vaguer one', () => {
    const withNumber = extractAtomicClaimsFromText('Acme cut 400 jobs.')[0]
    const withoutNumber = extractAtomicClaimsFromText('Acme announced redundancies at the site.')[0]
    expect(withNumber.specificityScore).toBeGreaterThan(withoutNumber.specificityScore)
  })

  it('labels a low-confidence generic statement NEEDS_REVIEW', () => {
    const claims = extractAtomicClaimsFromText('Globex unveiled a fresh office layout today.')
    expect(claims).toHaveLength(1)
    expect(claims[0].claimType).toBe('COMPANY_STATEMENT')
    expect(claims[0].factualityLabel).toBe('NEEDS_REVIEW')
  })

  it('captures sectors, regions and commodities on the claim', () => {
    const claim = extractAtomicClaimsFromText('A lithium shortage is squeezing battery factories across Europe.')[0]
    expect(claim.commodities).toContain('lithium')
    expect(claim.regions).toContain('EU')
  })
})

describe('extractAtomicClaims (persistence)', () => {
  beforeEach(resetDb)

  it('persists multiple atomic claims per document, preserving document and source ids', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, {
      bodyText:
        'Voltcore will cut 400 jobs at its Manchester plant. The regulator has opened an investigation into the firm.',
      entitiesMentionedJson: JSON.stringify(['Voltcore']),
    })
    const { atomicClaims, errors } = await extractAtomicClaims(
      [parsed],
      new Map([[doc.id, doc]]),
      new Map([[source.id, source]]),
    )
    expect(errors).toHaveLength(0)
    expect(atomicClaims.length).toBeGreaterThanOrEqual(2)
    for (const c of atomicClaims) {
      expect(c.documentId).toBe(doc.id)
      expect(c.sourceId).toBe(source.id)
      expect(ATOMIC_CLAIM_TYPES as readonly string[]).toContain(c.claimType)
      expect(c.extractionConfidence).toBeGreaterThanOrEqual(0)
      expect(c.extractionConfidence).toBeLessThanOrEqual(1)
    }
  })

  it('falls back to the injected LLM provider only when rules find nothing', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, {
      bodyText: 'Nothing especially newsworthy was discussed at the quiet gathering.',
    })
    const provider = fakeProvider(
      JSON.stringify({ documentId: doc.id, claims: [{ claimText: 'The firm restructured its operations.', claimType: 'COMPANY_STATEMENT' }] }),
    )
    const { atomicClaims } = await extractAtomicClaims(
      [parsed],
      new Map([[doc.id, doc]]),
      new Map([[source.id, source]]),
      { llmProvider: provider },
    )
    expect(atomicClaims).toHaveLength(1)
    expect(atomicClaims[0].extractionMethod).toBe('llm:CLAIM_EXTRACTION_ASSIST')
  })
})
