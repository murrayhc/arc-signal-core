import { z } from 'zod'
import { prisma } from '@/server/db'
import { enrichText } from '@/server/llm/enrich-text'
import { getActiveProvider } from '@/server/llm/provider'
import type { LLMProvider } from '@/server/llm/types'
import type { EnrichmentResult } from './types'

const NarrativeSchema = z.object({
  historic: z.string().min(1),
  present: z.string().min(1),
  future: z.string().min(1),
  executive: z.string().min(1),
})

const IMPACT_SYSTEM =
  'You explain, in two or three sentences, why a specifically-named company may be affected by an event, ' +
  'using ONLY the facts provided. Invent no company, number, or fact not present. No investment advice of any kind. ' +
  'Hedge appropriately (may, could) and end by noting the reader should verify against primary sources.'

const CONTEXT_SYSTEM =
  'You write grounded context for an event using ONLY the facts provided. Return ONLY JSON ' +
  '{"historic":string,"present":string,"future":string,"executive":string}. "executive" is a one-sentence brief. ' +
  'Invent nothing. No investment advice, price targets, or buy/sell/hold language.'

function parseArr(json: string): string[] {
  try {
    const j = JSON.parse(json)
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** On-demand AI enrichment of ONE event's consequence view. Reasons only over
 *  the event's already-resolved impacts + evidence; never invents a company.
 *  Fail-open: any failed/rejected/dormant call leaves the deterministic row
 *  untouched. Enriched text lands in the llm* columns with an audit run id.
 *  Named-org impacts only — category impacts (entityId null) are inferential,
 *  not a specific company, so they are never enriched. */
export async function enrichEventConsequence(
  eventCandidateId: string,
  opts: { provider?: LLMProvider | null } = {},
): Promise<EnrichmentResult> {
  const provider = opts.provider === undefined ? await getActiveProvider() : opts.provider
  if (!provider) return { status: 'DORMANT', impactsEnriched: 0, contextEnriched: false, skipped: 0 }

  const event = await prisma.eventCandidate.findUnique({ where: { id: eventCandidateId } })
  if (!event) return { status: 'DORMANT', impactsEnriched: 0, contextEnriched: false, skipped: 0 }

  let impactsEnriched = 0
  let skipped = 0

  // ── Named-org impact rationale (reasoning tier). ──
  const namedImpacts = await prisma.companyImpact.findMany({ where: { eventCandidateId, entityId: { not: null } } })
  for (const impact of namedImpacts) {
    const evidenceIds = parseArr(impact.evidenceIdsJson)
    const claims = evidenceIds.length
      ? await prisma.atomicClaim.findMany({ where: { id: { in: evidenceIds } }, select: { claimText: true } })
      : []
    const facts = claims.map((c) => `- ${c.claimText}`).join('\n') || `- ${event.summary}`
    const out = await enrichText({
      taskType: 'COMPANY_IMPACT_ANALYSIS',
      system: IMPACT_SYSTEM,
      prompt: `Company: ${impact.companyName}\nEvent: ${event.summary}\nImpact direction: ${impact.impactType}\nEvidence:\n${facts}`,
      provider,
      maxTokens: 512,
    })
    if (out) {
      await prisma.companyImpact.update({
        where: { id: impact.id },
        data: { llmRationale: out.text, enrichedByLLMRunId: out.llmRunId },
      })
      impactsEnriched += 1
    } else {
      skipped += 1
    }
  }

  // ── Context narrative (creative tier), one structured call. ──
  let contextEnriched = false
  const ctx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId } })
  if (ctx) {
    const impacts = await prisma.companyImpact.findMany({ where: { eventCandidateId } })
    const named = impacts.filter((i) => i.entityId).map((i) => i.companyName)
    const out = await enrichText({
      taskType: 'PRESENT_CONTEXT',
      system: CONTEXT_SYSTEM,
      prompt:
        `Event: ${event.summary}\n` +
        `Type: ${event.eventType} (${event.eventClass})\n` +
        `Named parties in evidence: ${named.join(', ') || 'none'}\n` +
        `Deterministic present read: ${ctx.presentContext}\n` +
        `Deterministic historic read: ${ctx.historicContext}`,
      provider,
      maxTokens: 1200,
      validate: { schema: NarrativeSchema },
    })
    if (out) {
      await prisma.eventContextSynthesis.update({
        where: { eventCandidateId },
        data: { llmNarrativeJson: out.text, enrichedByLLMRunId: out.llmRunId },
      })
      contextEnriched = true
    } else {
      skipped += 1
    }
  }

  return { status: 'ENRICHED', impactsEnriched, contextEnriched, skipped }
}
