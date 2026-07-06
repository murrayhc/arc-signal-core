# Security Hardening (P0 + P1) — Design

**Date:** 2026-07-06
**Status:** Approved to build (Full P0 + P1; auth = HTTP Basic Auth)
**Source:** `docs/security-audit-2026-07-06.md` (findings H1, H2, M1, M2, M3, L2, L3)

## Goal

Make Archlight safe to expose: add authentication over every page and API
route, cap AI spend, harden the RSS fetcher against SSRF, add security headers,
and rate-limit. Deterministic + fail-closed in production; local dev and the
existing 437 tests unaffected.

## Current state (from the audit)

Zero auth anywhere (no `middleware.ts`); every route public. Input validation,
injection, XSS, secrets, CORS are already clean (see audit "Strengths"). Live
LLM cost vectors (unauth): `POST /events/[id]/enrich`, `POST /opportunities/
[id]/playbook`, `GET /market/search`. Single external fetch: `rss.ts:58`.
`next.config.ts` sets no headers. App is LOCAL-ONLY today (nothing exploited).

## Owner decisions

- **Auth = HTTP Basic Auth** via middleware (browser-native prompt; no login
  page/cookie; transparent to the app's own same-origin fetches).
- **Full P0 + P1** in this pass.

## Architecture

Two new cross-cutting layers (`middleware.ts` for auth+rate-limit at the edge;
a small server-side fetch guard for SSRF) plus a budget check inside the
existing LLM layer and a headers block in `next.config.ts`. Each guard is a
**pure, unit-tested function**; the middleware/config are thin wrappers.

### P0 — Authentication (`middleware.ts` + Basic Auth)

- `src/lib/auth.ts` (new, edge-safe): `checkBasicAuth(header: string | null, token: string): boolean` — parses `Authorization: Basic <base64>`, `atob`-decodes, **constant-time**-compares the password segment to `token` (username ignored). And `authDecision(req, env): 'allow' | 'unauthorized' | 'misconfigured'`.
- `src/middleware.ts` (new): runs on all routes except static assets (`matcher` excludes `_next/static`, `_next/image`, `favicon.ico`). Logic:
  - `ARCHLIGHT_AUTH_TOKEN` **set** → require valid Basic Auth; miss → `401` + `WWW-Authenticate: Basic realm="Archlight"` (triggers the browser prompt; the same header on `/api/*` is harmless).
  - `ARCHLIGHT_AUTH_TOKEN` **unset** and `NODE_ENV === 'production'` → **fail closed**: `503` "Auth not configured" for everything (locked out, never wide open).
  - unset and non-production → allow (dev/test convenience).
- `.env.example` gains `ARCHLIGHT_AUTH_TOKEN=` (+ `ANTHROPIC_API_KEY=`, audit L2).
- **Existing tests unaffected:** route tests call handlers directly (vitest), bypassing middleware; middleware never runs in the suite. New tests exercise `checkBasicAuth`/`authDecision` directly.

### P1a — LLM spend cap + enrich cooldown (audit H2, L3)

- `src/server/llm/budget.ts` (new): `isWithinDailyBudget(now: Date): Promise<boolean>` — counts `LLMRun` rows with a real call today (`status` ∈ SUCCEEDED/FAILED/REJECTED_VALIDATION, `createdAt >= startOfDayUTC(now)`); returns false once `>= LLM_DAILY_CALL_CAP` (default **100**).
- `runLLMTask` consults it **after** resolving a live provider, **before** `provider.generate`: over budget → log a new terminal status **`SKIPPED_BUDGET`** (added to `LLMRunStatus`), return no text (same fail-open shape as dormant). Dormant/no-provider path is unchanged (never counts against budget).
- Enrich cooldown: `enrichEventConsequence` skips an event whose `EventContextSynthesis.enrichedByLLMRunId` is set and `updatedAt` is within `ENRICH_COOLDOWN_MINUTES` (default **60**), returning `{ status: 'COOLDOWN', … }` without spending. (Extends `EnrichmentResult.status`.)

### P1b — RSS fetch SSRF guard (audit M1)

- `src/server/net/safe-fetch.ts` (new, Node runtime):
  - `assertSafeUrl(url: string): URL` — throws unless protocol ∈ {http, https}; rejects a hostname that is an IP literal in a private/loopback/link-local/ULA range or `localhost`/`*.local`/`0.0.0.0`/metadata `169.254.169.254`.
  - `safeFetchText(url, { maxBytes, timeoutMs }): Promise<string>` — `assertSafeUrl`; `fetch(url, { redirect: 'manual', signal: timeout })`; on a 3xx, `assertSafeUrl(Location)` then follow once (bounded, re-guarded); reject a `content-length` over `maxBytes`; **stream-read** and abort past `maxBytes` (content-length can lie). Default `RSS_MAX_BYTES` = **5_000_000**.
- `collectRss` (`rss.ts`) uses `safeFetchText(source.url, …)` instead of the raw `fetch` + `res.text()`; keeps the 10 s timeout.
- Async DNS-resolve-and-check of the host IP is **out of scope** (documented) — literal + hostname blocking is the baseline; full DNS-rebind defense is a noted follow-up.

### P1c — Security headers (audit M2)

- `src/lib/security-headers.ts` (new): `securityHeaders(): { key: string; value: string }[]` — `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'` (anti-clickjacking/base-hijack without a restrictive `script-src` that would break Next's inline runtime), and `Strict-Transport-Security` **only when `NODE_ENV === 'production'`**.
- `next.config.ts` `async headers()` applies them to all routes via the shared function.
- A strict nonce-based `script-src` CSP is a documented follow-up (needs Next nonce middleware).

### P1d — Rate limiting (audit M3)

- `src/lib/rate-limit.ts` (new, edge-safe): `rateLimit(key, limit, windowMs, now): { ok: boolean; retryAfterSec: number }` — fixed-window counter in a module-scope `Map` (single-node local-first; cross-instance sharing is a documented limitation). `now` injected for testability.
- `middleware.ts` (after auth passes) derives the caller key from `x-forwarded-for` (first hop) / a fallback, applies a **general** limit (`RATE_LIMIT_PER_MIN`, default **120**) and a **tighter** limit on the paid routes `POST /api/events/*/enrich` and `POST /api/opportunities/*/playbook` (default **10**/min); over limit → `429` + `Retry-After`.

## Config (env, all with safe defaults)

| Var | Default | Purpose |
|---|---|---|
| `ARCHLIGHT_AUTH_TOKEN` | — (unset) | Basic Auth password. **Required in production** (else fail-closed). |
| `LLM_DAILY_CALL_CAP` | `100` | Max real LLM calls/day before skipping. |
| `ENRICH_COOLDOWN_MINUTES` | `60` | Per-event enrich re-spend cooldown. |
| `RSS_MAX_BYTES` | `5000000` | Max RSS response size. |
| `RATE_LIMIT_PER_MIN` | `120` | General per-IP request cap. |
| `RATE_LIMIT_PAID_PER_MIN` | `10` | Per-IP cap on paid LLM routes. |

## Testing (no live network; existing 437 unaffected)

- `checkBasicAuth`/`authDecision`: valid/invalid/missing/malformed creds; token-set-enforced; prod-unset → misconfigured; dev-unset → allow.
- `isWithinDailyBudget`: under cap allows, at/over cap blocks (seeded `LLMRun` rows); `runLLMTask` over budget → `SKIPPED_BUDGET`, no provider call (fake provider asserts `generate` not invoked).
- Enrich cooldown: second enrich within window → `COOLDOWN`, no spend.
- `assertSafeUrl`: rejects `file:`, `http://localhost`, `169.254.169.254`, `10.x`, `192.168.x`, `127.0.0.1`, `::1`; accepts `https://feeds.bbci.co.uk`. `safeFetchText`: size cap aborts oversized bodies (mocked stream).
- `securityHeaders`: includes required keys; HSTS only in prod.
- `rateLimit`: allows `limit` then `429`s; window reset via injected `now`.

## Non-goals / documented follow-ups

DNS-rebind (resolve-and-check) SSRF defense; nonce-based strict `script-src`
CSP; distributed/shared rate-limit store; multi-user accounts/roles (single
shared operator secret only). All noted in the hardening doc.
