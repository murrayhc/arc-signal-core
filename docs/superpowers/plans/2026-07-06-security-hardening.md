# Security Hardening (P0 + P1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Archlight safe to expose — Basic-Auth gate over all routes, LLM spend cap + enrich cooldown, RSS SSRF guard, security headers, per-IP rate limiting.

**Architecture:** Pure, unit-tested guard functions (`src/lib/*`, `src/server/net/*`, `src/server/llm/budget.ts`) wrapped by a thin `src/middleware.ts` (edge) and `next.config.ts headers()`. Fail-closed in production; local dev + the existing 437 tests are untouched (route tests call handlers directly, bypassing middleware).

**Tech Stack:** Next.js 15 middleware (edge), TypeScript (strict), Prisma+SQLite, Vitest, Web APIs (`atob`, `fetch`, `AbortSignal`, `ReadableStream`).

## Global Constraints

- Fail-closed in production: `ARCHLIGHT_AUTH_TOKEN` unset + `NODE_ENV==='production'` → deny all (503). Unset + non-prod → allow (dev/test).
- All limits env-tunable with safe defaults: `ARCHLIGHT_AUTH_TOKEN` (unset), `LLM_DAILY_CALL_CAP`=100, `ENRICH_COOLDOWN_MINUTES`=60, `RSS_MAX_BYTES`=5000000, `RATE_LIMIT_PER_MIN`=120, `RATE_LIMIT_PAID_PER_MIN`=10.
- No live network in tests; existing 437 tests stay green.
- `LLMRun.status` is a `String` column — adding `SKIPPED_BUDGET` is type-only (no migration).
- CSP uses the safe subset only (`frame-ancestors 'none'; base-uri 'self'; object-src 'none'`) — a `default-src`/`script-src` CSP would break Next's inline hydration and is a documented follow-up.
- Every commit: `npm run typecheck` clean + `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npm test` green. Trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/lib/auth.ts` | Create | `checkBasicAuth`, `authDecision` (pure, edge-safe). |
| `src/middleware.ts` | Create (T1) / Modify (T6) | Edge gate: auth (T1) + rate limit (T6). |
| `src/lib/rate-limit.ts` | Create | Fixed-window per-key limiter (pure, injected `now`). |
| `src/lib/security-headers.ts` | Create | `securityHeaders(isProd)` list. |
| `src/server/llm/budget.ts` | Create | Daily LLM call-count budget. |
| `src/server/net/safe-fetch.ts` | Create | `assertSafeUrl`, `safeFetchText` (SSRF + size cap). |
| `src/shared/enums.ts` | Modify | `+ 'SKIPPED_BUDGET'` in `LLM_RUN_STATUSES`. |
| `src/server/llm/run.ts` | Modify | Budget check before `provider.generate`. |
| `src/server/consequence/enrich.ts` | Modify | Per-event cooldown. |
| `src/server/consequence/types.ts` | Modify | `EnrichmentResult.status += 'COOLDOWN'`. |
| `src/components/consequence/RunEnrichmentButton.tsx` | Modify | Handle `COOLDOWN`. |
| `src/server/pipeline/collectors/rss.ts` | Modify | Use `safeFetchText`. |
| `next.config.ts` | Modify | `async headers()`. |
| `.env.example` | Modify | Document new vars. |
| `docs/security-hardening.md` | Create | Config + runbook + follow-ups. |
| Tests | Create/Modify | Per task. |

---

### Task 1: Basic-Auth gate (helpers + middleware)

**Files:**
- Create: `src/lib/auth.ts`, `src/middleware.ts`, `tests/lib/auth.test.ts`
- Modify: `.env.example`

**Interfaces — Produces:**
- `checkBasicAuth(header: string | null, token: string): boolean`
- `type AuthDecision = 'allow' | 'unauthorized' | 'misconfigured'`
- `authDecision(header: string | null, token: string | undefined, isProduction: boolean): AuthDecision`

- [ ] **Step 1: Write the failing test** — `tests/lib/auth.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run to verify it fails** — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run tests/lib/auth.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/auth.ts`:

```typescript
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
```

Note: the test uses Node's `Buffer` to build the header but `checkBasicAuth` decodes with `atob`; both are available under vitest's Node env, and `atob` is the edge-runtime API middleware will use.

- [ ] **Step 4: Implement middleware** — `src/middleware.ts`:

```typescript
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
```

- [ ] **Step 5: Update `.env.example`** — append:

```
# Basic Auth password gating all pages + API (REQUIRED in production; unset in
# production denies everything). Any username works; this is the password.
ARCHLIGHT_AUTH_TOKEN=
# Anthropic API key to activate AI enrichment (see docs/ai-activation.md).
ANTHROPIC_API_KEY=
```

- [ ] **Step 6: Run test + typecheck + full suite** — auth test PASS; `npm run typecheck` clean; `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npm test` green (middleware never runs in vitest).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/middleware.ts .env.example tests/lib/auth.test.ts
git commit -m "feat(security): Basic-Auth gate over all routes (fail-closed in prod)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: LLM daily spend cap

**Files:**
- Modify: `src/shared/enums.ts` (add `SKIPPED_BUDGET`), `src/server/llm/run.ts`
- Create: `src/server/llm/budget.ts`, `tests/llm/budget.test.ts`

**Interfaces — Produces:**
- `dailyCallCount(now: Date): Promise<number>`
- `isWithinDailyBudget(now: Date, cap?: number): Promise<boolean>`
- `LLMRunStatus` now includes `'SKIPPED_BUDGET'`.

- [ ] **Step 1: Write the failing test** — `tests/llm/budget.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import type { LLMProvider, LLMRequest } from '@/server/llm/types'
import { isWithinDailyBudget } from '@/server/llm/budget'
import { runLLMTask } from '@/server/llm/run'
import { resetDb } from '../helpers'

