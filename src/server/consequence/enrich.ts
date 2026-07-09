import { z } from 'zod'
import { prisma } from '@/server/db'
import { enrichText } from '@/server/llm/enrich-text'
import { getActiveProvider } from '@/server/llm/provider'
import type { LLMProvider } from '@/server/llm/types'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import type { EnrichmentResult } from './types'

const NarrativeSchema = z.object({
  historic: z.string().min(1),
  present: z.string().min(1),
  future: z.string().min(1),
  executive: z.string().min(1),
  /** The evidence ids the narrative actually relied on — the grounding gate in
   *  validateLLMOutput checks these appear among the supplied ids. */
  citedEvidenceIds: z.array(z.string()).min(1),
})

const ImpactRationaleSchema = z.object({
  rationale: z.string().min(1),
  citedEvidenceIds: z.array(z.string()).min(1),
})

const IMPACT_SYSTEM =
  'You explain, in two or three sentences, why a specifically-named company may be affected by an event, ' +
  'using ONLY the evidence lines provided (each is prefixed with its id in square brackets). ' +
  'Invent no company, number, or fact not present. No investment advice of any kind. ' +
  'Hedge appropriately (may, could) and end by noting the reader should verify against primary sources. ' +
  'Return ONLY JSON {"rationale":string,"citedEvidenceIds":string[]} where citedEvidenceIds lists the ids of the evidence lines you relied on.'

const CONTEXT_SYSTEM =
  'You write grounded context for an event using ONLY the facts provided (evidence lines are prefixed with their id in square brackets). Return ONLY JSON ' +
  '{"historic":string,"present":string,"future":string,"executive":string,"citedEvidenceIds":string[]}. "executive" is a one-sentence brief; ' +
  'citedEvidenceIds lists the ids of the evidence lines you relied on. ' +
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

  // Per-event cooldown: skip a re-spend if this event was enriched recently.
  const cooldownMin = Number(process.env.ENRICH_COOLDOWN_MINUTES ?? 60)
  const priorCtx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId } })
  if (priorCtx?.enrichedByLLMRunId && Date.now() - priorCtx.updatedAt.getTime() < cooldownMin * 60_000) {
    return { status: 'COOLDOWN', impactsEnriched: 0, contextEnriched: false, skipped: 0 }
  }

  let impactsEnriched = 0
  let skipped = 0

  // ── Named-org impact rationale (reasoning tier). ──
  const namedImpacts = await prisma.companyImpact.findMany({ where: { eventCandidateId, entityId: { not: null } } })
  for (const impact of namedImpacts) {
    const evidenceIds = parseArr(impact.evidenceIdsJson)
    const claims = evidenceIds.length
      ? await prisma.atomicClaim.findMany({ where: { id: { in: evidenceIds } }, select: { id: true, claimText: true } })
      : []
    // No claim evidence → grounding is impossible → do not enrich (fail-open:
    // the deterministic pathway text stands). Never reason over thin air.
    if (claims.length === 0) {
      skipped += 1
      continue
    }
    const claimIds = claims.map((c) => c.id)
    const facts = claims.map((c) => `- [${c.id}] ${c.claimText}`).join('\n')
    const out = await enrichText({
      taskType: 'COMPANY_IMPACT_ANALYSIS',
      system: IMPACT_SYSTEM,
      prompt: `Company: ${impact.companyName}\nEvent: ${event.summary}\nImpact direction: ${impact.impactType}\nEvidence:\n${facts}`,
      provider,
      maxTokens: 512,
      validate: { schema: ImpactRationaleSchema, evidenceIds: claimIds, requireGrounding: true },
    })
    const parsed = out?.parsed as z.infer<typeof ImpactRationaleSchema> | undefined
    if (out && parsed) {
      // Re-guard the PARSED rationale before persisting: JSON escape sequences
      // decouple the raw text the validator scanned from the decoded string we
      // store — same defence-in-depth as the playbook path.
      try {
        assertNoAdviceLanguage(parsed.rationale, 'CompanyImpact.llmRationale(parsed)')
      } catch {
        skipped += 1
        continue
      }
      await prisma.companyImpact.update({
        where: { id: impact.id },
        data: { llmRationale: parsed.rationale, enrichedByLLMRunId: out.llmRunId },
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
    // Ground the narrative in the same claim evidence the impacts rest on.
    const ctxEvidenceIds = [...new Set(impacts.flatMap((i) => parseArr(i.evidenceIdsJson)))]
    const ctxClaims = ctxEvidenceIds.length
      ? await prisma.atomicClaim.findMany({ where: { id: { in: ctxEvidenceIds } }, select: { id: true, claimText: true } })
      : []
    if (ctxClaims.length === 0) {
      // No claim evidence → grounding impossible → keep the deterministic
      // narrative rather than synthesising from thin air.
      skipped += 1
    } else {
      const ctxClaimIds = ctxClaims.map((c) => c.id)
      const evidenceLines = ctxClaims.map((c) => `- [${c.id}] ${c.claimText}`).join('\n')
      const out = await enrichText({
        taskType: 'PRESENT_CONTEXT',
        system: CONTEXT_SYSTEM,
        prompt:
          `Event: ${event.summary}\n` +
          `Type: ${event.eventType} (${event.eventClass})\n` +
          `Named parties in evidence: ${named.join(', ') || 'none'}\n` +
          `Evidence:\n${evidenceLines}\n` +
          `Deterministic present read: ${ctx.presentContext}\n` +
          `Deterministic historic read: ${ctx.historicContext}`,
        provider,
        maxTokens: 1200,
        validate: { schema: NarrativeSchema, evidenceIds: ctxClaimIds, requireGrounding: true },
      })
      const parsedCtx = out?.parsed as z.infer<typeof NarrativeSchema> | undefined
      if (out && parsedCtx) {
        // Re-guard every PARSED narrative field before persisting (JSON escapes
        // decouple raw-scanned text from what we store) — fail-open on any hit.
        try {
          for (const field of [parsedCtx.historic, parsedCtx.present, parsedCtx.future, parsedCtx.executive]) {
            assertNoAdviceLanguage(field, 'EventContextSynthesis.llmNarrative(parsed)')
          }
          await prisma.eventContextSynthesis.update({
            where: { eventCandidateId },
            data: { llmNarrativeJson: out.text, enrichedByLLMRunId: out.llmRunId },
          })
          contextEnriched = true
        } catch {
          skipped += 1
        }
      } else {
        skipped += 1
      }
    }
  }

  return { status: 'ENRICHED', impactsEnriched, contextEnriched, skipped }
}
