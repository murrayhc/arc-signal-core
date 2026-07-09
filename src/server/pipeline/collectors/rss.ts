import { XMLParser } from 'fast-xml-parser'
import type { Source } from '@prisma/client'
import { prisma } from '@/server/db'
import { safeFetchResponse, type SafeFetchResult } from '@/server/net/safe-fetch'
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

function parseDate(value: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[]
  return value ? [value as Record<string, unknown>] : []
}

/** Atom `link` fields come as one/many objects with @_href (rel=alternate
 *  preferred) or, from lax feeds, a bare string. */
function atomLink(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  const links = asArray(value)
  const alternate = links.find((l) => (l['@_rel'] ?? 'alternate') === 'alternate')
  const chosen = alternate ?? links[0]
  return chosen ? String(chosen['@_href'] ?? '').trim() : ''
}

function mapRssItems(rawItems: Record<string, unknown>[]): RawItem[] {
  const items: RawItem[] = []
  for (const raw of rawItems) {
    const title = stripHtml(text(raw.title))
    const link = text(raw.link).trim()
    const description = stripHtml(text(raw.description))
    if (!title || !link) continue
    items.push({
      url: link,
      title,
      content: `${title}\n\n${description}`,
      publishedAt: parseDate(text(raw.pubDate) || text(raw['dc:date'])),
    })
  }
  return items
}

function mapAtomEntries(entries: Record<string, unknown>[]): RawItem[] {
  const items: RawItem[] = []
  for (const raw of entries) {
    const title = stripHtml(text(raw.title))
    const link = atomLink(raw.link)
    const body = stripHtml(text(raw.summary) || text(raw.content))
    if (!title || !link) continue
    items.push({
      url: link,
      title,
      content: `${title}\n\n${body}`,
      publishedAt: parseDate(text(raw.published) || text(raw.updated)),
    })
  }
  return items
}

/** Pure feed-XML → RawItem[] mapping across the three wire formats actually
 *  used by public-sector and news feeds: RSS 2.0 (`rss.channel.item`),
 *  Atom (`feed.entry`, GOV.UK organisation feeds), and RDF/RSS 1.0
 *  (`rdf:RDF.item`). Returns [] for anything unrecognisable — a broken feed
 *  is a health event, never a crash. */
export function parseFeed(xml: string): RawItem[] {
  let doc: unknown
  try {
    doc = new XMLParser({ ignoreAttributes: false }).parse(xml)
  } catch {
    return []
  }
  const root = doc as Record<string, unknown>

  const rssChannel = (root?.rss as { channel?: { item?: unknown } } | undefined)?.channel
  if (rssChannel) return mapRssItems(asArray(rssChannel.item))

  const atomFeed = root?.feed as { entry?: unknown } | undefined
  if (atomFeed) return mapAtomEntries(asArray(atomFeed.entry))

  const rdf = root?.['rdf:RDF'] as { item?: unknown } | undefined
  if (rdf) return mapRssItems(asArray(rdf.item))

  return []
}

/** Back-compat alias (pre-Atom name). */
export const parseRssXml = parseFeed

type Fetcher = (
  url: string,
  opts: { timeoutMs: number; etag: string | null; lastModified: string | null },
) => Promise<SafeFetchResult>

/** Collector factory with an injectable fetcher (tests use a fake; production
 *  uses the SSRF-guarded client). Conditional GET: sends the stored
 *  validators, persists fresh ones, and treats 304 Not Modified as a
 *  successful zero-item collection — an unchanged feed costs one header
 *  round-trip, not a full download. */
export function collectFeedWith(fetchImpl: Fetcher) {
  return async function collectFeed(source: Source): Promise<RawItem[]> {
    if (!source.url) throw new Error(`Feed source ${source.name} has no url`)
    const res = await fetchImpl(source.url, {
      timeoutMs: 10_000,
      etag: source.httpEtag,
      lastModified: source.httpLastModified,
    })
    if (res.etag !== source.httpEtag || res.lastModified !== source.httpLastModified) {
      await prisma.source.update({
        where: { id: source.id },
        data: { httpEtag: res.etag, httpLastModified: res.lastModified },
      })
    }
    if (res.status === 304) return []
    return parseFeed(res.text)
  }
}

export const collectRss = collectFeedWith((url, opts) => safeFetchResponse(url, opts))