async function seedRuns(n: number) {
  for (let i = 0; i < n; i++) {
    await prisma.lLMRun.create({
      data: { taskType: 'COMPANY_IMPACT_ANALYSIS', provider: 'x', model: 'm', promptHash: 'h', inputSummary: '', outputSummary: '', status: 'SUCCEEDED', tokenCountInput: 1, tokenCountOutput: 1, estimatedCost: 0, latencyMs: 1 },
    })
  }
}

describe('LLM daily budget', () => {
  beforeEach(resetDb)

  it('is within budget under the cap and over at the cap', async () => {
    await seedRuns(2)
    expect(await isWithinDailyBudget(new Date(), 3)).toBe(true)
    expect(await isWithinDailyBudget(new Date(), 2)).toBe(false)
  })

  it('does not count SKIPPED runs', async () => {
    await prisma.lLMRun.create({ data: { taskType: 'COMPANY_IMPACT_ANALYSIS', provider: 'none', model: 'none', promptHash: 'h', inputSummary: '', outputSummary: '', status: 'SKIPPED_NO_PROVIDER', tokenCountInput: 0, tokenCountOutput: 0, estimatedCost: 0, latencyMs: 0 } })
    expect(await isWithinDailyBudget(new Date(), 1)).toBe(true)
  })

  it('runLLMTask over budget logs SKIPPED_BUDGET and never calls the provider', async () => {
    await seedRuns(2)
    let called = false
    const provider: LLMProvider = { name: 'fake', async generate(_r: LLMRequest) { called = true; return { text: 'x', tokensIn: 1, tokensOut: 1 } } }
    process.env.LLM_DAILY_CALL_CAP = '2'
    try {
      const res = await runLLMTask({ taskType: 'COMPANY_IMPACT_ANALYSIS', system: 's', prompt: 'p' }, { provider })
      expect(res.status).toBe('SKIPPED_BUDGET')
      expect(called).toBe(false)
    } finally {
      delete process.env.LLM_DAILY_CALL_CAP
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module missing / `SKIPPED_BUDGET` not a status).

- [ ] **Step 3a: Add the status** — in `src/shared/enums.ts`, change the `LLM_RUN_STATUSES` line to:

```typescript
export const LLM_RUN_STATUSES = ['PENDING','SUCCEEDED','FAILED','SKIPPED_NO_PROVIDER','SKIPPED_BUDGET','REJECTED_VALIDATION'] as const
```

- [ ] **Step 3b: Implement budget** — `src/server/llm/budget.ts`:

```typescript
import { prisma } from '@/server/db'

export const DEFAULT_DAILY_CALL_CAP = 100

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** Real LLM calls made today (UTC). SKIPPED_* made no call, so they don't count. */
export async function dailyCallCount(now: Date): Promise<number> {
  return prisma.lLMRun.count({
    where: {
      status: { in: ['SUCCEEDED', 'FAILED', 'REJECTED_VALIDATION'] },
      createdAt: { gte: startOfUtcDay(now) },
    },
  })
}

export async function isWithinDailyBudget(
  now: Date,
  cap = Number(process.env.LLM_DAILY_CALL_CAP ?? DEFAULT_DAILY_CALL_CAP),
): Promise<boolean> {
  return (await dailyCallCount(now)) < cap
}
```

- [ ] **Step 3c: Wire into `run.ts`** — in `runLLMTask`, immediately after the `const routedReq: LLMRequest = routed ? … : req` line (and before `const startedAt = Date.now()`), insert:

```typescript
  // Daily spend cap: over budget behaves like dormant — no provider call.
  const { isWithinDailyBudget } = await import('./budget')
  if (!(await isWithinDailyBudget(new Date()))) {
    const run = await prisma.lLMRun.create({
      data: {
        taskType: req.taskType, provider: provider.name, model: routedModel,
        promptHash, inputSummary, outputSummary: '',
        status: 'SKIPPED_BUDGET' satisfies LLMRunStatus,
        tokenCountInput: 0, tokenCountOutput: 0, estimatedCost: 0, latencyMs: 0,
      },
    })
    return { status: 'SKIPPED_BUDGET', llmRunId: run.id, validation: null }
  }
```

(Use a static `import { isWithinDailyBudget } from './budget'` at the top instead of the inline `await import` if preferred — either is fine; static is cleaner. `LLMRunStatus` is already imported in run.ts.)

- [ ] **Step 4: Run test + typecheck + full suite** → green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/enums.ts src/server/llm/budget.ts src/server/llm/run.ts tests/llm/budget.test.ts
git commit -m "feat(security): daily LLM call-cap (SKIPPED_BUDGET, dormant over cap)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Per-event enrich cooldown

**Files:**
- Modify: `src/server/consequence/types.ts`, `src/server/consequence/enrich.ts`, `src/components/consequence/RunEnrichmentButton.tsx`
- Test: `tests/consequence-enrich-cooldown.test.ts`

**Interfaces:** `EnrichmentResult.status` now `'ENRICHED' | 'DORMANT' | 'COOLDOWN'`.

- [ ] **Step 1: Write the failing test** — `tests/consequence-enrich-cooldown.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import type { LLMProvider, LLMRequest } from '@/server/llm/types'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { synthesiseContext } from '@/server/consequence/context'
import { enrichEventConsequence } from '@/server/consequence/enrich'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'
const GOOD_CONTEXT = JSON.stringify({ historic: 'h', present: 'p', future: 'f', executive: 'A Voltcore layoff signal to monitor.' })
function fake(byTask: Record<string, string>): LLMProvider {
  return { name: 'fake', async generate(req: LLMRequest) { return { text: byTask[req.taskType] ?? '', tokensIn: 1, tokensOut: 1 } } }
}

describe('enrich cooldown', () => {
  beforeEach(resetDb)

  it('a second enrich within the cooldown window is a no-op COOLDOWN', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    await synthesiseContext(event.id)
    const provider = fake({ COMPANY_IMPACT_ANALYSIS: 'Voltcore may face pressure; verify against primary sources.', PRESENT_CONTEXT: GOOD_CONTEXT })

    const first = await enrichEventConsequence(event.id, { provider })
    expect(first.status).toBe('ENRICHED')

    const second = await enrichEventConsequence(event.id, { provider })
    expect(second.status).toBe('COOLDOWN')
    expect(second.impactsEnriched).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (second returns `ENRICHED`, `COOLDOWN` not a valid status).

- [ ] **Step 3a: `types.ts`** — change:

```typescript
export type EnrichmentResult = {
  status: 'ENRICHED' | 'DORMANT' | 'COOLDOWN'
  impactsEnriched: number
  contextEnriched: boolean
  skipped: number
}
```

- [ ] **Step 3b: `enrich.ts`** — after the `if (!event) return …` guard and before the named-impact loop, insert:

```typescript
  // Per-event cooldown: skip a re-spend if this event was enriched recently.
  const cooldownMin = Number(process.env.ENRICH_COOLDOWN_MINUTES ?? 60)
  const priorCtx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId } })
  if (priorCtx?.enrichedByLLMRunId && Date.now() - priorCtx.updatedAt.getTime() < cooldownMin * 60_000) {
    return { status: 'COOLDOWN', impactsEnriched: 0, contextEnriched: false, skipped: 0 }
  }
```

- [ ] **Step 3c: `RunEnrichmentButton.tsx`** — extend the `Result` type's `status` to `'ENRICHED' | 'DORMANT' | 'COOLDOWN'` and add a branch after the DORMANT one:

```tsx
      {state === 'done' && result?.status === 'COOLDOWN' && (
        <p className="mt-2 text-xs text-slate-400">Already enhanced recently — try again later.</p>
      )}
```

- [ ] **Step 4: Run test + typecheck + full suite** → green (the existing `consequence-enrich.test.ts` enriches each event once, so cooldown never trips there).

- [ ] **Step 5: Commit**

```bash
git add src/server/consequence/types.ts src/server/consequence/enrich.ts src/components/consequence/RunEnrichmentButton.tsx tests/consequence-enrich-cooldown.test.ts
git commit -m "feat(security): per-event enrich cooldown (no re-spend within window)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: RSS SSRF guard + size cap

**Files:**
- Create: `src/server/net/safe-fetch.ts`, `tests/net/safe-fetch.test.ts`
- Modify: `src/server/pipeline/collectors/rss.ts`

**Interfaces — Produces:**
- `assertSafeUrl(raw: string): URL` (throws on unsafe)
- `safeFetchText(raw: string, opts?: { maxBytes?: number; timeoutMs?: number }): Promise<string>`

- [ ] **Step 1: Write the failing test** — `tests/net/safe-fetch.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { assertSafeUrl } from '@/server/net/safe-fetch'

describe('assertSafeUrl', () => {
  it('accepts public http/https', () => {
    expect(assertSafeUrl('https://feeds.bbci.co.uk/news/business/rss.xml').hostname).toBe('feeds.bbci.co.uk')
    expect(() => assertSafeUrl('http://example.com/feed')).not.toThrow()
  })
  it('rejects non-http(s) schemes', () => {
    for (const u of ['file:///etc/passwd', 'ftp://host/x', 'gopher://host', 'data:text/xml,<rss/>']) {
      expect(() => assertSafeUrl(u)).toThrow()
    }
  })
  it('rejects private / loopback / link-local / metadata hosts', () => {
    for (const u of [
      'http://localhost/f', 'http://127.0.0.1/f', 'http://0.0.0.0/f',
      'http://169.254.169.254/latest/meta-data', 'http://10.0.0.5/f',
      'http://192.168.1.1/f', 'http://172.16.0.1/f', 'http://[::1]/f',
      'http://service.local/f',
    ]) {
      expect(() => assertSafeUrl(u)).toThrow()
    }
  })
  it('rejects unparseable input', () => {
    expect(() => assertSafeUrl('not a url')).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/server/net/safe-fetch.ts`:

```typescript
const PRIVATE_V4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
]

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost')) return true
  if (h === '0.0.0.0' || h === '::1' || h === '::' ) return true
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true // IPv6 ULA / link-local
  if (PRIVATE_V4.some((re) => re.test(h))) return true
  return false
}

/** Throws unless `raw` is an http(s) URL to a non-private, non-loopback host.
 *  Baseline SSRF guard (literal + hostname blocking); DNS-rebind resolution is
 *  a documented follow-up. */
export function assertSafeUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Unsafe URL (unparseable): ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsafe URL scheme: ${url.protocol}`)
  }
  if (isBlockedHost(url.hostname)) {
    throw new Error(`Unsafe URL host (private/loopback/link-local): ${url.hostname}`)
  }
  return url
}

