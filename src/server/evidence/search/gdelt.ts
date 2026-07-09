import { parseGdeltArticles } from '@/server/pipeline/collectors/gdelt'
import { safeFetchText } from '@/server/net/safe-fetch'
import type { SearchAdapter, SearchDoc } from './registry'

/**
 * GDELT DOC 2.0 search adapter — the investigation loop's first live engine.
 * Keyless, lawful, global news index; the loop's follow-up queries become
 * GDELT full-text searches over the last week of coverage. Results are
 * headline-level (title + outlet), which is exactly what the loop needs:
 * corroborate / contradict / trace a claim across outlets the scanned feeds
 * never carry. Bounded by the loop's runtime/cost/document limits.
 */

/** Pure query-URL builder (unit-testable). GDELT rejects very long queries;
 *  clamp to its practical limit and drop characters outside its syntax. */
export function buildGdeltSearchUrl(queryText: string, limit: number): string {
  const cleaned = queryText.replace(/[^\w\s"'-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
  const params = new URLSearchParams({
    query: cleaned,
    mode: 'artlist',
    format: 'json',
    maxrecords: String(Math.max(1, Math.min(75, limit))),
    timespan: '1w',
  })
  return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`
}

export const GdeltSearchAdapter: SearchAdapter = {
  name: 'gdelt',
  sourceType: 'AGGREGATOR',
  status: () => 'CONFIGURED',
  async search(query, opts = {}) {
    const limit = opts.limit ?? 10
    const json = await safeFetchText(buildGdeltSearchUrl(query.queryText, limit), { timeoutMs: 15_000 })
    return parseGdeltArticles(json)
      .slice(0, limit)
      .map(
        (a): SearchDoc => ({
          url: a.url,
          title: a.title,
          content: a.content,
          publishedAt: a.publishedAt,
          sourceName: a.domain || 'gdelt',
        }),
      )
  },
}
