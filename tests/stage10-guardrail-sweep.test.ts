import { describe, expect, it } from 'vitest'
import { findAdviceLanguage } from '@/server/safety/advice-language'

/**
 * The brief's full forbidden-language list, asserted directly against the
 * RUNTIME guard (not just a test-only list). Each phrase must be caught before
 * any generated text can be persisted or displayed.
 */
describe('forbidden financial-advice language — full brief list', () => {
  it.each([
    // The brief's explicit list.
    'you should buy this stock',
    'investors should sell now',
    'a strong buy rating',
    'we issue a sell rating',
    'maintain a hold rating',
    'our target price is 240p',
    'a price target of 500',
    'guaranteed profit',
    'guaranteed returns',
    'a certain return of 12%',
    'change your portfolio allocation',
    // Additional advice registers the guard also blocks.
    'returns of 30%',
    '20% returns',
    'risk-free trade',
    'this is a sure thing',
    'load up on shares',
    'personal investment advice',
    'an overweight rating',
    'a buy-rated name',
    'our top pick this week',
    'a conviction buy',
  ])('catches: "%s"', (phrase) => {
    expect(findAdviceLanguage(phrase).length).toBeGreaterThan(0)
  })

  it('does NOT flag legitimate non-advisory intelligence language', () => {
    const clean = [
      'A procurement team may watch for pricing pressure.',
      'This information could be relevant to someone monitoring supplier exposure.',
      'A competitor may monitor customer dissatisfaction.',
      'The company cut short its earnings call.', // "cut short" ≠ "short this stock"
      'Evidence reliability is 72% across three independent publishers.',
      'A supplier could position around emerging demand if the signal strengthens.',
      'Watch for confirming reports before drawing conclusions.',
    ]
    for (const text of clean) {
      expect(findAdviceLanguage(text), text).toEqual([])
    }
  })
})
