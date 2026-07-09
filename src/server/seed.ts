import { prisma } from '@/server/db'
import { deriveIndependenceGroup } from '@/server/evidence/independence'

type SeedSource = {
  name: string
  category: string
  accessMethod: string
  url: string | null
  isFixture: boolean
  collectorStatus: string
  notes: string | null
  scanIntervalMinutes?: number
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

/** The free lawful public source pack: multiple source CATEGORIES (news,
 *  regulator, government, procurement, global aggregator), all keyless, all
 *  health-tracked, all non-fatal on failure. Feed URL drift shows up honestly
 *  as a FAILED health row with the reason persisted — never a crash. */
const LIVE_SOURCES: SeedSource[] = [
  {
    name: 'BBC News Business',
    category: 'NEWS',
    accessMethod: 'RSS',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Live public RSS feed. Failures are recorded on the ScanRun, never fatal.',
    scanIntervalMinutes: 60,
  },
  {
    name: 'BBC News Technology',
    category: 'NEWS',
    accessMethod: 'RSS',
    url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Same publisher group as BBC Business (bbci.co.uk) — corroboration between the two never counts as independent.',
    scanIntervalMinutes: 60,
  },
  {
    name: 'The Guardian Business',
    category: 'NEWS',
    accessMethod: 'RSS',
    url: 'https://www.theguardian.com/uk/business/rss',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Live public RSS feed — independent publisher group from the BBC feeds.',
    scanIntervalMinutes: 60,
  },
  {
    name: 'Sky News Business',
    category: 'NEWS',
    accessMethod: 'RSS',
    url: 'https://feeds.skynews.com/feeds/rss/business.xml',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Live public RSS feed — third independent news publisher group.',
    scanIntervalMinutes: 60,
  },
  {
    name: 'FCA News',
    category: 'REGULATOR',
    accessMethod: 'RSS',
    url: 'https://www.fca.org.uk/news/rss.xml',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Financial Conduct Authority news feed — primary regulator signal, high authority prior.',
    scanIntervalMinutes: 180,
  },
  {
    name: 'Bank of England News',
    category: 'REGULATOR',
    accessMethod: 'RSS',
    url: 'https://www.bankofengland.co.uk/rss/news',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Bank of England news feed — primary macro/regulatory signal.',
    scanIntervalMinutes: 180,
  },
  {
    name: 'GOV.UK Competition and Markets Authority',
    category: 'GOVERNMENT',
    accessMethod: 'RSS',
    url: 'https://www.gov.uk/government/organisations/competition-and-markets-authority.atom',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'GOV.UK organisation Atom feed — merger probes, market investigations, enforcement.',
    scanIntervalMinutes: 180,
  },
  {
    name: 'UK Contracts Finder (open tenders)',
    category: 'PROCUREMENT',
    accessMethod: 'CONTRACTS_FINDER',
    url: 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?stages=tender&orderBy=publishedDate&order=DESC&size=50',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Open Contracting (OCDS) releases for live UK tender notices — primary public-sector demand signal.',
    scanIntervalMinutes: 360,
  },
  {
    name: 'GDELT: UK insolvency & restructuring watch',
    category: 'AGGREGATOR',
    accessMethod: 'GDELT',
    url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=(insolvency%20OR%20administration%20OR%20restructuring)%20sourcecountry:UK&mode=artlist&format=json&maxrecords=40&timespan=3d',
    isFixture: false,
    collectorStatus: 'FUNCTIONAL',
    notes: 'Standing GDELT DOC 2.0 query (keyless) — low-visibility local reports of distress signals. Headline-level; aggregator authority prior.',
    scanIntervalMinutes: 120,
  },
]

export async function runSeed(options: { includeLive?: boolean } = {}) {
  const includeLive = options.includeLive ?? true
  const sources = includeLive ? [...FIXTURE_SOURCES, ...LIVE_SOURCES] : FIXTURE_SOURCES
  for (const s of sources) {
    // Publisher independence group: registrable domain for real URLs, the
    // source name otherwise — collapses same-publisher feeds in every
    // independence count. Scan-time reconciliation keeps this current.
    const independenceGroup = deriveIndependenceGroup(s.url, s.name)
    const scanIntervalMinutes = s.scanIntervalMinutes ?? 60
    await prisma.source.upsert({
      where: { name: s.name },
      create: { ...s, independenceGroup, scanIntervalMinutes },
      update: {
        category: s.category,
        accessMethod: s.accessMethod,
        url: s.url,
        isFixture: s.isFixture,
        collectorStatus: s.collectorStatus,
        independenceGroup,
        scanIntervalMinutes,
        notes: s.notes,
      },
    })
  }
  await prisma.revenueLens.upsert({
    where: { name: 'General Commercial Lens' },
    create: {
      name: 'General Commercial Lens',
      description: 'Broad default commercial context so opportunity conversion works out of the box.',
      userType: 'GENERAL',
      targetSectorsJson: '[]',
      targetRegionsJson: '[]',
      offerTypesJson: JSON.stringify(['ADVISORY', 'SALES', 'PARTNERSHIP']),
      buyerPersonasJson: '[]',
      excludedSectorsJson: '[]',
      riskAppetite: 'MEDIUM',
      active: true,
      isDefault: true,
    },
    update: { active: true, isDefault: true },
  })

  // Retire the old placeholder-named configs (one-time cleanup; no-op on a fresh DB).
  await prisma.lLMProviderConfig.deleteMany({
    where: { modelName: { in: ['claude-fast', 'claude-reasoning', 'claude-longcontext', 'claude-creative', 'claude-safety'] } },
  })

  // Seed 3 real-model provider configs (Balanced tier). All enabled:false —
  // dormant until the owner activates (see docs/ai-activation.md). modelName is
  // both the routing key and the model id sent to the Anthropic SDK, so Balanced
  // collapses to the 3 distinct models it uses; every LLM task type routes to
  // exactly one config. The upsert loop's `update` never touches `enabled`, so
  // re-seeding preserves an owner's activated state.
  const providerConfigs = [
    {
      providerName: 'Anthropic',
      modelName: 'claude-haiku-4-5',
      taskTypesJson: JSON.stringify(['FAST_CLASSIFICATION', 'SIGNAL_CLASSIFICATION_ASSIST', 'CLAIM_EXTRACTION_ASSIST', 'CLAIM_NORMALISATION', 'JSON_REPAIR', 'SAFETY_REVIEW']),
      costTier: 'LOW',
      latencyTier: 'FAST',
      strengthsJson: JSON.stringify(['Speed', 'Cost-effective']),
      weaknessesJson: JSON.stringify(['Less reasoning depth']),
    },
    {
      providerName: 'Anthropic',
      modelName: 'claude-opus-4-8',
      taskTypesJson: JSON.stringify(['CONTRADICTION_ANALYSIS', 'EVIDENCE_ARC_SUMMARY', 'RISK_OPPORTUNITY_SYNTHESIS', 'SOURCE_COMPARISON', 'COMPANY_IMPACT_ANALYSIS', 'FUTURE_SCENARIOS']),
      costTier: 'HIGH',
      latencyTier: 'SLOW',
      strengthsJson: JSON.stringify(['Deep reasoning', 'Complex analysis']),
      weaknessesJson: JSON.stringify(['Higher cost', 'Slower']),
    },
    {
      providerName: 'Anthropic',
      modelName: 'claude-sonnet-5',
      taskTypesJson: JSON.stringify(['LONG_CONTEXT_REVIEW', 'MARKET_CONTEXT_SYNTHESIS', 'OPPORTUNITY_PLAYBOOK_GENERATION', 'STRATEGIC_POSITIONING_GENERATION', 'EXECUTIVE_BRIEF_GENERATION', 'OUTREACH_DRAFT_GENERATION', 'GRAPH_NODE_SUMMARY', 'GRAPH_EDGE_EXPLANATION', 'STRATEGIC_POSITIONING', 'REPORT_SYNTHESIS', 'HISTORIC_CONTEXT', 'PRESENT_CONTEXT']),
      maxContextTokens: 200000,
      costTier: 'MEDIUM',
      latencyTier: 'MEDIUM',
      strengthsJson: JSON.stringify(['Balanced reasoning + writing', 'Large context']),
      weaknessesJson: JSON.stringify(['Mid-cost']),
    },
  ]

  for (const config of providerConfigs) {
    await prisma.lLMProviderConfig.upsert({
      where: { modelName: config.modelName },
      create: {
        ...config,
        enabled: false,
      },
      update: {
        taskTypesJson: config.taskTypesJson,
        costTier: config.costTier,
        latencyTier: config.latencyTier,
        strengthsJson: config.strengthsJson,
        weaknessesJson: config.weaknessesJson,
      },
    })
  }

  // Seed fixture commodity profiles — factual reference context, no prices
  const commodities = [
    {
      name: 'Copper',
      category: 'METAL',
      keySupplyRegions: ['Chile', 'Peru', 'China'],
      keyDemandSectors: ['Construction', 'Electronics', 'EV'],
    },
    {
      name: 'Brent Crude Oil',
      category: 'ENERGY',
      keySupplyRegions: ['Middle East', 'North Sea'],
      keyDemandSectors: ['Transport', 'Energy', 'Chemicals'],
    },
    {
      name: 'Wheat',
      category: 'AGRICULTURE',
      keySupplyRegions: ['Russia', 'United States', 'EU'],
      keyDemandSectors: ['Food', 'Livestock'],
    },
    {
      name: 'Lithium',
      category: 'INDUSTRIAL',
      keySupplyRegions: ['Australia', 'Chile'],
      keyDemandSectors: ['EV', 'Battery Storage'],
    },
  ]

  for (const commodity of commodities) {
    await prisma.commodityProfile.upsert({
      where: { name: commodity.name },
      create: {
        name: commodity.name,
        category: commodity.category,
        keySupplyRegionsJson: JSON.stringify(commodity.keySupplyRegions),
        keyDemandSectorsJson: JSON.stringify(commodity.keyDemandSectors),
        provider: 'FIXTURE',
        isFixture: true,
      },
      update: {
        category: commodity.category,
        keySupplyRegionsJson: JSON.stringify(commodity.keySupplyRegions),
        keyDemandSectorsJson: JSON.stringify(commodity.keyDemandSectors),
        provider: 'FIXTURE',
        isFixture: true,
      },
    })
  }

  // Seed fixture instrument profiles — sample reference data, no prices
  const instruments = [
    {
      provider: 'FIXTURE',
      symbol: 'ACME',
      name: 'Acme Industrials (sample)',
      exchange: 'LSE',
      instrumentType: 'EQUITY',
      currency: 'GBP',
    },
    {
      provider: 'FIXTURE',
      symbol: 'SMPL-ETF',
      name: 'Sample Sector ETF',
      exchange: 'LSE',
      instrumentType: 'ETF',
      currency: 'GBP',
    },
  ]

  for (const instrument of instruments) {
    await prisma.instrumentProfile.upsert({
      where: { provider_symbol: { provider: instrument.provider, symbol: instrument.symbol } },
      create: {
        ...instrument,
        isFixture: true,
      },
      update: {
        name: instrument.name,
        exchange: instrument.exchange,
        instrumentType: instrument.instrumentType,
        currency: instrument.currency,
        isFixture: true,
      },
    })
  }

  // Seed sample watch market
  await prisma.watchMarket.upsert({
    where: { name: 'Lithium supply chain' },
    create: {
      name: 'Lithium supply chain',
      description: 'Monitor lithium supply chain risks and opportunities',
      sectorsJson: JSON.stringify(['Mining', 'EV', 'Battery Storage']),
      regionsJson: JSON.stringify(['Australia', 'Chile']),
      themesJson: JSON.stringify(['supply chain']),
      queryTermsJson: JSON.stringify(['lithium']),
      active: true,
    },
    update: {
      description: 'Monitor lithium supply chain risks and opportunities',
      sectorsJson: JSON.stringify(['Mining', 'EV', 'Battery Storage']),
      regionsJson: JSON.stringify(['Australia', 'Chile']),
      themesJson: JSON.stringify(['supply chain']),
      queryTermsJson: JSON.stringify(['lithium']),
      active: true,
    },
  })

  return { sourcesSeeded: sources.length }
}
