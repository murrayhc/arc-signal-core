import type { Source } from '@prisma/client'
import type { RawItem } from '../types'
import { collectContractsFinder } from './contracts-finder'
import { collectFixture } from './fixture'
import { collectGdelt } from './gdelt'
import { collectRss } from './rss'

export type Collector = (source: Source) => Promise<RawItem[]>

export type CollectorEntry = { collect: Collector; documentType: string }

const COLLECTORS: Record<string, CollectorEntry> = {
  FIXTURE: { collect: collectFixture, documentType: 'FIXTURE_ITEM' },
  // RSS handles RSS 2.0, Atom and RDF feeds (news, regulators, GOV.UK).
  RSS: { collect: collectRss, documentType: 'RSS_ITEM' },
  // Keyless global news index — one standing query per source.
  GDELT: { collect: collectGdelt, documentType: 'GDELT_ARTICLE' },
  // UK public procurement notices (OCDS releases) — primary demand signal.
  CONTRACTS_FINDER: { collect: collectContractsFinder, documentType: 'PROCUREMENT_NOTICE' },
}

/** Returns the collector entry for an access method, or null when unsupported. */
export function getCollector(accessMethod: string): CollectorEntry | null {
  return COLLECTORS[accessMethod] ?? null
}
