import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runEvidenceDepth } from '@/server/evidence/depth-pipeline'
import { resetDb } from './helpers'
import { makeDocument, makeParsedDocument, makeSource } from './factories'

describe('runEvidenceDepth', () => {
  beforeEach(resetDb)

  it('extracts atomic claims, clusters canonical claims and generates queries from parsed docs', async () => {
    const source = await makeSource()
    const doc1 = await makeDocument(source.id)
    const doc2 = await makeDocument(source.id)
    const p1 = await makeParsedDocument(doc1.id, { bodyText: 'Voltcore will cut 400 jobs at its Manchester plant.' })
    const p2 = await makeParsedDocument(doc2.id, { bodyText: 'The regulator has opened an investigation into Globex.' })

    const { counts, errors } = await runEvidenceDepth(
      [p1, p2],
      new Map([[doc1.id, doc1], [doc2.id, doc2]]),
      new Map([[source.id, source]]),
    )

    expect(errors).toHaveLength(0)
    expect(counts.atomicClaimsExtracted).toBeGreaterThan(0)
    expect(counts.canonicalClaimsCreated).toBeGreaterThanOrEqual(1)
    expect(counts.lineageRecordsCreated).toBeGreaterThan(0)
    expect(counts.investigationQueriesGenerated).toBeGreaterThan(0)
    expect(await prisma.atomicClaim.count()).toBe(counts.atomicClaimsExtracted)
  })

  it('returns zeroed counts and no error for empty input (dormant-safe)', async () => {
    const { counts, errors } = await runEvidenceDepth([], new Map(), new Map())
    expect(errors).toHaveLength(0)
    expect(counts.atomicClaimsExtracted).toBe(0)
    expect(counts.canonicalClaimsCreated).toBe(0)
    expect(counts.investigationQueriesGenerated).toBe(0)
  })
})
