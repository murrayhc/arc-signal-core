# Security Hardening

Controls that make Archlight safe to expose. Implemented 2026-07-06 (see
`docs/security-audit-2026-07-06.md` for the findings these close).

## Controls

| Control | What it does | Where |
|---|---|---|
| **Basic-Auth gate** | Every page + `/api/*` requires the operator password. Browser prompts natively; the app's own fetches carry it transparently. **Fail-closed in production:** unset token in prod → 503 for everything (locked out, never wide open). Unset in dev/test → open. | `src/middleware.ts`, `src/lib/auth.ts` |
| **Daily LLM spend cap** | Over `LLM_DAILY_CALL_CAP` real calls/day (UTC), `runLLMTask` logs `SKIPPED_BUDGET` and makes no call — behaves dormant. | `src/server/llm/budget.ts`, `run.ts` |
| **Enrich cooldown** | Re-enriching an event within `ENRICH_COOLDOWN_MINUTES` returns `COOLDOWN` with no spend. | `src/server/consequence/enrich.ts` |
| **RSS SSRF guard** | Feed fetch: http(s) only; blocks private/loopback/link-local/metadata hosts; caps response size (stream-enforced); bounds + re-validates one redirect. | `src/server/net/safe-fetch.ts` |
| **Security headers** | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, a safe-subset CSP, HSTS (prod). | `src/lib/security-headers.ts`, `next.config.ts` |
| **Rate limiting** | Per-IP fixed-window in middleware; tighter on the paid LLM routes (`enrich`, `playbook`). `429 + Retry-After` over the limit. | `src/lib/rate-limit.ts`, `middleware.ts` |

## Configuration (env — safe defaults)

| Var | Default | Purpose |
|---|---|---|
| `ARCHLIGHT_AUTH_TOKEN` | — (unset) | Basic Auth password. **Required in production.** Any username works. |
| `LLM_DAILY_CALL_CAP` | `100` | Max real LLM calls/day (UTC). |
| `ENRICH_COOLDOWN_MINUTES` | `60` | Per-event enrich re-spend cooldown. |
| `RSS_MAX_BYTES` | `5000000` | Max RSS response size (5 MB). |
| `RATE_LIMIT_PER_MIN` | `120` | General per-IP request cap. |
| `RATE_LIMIT_PAID_PER_MIN` | `10` | Per-IP cap on paid LLM routes. |

## Before exposing Archlight

1. Set `ARCHLIGHT_AUTH_TOKEN` in `.env` (git-ignored) to a strong secret.
2. Serve over **HTTPS** (HSTS + Secure semantics assume TLS).
3. Confirm the browser prompts for the password and the app works once entered.
4. If AI is active, confirm the daily cap value suits your budget.

**The gate is enforced in production only when `ARCHLIGHT_AUTH_TOKEN` is set** —
if you forget it in production the app fails closed (503), so it can never be
exposed unprotected by accident.

## Documented follow-ups (not in this pass)

- **DNS-rebind SSRF:** the guard blocks IP-literal/hostname private targets but
  does not resolve a hostname to its IP and re-check (a hostname resolving to a
  private IP would pass). Add async resolve-and-check if feeds become
  user-supplied.
- **Strict CSP:** a nonce-based `script-src`/`default-src` policy (needs Next
  nonce middleware) — the current CSP is the safe subset that won't break
  Next's inline hydration.
- **Shared rate-limit store:** the limiter is in-memory per node; a shared store
  (Redis) is needed only if Archlight is ever scaled to multiple instances.
- **Multi-user accounts/roles:** this is a single shared-operator secret, not
  per-user auth.
