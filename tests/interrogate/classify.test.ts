import { describe, expect, it } from 'vitest'
import { classifyQuery } from '@/server/interrogate/classify'

describe('classifyQuery (pure)', () => {
  it('classifies short all-caps tickers as TICKER', () => {
    expect(classifyQuery('BP')).toBe('TICKER')
    expect(classifyQuery('AAPL')).toBe('TICKER')
  })

  it('classifies share/stock price phrasing as SHARE_PRICE', () => {
    expect(classifyQuery('BP share price')).toBe('SHARE_PRICE')
  })

  it('classifies known commodity words as COMMODITY', () => {
    expect(classifyQuery('lithium supply')).toBe('COMMODITY')
  })

  it('classifies a known sector as SECTOR', () => {
    expect(classifyQuery('technology', { knownSectors: ['technology'] })).toBe('SECTOR')
  })

  it('classifies a known region as REGION', () => {
    expect(classifyQuery('UK', { knownRegions: ['UK'] })).toBe('REGION')
  })

  it('classifies regulation-related phrasing as REGULATION', () => {
    expect(classifyQuery('AI regulation')).toBe('REGULATION')
  })

  it('classifies procurement-related phrasing as PROCUREMENT', () => {
    expect(classifyQuery('defence procurement')).toBe('PROCUREMENT')
  })

  it('classifies a known company (ci contains) as COMPANY', () => {
    expect(classifyQuery('Meridian Grid', { knownCompanies: ['Meridian Grid Systems'] })).toBe('COMPANY')
  })

  it('classifies an unmatched free-text query as THEME', () => {
    expect(classifyQuery('fintech layoffs')).toBe('THEME')
  })

  it('classifies an empty query as UNKNOWN', () => {
    expect(classifyQuery('')).toBe('UNKNOWN')
  })
})
