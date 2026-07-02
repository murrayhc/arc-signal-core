import type { Source } from '@prisma/client'
import type { RawItem } from '../types'
import { collectFixture } from './fixture'
import { collectRss } from './rss'

export type Collector = (source: Source) => Promise<RawItem[]>

const COLLECTORS: Record<string, Collector> = {
  FIXTURE: collectFixture,
  RSS: collectRss,
}

/** Returns the collector for an access method, or null when unsupported. */
export function getCollector(accessMethod: string): Collector | null {
  return COLLECTORS[accessMethod] ?? null
}
