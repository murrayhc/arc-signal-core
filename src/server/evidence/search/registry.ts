import type { SearchAdapterStatus } from '@/shared/enums'

export type SearchDoc = {
  url: string
  title: string
  content: string
  publishedAt?: Date | null
  /** Optional human name of the originating outlet, used to label the synthetic
   *  Source the ingested document is attached to. */
  sourceName?: string
}

export type SearchQuery = { queryText: string; queryClass: string }

/** A pluggable evidence source for the investigation loop. Mirrors the market
 *  provider abstraction: real adapters and test doubles both implement it. */
export interface SearchAdapter {
  name: string
  status(): SearchAdapterStatus
  search(query: SearchQuery, opts?: { limit?: number }): Promise<SearchDoc[]>
}

export class NoSearchAdapterConfiguredError extends Error {
  constructor(message = 'No search adapter is configured — investigation is dormant.') {
    super(message)
    this.name = 'NoSearchAdapterConfiguredError'
  }
}

/** Always-dormant adapter. search() throws so callers degrade uniformly. */
export const NullSearchAdapter: SearchAdapter = {
  name: 'null-search',
  status: () => 'NOT_CONFIGURED',
  async search() {
    throw new NoSearchAdapterConfiguredError()
  },
}

/** Empty by construction — this pass ships NO working web-search connector
 *  (owner decision). A real adapter (e.g. Brave/Tavily, key-gated) is
 *  registered here in a later pass; the investigation loop then reaches the
 *  open web with no other change. Mirrors the dormant market provider registry. */
export const SEARCH_ADAPTER_REGISTRY: Record<string, () => SearchAdapter> = {}

/** Returns only adapters that report themselves CONFIGURED. Empty today. */
export function getActiveSearchAdapters(): SearchAdapter[] {
  return Object.values(SEARCH_ADAPTER_REGISTRY)
    .map((build) => build())
    .filter((a) => a.status() === 'CONFIGURED')
}
