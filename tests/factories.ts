import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'
import type { Prisma } from '@prisma/client'
import { runEvidenceDepth } from '@/server/evidence/depth-pipeline'

export async function makeSource(overrides: Partial<Prisma.SourceUncheckedCreateInput> = {}) {
  return prisma.source.create({
    data: {
      name: `Test Source ${randomUUID()}`,
      category: 'NEWS',
      accessMethod: 'FIXTURE',
      url: 'fixtures/fixture-feed-a.json',
      isFixture: true,
      collectorStatus: 'FUNCTIONAL',
      ...overrides,
    },
  })
}

export async function makeDocument(
  sourceId: string,
  overrides: Partial<Prisma.DocumentUncheckedCreateInput> = {},
) {
  const content = (overrides.rawContent as string) ?? `Test document body ${randomUUID()}`
  return prisma.document.create({
    data: {
      sourceId,
      url: `https://fixture.archlight.local/${randomUUID()}`,
      title: 'Test document',
      rawContent: content,
      rawContentHash: createHash('sha256').update(content).digest('hex'),
      normalisedContentHash: createHash('sha256')
        .update(content.toLowerCase().replace(/\s+/g, ' ').trim())
        .digest('hex'),
      documentType: 'FIXTURE_ITEM',
      isFixture: true,
      ...overrides,
    },
  })
}

export async function makeParsedDocument(
  documentId: string,
  overrides: Partial<Prisma.ParsedDocumentUncheckedCreateInput> = {},
) {
  return prisma.parsedDocument.create({
    data: {
      documentId,
      title: 'Test document',
      bodyText: 'Test body text.',
      parserName: 'test',
      parserConfidence: 0.9,
      ...overrides,
    },
  })
}

export async function makeClaim(
  documentId: string,
  overrides: Partial<Prisma.ClaimUncheckedCreateInput> = {},
) {
  return prisma.claim.create({
    data: {
      documentId,
      claimType: 'LAYOFF_MENTION',
      claimText: 'Test claim: the company is cutting 100 jobs.',
      claimDate: new Date('2026-06-28T09:00:00Z'),
      extractionMethod: 'rule:v1:LAYOFF_MENTION',
      extractionConfidence: 0.8,
      credibilityScore: 0.7,
      isFixture: true,
      ...overrides,
    },
  })
}

export async function makeAtomicClaim(
  overrides: Partial<Prisma.AtomicClaimUncheckedCreateInput> = {},
) {
  return prisma.atomicClaim.create({
    data: {
      documentId: randomUUID(),
      sourceId: randomUUID(),
      claimText: 'The company is cutting 100 jobs at its site.',
      claimType: 'LAYOFF_SIGNAL',
      extractionMethod: 'rule:v2:LAYOFF_SIGNAL',
      extractionConfidence: 0.7,
      specificityScore: 0.5,
      factualityLabel: 'UNVERIFIED',
      ...overrides,
    },
  })
}

export async function makeSignal(
  claimId: string,
  documentId: string,
  sourceId: string,
  overrides: Partial<Prisma.SignalUncheckedCreateInput> = {},
) {
  return prisma.signal.create({
    data: {
      claimId,
      documentId,
      sourceId,
      signalType: 'LAYOFF_SIGNAL',
      signalDate: new Date('2026-06-28T09:00:00Z'),
      confidence: 0.8,
      strength: 0.7,
      direction: 'NEGATIVE',
      explanation: 'Test signal from LAYOFF_MENTION claim.',
      isFixture: true,
      ...overrides,
    },
  })
}

/** Builds a full event graph over one document that has been run through the
 *  evidence-depth layer: source → document → parsed → atomic/canonical claims →
 *  event (cluster + signal). Returns the event and its source/doc. Reused across
 *  the consequence-engine tests. */
export async function makeEventGraph(
  bodyText: string,
  opts: {
    direction?: string
    eventClass?: string
    eventType?: string
    sector?: string | null
    region?: string | null
  } = {},
) {
  const source = await makeSource({ category: 'NEWS' })
  const doc = await makeDocument(source.id)
  const parsed = await makeParsedDocument(doc.id, { bodyText })
  await runEvidenceDepth([parsed], new Map([[doc.id, doc]]), new Map([[source.id, source]]))
  const claim = await makeClaim(doc.id)
  const signal = await makeSignal(claim.id, doc.id, source.id, { direction: opts.direction ?? 'NEGATIVE' })
  const scanRun = await prisma.scanRun.create({ data: {} })
  const event = await prisma.eventCandidate.create({
    data: {
      title: 'Test event',
      eventType: opts.eventType ?? 'LAYOFF_SIGNAL',
      eventClass: opts.eventClass ?? 'RISK',
      summary: 'Test event summary.',
      severity: 0.6,
      probability: 0.6,
      confidence: 0.6,
      evidenceCount: 1,
      sourceDiversityScore: 0.5,
      signalStrength: 0.6,
      noveltyScore: 0.5,
      opportunityScore: 0.3,
      riskScore: 0.7,
      affectedSector: opts.sector ?? null,
      affectedRegion: opts.region ?? null,
      createdFromScanRunId: scanRun.id,
    },
  })
  const cluster = await prisma.signalCluster.create({
    data: {
      title: 'Test cluster',
      clusterType: opts.eventType ?? 'LAYOFF_SIGNAL',
      strength: 0.6,
      confidence: 0.6,
      novelty: 0.5,
      explanation: 'test cluster',
      eventCandidateId: event.id,
    },
  })
  await prisma.signalClusterSignal.create({ data: { clusterId: cluster.id, signalId: signal.id } })
  return { event, source, doc }
}
