# Archlight Security Audit — 2026-07-06

**Scope:** Full codebase security scan of Archlight (Next.js 15 / TypeScript / Prisma+SQLite), HEAD `a30566b`.
**Method:** Read-only static review — attack-surface enumeration (all ~35 API routes), auth/authz, external fetch (SSRF), input validation, injection, secrets, XSS, dependency advisories (`npm audit`), security headers. No code changed.
**Verdict:** **Strong input-hygiene fundamentals, but UNAUTHENTICATED end-to-end.** The single production blocker is that every route is public, including expensive and (once AI is activated) paid ones. **Not currently exploitable — the app is local-only and unexposed** — but every finding below must be closed before it is exposed to any untrusted network.

---

## Executive summary (plain English)

Archlight is carefully built where it counts for a data app: every input is validated, there is no SQL injection or cross-site-scripting exposure, no secrets are committed, and it never leaks internal errors. Those are real strengths.

The problem is the front door: **there is no lock on it at all.** Nothing checks who is calling any route. On your own laptop that is fine. The moment the app is put on the internet, anyone who finds it can change or delete your data, kick off heavy scans — and, once you switch the AI on, **make it spend your Anthropic credits on an unlimited loop.** That last one is new (it came in with the AI enrichment I just built) and is the most financially dangerous.

So this scan produces one clear rule and a short fix list:

> **Do not expose Archlight to the internet — especially with the AI key set — until authentication is added.**

Everything else (SSRF hardening on the RSS fetcher, security headers, rate limiting, a dependency tidy-up) is standard production hardening layered on top.

---

## Strengths (already solid — keep these)

| Area | Evidence |
|---|---|
| **Input validation everywhere** | Every route that accepts a body or query validates it with Zod `safeParse` and returns 400 on failure (`interrogate`, `market/search`, `events/[id]` PATCH, all `lenses`/`watch`/`portfolio`/`opportunities` mutations, `events/[id]/report`). Bodyless POSTs (`scans/run`, `enrich`, `investigate`, `graph/rebuild`) have nothing to validate. |
| **No SQL injection** | Zero raw SQL — no `$queryRaw`/`$executeRaw`/`*Unsafe` anywhere; all DB access is parameterized Prisma. |
| **No XSS sink** | No `dangerouslySetInnerHTML`; React auto-escapes; ingested RSS is `stripHtml`-cleaned before storage (`rss.ts`). |
| **No committed secrets** | `.env` is git-ignored and holds only `DATABASE_URL`; `.env.example` is a safe template; no hardcoded keys/tokens in source. |
| **No error/stack leakage** | Routes return structured `{ error: "…" }` messages, never raw stack traces. |
| **No permissive CORS** | No `Access-Control-Allow-*` headers set; Next.js same-origin default stands. |
| **Next.js is current** | `next@15.5.20` — past the `CVE-2025-29927` middleware auth-bypass (fixed 15.2.3). |
| **Scan concurrency guard** | `scans/run` refuses a second concurrent scan (409) with a 10-min stale-lock recovery. |
| **Fetch timeout** | RSS fetch uses `AbortSignal.timeout(10_000)`. |
| **AI/market dormant + guarded** | LLM + market layers off by default; every generated string passes the advice-language guard; scans never call the LLM (test-locked). |

---

## Findings

Severity is rated for the **production (exposed) scenario**, which is the goal of this pass. **Current real-world risk is LOW for all of them because the app is local-only and unexposed.**

| ID | Sev | Finding | Evidence |
|---|---|---|---|
| **H1** | HIGH | No authentication on any route | No `src/middleware.ts`; zero auth/session/token checks anywhere in `src/` |
| **H2** | HIGH | Unauthenticated, unbounded AI **spend** (once activated) | `POST /events/[id]/enrich`, `POST /opportunities/[id]/playbook`, `GET /market/search` all resolve a live provider with no auth/rate-limit/cooldown |
| **M1** | MED | RSS fetch SSRF hardening gaps | `src/server/pipeline/collectors/rss.ts:58` |
| **M2** | MED | No security response headers | `next.config.ts` sets no `headers()` |
| **M3** | MED | No rate limiting / abuse throttling | No middleware; only `scans/run` has any concurrency guard |
| **L1** | LOW | 3 moderate dependency advisories (none exploitable here) | `npm audit` |
| **L2** | LOW | `.env.example` omits `ANTHROPIC_API_KEY` placeholder | `.env.example` |
| **L3** | LOW | `enrich` re-spends on every call (no idempotency/cooldown) | `src/server/consequence/enrich.ts` |

