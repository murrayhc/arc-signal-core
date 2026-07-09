import { createHash } from 'node:crypto'
import type { Document, Source } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { simhash64 } from '@/server/evidence/fingerprint'
import { deriveIndependenceGroup } from '@/server/evidence/independence'
import { getCollector } from './collectors/registry'
import type { PipelineError } from './types'
import type { SourceOutcome } from './health'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

export async function collectFromSources(sources: Source[]): Promise<{
  documents: Document[]
  skipped: { sourceId: string; reason: string }[]
  errors: PipelineError[]
  perSource: SourceOutcome[]
}> {
  const documents: Document[] = []
  const skipped: { sourceId: string; reason: string }[] = []
  const errors: PipelineError[] = []
  const perSource: SourceOutcome[] = []

  for (const source of sources) {
    const entry = getCollector(source.accessMethod)
    // Reconcile collectorStatus with runtime truth on every scan: the status
    // is derived from whether a collector actually exists for this access
    // method NOW, never trusted from a static seed value.
    if (!entry) {
      const reason = `No compatible collector for access method ${source.accessMethod} (UNSUPPORTED)`
      skipped.push({ sourceId: source.id, reason })
      perSource.push({ sourceId: source.id, outcome: 'SKIPPED_UNSUPPORTED', documentsStored: 0 })
      await prisma.source.update({
        where: { id: source.id },
        data: { lastRunStatus: 'SKIPPED_UNSUPPORTED', lastRunAt: new Date(), collectorStatus: 'UNSUPPORTED' },
      })
      continue
    }
    // Reconcile the publisher independence group at scan time (like
    // collectorStatus): derived from the source's registrable domain so
    // same-publisher feeds can never be counted as independent corroboration.
    const independenceGroup = deriveIndependenceGroup(source.url, source.name)
    if (source.independenceGroup !== independenceGroup) {
      await prisma.source.update({ where: { id: source.id }, data: { independenceGroup } })
    }
    let createdForThisSource = 0
    try {
      const items = await entry.collect(source)
      for (const item of items) {
        try {
          const doc = await prisma.document.create({
            data: {
              sourceId: source.id,
              url: item.url,
              title: item.title,
              rawContent: item.content,
              rawContentHash: sha256(item.content),
              normalisedContentHash: sha256(normalise(item.content)),
              simhash: simhash64(item.content),
              publishedAt: item.publishedAt,
              documentType: entry.documentType,
              isFixture: source.isFixture,
            },
          })
          documents.push(doc)
          createdForThisSource += 1
        } catch (err) {
          // P2002 = unique violation on (sourceId, rawContentHash): duplicate, skip silently.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue
          throw err
        }
      }
      await prisma.source.update({
        where: { id: source.id },
        data: { lastRunStatus: 'SUCCESS', lastRunAt: new Date(), collectorStatus: 'FUNCTIONAL' },
      })
      perSource.push({ sourceId: source.id, outcome: 'SUCCESS', documentsStored: createdForThisSource })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({
        stage: 'collect',
        sourceId: source.id,
        message,
      })
      await prisma.source.update({
        where: { id: source.id },
        // A collector exists (we reached it) — the FETCH failed. That is a
        // health matter, not a collector-support matter.
        data: { lastRunStatus: 'FAILED', lastRunAt: new Date(), collectorStatus: 'FUNCTIONAL' },
      })
      perSource.push({ sourceId: source.id, outcome: 'FAILED', documentsStored: 0, errorMessage: message })
    }
  }
  return { documents, skipped, errors, perSource }
}
