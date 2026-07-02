import type { Document, ParsedDocument } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from './types'

const SUPPORTED_TYPES = new Set(['FIXTURE_ITEM', 'RSS_ITEM'])

function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

/** Naive display-only mention extraction: capitalised multi-word sequences, top 10 unique. */
function extractMentions(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-z]+(?: [A-Z][a-z]+)+\b/g) ?? []
  return [...new Set(matches)].slice(0, 10)
}

export async function parseDocuments(documents: Document[]): Promise<{
  parsed: ParsedDocument[]
  errors: PipelineError[]
}> {
  const parsed: ParsedDocument[] = []
  const errors: PipelineError[] = []

  for (const doc of documents) {
    try {
      const existing = await prisma.parsedDocument.findUnique({ where: { documentId: doc.id } })
      if (existing) continue

      if (!SUPPORTED_TYPES.has(doc.documentType)) {
        const row = await prisma.parsedDocument.create({
          data: {
            documentId: doc.id,
            title: doc.title,
            bodyText: '',
            parserName: 'none',
            parserConfidence: 0,
            status: 'UNSUPPORTED',
          },
        })
        parsed.push(row)
        errors.push({
          stage: 'parse',
          sourceId: doc.sourceId,
          message: `Document ${doc.id} has unsupported type ${doc.documentType}; marked UNSUPPORTED`,
        })
        continue
      }

      const bodyText = cleanText(doc.rawContent)
      const row = await prisma.parsedDocument.create({
        data: {
          documentId: doc.id,
          title: doc.title,
          bodyText,
          publishedAt: doc.publishedAt,
          entitiesMentionedJson: JSON.stringify(extractMentions(bodyText)),
          parserName: doc.documentType === 'FIXTURE_ITEM' ? 'fixture-text:v1' : 'rss-item:v1',
          parserConfidence: doc.documentType === 'FIXTURE_ITEM' ? 0.9 : 0.8,
          status: 'PARSED',
        },
      })
      parsed.push(row)
    } catch (err) {
      errors.push({
        stage: 'parse',
        sourceId: doc.sourceId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { parsed, errors }
}