### H1 — No authentication on any route (HIGH)
There is no `middleware.ts` and no auth check in any handler. All ~35 routes are public. When exposed, anyone can:
- **Mutate/delete data:** `PATCH /events/[id]` (status), `POST|PATCH|DELETE /lenses`, `/watch`, `/portfolio`, `PATCH /opportunities/[id]`.
- **Trigger heavy work:** `POST /scans/run`, `POST /graph/rebuild`, `POST /events/[id]/investigate`, `POST /events/[id]/report`.

This is *the* production blocker. **Fix:** add an auth gate in `middleware.ts` covering `/api/*` (and app pages). For a single-operator tool a shared bearer token/secret checked in middleware is sufficient; a session/OAuth layer is the fuller option. Keep read-only GETs vs mutations in mind if you later want public read.

### H2 — Unauthenticated, unbounded AI spend once activated (HIGH)
Three routes resolve a **live, paid** provider with no auth, rate limit, or cooldown:
- `POST /events/[id]/enrich` → `enrichEventConsequence` → `getActiveProvider()` → **Anthropic** (Opus per named company + Sonnet for the narrative). *Introduced in the AI-integration pass — flagged as my own addition.*
- `POST /opportunities/[id]/playbook` → `generatePlaybook` (`playbook/service.ts:210`) → **Anthropic**.
- `GET /market/search` → `searchMarket` → **market-data provider** (spend if a real adapter is ever configured).

Once you set `ANTHROPIC_API_KEY` and enable configs, a loop over `POST …/enrich` is **uncapped Anthropic billing**. **Fix:** H1 (auth) is the primary control; additionally add a **per-day/per-scan LLM call+token budget cap** in the LLM layer and a **per-event enrich cooldown/idempotency** (L3). Until then: never expose the app with the key set.

### M1 — RSS fetch SSRF hardening gaps (MEDIUM, latent)
`collectRss` (`rss.ts:58`) does `fetch(source.url, …)` with a 10s timeout but **no scheme allowlist**, **no private/loopback/link-local IP block** (e.g. `169.254.169.254` metadata, `localhost`, `10.x`), **no response size cap** (`res.text()` reads an unbounded body → memory DoS), and it **follows redirects** (a public URL can 30x-redirect to an internal address). Real risk is limited today because sources are **seeded only** — there is no API to add a source URL — so an external caller can't point the fetcher anywhere. It is still the documented production gap and worth defense-in-depth, especially if source management ever becomes user-facing. **Fix:** allow only `http`/`https`; resolve + reject private/loopback/link-local IPs (re-check after each redirect, or set `redirect: 'manual'`); cap the body (stream + byte limit, or reject on oversized `content-length`).

### M2 — No security response headers (MEDIUM)
`next.config.ts` sets no headers. When exposed: no `Content-Security-Policy`, `X-Frame-Options` (clickjacking), `X-Content-Type-Options` (MIME-sniffing), `Referrer-Policy`, `Strict-Transport-Security`, or `Permissions-Policy`. **Fix:** add a `headers()` block returning a sensible baseline for all routes.

