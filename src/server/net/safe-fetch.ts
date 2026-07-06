const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
]

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost')) return true
  if (h === '0.0.0.0' || h === '::1' || h === '::') return true
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true // IPv6 ULA / link-local
  if (PRIVATE_V4.some((re) => re.test(h))) return true
  return false
}

/** Throws unless `raw` is an http(s) URL to a non-private, non-loopback host.
 *  Baseline SSRF guard (scheme + literal/hostname blocking); async DNS-rebind
 *  resolution is a documented follow-up. */
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
