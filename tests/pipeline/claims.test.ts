import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { extractClaims, extractClaimsFromText } from '@/server/pipeline/claims'
import { resetDb } from '../helpers'
import { makeDocument, makeParsedDocument, makeSource } from '../factories'

describe('extractClaimsFromText (pure rules)', () => {
  it('detects layoff mentions with sector and region', () => {
    const claims = extractClaimsFromText(
      'Meridian Grid Systems, a UK technology manufacturer, is cutting 400 jobs in Manchester.',
    )
    const layoff = claims.find((c) => c.claimType === 'LAYOFF_MENTION')
    expect(layoff).toBeDefined()
    expect(layoff!.extractionConfidence).toBeCloseTo(0.85, 5) // 0.75 base + 0.1 digit bonus
    expect(layoff!.sector).toBe('technology')
    expect(layoff!.region).toBe('UK')
  })

  it('detects procurement, regulatory and demand claims', () => {
    expect(
      extractClaimsFromText('The council launched a £45m tender for a framework agreement.').some(
        (c) => c.claimType === 'PROCUREMENT_EVENT',
      ),
    ).toBe(true)
    expect(
      extractClaimsFromText('The regulator opened an investigation into payment fees.').some(
        (c) => c.claimType === 'REGULATORY_EVENT',
      ),
    ).toBe(true)
    expect(
      extractClaimsFromText('Distributors report a demand surge with record orders in June.').some(
        (c) => c.claimType === 'MARKET_DEMAND_EVENT',
      ),
    ).toBe(true)
  })

  it('returns no claims for empty or non-matching text', () => {
    expect(extractClaimsFromText('')).toEqual([])
    expect(extractClaimsFromText('Seaside towns prepare decorations for the festival.')).toEqual([])
  })
})

describe('extractClaims (persistence)', () => {
  beforeEach(resetDb)

  it('creates claims linked to their source document with provenance fields', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id, { publishedAt: new Date('2026-06-28T09:00:00Z') })
    const parsed = await makeParsedDocument(doc.id, {
      bodyText: 'The technology firm is cutting 400 jobs in the UK.',
      publishedAt: new Date('2026-06-28T09:00:00Z'),
    })
    const { claims, errors } = await extractClaims([parsed], new Map([[doc.id, doc]]))
    expect(errors).toHaveLength(0)
    expect(claims.length).toBeGreaterThanOrEqual(1)
    expect(claims[0].documentId).toBe(doc.id)
    expect(claims[0].isFixture).toBe(true)
    expect(claims[0].extractionMethod).toMatch(/^rule:v1:/)
    expect(claims[0].claimDate?.toISOString()).toBe('2026-06-28T09:00:00.000Z')
  })

  it('flags low-confidence claims for review', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    // "headcount" alone matches HIRING_CHANGE at base 0.45, no digit bonus → 0.45 < 0.5 → needsReview
    const parsed = await makeParsedDocument(doc.id, {
      bodyText: 'Analysts discussed headcount at the meeting.',
    })
    const { claims } = await extractClaims([parsed], new Map([[doc.id, doc]]))
    expect(claims).toHaveLength(1)
    expect(claims[0].needsReview).toBe(true)
  })

  it('creates no claims from empty parser output', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, { bodyText: '' })
    const { claims } = await extractClaims([parsed], new Map([[doc.id, doc]]))
    expect(claims).toHaveLength(0)
    expect(await prisma.claim.count()).toBe(0)
  })

  it('skips parsed documents whose status is not PARSED', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, { status: 'UNSUPPORTED', bodyText: 'The firm is cutting 400 jobs.' })
    const { claims, errors } = await extractClaims([parsed], new Map([[doc.id, doc]]))
    expect(claims).toHaveLength(0)
    expect(errors).toHaveLength(0)
  })

  it('records an error when the document is missing from docsById', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const parsed = await makeParsedDocument(doc.id, { bodyText: 'The firm is cutting 400 jobs.' })
    const { claims, errors } = await extractClaims([parsed], new Map())
    expect(claims).toHaveLength(0)
    expect(errors[0].message).toContain('No document loaded')
  })
})
