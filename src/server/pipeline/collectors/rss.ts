import { XMLParser } from 'fast-xml-parser'
import type { Source } from '@prisma/client'
import { safeFetchText } from '@/server/net/safe-fetch'
import type { RawItem } from '../types'

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text'])
  }
  return ''
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pure RSS-XML → RawItem[] mapping. Returns [] for anything that is not an RSS channel. */
export function parseRssXml(xml: string): RawItem[] {
  let doc: unknown
  try {
    doc = new XMLParser({ ignoreAttributes: false }).parse(xml)
  } catch {
    return []
  }
  const channel = (doc as { rss?: { channel?: { item?: unknown } } })?.rss?.channel
  if (!channel) return []
  const rawItems = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : []
  const items: RawItem[] = []
  for (const raw of rawItems as Record<string, unknown>[]) {
    const title = stripHtml(text(raw.title))
    const link = text(raw.link).trim()
    const description = stripHtml(text(raw.description))
    if (!title || !link) continue
    const pubDate = text(raw.pubDate)
    const publishedAt = pubDate ? new Date(pubDate) : null
    items.push({
      url: link,
      title,
      content: `${title}\n\n${description}`,
      publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
    })
  }
  return items
}

export async function collectRss(source: Source): Promise<RawItem[]> {
  if (!source.url) throw new Error(`RSS source ${source.name} has no url`)
  // SSRF-guarded: http(s) only, private/loopback hosts blocked, response size
  // capped, redirects bounded + re-validated. Keeps the 10s timeout.
  const xml = await safeFetchText(source.url, { timeoutMs: 10_000 })
  return parseRssXml(xml)
}
