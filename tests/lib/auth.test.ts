import { describe, expect, it } from 'vitest'
import { authDecision, checkBasicAuth } from '@/lib/auth'

function basic(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64')
}

describe('checkBasicAuth', () => {
  it('accepts the correct password (any username)', () => {
    expect(checkBasicAuth(basic('archlight', 'sekret'), 'sekret')).toBe(true)
    expect(checkBasicAuth(basic('', 'sekret'), 'sekret')).toBe(true)
  })
  it('rejects wrong/missing/malformed', () => {
    expect(checkBasicAuth(basic('x', 'nope'), 'sekret')).toBe(false)
    expect(checkBasicAuth(null, 'sekret')).toBe(false)
    expect(checkBasicAuth('Bearer abc', 'sekret')).toBe(false)
    expect(checkBasicAuth('Basic !!!not-base64', 'sekret')).toBe(false)
  })
})

describe('authDecision', () => {
  it('token set → enforce', () => {
    expect(authDecision(basic('a', 'sekret'), 'sekret', true)).toBe('allow')
    expect(authDecision(basic('a', 'bad'), 'sekret', true)).toBe('unauthorized')
    expect(authDecision(null, 'sekret', true)).toBe('unauthorized')
  })
  it('token unset → fail closed in prod, open in dev', () => {
    expect(authDecision(null, undefined, true)).toBe('misconfigured')
    expect(authDecision(null, undefined, false)).toBe('allow')
    expect(authDecision(null, '', true)).toBe('misconfigured')
  })
})
