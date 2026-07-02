import { describe, expect, it } from 'vitest'
import { AdviceLanguageError, assertNoAdviceLanguage, findAdviceLanguage } from '@/server/safety/advice-language'

describe('findAdviceLanguage', () => {
  it('passes permitted strategic language', () => {
    for (const ok of [
      'This public signal may be useful to someone watching this sector.',
      'A recruiter could watch for demand in interim support.',
      'This may indicate rising pressure; consider reviewing exposure.',
      'Strategic positioning example, not investment advice.',
    ]) {
      expect(findAdviceLanguage(ok)).toEqual([])
    }
  })

  it('flags each prohibited category', () => {
    expect(findAdviceLanguage('You should buy this stock now.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('Sell this instrument immediately.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('We recommend you hold this position.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('Target price of £45 with guaranteed returns.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('This is a risk-free profit opportunity.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('This will definitely happen, act now.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('Personalised financial advice for your portfolio.').length).toBeGreaterThan(0)
  })
})

describe('assertNoAdviceLanguage', () => {
  it('throws AdviceLanguageError listing matches, with context', () => {
    try {
      assertNoAdviceLanguage('You should buy now.', 'OpportunityCard.summary')
      throw new Error('did not throw')
    } catch (e) {
      expect(e).toBeInstanceOf(AdviceLanguageError)
      expect((e as Error).message).toContain('OpportunityCard.summary')
    }
  })
  it('does not throw on clean text', () => {
    expect(() => assertNoAdviceLanguage('This may help a team prepare.', 'ctx')).not.toThrow()
  })
})
