import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { parseDocuments } from '@/server/pipeline/parse'
import { resetDb } from '../helpers'
import { makeDocument, makeSource } from '../factories'

describe('parseDocuments', () => {
  beforeEach(resetDb)

  it('parses a supported document into normalised body text', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id, {
      rawContent:
        'Meridian Grid Systems cuts jobs\n\nMeridian Grid Systems said it is <b>cutting 400 jobs</b> in Manchester.',
      publishedAt: new Date('2026-06-28T09:00:00Z'),
    })
    const { parsed, errors } = await parseDocuments([doc])
    expect(errors).toHaveLength(0)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].status).toBe('PARSED')
    expect(parsed[0].bodyText).toContain('cutting 400 jobs')
    expect(parsed[0].bodyText).not.toContain('<b>')
    expect(parsed[0].publishedAt?.toISOString()).toBe('2026-06-28T09:00:00.000Z')
    const mentions = JSON.parse(parsed[0].entitiesMentionedJson) as string[]
    expect(mentions).toContain('Meridian Grid Systems')
  })

  it('marks unsupported document types as UNSUPPORTED instead of ignoring them', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id, { documentType: 'PDF' })
    const { parsed, errors } = await parseDocuments([doc])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].status).toBe('UNSUPPORTED')
    expect(errors.some((e) => e.stage === 'parse' && e.message.includes('PDF'))).toBe(true)
  })

  it('does not create a second ParsedDocument for an already-parsed document', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    await parseDocuments([doc])
    const second = await parseDocuments([doc])
    expect(second.parsed).toHaveLength(0)
    expect(await prisma.parsedDocument.count()).toBe(1)
  })
})
