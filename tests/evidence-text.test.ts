import { describe, it, expect } from 'vitest'
import { normalise, jaccard, blendedSimilarity, MATCH_THRESHOLD, COPY_THRESHOLD } from '@/server/evidence/text'
import { deriveAuthority } from '@/server/evidence/authority'
import {
  ATOMIC_MATCHERS,
  detectSectors,
  detectRegions,
  detectCommodities,
  hasOpinionMarker,
} from '@/server/evidence/matchers'

describe('normalise', () => {
  it('lowercases, strips punctuation and drops stopwords', () => {
    const n = normalise("The Company's PROFITS, rose 20%!")
    expect(n.tokens.has('company')).toBe(true)
    expect(n.tokens.has('profits')).toBe(true)
    expect(n.tokens.has('rose')).toBe(true)
    expect(n.tokens.has('the')).toBe(false)
    expect(n.normalised).not.toMatch(/[,%!']/)
  })
})

describe('jaccard', () => {
  it('is 1 for identical sets, 0 for disjoint sets', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['a', 'b']))).toBe(1)
    expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0)
  })
})

describe('blendedSimilarity', () => {
  it('identical text scores ~1 (≥ COPY_THRESHOLD)', () => {
    const a = normalise('Voltcore will cut 400 jobs at its Manchester battery plant')
    const s = blendedSimilarity(a, a)
    expect(s).toBeGreaterThanOrEqual(0.99)
    expect(s).toBeGreaterThanOrEqual(COPY_THRESHOLD)
  })

  it('near-identical reprint scores ≥ COPY_THRESHOLD', () => {
    const a = normalise('Voltcore warns of a lithium shortage in Europe')
    const b = normalise('Voltcore warns of a lithium shortage in Europe this year')
    expect(blendedSimilarity(a, b)).toBeGreaterThanOrEqual(COPY_THRESHOLD)
  })

  it('unrelated text scores below MATCH_THRESHOLD', () => {
    const a = normalise('Voltcore warns of a lithium shortage in Europe')
    const b = normalise('The referee awarded a penalty in the closing minutes of the match')
    expect(blendedSimilarity(a, b)).toBeLessThan(MATCH_THRESHOLD)
  })
})

describe('deriveAuthority', () => {
  it('ranks official above news above blog and stays within 0..1', () => {
    const off = deriveAuthority('OFFICIAL', 'RSS')
    const news = deriveAuthority('NEWS', 'RSS')
    const blog = deriveAuthority('BLOG', 'RSS')
    expect(off).toBeGreaterThan(news)
    expect(news).toBeGreaterThan(blog)
    expect(off).toBeLessThanOrEqual(1)
    expect(blog).toBeGreaterThanOrEqual(0)
  })

  it('falls back to a low prior for an unknown category', () => {
    expect(deriveAuthority('WHATEVER')).toBeLessThan(deriveAuthority('NEWS'))
  })
})

describe('matchers', () => {
  it('has a matcher for every atomic type it claims to cover, all valid regexes', () => {
    expect(ATOMIC_MATCHERS.length).toBeGreaterThanOrEqual(10)
    for (const m of ATOMIC_MATCHERS) {
      expect(m.pattern).toBeInstanceOf(RegExp)
      expect(m.baseConfidence).toBeGreaterThan(0)
      expect(m.baseConfidence).toBeLessThanOrEqual(1)
    }
  })

  it('classifies a layoff sentence as LAYOFF_SIGNAL', () => {
    const s = 'Voltcore will cut 400 jobs at its Manchester plant.'
    const hit = ATOMIC_MATCHERS.find((m) => m.pattern.test(s))
    expect(hit?.claimType).toBe('LAYOFF_SIGNAL')
  })

  it('detects sectors, regions and commodities', () => {
    const s = 'A lithium shortage is hitting battery factories across Europe.'
    expect(detectCommodities(s)).toContain('lithium')
    expect(detectRegions(s)).toContain('EU')
    expect(detectSectors(s)).toContain('manufacturing')
  })

  it('flags opinion/forecast language', () => {
    expect(hasOpinionMarker('Analysts expect prices could rise sharply')).toBe(true)
    expect(hasOpinionMarker('The company cut 400 jobs on Tuesday')).toBe(false)
  })
})
