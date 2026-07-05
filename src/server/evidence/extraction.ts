import { z } from 'zod'
import type { AtomicClaim, Document, ParsedDocument, Source } from '@prisma/client'
import { prisma } from '@/server/db'
import { ATOMIC_CLAIM_TYPES, type AtomicClaimType, type FactualityLabel } from '@/shared/enums'
import { runLLMTask } from '@/server/llm/run'
import type { LLMProvider } from '@/server/llm/types'
import type { EvidenceError } from './types'
import {
  ATOMIC_MATCHERS,
  detectSectors,
  detectRegions,
  detectCommodities,
  detectInstruments,
  hasOpinionMarker,
} from './matchers'

const MAX_CLAIM_TEXT = 300
const ATOMIC_TYPE_SET = new Set<string>(ATOMIC_CLAIM_TYPES)

export type ExtractedAtomicClaim = {
  claimType: AtomicClaimType
  claimText: string
  extractionConfidence: number
  specificityScore: number
  factualityLabel: FactualityLabel
  entities: string[]
  sectors: string[]
  regions: string[]
  commodities: string[]
  instruments: string[]
  isCommentary: boolean
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function computeSpecificity(sentence: string, entityCount: number): number {
  let score = 0.2
  if (/\d/.test(sentence)) score += 0.3
  if (/\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b|\bq[1-4]\b|quarter/i.test(sentence)) {
    score += 0.2
  }
  if (entityCount > 0) score += 0.3
  return Math.max(0.1, Math.min(1, score))
}

const CAP_STOPWORDS = new Set(['The', 'A', 'An', 'This', 'That', 'These', 'Those', 'It', 'They', 'But', 'And', 'On', 'In', 'At', 'For', 'When', 'While'])

/** Naive display-only entity capture: mentioned entities present in the
 *  sentence, plus capitalised multi-word sequences. Same spirit as parse.ts. */
function extractEntities(sentence: string, mentioned: string[]): string[] {
  const found = new Set<string>()
  const lower = sentence.toLowerCase()
  for (const m of mentioned) {
    if (m && lower.includes(m.toLowerCase())) found.add(m)
  }
  const caps = sentence.match(/\b[A-Z][a-zA-Z0-9&.'’-]+(?:\s+[A-Z][a-zA-Z0-9&.'’-]+)*\b/g) ?? []
  for (const c of caps) {
    if (!c.includes(' ') && CAP_STOPWORDS.has(c)) continue
    if (c.length >= 3) found.add(c)
  }
  return [...found].slice(0, 8)
}

function detectWithFallback(sentence: string, fullText: string, fn: (t: string) => string[]): string[] {
  const perSentence = fn(sentence)
  return perSentence.length > 0 ? perSentence : fn(fullText)
}

/** Pure: parsed body text → many discrete atomic claims. One claim per
 *  (sentence, matched type); the generic COMPANY_STATEMENT is dropped when a
 *  more specific type matched the same sentence. */
export function extractAtomicClaimsFromText(bodyText: string, mentionedEntities: string[] = []): ExtractedAtomicClaim[] {
  const sentences = splitSentences(bodyText)
  const out: ExtractedAtomicClaim[] = []
  for (const sentence of sentences) {
    const matched = ATOMIC_MATCHERS.filter((m) => m.pattern.test(sentence))
    if (matched.length === 0) continue
    const specific = matched.filter((m) => m.claimType !== 'COMPANY_STATEMENT')
    const chosen = specific.length > 0 ? specific : matched
    for (const matcher of chosen) {
      const entities = extractEntities(sentence, mentionedEntities)
      const hasDigit = /\d/.test(sentence)
      const extractionConfidence = Math.min(0.9, matcher.baseConfidence + (hasDigit ? 0.1 : 0))
      const factualityLabel: FactualityLabel = extractionConfidence < 0.5 ? 'NEEDS_REVIEW' : 'UNVERIFIED'
      out.push({
        claimType: matcher.claimType,
        claimText: sentence.slice(0, MAX_CLAIM_TEXT),
        extractionConfidence,
        specificityScore: computeSpecificity(sentence, entities.length),
        factualityLabel,
        entities,
        sectors: detectWithFallback(sentence, bodyText, detectSectors),
        regions: detectWithFallback(sentence, bodyText, detectRegions),
        commodities: detectWithFallback(sentence, bodyText, detectCommodities),
        instruments: detectInstruments(sentence),
        isCommentary: hasOpinionMarker(sentence),
      })
    }
  }
  return out
}

const LlmExtractionSchema = z.object({
  documentId: z.string(),
  claims: z
    .array(
      z.object({
        claimText: z.string().min(3),
        claimType: z.string(),
      }),
    )
    .max(20),
})

