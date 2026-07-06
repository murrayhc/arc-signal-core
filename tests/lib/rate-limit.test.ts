import { beforeEach, describe, expect, it } from 'vitest'
import { rateLimit, __resetRateLimit } from '@/lib/rate-limit'

describe('rateLimit', () => {
  beforeEach(() => __resetRateLimit())

  it('allows up to the limit then blocks with retry-after', () => {
    const win = 60_000
    expect(rateLimit('ip1', 2, win, 1000).ok).toBe(true)
    expect(rateLimit('ip1', 2, win, 1000).ok).toBe(true)
    const third = rateLimit('ip1', 2, win, 1000)
    expect(third.ok).toBe(false)
    expect(third.retryAfterSec).toBeGreaterThan(0)
  })

  it('resets after the window and isolates keys', () => {
    expect(rateLimit('a', 1, 60_000, 1000).ok).toBe(true)
    expect(rateLimit('a', 1, 60_000, 1000).ok).toBe(false)
    expect(rateLimit('a', 1, 60_000, 61_001).ok).toBe(true) // window elapsed
    expect(rateLimit('b', 1, 60_000, 1000).ok).toBe(true) // separate key
  })
})
