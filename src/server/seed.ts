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

  // Seed Claude-native provider configs (all enabled: false — dormant until owner activates)
  const providerConfigs = [
    {
      providerName: 'Anthropic',
      modelName: 'claude-fast',
      taskTypesJson: JSON.stringify(['FAST_CLASSIFICATION', 'SIGNAL_CLASSIFICATION_ASSIST', 'CLAIM_EXTRACTION_ASSIST']),
      costTier: 'LOW',
      latencyTier: 'FAST',
      strengthsJson: JSON.stringify(['Speed', 'Cost-effective']),
      weaknessesJson: JSON.stringify(['Less reasoning depth']),
    },
    {
      providerName: 'Anthropic',
      modelName: 'claude-reasoning',
      taskTypesJson: JSON.stringify(['CONTRADICTION_ANALYSIS', 'EVIDENCE_ARC_SUMMARY', 'RISK_OPPORTUNITY_SYNTHESIS']),
      costTier: 'HIGH',
      latencyTier: 'SLOW',
      strengthsJson: JSON.stringify(['Deep reasoning', 'Complex analysis']),
      weaknessesJson: JSON.stringify(['Higher cost', 'Slower']),
    },
    {
      providerName: 'Anthropic',
      modelName: 'claude-longcontext',
      taskTypesJson: JSON.stringify(['LONG_CONTEXT_REVIEW', 'MARKET_CONTEXT_SYNTHESIS']),
      maxContextTokens: 100000,
      costTier: 'MEDIUM',
      latencyTier: 'MEDIUM',
      strengthsJson: JSON.stringify(['Large context window']),
      weaknessesJson: JSON.stringify(['Context cost trade-offs']),
    },
    {
      providerName: 'Anthropic',
      modelName: 'claude-creative',
      taskTypesJson: JSON.stringify(['OPPORTUNITY_PLAYBOOK_GENERATION', 'STRATEGIC_POSITIONING_GENERATION', 'EXECUTIVE_BRIEF_GENERATION', 'OUTREACH_DRAFT_GENERATION', 'GRAPH_NODE_SUMMARY', 'GRAPH_EDGE_EXPLANATION']),
      costTier: 'MEDIUM',
      latencyTier: 'MEDIUM',
      strengthsJson: JSON.stringify(['Creative generation', 'Content quality']),
      weaknessesJson: JSON.stringify(['Variable output quality']),
    },
    {
      providerName: 'Anthropic',
      modelName: 'claude-safety',
      taskTypesJson: JSON.stringify(['SAFETY_REVIEW']),
      costTier: 'MEDIUM',
      latencyTier: 'MEDIUM',
      strengthsJson: JSON.stringify(['Safety detection']),
      weaknessesJson: JSON.stringify(['Specialized use only']),
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

  return { sourcesSeeded: sources.length }
}