const LLM_EXTRACTION_SYSTEM =
  'You extract short, discrete, testable factual claims from a news document. ' +
  'Return ONLY JSON: {"documentId": string, "claims": [{"claimText": string, "claimType": string}]}. ' +
  'Never invent facts. Echo the provided documentId exactly.'

function coerceClaimType(raw: string): AtomicClaimType {
  const up = raw.toUpperCase()
  return (ATOMIC_TYPE_SET.has(up) ? up : 'UNKNOWN') as AtomicClaimType
}

/** Dormant-by-default LLM assist. Only reached when a provider is explicitly
 *  injected AND deterministic rules found nothing. Schema-validated and
 *  grounded (output must echo the documentId); invalid output → no claims. */
async function llmAssist(parsed: ParsedDocument, doc: Document, provider: LLMProvider): Promise<ExtractedAtomicClaim[]> {
  const result = await runLLMTask(
    {
      taskType: 'CLAIM_EXTRACTION_ASSIST',
      system: LLM_EXTRACTION_SYSTEM,
      prompt: `documentId: ${doc.id}\n\n${parsed.bodyText.slice(0, 6000)}`,
    },
    { provider, validate: { schema: LlmExtractionSchema, evidenceIds: [doc.id], requireGrounding: true } },
  )
  if (result.status !== 'SUCCEEDED' || !result.parsed) return []
  const parsedOut = result.parsed as z.infer<typeof LlmExtractionSchema>
  return parsedOut.claims.map((c) => ({
    claimType: coerceClaimType(c.claimType),
    claimText: c.claimText.slice(0, MAX_CLAIM_TEXT),
    extractionConfidence: 0.5,
    specificityScore: computeSpecificity(c.claimText, 0),
    factualityLabel: 'NEEDS_REVIEW' as FactualityLabel,
    entities: [],
    sectors: detectSectors(c.claimText),
    regions: detectRegions(c.claimText),
    commodities: detectCommodities(c.claimText),
    instruments: detectInstruments(c.claimText),
    isCommentary: hasOpinionMarker(c.claimText),
  }))
}

export type ExtractionOptions = {
  /** Inject a provider to enable the dormant LLM assist. Omit to stay
   *  deterministic-only (the scan default). */
  llmProvider?: LLMProvider
}

/** Persists atomic claims for each parsed document. Deterministic-first;
 *  LLM assist only when a provider is injected and rules yield nothing. */
export async function extractAtomicClaims(
  parsedDocs: ParsedDocument[],
  docsById: Map<string, Document>,
  sourcesById: Map<string, Source>,
  opts: ExtractionOptions = {},
): Promise<{ atomicClaims: AtomicClaim[]; errors: EvidenceError[] }> {
  const atomicClaims: AtomicClaim[] = []
  const errors: EvidenceError[] = []
  for (const parsed of parsedDocs) {
    if (parsed.status !== 'PARSED') continue
    const doc = docsById.get(parsed.documentId)
    if (!doc) {
      errors.push({ stage: 'atomic-extraction', message: `No document for parsed doc ${parsed.id}`, documentId: parsed.documentId })
      continue
    }
    let mentioned: string[] = []
    try {
      const j = JSON.parse(parsed.entitiesMentionedJson)
      if (Array.isArray(j)) mentioned = j.filter((x): x is string => typeof x === 'string')
    } catch {
      mentioned = []
    }
    const eventDate = parsed.publishedAt ?? doc.publishedAt ?? doc.fetchedAt
    try {
      let extracted = extractAtomicClaimsFromText(parsed.bodyText, mentioned)
      let method = 'rule:v2'
      if (extracted.length === 0 && opts.llmProvider && parsed.bodyText.trim().length > 40) {
        extracted = await llmAssist(parsed, doc, opts.llmProvider)
        method = 'llm'
      }
      for (const e of extracted) {
        atomicClaims.push(
          await prisma.atomicClaim.create({
            data: {
              documentId: doc.id,
              sourceId: doc.sourceId,
              claimText: e.claimText,
              claimType: e.claimType,
              entitiesJson: JSON.stringify(e.entities),
              sectorsJson: JSON.stringify(e.sectors),
              regionsJson: JSON.stringify(e.regions),
              commoditiesJson: JSON.stringify(e.commodities),
              instrumentsJson: JSON.stringify(e.instruments),
              eventDate,
              extractionMethod: method === 'llm' ? 'llm:CLAIM_EXTRACTION_ASSIST' : `rule:v2:${e.claimType}`,
              extractionConfidence: e.extractionConfidence,
              specificityScore: e.specificityScore,
              factualityLabel: e.factualityLabel,
              metadataJson: JSON.stringify({ commentary: e.isCommentary }),
            },
          }),
        )
      }
    } catch (err) {
      errors.push({ stage: 'atomic-extraction', message: err instanceof Error ? err.message : String(err), documentId: doc.id })
    }
  }
  return { atomicClaims, errors }
}