const UA = 'ArchlightRadar/0.1 (public intelligence radar)'

/** SSRF-guarded text fetch with a hard byte cap and one bounded, re-guarded
 *  redirect. Streams the body and aborts past `maxBytes` (content-length can lie). */
export async function safeFetchText(
  raw: string,
  opts: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string> {
  const maxBytes = opts.maxBytes ?? Number(process.env.RSS_MAX_BYTES ?? 5_000_000)
  const timeoutMs = opts.timeoutMs ?? 10_000
  const doFetch = (u: URL) =>
    fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': UA } })

  let url = assertSafeUrl(raw)
  let res = await doFetch(url)
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location')
    if (!loc) throw new Error('Redirect without Location header')
    url = assertSafeUrl(new URL(loc, url).toString())
    res = await doFetch(url)
    if (res.status >= 300 && res.status < 400) throw new Error('Too many redirects')
  }
  if (!res.ok) throw new Error(`fetch failed with HTTP ${res.status}`)

  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared && declared > maxBytes) throw new Error(`Response too large: ${declared} > ${maxBytes}`)
  if (!res.body) return (await res.text()).slice(0, maxBytes)

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error(`Response exceeded ${maxBytes} bytes`)
      }
      chunks.push(value)
    }
  }
  const merged = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    merged.set(c, off)
    off += c.byteLength
  }
  return new TextDecoder().decode(merged)
}
```

- [ ] **Step 4: Wire into `rss.ts`** — replace the body of `collectRss` (the `fetch`/`res.text()` block) with:

```typescript
import { safeFetchText } from '@/server/net/safe-fetch'
// ...
export async function collectRss(source: Source): Promise<RawItem[]> {
  if (!source.url) throw new Error(`RSS source ${source.name} has no url`)
  const xml = await safeFetchText(source.url, { timeoutMs: 10_000 })
  return parseRssXml(xml)
}
```

- [ ] **Step 5: Run test + typecheck + full suite** → green. If any RSS collector test stubbed the old `fetch` shape, update it to stub `global.fetch` returning `{ ok: true, status: 200, headers: new Headers(), body: <ReadableStream> }` or adjust to the new `safeFetchText` path; the pure `parseRssXml` tests are unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/server/net/safe-fetch.ts src/server/pipeline/collectors/rss.ts tests/net/safe-fetch.test.ts
git commit -m "feat(security): SSRF-guarded RSS fetch (scheme/private-IP/size cap)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Security response headers

**Files:**
- Create: `src/lib/security-headers.ts`, `tests/lib/security-headers.test.ts`
- Modify: `next.config.ts`

**Interfaces — Produces:** `securityHeaders(isProduction: boolean): { key: string; value: string }[]`

- [ ] **Step 1: Write the failing test** — `tests/lib/security-headers.test.ts`:

```typescript
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
    expect(csp).not.toContain('default-src') // must not break Next inline runtime
  })
  it('adds HSTS only in production', () => {
    expect(securityHeaders(false).some((h) => h.key === 'Strict-Transport-Security')).toBe(false)
    expect(securityHeaders(true).some((h) => h.key === 'Strict-Transport-Security')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/security-headers.ts`:

```typescript
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
```

- [ ] **Step 4: Wire into `next.config.ts`** — add an `async headers()`:

```typescript
import type { NextConfig } from 'next'
import { securityHeaders } from './src/lib/security-headers'

const nextConfig: NextConfig = {
  serverExternalPackages: ['@anthropic-ai/sdk'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') }]
  },
}

export default nextConfig
```

(Keep the existing `serverExternalPackages` and its comment.)

- [ ] **Step 5: Run test + typecheck + full suite** → green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/security-headers.ts next.config.ts tests/lib/security-headers.test.ts
git commit -m "feat(security): baseline security response headers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Per-IP rate limiting in middleware

**Files:**
- Create: `src/lib/rate-limit.ts`, `tests/lib/rate-limit.test.ts`
- Modify: `src/middleware.ts`

**Interfaces — Produces:**
- `rateLimit(key: string, limit: number, windowMs: number, now: number): { ok: boolean; retryAfterSec: number }`
- `__resetRateLimit(): void` (test helper)

- [ ] **Step 1: Write the failing test** — `tests/lib/rate-limit.test.ts`:

```typescript
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
    expect(rateLimit('b', 1, 60_000, 1000).ok).toBe(true)   // separate key
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/rate-limit.ts`:

```typescript
type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/** Fixed-window per-key limiter. Module-scope state — single-node/local-first
 *  only (cross-instance sharing is a documented limitation). `now` is injected
 *  for testability. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number,
): { ok: boolean; retryAfterSec: number } {
  const b = buckets.get(key)
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSec: 0 }
  }
  if (b.count < limit) {
    b.count += 1
    return { ok: true, retryAfterSec: 0 }
  }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) }
}

/** Test-only: clear all buckets. */
export function __resetRateLimit(): void {
  buckets.clear()
}
```

- [ ] **Step 4: Wire into `middleware.ts`** — after the auth block resolves to `allow`, before `return NextResponse.next()`, add:

```typescript
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
```

Add `import { rateLimit } from '@/lib/rate-limit'` at the top.

- [ ] **Step 5: Run test + typecheck + full suite** → green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/rate-limit.ts src/middleware.ts tests/lib/rate-limit.test.ts
git commit -m "feat(security): per-IP rate limiting (tighter on paid LLM routes)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Docs + audit remediation status + final verify

**Files:**
- Create: `docs/security-hardening.md`
- Modify: `docs/security-audit-2026-07-06.md` (mark findings addressed), `docs/ai-activation.md` (note auth)

- [ ] **Step 1: Write `docs/security-hardening.md`** — cover: what each control does; the env-var table (from the spec); the fail-closed-in-prod rule; how to set `ARCHLIGHT_AUTH_TOKEN`; and the documented follow-ups (DNS-rebind SSRF, nonce CSP, shared rate-limit store, multi-user accounts).

- [ ] **Step 2: Update `docs/security-audit-2026-07-06.md`** — append a "Remediation status (2026-07-06)" note marking H1/H2/M1/M2/M3/L2/L3 as **addressed** in the hardening pass (with the controls), leaving the documented non-goals open.

- [ ] **Step 3: Update `docs/ai-activation.md`** — add a one-line note that when exposed, `ARCHLIGHT_AUTH_TOKEN` must be set (Basic Auth) and the daily LLM cap applies.

- [ ] **Step 4: Final verify** — `npm run typecheck` clean; `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npm test` all green; `git status` shows only intended files (never ` 2.` sync copies).

- [ ] **Step 5: Commit**

```bash
git add docs/security-hardening.md docs/security-audit-2026-07-06.md docs/ai-activation.md
git commit -m "docs(security): hardening runbook + audit remediation status

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6:** Use superpowers:finishing-a-development-branch → merge to main + push origin.

---

## Self-review

- **Spec coverage:** Auth (T1), spend cap (T2), enrich cooldown (T3), SSRF (T4), headers (T5), rate limit (T6), docs+config (T1/T7). All spec sections covered.
- **Type consistency:** `AuthDecision`, `isWithinDailyBudget(now, cap?)`, `SKIPPED_BUDGET`, `EnrichmentResult.status` (+COOLDOWN), `assertSafeUrl`/`safeFetchText`, `securityHeaders(isProd)`, `rateLimit(key,limit,windowMs,now)` — consistent across tasks and matches the spec.
- **Correctness catch:** CSP is the safe subset (no `default-src`) so it can't break Next's inline runtime (test asserts this).
- **Fail-closed:** enforced in `authDecision` (prod + no token → `misconfigured` → 503) and tested.
