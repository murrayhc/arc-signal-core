import { NextResponse, type NextRequest } from 'next/server'
import { authDecision } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export function middleware(req: NextRequest): NextResponse {
  const decision = authDecision(
    req.headers.get('authorization'),
    process.env.ARCHLIGHT_AUTH_TOKEN,
    process.env.NODE_ENV === 'production',
  )
  if (decision === 'misconfigured') {
    return new NextResponse('Auth not configured (set ARCHLIGHT_AUTH_TOKEN)', { status: 503 })
  }
  if (decision === 'unauthorized') {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Archlight"' },
    })
  }

  // Per-IP rate limiting (after auth). Paid LLM routes get a tighter cap.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local'
  const path = req.nextUrl.pathname
  const isPaid = /^\/api\/(events\/[^/]+\/enrich|opportunities\/[^/]+\/playbook)$/.test(path)
  const limit = isPaid
    ? Number(process.env.RATE_LIMIT_PAID_PER_MIN ?? 10)
    : Number(process.env.RATE_LIMIT_PER_MIN ?? 120)
  const rl = rateLimit(`${isPaid ? 'paid' : 'gen'}:${ip}`, limit, 60_000, Date.now())
  if (!rl.ok) {
    return new NextResponse('Rate limit exceeded', {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec) },
    })
  }

  return NextResponse.next()
}

// Runs on everything except static assets.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
