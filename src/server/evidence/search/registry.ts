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
  /** Source category this adapter reaches (NEWS/AGGREGATOR/…) — the loop's
   *  allowedSourceTypes limit filters on it. Optional for test doubles. */
  sourceType?: string
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

import { GdeltSearchAdapter } from './gdelt'

/** The investigation loop's live engines. GDELT (keyless, lawful) ships
 *  registered; further adapters (key-gated news APIs etc.) add entries here
 *  and activate via SEARCH_ADAPTERS. */
export const SEARCH_ADAPTER_REGISTRY: Record<string, () => SearchAdapter> = {
  gdelt: () => GdeltSearchAdapter,
}

/** Which adapters are enabled: SEARCH_ADAPTERS env (comma-separated names,
 *  empty string = none) when set; otherwise gdelt by default — EXCEPT under
 *  test, where the default is dormant so no test ever hits the network
 *  without explicitly injecting an adapter. */
export function enabledAdapterNames(): string[] {
  const raw = process.env.SEARCH_ADAPTERS
  if (raw !== undefined) {
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  }
  return process.env.NODE_ENV === 'test' ? [] : ['gdelt']
}

/** Returns the enabled adapters that report themselves CONFIGURED. */
export function getActiveSearchAdapters(): SearchAdapter[] {
  return enabledAdapterNames()
    .map((name) => SEARCH_ADAPTER_REGISTRY[name])
    .filter((build): build is () => SearchAdapter => !!build)
    .map((build) => build())
    .filter((a) => a.status() === 'CONFIGURED')
}
