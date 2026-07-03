import { z } from 'zod'
import type { OpportunityCard, OpportunityPlaybook } from '@prisma/client'
import { prisma } from '@/server/db'
import { assertNoAdviceLanguage, findAdviceLanguage } from '@/server/safety/advice-language'
import { runLLMTask } from '@/server/llm/run'
import { getActiveProvider } from '@/server/llm/provider'
import type { LLMProvider } from '@/server/llm/types'
import type { OpportunityType } from '@/shared/enums'

/** Extra guardrail beyond the general advice-language guard: no generated
 *  playbook field may promise a guaranteed commercial outcome. Deliberately
 *  narrow — the advice-language guard already blocks buy/sell/hold framing;
 *  this catches sales-outcome overpromising that guard doesn't cover. */
const GUARANTEED_OUTCOME_PATTERNS: RegExp[] = [
  /\bguaranteed\s+conversion\b/i,
  /\bwill\s+close\b/i,
  /\bguaranteed\b/i,
]

export function findGuaranteedOutcomeLanguage(text: string): string[] {
  const matches: string[] = []
  for (const pattern of GUARANTEED_OUTCOME_PATTERNS) {
    const m = text.match(pattern)
    if (m) matches.push(m[0])
  }
  return matches
}

function assertGuardClean(text: string, context: string): void {
  assertNoAdviceLanguage(text, context)
  const outcomeMatches = findGuaranteedOutcomeLanguage(text)
  if (outcomeMatches.length > 0) {
    throw new Error(`Prohibited guaranteed-outcome language in ${context}: ${outcomeMatches.join('; ')}`)
  }
}

function isGuardClean(text: string): boolean {
  return findAdviceLanguage(text).length === 0 && findGuaranteedOutcomeLanguage(text).length === 0
}

function parseJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Per-opportunityType deterministic templates for the playbook-specific
 *  fields not already carried on the OpportunityCard. Mirrors the pattern in
 *  server/pipeline/opportunity.ts and server/pipeline/positioning.ts. */
type PlaybookTemplate = {
  discoveryQuestions: string[]
  likelyObjections: string[]
  proofPoints: (evidenceCount: number) => string[]
  outreachAngle: (sector: string, region: string) => string
}

const SECTOR_FALLBACK = 'the affected sector'
const REGION_FALLBACK = 'the affected region'

