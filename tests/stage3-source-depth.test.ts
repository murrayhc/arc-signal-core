import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { parseFeed, collectFeedWith } from '@/server/pipeline/collectors/rss'
import { parseGdeltJson } from '@/server/pipeline/collectors/gdelt'
import { parseOcdsJson } from '@/server/pipeline/collectors/contracts-finder'
import { computeNextScanAt } from '@/server/pipeline/health'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { resetDb } from './helpers'
import { makeSource } from './factories'

// ── Feed format coverage ────────────────────────────────────────────────────

describe('parseFeed: RSS 2.0, Atom, RDF', () => {
  it('parses RSS 2.0 channels (existing behaviour)', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>Story A</title><link>https://ex.com/a</link><description>Body A</description><pubDate>Tue, 07 Jul 2026 09:00:00 GMT</pubDate></item>
    </channel></rss>`
    const items = parseFeed(xml)
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://ex.com/a')
    expect(items[0].content).toContain('Body A')
    expect(items[0].publishedAt).not.toBeNull()
  })

  it('parses Atom feeds (GOV.UK organisation feed shape)', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>CMA - Activity on GOV.UK</title>
      <entry>
        <title>CMA opens merger inquiry into Acme/Blot deal</title>
        <link rel="alternate" type="text/html" href="https://www.gov.uk/cma-cases/acme-blot"/>
        <summary>The CMA is investigating the completed acquisition.</summary>
        <published>2026-07-06T10:30:00+01:00</published>
        <updated>2026-07-06T11:00:00+01:00</updated>
      </entry>
      <entry>
        <title>Untitled entry with no link is skipped</title>
      </entry>
    </feed>`
    const items = parseFeed(xml)
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://www.gov.uk/cma-cases/acme-blot')
    expect(items[0].title).toContain('merger inquiry')
    expect(items[0].content).toContain('investigating the completed acquisition')
    expect(items[0].publishedAt).not.toBeNull()
  })

  it('parses RDF/RSS 1.0 feeds', () => {
    const xml = `<?xml version="1.0"?>
    <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <channel rdf:about="https://ex.org/feed"><title>Feed</title></channel>
      <item rdf:about="https://ex.org/x">
        <title>RDF story</title><link>https://ex.org/x</link>
        <description>An RSS 1.0 item.</description><dc:date>2026-07-05T08:00:00Z</dc:date>
      </item>
    </rdf:RDF>`
    const items = parseFeed(xml)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('RDF story')
    expect(items[0].publishedAt).not.toBeNull()
  })

  it('returns [] for junk instead of crashing', () => {
    expect(parseFeed('not xml at all')).toEqual([])
    expect(parseFeed('<html><body>an error page</body></html>')).toEqual([])
  })
})

// ── New collectors: pure parsers ────────────────────────────────────────────

describe('parseGdeltJson', () => {
  it('maps articles defensively', () => {
    const json = JSON.stringify({
      articles: [
        { url: 'https://local.paper/x', title: 'Supplier enters administration', seendate: '20260707T093000Z', domain: 'local.paper', sourcecountry: 'United Kingdom' },
        { url: '', title: 'no url — skipped' },
        { title: 'no url field — skipped' },
      ],
    })
    const items = parseGdeltJson(json)
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://local.paper/x')
    expect(items[0].content).toContain('via local.paper')
    expect(items[0].publishedAt?.toISOString()).toBe('2026-07-07T09:30:00.000Z')
  })

  it('returns [] for junk or shape drift', () => {
    expect(parseGdeltJson('not json')).toEqual([])
    expect(parseGdeltJson('{"unexpected": true}')).toEqual([])
  })
})

describe('parseOcdsJson', () => {
  const release = {
    ocid: 'ocds-b5fd17-12345',
    id: 'notice-abc',
    date: '2026-07-06T09:00:00Z',
    tender: {
      title: 'Cyber security monitoring services',
      description: 'Provision of SOC monitoring for the authority.',
      value: { amount: 1250000, currency: 'GBP' },
      tenderPeriod: { endDate: '2026-08-01T12:00:00Z' },
    },
    buyer: { name: 'Example Borough Council' },
  }

  it('maps OCDS releases in both envelope shapes', () => {
    for (const envelope of [{ results: [{ releases: [release] }] }, { releases: [release] }]) {
      const items = parseOcdsJson(JSON.stringify(envelope))
      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('Procurement notice: Cyber security monitoring services')
      expect(items[0].content).toContain('Buyer: Example Borough Council.')
      expect(items[0].content).toContain('GBP')
      expect(items[0].url).toContain('contractsfinder.service.gov.uk/Notice/notice-abc')
    }
  })

  it('returns [] for junk or shape drift', () => {
    expect(parseOcdsJson('nope')).toEqual([])
    expect(parseOcdsJson('{"results": "weird"}')).toEqual([])
  })
})