### M3 — No rate limiting (MEDIUM)
No middleware means no throttling on any route. The expensive/paid routes (`enrich`, `playbook`, `investigate`, `report`, `rebuild`) have no per-caller limits (`scans/run`'s concurrency guard is the lone exception). **Fix:** add rate limiting in middleware (in-memory token bucket is fine for a single-node local-first app; a shared store if you ever scale out).

### L1 — Dependency advisories: 3 moderate, none exploitable here (LOW)
`npm audit` reports 3 moderate, all effectively inert in this app's usage:
- `fast-xml-parser <5.7.0` — injection in **XMLBuilder**; Archlight only uses **XMLParser** (`rss.ts`), never XMLBuilder → not reachable.
- `postcss <8.5.10` — XSS via CSS stringify; **build-time** tooling, app processes no attacker-controlled CSS → not reachable.
- `next` range flagged **transitively** for the postcss fix, not a direct runtime CVE (installed `15.5.20` is current).

> ⚠️ **Do NOT run `npm audit fix --force`.** It resolves the tree by installing **`next@9.3.3`** — a catastrophic downgrade from 15.5.20. **Fix (optional):** targeted bump of the direct dep `fast-xml-parser` to `≥5.7.0` (verify the `XMLParser` API is unchanged 4→5 and tests pass), and let Next's own updates carry postcss. Otherwise accept-with-note — nothing here is exploitable.

### L2 — `.env.example` omits `ANTHROPIC_API_KEY` (LOW / hygiene)
Activation adds the key to `.env`; documenting it (empty) in `.env.example` clarifies the expected variable and reduces the chance of it landing somewhere committable. **Fix:** add `ANTHROPIC_API_KEY=` to `.env.example`.

### L3 — `enrich` re-spends on every call (LOW)
`enrichEventConsequence` re-runs the LLM every time, overwriting `llm*` columns — repeated clicks re-bill. **Fix:** skip when already enriched within a cooldown window (also blunts H2's cost loop).

---

## Remediation roadmap (prioritized)

**P0 — before ANY exposure (the production blocker):**
- **H1** Add `middleware.ts` auth gate over `/api/*` (+ pages). Shared-secret bearer for single-operator; session/OAuth for multi-user.

**P1 — production hardening (do with P0, before real traffic):**
- **H2 + L3** LLM budget cap (per-day/scan call+token ceiling) + per-event enrich cooldown/idempotency.
- **M1** RSS fetch: scheme allowlist + private-IP block (post-redirect) + response size cap.
- **M2** Security headers via `next.config.ts` `headers()`.
- **M3** Rate limiting in middleware, tightest on the paid routes.

**P2 — hygiene (low urgency):**
- **L1** Targeted `fast-xml-parser` bump (or accept-with-note); never `audit fix --force`.
- **L2** Add `ANTHROPIC_API_KEY=` to `.env.example`.

---

## What was NOT found (checked, clean)

SQL injection · XSS sinks · committed secrets/keys · raw-error/stack leakage · permissive CORS · missing input validation · a known-exploitable Next.js runtime CVE. Injection and data-hygiene fundamentals are solid; the work is authentication and exposure hardening.

---

## Remediation status (2026-07-06)

Addressed in the hardening pass (`docs/security-hardening.md`; spec/plan under `docs/superpowers/…/2026-07-06-security-hardening…`):

| ID | Status | Control |
|---|---|---|
| **H1** | ✅ Addressed | Basic-Auth middleware over all routes; fail-closed in production. |
| **H2** | ✅ Addressed | Auth (H1) + daily LLM call-cap (`SKIPPED_BUDGET`) + enrich cooldown. |
| **M1** | ✅ Addressed (baseline) | `safeFetchText` — scheme allowlist, private-IP block, size cap, bounded re-validated redirect. (DNS-rebind resolve-and-check remains a documented follow-up.) |
| **M2** | ✅ Addressed | Security headers via `next.config.ts`. (Strict nonce CSP remains a follow-up.) |
| **M3** | ✅ Addressed | Per-IP rate limiting in middleware, tighter on paid routes. (Shared store is a follow-up for multi-node.) |
| **L1** | ⚠️ Accepted-with-note | Advisories not exploitable in this app; `npm audit fix --force` still forbidden (Next downgrade). |
| **L2** | ✅ Addressed | `ANTHROPIC_API_KEY` + `ARCHLIGHT_AUTH_TOKEN` documented in `.env.example`. |
| **L3** | ✅ Addressed | Enrich cooldown. |

Open follow-ups (all documented in `docs/security-hardening.md`): DNS-rebind SSRF resolution, strict nonce-based CSP, shared rate-limit store, multi-user accounts/roles.
