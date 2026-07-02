import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Source } from '@prisma/client'
import type { RawItem } from '../types'

type FixtureFile = {
  items: { id: string; url: string; title: string; content: string; publishedAt: string }[]
}

/** Reads a bundled fixture corpus. Refuses any path outside the fixtures/ directory. */
export async function collectFixture(source: Source): Promise<RawItem[]> {
  if (!source.url) throw new Error(`Fixture source ${source.name} has no url`)
  const fixturesRoot = path.resolve(process.cwd(), 'fixtures')
  const resolved = path.resolve(process.cwd(), source.url)
  if (!resolved.startsWith(fixturesRoot + path.sep)) {
    throw new Error(`Fixture path resolves outside fixtures/: ${source.url}`)
  }
  const parsed = JSON.parse(await readFile(resolved, 'utf8')) as FixtureFile
  return parsed.items.map((item) => ({
    url: item.url,
    title: item.title,
    content: `${item.title}\n\n${item.content}`,
    publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
  }))
}
