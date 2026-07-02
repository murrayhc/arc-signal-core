import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'
import type { Prisma } from '@prisma/client'

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
