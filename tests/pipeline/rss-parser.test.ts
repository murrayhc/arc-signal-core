import { describe, expect, it } from 'vitest'
import { parseRssXml } from '@/server/pipeline/collectors/rss'

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Sample Feed</title>
  <item>
    <title>First headline</title>
    <link>https://example.org/1</link>
    <description>Body &lt;b&gt;one&lt;/b&gt; text.</description>
    <pubDate>Mon, 29 Jun 2026 10:00:00 GMT</pubDate>
  </item>
  <item>
    <title>Second headline</title>
    <link>https://example.org/2</link>
    <description>Body two.</description>
  </item>
</channel></rss>`

describe('parseRssXml', () => {
  it('maps RSS items to RawItems', () => {
    const items = parseRssXml(SAMPLE_RSS)
    expect(items).toHaveLength(2)
    expect(items[0].url).toBe('https://example.org/1')
    expect(items[0].title).toBe('First headline')
    expect(items[0].content).toContain('First headline')
    expect(items[0].content).toContain('Body')
    expect(items[0].publishedAt?.toISOString()).toBe('2026-06-29T10:00:00.000Z')
    expect(items[1].publishedAt).toBeNull()
  })

  it('returns [] for malformed or non-RSS input', () => {
    expect(parseRssXml('not xml at all')).toEqual([])
    expect(parseRssXml('<html><body>nope</body></html>')).toEqual([])
  })

  it('handles a single-item channel (object, not array)', () => {
    const single = SAMPLE_RSS.replace(/<item>[\s\S]*?<\/item>\s*(?=<item>)/, '')
    expect(parseRssXml(single)).toHaveLength(1)
  })
})
