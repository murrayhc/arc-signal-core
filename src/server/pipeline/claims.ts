import type { Claim, Document, ParsedDocument } from '@prisma/client'
import { prisma } from '@/server/db'
import type { ClaimType } from '@/shared/enums'
import type { PipelineError } from './types'

type Matcher = { claimType: ClaimType; pattern: RegExp; baseConfidence: number }

/** Rule table v1. Order matters only for readability; every matcher runs per sentence. */
const MATCHERS: Matcher[] = [
  { claimType: 'LAYOFF_MENTION', pattern: /\b(lay[- ]?offs?|redundanc(?:y|ies)|job cuts?|cutting \d+ (?:jobs|roles)|shed(?:ding)? hundreds of roles|workforce reduction|reduce (?:its|the) .{0,20}workforce)\b/i, baseConfidence: 0.75 },
  { claimType: 'FUNDING_MENTION', pattern: /\b(funding round|series [a-d]\b|raise[sd]? [£$€]?\d+|venture capital|investment round)\b/i, baseConfidence: 0.7 },
  { claimType: 'EXECUTIVE_CHANGE', pattern: /\b(chief executive|ceo|cfo|coo|chair(?:man|woman)?)\b.{0,60}\b(resign|step(?:s|ped)? down|depart|appoint|join|exit)/i, baseConfidence: 0.7 },
  { claimType: 'HIRING_CHANGE', pattern: /\b(hiring (?:surge|freeze|spree)|recruitment (?:drive|freeze)|headcount)\b/i, baseConfidence: 0.45 },
  { claimType: 'REGULATORY_EVENT', pattern: /\b(regulator|watchdog|fine[ds]?\b|investigation|inquiry|compliance obligations?|new rules|legislation)\b/i, baseConfidence: 0.6 },
  { claimType: 'PROCUREMENT_EVENT', pattern: /\b(procurement|tender|public contract|framework agreement|contract award|highways? (?:tender|award))\b/i, baseConfidence: 0.7 },
  { claimType: 'SUPPLY_CHAIN_EVENT', pattern: /\b(supply chain|component shortage|port delays|shipping disruption|freight backlog)\b/i, baseConfidence: 0.65 },
  { claimType: 'MARKET_DEMAND_EVENT', pattern: /\b(demand (?:surge|spike|growth)|record orders|sales (?:jump|surge))\b/i, baseConfidence: 0.65 },
  { claimType: 'FINANCIAL_RESULT', pattern: /\b(profit warning|quarterly (?:results|earnings)|revenue (?:fell|rose|grew)|losses widened)\b/i, baseConfidence: 0.65 },
  { claimType: 'LEGAL_EVENT', pattern: /\b(lawsuit|court ruling|sued|legal action|litigation)\b/i, baseConfidence: 0.6 },
]

const SECTORS: Record<string, RegExp> = {
  technology: /\b(tech(?:nology)? (?:firm|manufacturer|supplier|company)|software|semiconductor|grid systems)\b/i,
  retail: /\b(retail|high street|supermarket|merchants?|checkout)\b/i,
  energy: /\b(energy|solar|oil|gas|renewables|inverters|grid storage)\b/i,
  healthcare: /\b(health(?:care)?|hospital|pharma)\b/i,
  logistics: /\b(logistics|shipping|freight|supply chain)\b/i,
  'public-sector': /\b(council|local authority|public contract|procurement|tender|government)\b/i,
}

const REGIONS: Record<string, RegExp> = {
  UK: /\b(UK|United Kingdom|Britain|Manchester|London)\b/,
  EU: /\b(EU|Europe|European)\b/,
  US: /\b(US|United States|America)\b/,
}

export function detectSector(text: string): string | null {
  for (const [sector, pattern] of Object.entries(SECTORS)) if (pattern.test(text)) return sector
  return null
}

export function detectRegion(text: string): string | null {
  for (const [region, pattern] of Object.entries(REGIONS)) if (pattern.test(text)) return region
  return null
}

export type ExtractedClaim = {
  claimType: ClaimType
  claimText: string
  extractionConfidence: number
  sector: string | null
  region: string | null
}

/** Pure sentence-level rule matching. One claim per (sentence, claimType) match. */
export function extractClaimsFromText(bodyText: string): ExtractedClaim[] {
  const text = bodyText.trim()
  if (!text) return []
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 0)
  const claims: ExtractedClaim[] = []
  for (const sentence of sentences) {
    for (const matcher of MATCHERS) {
      if (!matcher.pattern.test(sentence)) continue
      const digitBonus = /\d/.test(sentence) ? 0.1 : 0
      claims.push({
        claimType: matcher.claimType,
        claimText: sentence.trim().slice(0, 300),
        extractionConfidence: Math.min(0.9, matcher.baseConfidence + digitBonus),
        sector: detectSector(sentence) ?? detectSector(text),
        region: detectRegion(sentence) ?? detectRegion(text),
      })
    }
  }
  return claims
}

export async function extractClaims(
  parsedDocs: ParsedDocument[],
  docsById: Map<string, Document>,
): Promise<{ claims: Claim[]; errors: PipelineError[] }> {
  const claims: Claim[] = []
  const errors: PipelineError[] = []
  for (const parsed of parsedDocs) {
    if (parsed.status !== 'PARSED') continue
    const doc = docsById.get(parsed.documentId)
    if (!doc) {
      errors.push({ stage: 'claims', message: `No document loaded for parsed doc ${parsed.id}` })
      continue
    }
    try {
      for (const extracted of extractClaimsFromText(parsed.bodyText)) {
        claims.push(
          await prisma.claim.create({
            data: {
              documentId: doc.id,
              claimType: extracted.claimType,
              claimText: extracted.claimText,
              claimDate: parsed.publishedAt ?? doc.fetchedAt,
              sector: extracted.sector,
              region: extracted.region,
              extractionMethod: `rule:v1:${extracted.claimType}`,
              extractionConfidence: extracted.extractionConfidence,
              credibilityScore: 0.7,
              needsReview: extracted.extractionConfidence < 0.5,
              isFixture: doc.isFixture,
            },
          }),
        )
      }
    } catch (err) {
      errors.push({
        stage: 'claims',
        sourceId: doc.sourceId,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { claims, errors }
}
