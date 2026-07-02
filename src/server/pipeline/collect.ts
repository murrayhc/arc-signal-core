import { createHash } from 'node:crypto'
import type { Document, Source } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '@/server/db'
import { getCollector } from './collectors/registry'
import type { PipelineError } from './types'

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
}> {
  const documents: Document[] = []
  const skipped: { sourceId: string; reason: string }[] = []
  const errors: PipelineError[] = []

  for (const source of sources) {
    const collector = getCollector(source.accessMethod)
    if (!collector) {
      const reason = `No compatible collector for access method ${source.accessMethod} (UNSUPPORTED)`
      skipped.push({ sourceId: source.id, reason })
      await prisma.source.update({
        where: { id: source.id },
        data: { lastRunStatus: 'SKIPPED_UNSUPPORTED', lastRunAt: new Date() },
      })
      continue
    }
    try {
      const items = await collector(source)
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
              publishedAt: item.publishedAt,
              documentType: source.accessMethod === 'FIXTURE' ? 'FIXTURE_ITEM' : 'RSS_ITEM',
              isFixture: source.isFixture,
            },
          })
          documents.push(doc)
        } catch (err) {
          // P2002 = unique violation on (sourceId, rawContentHash): duplicate, skip silently.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue
          throw err
        }
      }
      await prisma.source.update({
        where: { id: source.id },
        data: { lastRunStatus: 'SUCCESS', lastRunAt: new Date() },
      })
    } catch (err) {
      errors.push({
        stage: 'collect',
        sourceId: source.id,
        message: err instanceof Error ? err.message : String(err),
      })
      await prisma.source.update({
        where: { id: source.id },
        data: { lastRunStatus: 'FAILED', lastRunAt: new Date() },
      })
    }
  }
  return { documents, skipped, errors }
}
