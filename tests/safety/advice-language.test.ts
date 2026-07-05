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

  it('catches evasions found in the adversarial probe', () => {
    for (const bad of [
      'We rate this a strong buy.',
      'Analysts have a strong buy on the name.',
      'Our price target is 45p.',
      "You'll see returns of 20%.",
      'Expect 20% returns this year.',
      "It's a sure thing, you can't lose.",
      'Short this name before earnings.',
      'Load up on shares now.',
      'This stock is going to the moon.',
      'We issue a hold recommendation on this name.',
      'Analysts have a strong hold rating.',
    ]) {
      expect(findAdviceLanguage(bad).length).toBeGreaterThan(0)
    }
  })

  it('catches the Pass 3 forbidden phrases', () => {
    for (const bad of [
      'This offers a certain return for buyers.',
      'A guaranteed profit awaits.',
      'Adjust your portfolio allocation accordingly.',
      'This is our investment recommendation.',
    ]) {
      expect(findAdviceLanguage(bad).length).toBeGreaterThan(0)
    }
  })

  it('does not false-positive on the strategic vocabulary the templates use', () => {
    for (const ok of [
      'Strong buyer demand may be forming in this sector.',
      'A supplier could review which buyer groups face pressure.',
      'This may cut short the planning window for procurement teams.',
      'A recruiter might watch for a short-term spike in interim demand.',
      'Consider monitoring long-term sector momentum.',
      'Review the returns of the recent tender process.',
    ]) {
      expect(findAdviceLanguage(ok)).toEqual([])
    }
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
