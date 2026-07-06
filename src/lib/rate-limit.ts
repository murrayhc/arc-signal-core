type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/** Fixed-window per-key limiter. Module-scope state — single-node/local-first
 *  only (cross-instance sharing is a documented follow-up). `now` is injected
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