const PLAYBOOK_TEMPLATES: Record<OpportunityType, PlaybookTemplate> = {
  TALENT_ACQUISITION: {
    discoveryQuestions: [
      'What is the current headcount trend for the affected teams?',
      'Which roles or skill sets have been most affected?',
      'Is there an internal redeployment process already underway?',
    ],
    likelyObjections: [
      'We already have an established recruiter relationship.',
      'It may be too early to confirm which staff are affected.',
    ],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed evidence about the workforce pattern.`],
    outreachAngle: (sector, region) =>
      `A short note referencing the observed workforce pattern in ${sector} (${region}) and offering placement support.`,
  },
  HIRING: {
    discoveryQuestions: [
      'Has a replacement search already started?',
      'Who is currently covering the vacated responsibilities?',
    ],
    likelyObjections: ['The exit may be part of a planned succession, not an open gap.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed evidence about the leadership change.`],
    outreachAngle: (sector, region) =>
      `A note referencing the leadership change in ${sector} (${region}) and offering a shortlist or interim option.`,
  },
  SALES: {
    discoveryQuestions: [
      'What budget cycle is currently in effect for this buyer?',
      'Who owns the decision for this category of spend?',
    ],
    likelyObjections: ['The buyer may already be committed to an incumbent supplier.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed demand-signal evidence.`],
    outreachAngle: (sector, region) =>
      `A tailored proposal referencing the momentum observed in ${sector} (${region}).`,
  },
  PARTNERSHIP: {
    discoveryQuestions: [
      'Does the counterpart have existing partner relationships in this space?',
      'What complementary capability would make the partnership most useful to them?',
    ],
    likelyObjections: ['The alignment observed may be coincidental rather than durable.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed evidence about the sector shift.`],
    outreachAngle: (sector, region) =>
      `A joint-proposition note referencing the emerging pattern in ${sector} (${region}).`,
  },
  PROCUREMENT: {
    discoveryQuestions: [
      'What is the buyer\'s current supplier panel for this category?',
      'Is there a formal tender process, or is this a direct-approach opportunity?',
    ],
    likelyObjections: ['A single procurement signal may not repeat into a durable buying cycle.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed procurement-signal evidence.`],
    outreachAngle: (sector, region) =>
      `A proposal referencing the procurement pattern emerging in ${sector} (${region}).`,
  },
  INVESTMENT_WATCH: {
    discoveryQuestions: [
      'What other sector indicators corroborate this pattern?',
      'Who on the team needs this context and on what cadence?',
    ],
    likelyObjections: ['Market context can shift quickly and may already be stale.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed market-context evidence.`],
    outreachAngle: (sector, region) => `A market-context briefing on the pattern observed in ${sector} (${region}).`,
  },
  M_AND_A: {
    discoveryQuestions: [
      'What is the entity\'s current financial trajectory?',
      'Are there existing advisory relationships already engaged?',
    ],
    likelyObjections: ['The pressure may resolve without a transaction being pursued.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed financial-pressure evidence.`],
    outreachAngle: (sector, region) =>
      `A preliminary-review note referencing the consolidation pattern in ${sector} (${region}).`,
  },
  CONTENT: {
    discoveryQuestions: [
      'What audience most needs an explanation of this pattern right now?',
      'What follow-up evidence would strengthen the briefing?',
    ],
    likelyObjections: ['The pattern may be too early-stage to support firm conclusions yet.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed evidence supporting this briefing.`],
    outreachAngle: (sector, region) => `An explainer briefing on the pattern observed in ${sector} (${region}).`,
  },
  ADVISORY: {
    discoveryQuestions: [
      'Has the organisation already sought external advice on this pattern?',
      'What decision is the organisation trying to make in the near term?',
    ],
    likelyObjections: ['The pattern\'s severity may be overstated by early evidence.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed evidence about the pressure pattern.`],
    outreachAngle: (sector, region) =>
      `A structured-review note referencing the pattern observed in ${sector} (${region}).`,
  },
  PRODUCT_GAP: {
    discoveryQuestions: [
      'How many independent signals confirm the same gap?',
      'What would a lightweight response look like for this gap?',
    ],
    likelyObjections: ['The gap may be narrow or temporary rather than durable demand.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed demand-gap evidence.`],
    outreachAngle: (sector, region) => `A scoping note referencing the gap emerging in ${sector} (${region}).`,
  },
  MARKET_ENTRY: {
    discoveryQuestions: [
      'What barriers to entry remain in this market?',
      'Which competitors are already positioned in this space?',
    ],
    likelyObjections: ['Entry barriers may re-form before a plan can be executed.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed market-shift evidence.`],
    outreachAngle: (sector, region) => `A market-entry note referencing the shift observed in ${sector} (${region}).`,
  },
  COMPETITOR_DISPLACEMENT: {
    discoveryQuestions: [
      'Which buyers are most exposed to the incumbent\'s disruption?',
      'What would make switching costs low for those buyers right now?',
    ],
    likelyObjections: ['The incumbent may recover capacity before a switch can be completed.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed supply-chain-pressure evidence.`],
    outreachAngle: (sector, region) =>
      `A displacement-positioned proposal referencing the incumbent's disruption in ${sector} (${region}).`,
  },
  COMPLIANCE: {
    discoveryQuestions: [
      'What is the organisation\'s current compliance-readiness status?',
      'Is there a deadline already attached to this regulatory change?',
    ],
    likelyObjections: ['Regulatory scope may narrow before enforcement takes effect.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed regulatory-pressure evidence.`],
    outreachAngle: (sector, region) => `A readiness-review note referencing the pressure observed in ${sector} (${region}).`,
  },
  CRISIS_SUPPORT: {
    discoveryQuestions: [
      'How urgent does the organisation consider its own situation?',
      'What internal resources are already mobilised?',
    ],
    likelyObjections: ['The situation may stabilise without needing external support.'],
    proofPoints: (n) => [`Derived from ${n} piece(s) of observed escalation evidence.`],
    outreachAngle: (sector, region) => `A rapid-response outline referencing the pressure observed in ${sector} (${region}).`,
  },
}

/** Zod schema an LLM-produced playbook JSON payload must satisfy before it
 *  can upgrade generatedBy to 'LLM'. Deliberately mirrors the deterministic
 *  field set so upgraded playbooks stay structurally identical. */
export const PlaybookSchema = z.object({
  targetBuyer: z.string().min(1),
  commercialHypothesis: z.string().min(1),
  painStatement: z.string().min(1),
  offerAngle: z.string().min(1),
  discoveryQuestions: z.array(z.string().min(1)).min(1),
  outreachAngle: z.string().min(1),
  likelyObjections: z.array(z.string().min(1)).min(1),
  proofPoints: z.array(z.string().min(1)).min(1),
  firstAction: z.string().min(1),
})
export type PlaybookLLMOutput = z.infer<typeof PlaybookSchema>

type CardWithEvidence = OpportunityCard & {
  eventCandidate: {
    id: string
    title: string
    eventType: string
    affectedSector: string | null
    affectedRegion: string | null
    evidenceCount: number
    clusters: {
      signals: { signal: { claim: { id: string } } }[]
    }[]
  }
}

async function loadCard(cardId: string): Promise<CardWithEvidence | null> {
  return prisma.opportunityCard.findUnique({
    where: { id: cardId },
    include: {
      eventCandidate: {
        include: {
          clusters: {
            include: { signals: { include: { signal: { include: { claim: true } } } } },
          },
        },
      },
    },
  }) as Promise<CardWithEvidence | null>
}

function evidenceClaimIds(card: CardWithEvidence): string[] {
  return card.eventCandidate.clusters.flatMap((c) => c.signals.map((link) => link.signal.claim.id))
}

type DeterministicFields = {
  title: string
  targetBuyer: string
  commercialHypothesis: string
  painStatement: string
  offerAngle: string
  discoveryQuestionsJson: string
  outreachAngle: string
  likelyObjectionsJson: string
  proofPointsJson: string
  firstAction: string
}

function buildDeterministicFields(card: CardWithEvidence): DeterministicFields {
  const sector = card.eventCandidate.affectedSector ?? SECTOR_FALLBACK
  const region = card.eventCandidate.affectedRegion ?? REGION_FALLBACK
  const likelyBuyers = parseJsonArray(card.likelyBuyersJson)
  const template = PLAYBOOK_TEMPLATES[card.opportunityType as OpportunityType] ?? PLAYBOOK_TEMPLATES.CONTENT

  const title = `${card.title} — playbook`
  const targetBuyer = likelyBuyers[0] ?? 'The likely buyer for this opportunity'
  const painStatement = card.buyerPain
  const offerAngle = card.suggestedOffer
  const commercialHypothesis =
    `If ${targetBuyer.toLowerCase()} act on this pattern in ${sector} (${region}), ` +
    `the observed pain ("${card.buyerPain}") may translate into an openness to the suggested offer.`
  const discoveryQuestions = template.discoveryQuestions
  const outreachAngle = template.outreachAngle(sector, region)
  const likelyObjections = template.likelyObjections
  const proofPoints = template.proofPoints(card.eventCandidate.evidenceCount)
  const firstAction = card.nextBestAction

  const fields: DeterministicFields = {
    title,
    targetBuyer,
    commercialHypothesis,
    painStatement,
    offerAngle,
    discoveryQuestionsJson: JSON.stringify(discoveryQuestions),
    outreachAngle,
    likelyObjectionsJson: JSON.stringify(likelyObjections),
    proofPointsJson: JSON.stringify(proofPoints),
    firstAction,
  }

  assertGuardClean(fields.title, 'OpportunityPlaybook.title')
  assertGuardClean(fields.targetBuyer, 'OpportunityPlaybook.targetBuyer')
  assertGuardClean(fields.commercialHypothesis, 'OpportunityPlaybook.commercialHypothesis')
  assertGuardClean(fields.painStatement, 'OpportunityPlaybook.painStatement')
  assertGuardClean(fields.offerAngle, 'OpportunityPlaybook.offerAngle')
  assertGuardClean(fields.outreachAngle, 'OpportunityPlaybook.outreachAngle')
  assertGuardClean(fields.firstAction, 'OpportunityPlaybook.firstAction')
  for (const q of discoveryQuestions) assertGuardClean(q, 'OpportunityPlaybook.discoveryQuestions')
  for (const o of likelyObjections) assertGuardClean(o, 'OpportunityPlaybook.likelyObjections')
  for (const p of proofPoints) assertGuardClean(p, 'OpportunityPlaybook.proofPoints')

  return fields
}

/** Every text field an LLM upgrade could touch, checked before it is allowed
 *  to overwrite the deterministic baseline. Fails closed: any guard failure
 *  here means the deterministic playbook is kept as-is. */
function llmOutputIsGuardClean(output: PlaybookLLMOutput): boolean {
  const fields = [
    output.targetBuyer,
    output.commercialHypothesis,
    output.painStatement,
    output.offerAngle,
    output.outreachAngle,
    output.firstAction,
    ...output.discoveryQuestions,
    ...output.likelyObjections,
    ...output.proofPoints,
  ]
  return fields.every(isGuardClean)
}

export type GeneratePlaybookOptions = {
  /** Injectable provider for tests/dormant callers. Pass null explicitly to
   *  force the dormant/deterministic-only path. Omit to fall back to
   *  getActiveProvider(). */
  provider?: LLMProvider | null
}

/** Generates (or regenerates) the playbook for an OpportunityCard.
 *
 *  Always builds the DETERMINISTIC baseline first from the card + its event
 *  evidence — every field guard-clean (advice-language + guaranteed-outcome
 *  checks) — and upserts it (unique on opportunityCardId, so a regenerate
 *  updates in place rather than duplicating).
 *
 *  THEN, if a provider is active (opts.provider or getActiveProvider()),
 *  attempts an LLM upgrade via runLLMTask. The upgrade only takes effect when
 *  the run SUCCEEDED (schema + evidence-grounding + advice-language all
 *  passed inside runLLMTask's validation) AND the parsed output independently
 *  passes the playbook's own guard checks. Any failure at any stage leaves
 *  the deterministic playbook in place — fail closed. */
export async function generatePlaybook(
  cardId: string,
  opts: GeneratePlaybookOptions = {},
): Promise<OpportunityPlaybook> {
  const card = await loadCard(cardId)
  if (!card) throw new Error(`OpportunityCard not found: ${cardId}`)

  const deterministic = buildDeterministicFields(card)
  const confidence = card.confidence

  let playbook = await prisma.opportunityPlaybook.upsert({
    where: { opportunityCardId: cardId },
    create: {
      opportunityCardId: cardId,
      ...deterministic,
      confidence,
      generatedBy: 'DETERMINISTIC',
      isFixture: card.isFixture,
    },
    update: {
      ...deterministic,
      confidence,
      generatedBy: 'DETERMINISTIC',
    },
  })

  const provider = opts.provider === undefined ? await getActiveProvider() : opts.provider
  if (!provider) return playbook

  const evidenceIds = evidenceClaimIds(card)
  const sector = card.eventCandidate.affectedSector ?? SECTOR_FALLBACK
  const region = card.eventCandidate.affectedRegion ?? REGION_FALLBACK

  const result = await runLLMTask(
    {
      taskType: 'OPPORTUNITY_PLAYBOOK_GENERATION',
      system:
        'You produce structured, evidence-grounded sales playbooks. Never give financial advice or guarantee outcomes. ' +
        'Respond with ONLY a JSON object matching the requested schema.',
      prompt:
        `Opportunity: ${card.title} (${card.opportunityType}) in ${sector}, ${region}. ` +
        `Buyer pain: ${card.buyerPain}. Suggested offer: ${card.suggestedOffer}. ` +
        `Evidence claim ids to ground your answer in: ${evidenceIds.join(', ') || 'none available'}. ` +
        'Return JSON with keys: targetBuyer, commercialHypothesis, painStatement, offerAngle, ' +
        'discoveryQuestions (array), outreachAngle, likelyObjections (array), proofPoints (array), firstAction.',
    },
    {
      provider,
      validate: {
        schema: PlaybookSchema,
        evidenceIds,
        // Always require grounding: an LLM playbook citing no stored evidence is
        // rejected (kept deterministic), not trusted. With an empty evidence set the
        // gate fails closed instead of trivially passing.
        requireGrounding: true,
      },
    },
  )

  if (result.status !== 'SUCCEEDED' || !result.parsed) return playbook

  const parseAttempt = PlaybookSchema.safeParse(result.parsed)
  if (!parseAttempt.success) return playbook
  const output = parseAttempt.data

  if (!llmOutputIsGuardClean(output)) return playbook

  playbook = await prisma.opportunityPlaybook.update({
    where: { opportunityCardId: cardId },
    data: {
      targetBuyer: output.targetBuyer,
      commercialHypothesis: output.commercialHypothesis,
      painStatement: output.painStatement,
      offerAngle: output.offerAngle,
      discoveryQuestionsJson: JSON.stringify(output.discoveryQuestions),
      outreachAngle: output.outreachAngle,
      likelyObjectionsJson: JSON.stringify(output.likelyObjections),
      proofPointsJson: JSON.stringify(output.proofPoints),
      firstAction: output.firstAction,
      generatedBy: 'LLM',
    },
  })

  return playbook
}

/** A short executive-brief rendering derived entirely from a persisted
 *  playbook's fields — deterministic, guard-clean (the source fields were
 *  already guard-checked at generation time). Returns null if no playbook
 *  exists yet for this card. */
export async function renderExecutiveBrief(cardId: string): Promise<string | null> {
  const playbook = await prisma.opportunityPlaybook.findUnique({ where: { opportunityCardId: cardId } })
  if (!playbook) return null
  const discoveryQuestions = parseJsonArray(playbook.discoveryQuestionsJson)

  return [
    `# ${playbook.title}`,
    '',
    `**Target buyer:** ${playbook.targetBuyer}`,
    `**Pain:** ${playbook.painStatement}`,
    `**Offer angle:** ${playbook.offerAngle}`,
    `**Commercial hypothesis:** ${playbook.commercialHypothesis}`,
    '',
    '**Discovery questions:**',
    ...discoveryQuestions.map((q) => `- ${q}`),
    '',
    `**First action:** ${playbook.firstAction}`,
  ].join('\n')
}

/** A short outreach-draft rendering derived entirely from a persisted
 *  playbook's fields. Returns null if no playbook exists yet for this card. */
export async function renderOutreachDraft(cardId: string): Promise<string | null> {
  const playbook = await prisma.opportunityPlaybook.findUnique({ where: { opportunityCardId: cardId } })
  if (!playbook) return null

  return [
    `Subject: ${playbook.title}`,
    '',
    playbook.outreachAngle,
    '',
    playbook.painStatement,
    '',
    playbook.offerAngle,
    '',
    `Suggested next step: ${playbook.firstAction}`,
  ].join('\n')
}

/** Markdown export of a full playbook. Deterministic, guard-clean (fields
 *  were guard-checked when the playbook was generated). */
export function exportMarkdown(playbook: OpportunityPlaybook): string {
  const discoveryQuestions = parseJsonArray(playbook.discoveryQuestionsJson)
  const likelyObjections = parseJsonArray(playbook.likelyObjectionsJson)
  const proofPoints = parseJsonArray(playbook.proofPointsJson)

  return [
    `# ${playbook.title}`,
    '',
    `Generated by: ${playbook.generatedBy}`,
    `Confidence: ${playbook.confidence.toFixed(2)}`,
    '',
    '## Target buyer',
    playbook.targetBuyer,
    '',
    '## Pain statement',
    playbook.painStatement,
    '',
    '## Offer angle',
    playbook.offerAngle,
    '',
    '## Commercial hypothesis',
    playbook.commercialHypothesis,
    '',
    '## Discovery questions',
    ...discoveryQuestions.map((q) => `- ${q}`),
    '',
    '## Outreach angle',
    playbook.outreachAngle,
    '',
    '## Likely objections',
    ...likelyObjections.map((o) => `- ${o}`),
    '',
    '## Proof points',
    ...proofPoints.map((p) => `- ${p}`),
    '',
    '## First action',
    playbook.firstAction,
  ].join('\n')
}

export type PlaybookJson = {
  id: string
  opportunityCardId: string
  title: string
  targetBuyer: string
  commercialHypothesis: string
  painStatement: string
  offerAngle: string
  discoveryQuestions: string[]
  outreachAngle: string
  likelyObjections: string[]
  proofPoints: string[]
  firstAction: string
  confidence: number
  generatedBy: string
  isFixture: boolean
}

/** JSON export of a full playbook — the *Json DB columns are expanded into
 *  arrays here rather than leaked as raw JSON strings. */
export function exportJson(playbook: OpportunityPlaybook): PlaybookJson {
  return {
    id: playbook.id,
    opportunityCardId: playbook.opportunityCardId,
    title: playbook.title,
    targetBuyer: playbook.targetBuyer,
    commercialHypothesis: playbook.commercialHypothesis,
    painStatement: playbook.painStatement,
    offerAngle: playbook.offerAngle,
    discoveryQuestions: parseJsonArray(playbook.discoveryQuestionsJson),
    outreachAngle: playbook.outreachAngle,
    likelyObjections: parseJsonArray(playbook.likelyObjectionsJson),
    proofPoints: parseJsonArray(playbook.proofPointsJson),
    firstAction: playbook.firstAction,
    confidence: playbook.confidence,
    generatedBy: playbook.generatedBy,
    isFixture: playbook.isFixture,
  }
}
