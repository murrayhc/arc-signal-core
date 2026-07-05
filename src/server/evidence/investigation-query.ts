import { z } from 'zod'
import type { InvestigationQuery } from '@prisma/client'
import { prisma } from '@/server/db'
import { QUERY_CLASSES, type QueryClass } from '@/shared/enums'
import { runLLMTask } from '@/server/llm/run'
import type { LLMProvider } from '@/server/llm/types'
import { DEFAULT_INVESTIGATION_LIMITS } from './types'

const CLAIM_TYPE_WORDS: Record<string, string> = {
  LAYOFF_SIGNAL: 'layoffs',
  HIRING_CHANGE: 'hiring changes',
  REGULATORY_PRESSURE: 'regulatory pressure',
  PROCUREMENT_ACTIVITY: 'procurement activity',
  SUPPLY_CHAIN_PRESSURE: 'supply chain disruption',
  MARKET_MOVEMENT: 'market movement',
  COMMODITY_PRESSURE: 'commodity shortage',
  COMPANY_STATEMENT: 'company statement',
  EXECUTIVE_CHANGE: 'executive change',
  LEGAL_EVENT: 'legal action',
  CUSTOMER_COMPLAINT: 'customer complaints',
  DEMAND_SIGNAL: 'demand surge',
  FUNDING_SIGNAL: 'funding',
  MACRO_SIGNAL: 'macroeconomic pressure',
  UNKNOWN: 'development',
}

type QueryContext = {
  entity?: string
  sector?: string
  region?: string
  commodity?: string
  words: string
  subject: string
}

