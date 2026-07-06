/** Length-tolerant constant-time-ish compare — no early exit on mismatch. */
function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  const max = Math.max(a.length, b.length)
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

/** Verifies an `Authorization: Basic <base64(user:pass)>` header. The username
 *  is ignored; only the password must equal `token`. Edge-safe (uses atob). */
export function checkBasicAuth(header: string | null, token: string): boolean {
  if (!header || !header.startsWith('Basic ')) return false
  let decoded: string
  try {
    decoded = atob(header.slice(6).trim())
  } catch {
    return false
  }
  const idx = decoded.indexOf(':')
  const password = idx === -1 ? decoded : decoded.slice(idx + 1)
  return timingSafeEqual(password, token)
}

export type AuthDecision = 'allow' | 'unauthorized' | 'misconfigured'

/** Central gate decision. Token set → enforce Basic Auth. Token unset →
 *  fail-closed ('misconfigured') in production, open in dev/test. */
export function authDecision(
  header: string | null,
  token: string | undefined,
  isProduction: boolean,
): AuthDecision {
  if (!token) return isProduction ? 'misconfigured' : 'allow'
  return checkBasicAuth(header, token) ? 'allow' : 'unauthorized'
}
