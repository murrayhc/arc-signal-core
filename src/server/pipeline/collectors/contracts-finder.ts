import type { Source } from '@prisma/client'
import { safeFetchText } from '@/server/net/safe-fetch'
import type { RawItem } from '../types'

/**
 * UK Contracts Finder collector — public procurement notices via the
 * Open Contracting Data Standard (OCDS) search endpoint
 * (contractsfinder.service.gov.uk/Published/Notices/OCDS/Search). Keyless
 * and lawful. The source's `url` IS the full query URL (stage/date filters
 * belong there), so different procurement watchlists are just different
 * sources. Each OCDS release becomes one document carrying the tender
 * title, description, buyer and value — primary public-sector demand
 * signal, not press coverage of it.
 */

type OcdsRelease = {
  ocid?: unknown
  id?: unknown
  date?: unknown
  tender?: {
    title?: unknown
    description?: unknown
    value?: { amount?: unknown; currency?: unknown }
    tenderPeriod?: { endDate?: unknown }
  }
  buyer?: { name?: unknown }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** Pure OCDS search JSON → RawItem[]. Defensive: unknown shapes yield [],
 *  malformed releases are skipped item-by-item, never a crash. */
export function parseOcdsJson(json: string): RawItem[] {
  let doc: unknown
  try {
    doc = JSON.parse(json)
  } catch {
    return []
  }
  // The endpoint returns either {results: [{releases: [...]}]} or a plain
  // {releases: [...]} page depending on query shape — accept both.
  const root = doc as { results?: unknown; releases?: unknown }
  const packets = Array.isArray(root.results) ? (root.results as { releases?: unknown }[]) : [root]
  const items: RawItem[] = []
  for (const packet of packets) {
    const releases = Array.isArray(packet.releases) ? (packet.releases as OcdsRelease[]) : []
    for (const rel of releases) {
      const ocid = str(rel.ocid)
      const title = str(rel.tender?.title)
      if (!ocid || !title) continue
      const description = str(rel.tender?.description)
      const buyer = str(rel.buyer?.name)
      const amount = rel.tender?.value?.amount
      const currency = str(rel.tender?.value?.currency)
      const closes = str(rel.tender?.tenderPeriod?.endDate)
      const valueLine =
        typeof amount === 'number' && currency ? `Value: ${currency} ${amount.toLocaleString('en-GB')}.` : ''
      const lines = [
        title,
        '',
        description,
        buyer && `Buyer: ${buyer}.`,
        valueLine,
        closes && `Tender period ends ${closes}.`,
      ].filter((l) => l !== undefined && l !== '')
      items.push({
        // Stable public notice URL keyed by the OCDS id.
        url: `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(str(rel.id) || ocid)}`,
        title: `Procurement notice: ${title}`,
        content: lines.join('\n'),
        publishedAt: rel.date ? new Date(str(rel.date)) : null,
      })
    }
  }
  return items.map((i) => ({
    ...i,
    publishedAt: i.publishedAt && !Number.isNaN(i.publishedAt.getTime()) ? i.publishedAt : null,
  }))
}

export async function collectContractsFinder(source: Source): Promise<RawItem[]> {
  if (!source.url) throw new Error(`Contracts Finder source ${source.name} has no url`)
  const json = await safeFetchText(source.url, { timeoutMs: 15_000 })
  return parseOcdsJson(json)
}
