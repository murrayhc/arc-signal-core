/** Baseline security response headers. CSP is the safe subset only — a
 *  `default-src`/`script-src` policy would block Next's inline hydration
 *  runtime; a nonce-based strict CSP is a documented follow-up. */
export function securityHeaders(isProduction: boolean): { key: string; value: string }[] {
  const headers = [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  ]
  if (isProduction) {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' })
  }
  return headers
}
