import type { Source } from '@prisma/client'
import { safeFetchText } from '@/server/net/safe-fetch'
import type { RawItem } from '../types'

/**
 * GDELT DOC 2.0 collector — a keyless, lawful global news index
 * (api.gdeltproject.org/api/v2/doc/doc). The source's `url` IS the full query
 * URL (mode=artlist&format=json), so each GDELT source is one standing query
 * the radar re-runs every scan — e.g. insolvency signals, commodity squeeze
 * mentions, procurement language. Articles arrive as title+url+domain+date
 * (headline-level, no body): thin but honest — the investigation loop and
 * richer collectors deepen from here.
 */

type GdeltArticle = {
  url?: unknown
  title?: unknown
  seendate?: unknown
  domain?: unknown
  sourcecountry?: unknown
  language?: unknown
}

/** GDELT seendate format: YYYYMMDDTHHMMSSZ. */
function parseSeendate(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/.exec(value)
  if (!m) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]))
  return Number.isNaN(d.getTime()) ? null : d
}

export type GdeltParsedArticle = RawItem & { domain: string }

/** Pure GDELT artlist JSON → articles (with source domain). Defensive:
 *  unknown shapes yield [], malformed articles are skipped item-by-item,
 *  never a crash. */
export function parseGdeltArticles(json: string): GdeltParsedArticle[] {
  let doc: unknown
  try {
    doc = JSON.parse(json)
  } catch {
    return []
  }
  const articles = (doc as { articles?: unknown })?.articles
  if (!Array.isArray(articles)) return []
  const items: GdeltParsedArticle[] = []
  for (const raw of articles as GdeltArticle[]) {
    const url = typeof raw.url === 'string' ? raw.url.trim() : ''
    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    if (!url || !title) continue
    const domain = typeof raw.domain === 'string' ? raw.domain : ''
    const country = typeof raw.sourcecountry === 'string' ? raw.sourcecountry : ''
    const meta = [domain && `via ${domain}`, country && `(${country})`].filter(Boolean).join(' ')
    items.push({
      url,
      title,
      content: meta ? `${title}\n\n${meta}` : title,
      publishedAt: typeof raw.seendate === 'string' ? parseSeendate(raw.seendate) : null,
      domain,
    })
  }
  return items
}

/** RawItem view of the same parse (collector path). */
export function parseGdeltJson(json: string): RawItem[] {
  return parseGdeltArticles(json).map(({ domain: _domain, ...item }) => item)
}

export async function collectGdelt(source: Source): Promise<RawItem[]> {
  if (!source.url) throw new Error(`GDELT source ${source.name} has no query url`)
  const json = await safeFetchText(source.url, { timeoutMs: 15_000 })
  return parseGdeltJson(json)
}