function parseArr(json: string): string[] {
  try {
    const j = JSON.parse(json)
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function uniq(items: string[]): string[] {
  return [...new Set(items.filter((s) => s && s.trim().length > 0))]
}

/** Deterministic query templates per class. The base (index 0) always includes
 *  the subject (which carries the entity where present) so every class yields at
 *  least one specific, token-preserving query. */
function queriesForClass(cls: QueryClass, ctx: QueryContext): string[] {
  const { entity, sector, region, commodity, words, subject } = ctx
  const out: string[] = []
  const push = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim()
    if (t) out.push(t)
  }
  switch (cls) {
    case 'ORIGIN_TRACE':
      push(`${subject} original source`)
      if (entity) push(`${entity} ${words} first reported`)
      break
    case 'SUPPORTING_EVIDENCE':
      push(`${subject} latest data`)
      if (sector) push(`${sector} ${words} ${region ?? ''} evidence`)
      break
    case 'CONTRADICTION':
      push(`${subject} denied or disputed`)
      if (entity) push(`${entity} ${words} contradiction`)
      break
    case 'AFFECTED_ENTITIES':
      push(`companies affected by ${subject}`)
      if (commodity) push(`companies exposed to ${commodity} ${region ?? ''} supply`)
      break
    case 'BENEFICIARY_SEARCH':
      push(`who benefits from ${subject}`)
      if (sector) push(`${sector} companies gaining from ${words}`)
      break
    case 'HARMED_PARTY_SEARCH':
      push(`who is harmed by ${subject}`)
      if (sector) push(`${sector} suppliers exposed to ${words}`)
      break
    case 'HISTORIC_ANALOGUE':
      push(`${subject} historic precedent winners losers`)
      if (commodity) push(`past ${commodity} ${words} outcome`)
      break
    case 'FUTURE_SCENARIO_SIGNAL':
      push(`${subject} what happens next watch signals`)
      if (sector) push(`${sector} ${region ?? ''} ${words} forecast`)
      break
  }
  return out
}

async function buildContext(canonicalClaimId: string, claimType: string, claimText: string): Promise<QueryContext> {
  const atomics = await prisma.atomicClaim.findMany({ where: { canonicalClaimId } })
  const entity = uniq(atomics.flatMap((a) => parseArr(a.entitiesJson)))[0]
  const sector = uniq(atomics.flatMap((a) => parseArr(a.sectorsJson)))[0]
  const region = uniq(atomics.flatMap((a) => parseArr(a.regionsJson)))[0]
  const commodity = uniq(atomics.flatMap((a) => parseArr(a.commoditiesJson)))[0]
  const words = CLAIM_TYPE_WORDS[claimType] ?? 'development'
  const anchor = entity ?? commodity ?? sector ?? firstKeywords(claimText)
  const subject = `${anchor} ${words}`.replace(/\s+/g, ' ').trim()
  return { entity, sector, region, commodity, words, subject }
}

function firstKeywords(text: string): string {
  return text
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .join(' ')
}

const LlmQuerySchema = z.object({
  queries: z.array(z.object({ queryText: z.string().min(3), queryClass: z.string() })).max(20),
})

const QUERY_CLASS_SET = new Set<string>(QUERY_CLASSES)

function coerceClass(raw: string): QueryClass {
  return (QUERY_CLASS_SET.has(raw) ? raw : 'SUPPORTING_EVIDENCE') as QueryClass
}

export type QueryGenOptions = { max?: number; provider?: LLMProvider }

/** Generates and persists follow-up investigation queries for a canonical
 *  claim across all query classes. Deterministic templates by default; an
 *  injected provider yields structured, validated LLM queries instead. */
export async function generateQueriesForCanonical(
  canonicalClaimId: string,
  opts: QueryGenOptions = {},
): Promise<InvestigationQuery[]> {
  const canonical = await prisma.canonicalClaim.findUnique({ where: { id: canonicalClaimId } })
  if (!canonical) return []
  const max = opts.max ?? DEFAULT_INVESTIGATION_LIMITS.maxQueriesPerClaim
  const ctx = await buildContext(canonicalClaimId, canonical.claimType, canonical.claimText)

  let pairs: { queryClass: QueryClass; queryText: string }[] = []
  let generatedBy = 'DETERMINISTIC'

  if (opts.provider) {
    const llm = await llmQueries(canonical.claimText, ctx, opts.provider)
    if (llm.length > 0) {
      pairs = llm
      generatedBy = 'LLM'
    }
  }

  if (pairs.length === 0) {
    const perClass = QUERY_CLASSES.map((cls) => ({ cls, qs: queriesForClass(cls, ctx) }))
    for (const { cls, qs } of perClass) if (qs[0]) pairs.push({ queryClass: cls, queryText: qs[0] })
    for (const { cls, qs } of perClass) for (const q of qs.slice(1)) pairs.push({ queryClass: cls, queryText: q })
  }

  const seen = new Set<string>()
  const created: InvestigationQuery[] = []
  for (const pair of pairs) {
    const key = pair.queryText.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    created.push(
      await prisma.investigationQuery.create({
        data: {
          canonicalClaimId,
          queryText: pair.queryText,
          queryClass: pair.queryClass,
          status: 'GENERATED',
          metadataJson: JSON.stringify({ generatedBy }),
        },
      }),
    )
    if (created.length >= max) break
  }
  return created
}

async function llmQueries(
  claimText: string,
  ctx: QueryContext,
  provider: LLMProvider,
): Promise<{ queryClass: QueryClass; queryText: string }[]> {
  const result = await runLLMTask(
    {
      taskType: 'INVESTIGATION_QUERY_GENERATION',
      system:
        'You generate specific follow-up search queries to verify or challenge a claim. ' +
        `Return ONLY JSON {"queries":[{"queryText":string,"queryClass":string}]} using classes: ${QUERY_CLASSES.join(', ')}. ` +
        'Queries must be specific and preserve the entity, sector and region. No speculation.',
      prompt: `Claim: ${claimText}\nEntity: ${ctx.entity ?? ''}\nSector: ${ctx.sector ?? ''}\nRegion: ${ctx.region ?? ''}`,
    },
    { provider, validate: { schema: LlmQuerySchema } },
  )
  if (result.status !== 'SUCCEEDED' || !result.parsed) return []
  const parsed = result.parsed as z.infer<typeof LlmQuerySchema>
  return parsed.queries.map((q) => ({ queryClass: coerceClass(q.queryClass), queryText: q.queryText }))
}
