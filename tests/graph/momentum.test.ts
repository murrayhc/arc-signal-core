import { describe, expect, it } from 'vitest'
import {
  momentumScore,
  confidenceDecay,
  decayedConfidence,
  MOMENTUM_WINDOW_DAYS,
  MOMENTUM_SCALE,
} from '@/server/graph/momentum'

const NOW = new Date('2026-07-03T00:00:00Z')

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

describe('momentumScore (pure)', () => {
  it('constants match the plan', () => {
    expect(MOMENTUM_WINDOW_DAYS).toBe(21)
    expect(MOMENTUM_SCALE).toBe(4)
  })

  it('a single fresh NEW_SOURCE yields momentum > 0.5 (hand-verified: 0.75)', () => {
    const score = momentumScore([{ eventType: 'NEW_SOURCE', occurredAt: daysAgo(0) }], NOW)
    expect(score).toBeCloseTo(0.75, 5)
    expect(score).toBeGreaterThan(0.5)
  })

  it('a single fresh CONTRADICTION_DETECTED yields momentum < 0.5 (hand-verified: 0.25)', () => {
    const score = momentumScore([{ eventType: 'CONTRADICTION_DETECTED', occurredAt: daysAgo(0) }], NOW)
    expect(score).toBeCloseTo(0.25, 5)
    expect(score).toBeLessThan(0.5)
  })

  it('an event with no GraphEvents returns exactly 0.5 (neutral baseline)', () => {
    expect(momentumScore([], NOW)).toBe(0.5)
  })

  it('an event older than MOMENTUM_WINDOW_DAYS contributes 0 (still 0.5)', () => {
    const score = momentumScore([{ eventType: 'NEW_SOURCE', occurredAt: daysAgo(30) }], NOW)
    expect(score).toBe(0.5)
  })

  it('an event exactly at the window boundary contributes 0', () => {
    const score = momentumScore([{ eventType: 'NEW_SOURCE', occurredAt: daysAgo(21) }], NOW)
    expect(score).toBe(0.5)
  })

  it('FIRST_DETECTED is neutral — contributes 0 even when fresh', () => {
    const score = momentumScore([{ eventType: 'FIRST_DETECTED', occurredAt: daysAgo(0) }], NOW)
    expect(score).toBe(0.5)
  })

  it('multiple positive events compound (two fresh positives at d=0 and d=10.5)', () => {
    // d=0 -> w=1 (+1); d=10.5 -> w=1-10.5/21=0.5 (+0.5); raw=1.5; score=clamp01(0.5+1.5/4)=0.875
    const score = momentumScore(
      [
        { eventType: 'NEW_SOURCE', occurredAt: daysAgo(0) },
        { eventType: 'SIGNAL_STRENGTHENED', occurredAt: daysAgo(10.5) },
      ],
      NOW,
    )
    expect(score).toBeCloseTo(0.875, 5)
  })

  it('a positive and negative event of equal freshness cancel out to 0.5', () => {
    const score = momentumScore(
      [
        { eventType: 'NEW_SOURCE', occurredAt: daysAgo(5) },
        { eventType: 'CONFIDENCE_FELL', occurredAt: daysAgo(5) },
      ],
      NOW,
    )
    expect(score).toBeCloseTo(0.5, 5)
  })

  it('clamps at 1 when raw contributions would push above the [0,1] range', () => {
    const events = Array.from({ length: 10 }, () => ({ eventType: 'NEW_SOURCE' as const, occurredAt: daysAgo(0) }))
    expect(momentumScore(events, NOW)).toBe(1)
  })

  it('clamps at 0 when raw contributions would push below the [0,1] range', () => {
    const events = Array.from({ length: 10 }, () => ({ eventType: 'CONTRADICTION_DETECTED' as const, occurredAt: daysAgo(0) }))
    expect(momentumScore(events, NOW)).toBe(0)
  })
})

describe('confidenceDecay (pure)', () => {
  it('is ~0 for a fresh supporting date (within RECENT_DAYS)', () => {
    expect(confidenceDecay(daysAgo(0), NOW)).toBeCloseTo(0, 5)
  })

  it('is high (~0.9) for a stale supporting date (>30 days)', () => {
    expect(confidenceDecay(daysAgo(45), NOW)).toBeCloseTo(0.9, 5)
  })

  it('is 0.7 for a null lastSupportingAt (unknown recency -> freshness 0.3)', () => {
    expect(confidenceDecay(null, NOW)).toBeCloseTo(0.7, 5)
  })

  it('increases monotonically with age', () => {
    const near = confidenceDecay(daysAgo(5), NOW)
    const far = confidenceDecay(daysAgo(20), NOW)
    const stale = confidenceDecay(daysAgo(60), NOW)
    expect(near).toBeLessThan(far)
    expect(far).toBeLessThan(stale)
  })
})

describe('decayedConfidence (pure)', () => {
  it('shrinks with age relative to the base confidence', () => {
    const base = 0.8
    const fresh = decayedConfidence(base, daysAgo(0), NOW)
    const stale = decayedConfidence(base, daysAgo(45), NOW)
    expect(fresh).toBeCloseTo(0.8, 5) // freshness=1 at d=0
    expect(stale).toBeCloseTo(0.08, 5) // freshness=0.1 at d=45 (floor)
    expect(stale).toBeLessThan(fresh)
  })

  it('never exceeds the base confidence', () => {
    const base = 0.6
    expect(decayedConfidence(base, daysAgo(0), NOW)).toBeLessThanOrEqual(base)
    expect(decayedConfidence(base, daysAgo(100), NOW)).toBeLessThanOrEqual(base)
  })

  it('treats a null lastSupportingAt with the NULL_DATE_FRESHNESS (0.3) multiplier', () => {
    const base = 0.5
    expect(decayedConfidence(base, null, NOW)).toBeCloseTo(0.15, 5)
  })
})
