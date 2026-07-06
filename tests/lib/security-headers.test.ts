import { describe, expect, it } from 'vitest'
import { securityHeaders } from '@/lib/security-headers'

describe('securityHeaders', () => {
  it('includes the baseline hardening headers', () => {
    const keys = securityHeaders(false).map((h) => h.key)
    expect(keys).toContain('X-Frame-Options')
    expect(keys).toContain('X-Content-Type-Options')
    expect(keys).toContain('Referrer-Policy')
    expect(keys).toContain('Content-Security-Policy')
    const csp = securityHeaders(false).find((h) => h.key === 'Content-Security-Policy')!.value
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('default-src') // must not break Next's inline runtime
  })
  it('adds HSTS only in production', () => {
    expect(securityHeaders(false).some((h) => h.key === 'Strict-Transport-Security')).toBe(false)
    expect(securityHeaders(true).some((h) => h.key === 'Strict-Transport-Security')).toBe(true)
  })
})
