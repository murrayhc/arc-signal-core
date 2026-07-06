import { NextResponse, type NextRequest } from 'next/server'
import { authDecision } from '@/lib/auth'

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
  return NextResponse.next()
}

// Runs on everything except static assets. Task 6 adds rate limiting above.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
