import { prisma } from '@/server/db'

type SeedSource = {
  name: string
  category: string
  accessMethod: string
  url: string | null
  isFixture: boolean
  collectorStatus: string
  notes: string | null
}

const FIXTURE_SOURCES: SeedSource[] = [
  {
    name: 'Fixture Wire A',
    category: 'NEWS',
    accessMethod: 'FIXTURE',
    url: 'fixtures/fixture-feed-a.json',
    isFixture: true,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Bundled synthetic corpus — clearly labelled fixture data, never live evidence.',
  },
  {
    name: 'Fixture Wire B',
    category: 'NEWS',
    accessMethod: 'FIXTURE',
    url: 'fixtures/fixture-feed-b.json',
    isFixture: true,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Second bundled synthetic corpus for source-diversity testing.',
  },
  {
    name: 'Companies House Filings',
    category: 'OFFICIAL',
    accessMethod: 'UNSUPPORTED',
    url: null,
    isFixture: false,
    collectorStatus: 'UNSUPPORTED',
    notes: 'No compatible collector yet — scans must skip this source and record the reason.',
  },
]

const LIVE_SOURCES: SeedSource[] = [
  {
    name: 'BBC News Business',
    category: 'NEWS',
    accessMethod: 'RSS',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Live public RSS feed. Failures are recorded on the ScanRun, never fatal.',
  },
]

export async function runSeed(options: { includeLive?: boolean } = {}) {
  const includeLive = options.includeLive ?? true
  const sources = includeLive ? [...FIXTURE_SOURCES, ...LIVE_SOURCES] : FIXTURE_SOURCES
  for (const s of sources) {
    await prisma.source.upsert({
      where: { name: s.name },
      create: s,
      update: {
        category: s.category,
        accessMethod: s.accessMethod,
        url: s.url,
        isFixture: s.isFixture,
        collectorStatus: s.collectorStatus,
        notes: s.notes,
      },
    })
  }
  return { sourcesSeeded: sources.length }
}
