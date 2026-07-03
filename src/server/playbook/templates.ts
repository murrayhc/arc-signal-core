import type { OpportunityType } from '@/shared/enums'

/** Per-opportunityType deterministic templates for the playbook-specific
 *  fields not already carried on the OpportunityCard. Mirrors the pattern in
 *  server/pipeline/opportunity.ts and server/pipeline/positioning.ts. */
export type PlaybookTemplate = {
  discoveryQuestions: string[]
  likelyObjections: string[]
  proofPoints: (evidenceCount: number) => string[]
  outreachAngle: (sector: string, region: string) => string
}

export const PLAYBOOK_TEMPLATES: Record<OpportunityType, PlaybookTemplate> = {
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