// ── Conditional GET ─────────────────────────────────────────────────────────

describe('conditional GET on feed sources', () => {
  beforeEach(resetDb)

  it('persists validators and treats 304 as a successful zero-item collection', async () => {
    const source = await makeSource({ accessMethod: 'RSS', url: 'https://feeds.example.com/a.xml', isFixture: false })
    const xml = `<rss version="2.0"><channel><item><title>T</title><link>https://e.com/1</link><description>D</description></item></channel></rss>`

    let sentEtag: string | null = null
    const fetchImpl = async (_url: string, opts: { etag: string | null }) => {
      sentEtag = opts.etag
      if (opts.etag === '"v1"') return { status: 304, text: '', etag: '"v1"', lastModified: null }
      return { status: 200, text: xml, etag: '"v1"', lastModified: 'Tue, 07 Jul 2026 09:00:00 GMT' }
    }
    const collect = collectFeedWith(fetchImpl)

    // First fetch: full body, validators stored.
    const first = await collect(source)
    expect(first).toHaveLength(1)
    const stored = await prisma.source.findUniqueOrThrow({ where: { id: source.id } })
    expect(stored.httpEtag).toBe('"v1"')
    expect(stored.httpLastModified).toContain('Jul 2026')

    // Second fetch: validator sent, 304 → zero items, no error.
    const second = await collect(stored)
    expect(sentEtag).toBe('"v1"')
    expect(second).toEqual([])
  })
})

// ── Cadence + backoff + due-gating ──────────────────────────────────────────

describe('scan scheduling', () => {
  beforeEach(resetDb)

  it('computeNextScanAt: interval on success, exponential backoff on failure, deterministic jitter', () => {
    const now = new Date('2026-07-07T12:00:00Z')
    const ok = computeNextScanAt(now, 'src-1', 60, 0)
    const okMinutes = (ok.getTime() - now.getTime()) / 60000
    expect(okMinutes).toBeGreaterThanOrEqual(60)
    expect(okMinutes).toBeLessThan(66.1) // ≤10% deterministic jitter

    const fail2 = computeNextScanAt(now, 'src-1', 60, 2)
    const fail2Minutes = (fail2.getTime() - now.getTime()) / 60000
    expect(fail2Minutes).toBeGreaterThanOrEqual(240) // 60 × 2²

    // Capped at 16× — a dead feed is probed at most every interval×16.
    const fail9 = computeNextScanAt(now, 'src-1', 60, 9)
    expect((fail9.getTime() - now.getTime()) / 60000).toBeLessThanOrEqual(60 * 16 * 1.1)

    // Deterministic: same inputs, same output.
    expect(computeNextScanAt(now, 'src-1', 60, 0).getTime()).toBe(ok.getTime())
  })

  it('a scan sets nextScanAt on scanned sources', async () => {
    await runSeed({ includeLive: false })
    await runFullScan()
    const wireA = await prisma.source.findFirstOrThrow({ where: { name: 'Fixture Wire A' } })
    expect(wireA.nextScanAt).not.toBeNull()
    expect(wireA.nextScanAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('dueOnly scans skip sources that are not due; manual scans do not', async () => {
    await runSeed({ includeLive: false })
    const future = new Date(Date.now() + 60 * 60 * 1000)
    await prisma.source.updateMany({ where: { name: 'Fixture Wire A' }, data: { nextScanAt: future } })

    const scheduled = await runFullScan({ dueOnly: true, scanType: 'SCHEDULED' })
    const wireA = await prisma.source.findFirstOrThrow({ where: { name: 'Fixture Wire A' } })
    // Not due → untouched by the scheduled scan.
    expect(wireA.lastRunAt).toBeNull()
    // Wire B was due and produced its documents.
    expect(scheduled.counts.documentsFetched).toBeGreaterThan(0)

    // A manual scan ignores cadence and scans everything.
    await runFullScan()
    const wireAAfter = await prisma.source.findFirstOrThrow({ where: { name: 'Fixture Wire A' } })
    expect(wireAAfter.lastRunAt).not.toBeNull()
  })
})
