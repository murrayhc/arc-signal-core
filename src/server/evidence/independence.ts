/**
 * Publisher independence groups.
 *
 * "Five sources" is not "five independent sources" when three of them are the
 * same publisher on different feeds. The independence group is a deterministic
 * publisher key derived from a source's registrable domain (or its name when
 * there is no URL), and every independence count in the evidence engine
 * collapses sources within one group to a single vote.
 *
 * Deliberately conservative: it can only ever MERGE sources that share an
 * owner-shaped domain — it never splits, so the worst failure mode is
 * counting two same-owner outlets on different domains as independent (the
 * status quo before groups existed).
 */

/** Common multi-part public suffixes where the registrable domain is one label
 *  deeper (news sources are dominated by co.uk/gov.uk-style hosts). Not a full
 *  public-suffix list — unknown TLD shapes fall back to last-two-labels. */
const SECOND_LEVEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'net.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'nhs.uk',
  'com.au', 'net.au', 'org.au', 'gov.au', 'edu.au',
  'co.nz', 'org.nz', 'govt.nz',
  'co.jp', 'or.jp', 'ne.jp', 'go.jp',
  'com.br', 'org.br', 'gov.br',
  'co.in', 'org.in', 'gov.in', 'net.in',
  'co.za', 'org.za', 'gov.za',
  'com.cn', 'org.cn', 'gov.cn',
  'com.sg', 'gov.sg', 'com.hk', 'gov.hk',
  'co.kr', 'go.kr', 'or.kr',
  'com.mx', 'gob.mx', 'com.ar', 'gob.ar',
  'co.il', 'gov.il', 'org.il',
])

/** Registrable domain of a URL's hostname: "feeds.bbci.co.uk" → "bbci.co.uk",
 *  "www.reuters.com" → "reuters.com". Null when the URL has no usable host. */
export function registrableDomain(url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  if (!host || /^[\d.]+$/.test(host)) return host || null // bare IPs group as themselves
  const labels = host.split('.').filter(Boolean)
  if (labels.length <= 2) return labels.join('.')
  const lastTwo = labels.slice(-2).join('.')
  if (SECOND_LEVEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.')
  }
  return lastTwo
}

/** The independence group for a source: registrable domain when it has a real
 *  URL, otherwise a normalised form of its name (fixtures, search-ingested
 *  sources, URL-less registries each group as themselves). */
export function deriveIndependenceGroup(url: string | null | undefined, name: string): string {
  if (url && /^https?:\/\//i.test(url)) {
    const domain = registrableDomain(url)
    if (domain) return domain
  }
  return `name:${name.toLowerCase().replace(/\s+/g, '-')}`
}
