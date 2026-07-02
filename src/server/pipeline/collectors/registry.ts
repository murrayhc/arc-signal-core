import type { Source } from '@prisma/client'
import type { RawItem } from '../types'
import { collectFixture } from './fixture'
import { collectRss } from './rss'

export type Collector = (source: Source) => Promise<RawItem[]>

export type CollectorEntry = { collect: Collector; documentType: string }

const COLLECTORS: Record<string, CollectorEntry> = {
  FIXTURE: { collect: collectFixture, documentType: 'FIXTURE_ITEM' },
  RSS: { collect: collectRss, documentType: 'RSS_ITEM' },
}

/** Returns the collector entry for an access method, or null when unsupported. */
export function getCollector(accessMethod: string): CollectorEntry | null {
  return COLLECTORS[accessMethod] ?? null
}
