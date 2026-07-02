import type { EventCandidate, RiskOpportunity } from '@prisma/client'
import { prisma } from '@/server/db'
import type { PipelineError } from './types'

type ClassifyRule = { riskLogic: string; opportunityLogic: string; questions: string[] }

/** Strategic-intelligence framing only. Never investment or financial advice. */
const CLASSIFY_RULES: Record<string, ClassifyRule> = {
  LAYOFF_SIGNAL: {
    riskLogic:
      'Workforce reductions indicate operational or financial stress in the affected organisations and may signal wider sector pressure.',
    opportunityLogic:
      'A talent acquisition window: experienced staff entering the market, and potential openings for suppliers serving restructuring organisations.',
    questions: ['Which organisations in this sector are hiring the released skill sets?', 'Is this an isolated restructuring or a sector-wide pattern?'],
  },
  PROCUREMENT_INCREASE: {
    riskLogic:
      'Rising public spend can indicate urgency or cost pressure in the buying organisations and increased competition for delivery capacity.',
    opportunityLogic:
      'Growing addressable public-sector demand: an expanding bid pipeline for suppliers able to meet framework requirements.',
    questions: ['Which frameworks are open and what are their deadlines?', 'What delivery capacity do incumbent suppliers have?'],
  },
  REGULATORY_PRESSURE: {
    riskLogic:
      'Regulatory scrutiny raises compliance risk and potential cost or restriction for organisations in the affected market.',
    opportunityLogic:
      'A compliance and advisory opportunity: affected organisations will need help adapting; compliant challengers may gain ground.',
    questions: ['Which obligations are likely to change and when?', 'Who is best positioned if the rules tighten?'],
  },
  DEMAND_SPIKE: {
    riskLogic:
      'Rapid demand growth can strain supply, pricing and delivery for incumbents, and may prove temporary.',
    opportunityLogic:
      'A market demand opportunity: sustained order growth suggests expanding demand for products and services in this category.',
    questions: ['Is the demand growth corroborated across regions and months?', 'What supply constraints could cap it?'],
  },
  SUPPLY_CHAIN_PRESSURE: {
    riskLogic:
      'Supply disruption threatens delivery schedules and input costs for dependent organisations.',
    opportunityLogic:
      'A vendor replacement opportunity: buyers under disruption actively seek alternative suppliers and routes.',
    questions: ['Which inputs are constrained and for how long?', 'Which alternative suppliers can absorb displaced demand?'],
  },
  CASH_PRESSURE: {
    riskLogic:
      'Financial strain signals raise the likelihood of restructuring, delayed payments or reduced investment in affected organisations.',
    opportunityLogic:
      'Partners and competitors may find openings as strained organisations retrench from markets or renegotiate commitments.',
    questions: ['Is the pressure isolated or shared across the sector?', 'What would fresh funding change?'],
  },
}

const GENERIC_RULE: ClassifyRule = {
  riskLogic:
    'The clustered signals indicate pressure in the affected area; if the pattern strengthens it may disrupt organisations exposed to it.',
  opportunityLogic:
    'Changing conditions create openings for organisations positioned to respond faster than incumbents.',
  questions: [],
}

const STANDARD_QUESTIONS = [
  'What changed in the last seven days?',
  'Which sources disagree?',
  'What evidence would raise confidence?',
  'What evidence would lower confidence?',
  'Which entities are most exposed?',
  'Is this event a risk, opportunity or both?',
  'What should be watched next?',
]

export async function classifyEvents(events: EventCandidate[]): Promise<{
  riskOpportunities: RiskOpportunity[]
  errors: PipelineError[]
}> {
  const riskOpportunities: RiskOpportunity[] = []
  const errors: PipelineError[] = []
  for (const event of events) {
    try {
      const rule = CLASSIFY_RULES[event.eventType] ?? GENERIC_RULE
      riskOpportunities.push(
        await prisma.riskOpportunity.create({
          data: {
            eventCandidateId: event.id,
            type: event.eventClass,
            title: `${event.eventClass} assessment: ${event.title}`,
            explanation:
              `Classified ${event.eventClass} from direction mix and scores ` +
              `(risk ${event.riskScore.toFixed(2)}, opportunity ${event.opportunityScore.toFixed(2)}, ` +
              `confidence ${event.confidence.toFixed(2)}).`,
            riskLogic: rule.riskLogic,
            opportunityLogic: rule.opportunityLogic,
            questionsJson: JSON.stringify([...rule.questions, ...STANDARD_QUESTIONS]),
            confidence: event.confidence,
          },
        }),
      )
    } catch (err) {
      errors.push({ stage: 'classify', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { riskOpportunities, errors }
}
