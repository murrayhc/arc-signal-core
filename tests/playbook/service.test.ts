import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from '../factories'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import {
  generatePlaybook,
  renderExecutiveBrief,
  renderOutreachDraft,
  exportMarkdown,
  exportJson,
} from '@/server/playbook/service'
import type { LLMProvider, LLMRequest, LLMResponse } from '@/server/llm/types'

class FakeProvider implements LLMProvider {
  name = 'fake-provider'
  constructor(
    private readonly respond: (req: LLMRequest) => LLMResponse | Promise<LLMResponse>,
  ) {}
  async generate(req: LLMRequest): Promise<LLMResponse> {
    return this.respond(req)
  }
}

async function seedCard() {
  const sr = await prisma.scanRun.create({ data: {} })
  const event = await prisma.eventCandidate.create({
    data: {
      title: 'Layoff pressure — technology (UK)',
      eventType: 'LAYOFF_SIGNAL',
      eventClass: 'RISK',
      summary: 's',
      severity: 0.8,
      probability: 0.7,
      confidence: 0.8,
      affectedSector: 'technology',
      affectedRegion: 'UK',
      evidenceCount: 2,
      sourceDiversityScore: 1,
      signalStrength: 0.8,
      noveltyScore: 0.9,
      opportunityScore: 0.2,
      riskScore: 0.7,
      createdFromScanRunId: sr.id,
      isFixture: true,
    },
  })
  const card = await prisma.opportunityCard.create({
    data: {
      eventCandidateId: event.id,
      title: 'Layoff pressure — talent acquisition angle',
      opportunityType: 'TALENT_ACQUISITION',
      summary: 'Derived from event.',
      buyerPain: 'Organisations in technology may face pressure that releases experienced staff.',
      likelyBuyersJson: JSON.stringify(['Recruiters', 'Workforce consultancies']),
      affectedSectorsJson: JSON.stringify(['technology']),
      affectedRegionsJson: JSON.stringify(['UK']),
      suggestedOffer: 'A recruiter could prepare interim or redeployment support.',
      urgencyScore: 0.7,
      commercialValueScore: 0.6,
      confidence: 0.72,
      evidenceScore: 0.65,
      actionabilityScore: 0.68,
      opportunityLogic: 'Watch for displaced talent that may need placement support.',
      riskLogic: 'The pattern could ease; monitor before committing resource.',
      nextBestAction: 'Review which employers may face similar pressure next.',
      status: 'NEW',
      isFixture: true,
    },
  })
  return { card, event }
}

/** A card whose event has a real evidence chain, so evidenceClaimIds() is non-empty
 *  and the LLM grounding gate can actually be exercised. Returns the claim id. */
async function seedCardWithEvidence() {
  const { card, event } = await seedCard()
  const source = await makeSource({ name: `Src ${event.id}` })
  const doc = await makeDocument(source.id)
  const claim = await makeClaim(doc.id)
  const signal = await makeSignal(claim.id, doc.id, source.id)
  await prisma.signalCluster.create({
    data: {
      title: 'Layoff signals', clusterType: 'LAYOFF_SIGNAL', strength: 0.7, confidence: 0.8,
      novelty: 0.9, explanation: 'e', isFixture: true, eventCandidateId: event.id,
      signals: { create: [{ signalId: signal.id }] },
    },
  })
  return { card, event, claimId: claim.id }
}

describe('generatePlaybook (deterministic)', () => {
  beforeEach(resetDb)

  it('produces a DETERMINISTIC, guard-clean playbook with non-empty discovery questions', async () => {
    const { card } = await seedCard()
    const playbook = await generatePlaybook(card.id, { provider: null })

    expect(playbook.generatedBy).toBe('DETERMINISTIC')
    expect(playbook.opportunityCardId).toBe(card.id)
    expect(playbook.targetBuyer).toBeTruthy()
    expect(playbook.painStatement).toBeTruthy()
    expect(playbook.offerAngle).toBeTruthy()
    expect(playbook.commercialHypothesis).toBeTruthy()
    expect(playbook.firstAction).toBeTruthy()
    expect(playbook.confidence).toBeCloseTo(0.72)

    const discoveryQuestions = JSON.parse(playbook.discoveryQuestionsJson) as string[]
    const likelyObjections = JSON.parse(playbook.likelyObjectionsJson) as string[]
    const proofPoints = JSON.parse(playbook.proofPointsJson) as string[]
    expect(discoveryQuestions.length).toBeGreaterThan(0)
    expect(likelyObjections.length).toBeGreaterThan(0)
    expect(proofPoints.length).toBeGreaterThan(0)

    const textFields = [
      playbook.title,
      playbook.targetBuyer,
      playbook.commercialHypothesis,
      playbook.painStatement,
      playbook.offerAngle,
      playbook.outreachAngle,
      playbook.firstAction,
      ...discoveryQuestions,
      ...likelyObjections,
      ...proofPoints,
    ]
    for (const field of textFields) {
      expect(findAdviceLanguage(field)).toEqual([])
      expect(field.toLowerCase()).not.toContain('guaranteed conversion')
      expect(field.toLowerCase()).not.toContain('will close')
      expect(field.toLowerCase()).not.toContain('guaranteed')
    }
  })

  it('regenerate upserts rather than duplicating (count stays 1)', async () => {
    const { card } = await seedCard()
    await generatePlaybook(card.id, { provider: null })
    await generatePlaybook(card.id, { provider: null })
    expect(await prisma.opportunityPlaybook.count()).toBe(1)
  })

  it('with a FakeProvider returning a valid, grounded, schema-correct playbook, upgrades to LLM', async () => {
    const { card, claimId } = await seedCardWithEvidence()
    const provider = new FakeProvider(() => ({
      text: JSON.stringify({
        targetBuyer: 'Recruiters',
        commercialHypothesis: `Recruiters may find candidate availability opening up (evidence ${claimId}).`,
        painStatement: 'Organisations may face disruption releasing experienced staff.',
        offerAngle: 'A recruiter could prepare a shortlist of available candidates.',
        discoveryQuestions: ['What is the current headcount trend?', 'Which teams were affected?'],
        outreachAngle: 'A tailored note referencing the recent workforce pattern.',
        likelyObjections: ['We already have a recruiter relationship.'],
        proofPoints: [`Grounded in claim ${claimId}.`],
        firstAction: 'Draft a shortlist and confirm the buyer contact.',
      }),
      tokensIn: 50,
      tokensOut: 80,
    }))
    const playbook = await generatePlaybook(card.id, { provider })
    expect(playbook.generatedBy).toBe('LLM')
    expect(playbook.targetBuyer).toBe('Recruiters')
    expect(playbook.firstAction).toBe('Draft a shortlist and confirm the buyer contact.')
  })

  it('with a FakeProvider returning advice language, stays DETERMINISTIC (rejected)', async () => {
    const { card, claimId } = await seedCardWithEvidence()
    // Grounded (cites the claim id) but contains advice language → rejected for advice, not grounding.
    const provider = new FakeProvider(() => ({
      text: JSON.stringify({
        targetBuyer: 'Recruiters',
        commercialHypothesis: `Evidence ${claimId}: you should buy this stock immediately.`,
        painStatement: 'Organisations may face disruption releasing experienced staff.',
        offerAngle: 'A recruiter could prepare a shortlist of available candidates.',
        discoveryQuestions: ['What is the current headcount trend?'],
        outreachAngle: 'A tailored note referencing the recent workforce pattern.',
        likelyObjections: ['We already have a recruiter relationship.'],
        proofPoints: [`Grounded in claim ${claimId}.`],
        firstAction: 'Draft a shortlist and confirm the buyer contact.',
      }),
      tokensIn: 50,
      tokensOut: 80,
    }))
    const playbook = await generatePlaybook(card.id, { provider })
    expect(playbook.generatedBy).toBe('DETERMINISTIC')
  })

  it('with a FakeProvider returning "guaranteed conversion" (grounded, schema-valid), the run is REJECTED_VALIDATION, the LLMRun is redacted, and the playbook stays DETERMINISTIC', async () => {
    const { card, claimId } = await seedCardWithEvidence()
    // "guaranteed conversion" is NOT caught by findAdviceLanguage's patterns (only
    // "guaranteed returns/profit/gains" and "guaranteed win") — this proves the
    // guaranteed-outcome check is now centralised inside runLLMTask's validation
    // (via extraCheckers), not applied post-hoc after SUCCEEDED.
    const provider = new FakeProvider(() => ({
      text: JSON.stringify({
        targetBuyer: 'Recruiters',
        commercialHypothesis: `Evidence ${claimId}: this outreach has a guaranteed conversion rate.`,
        painStatement: 'Organisations may face disruption releasing experienced staff.',
        offerAngle: 'A recruiter could prepare a shortlist of available candidates.',
        discoveryQuestions: ['What is the current headcount trend?'],
        outreachAngle: 'A tailored note referencing the recent workforce pattern.',
        likelyObjections: ['We already have a recruiter relationship.'],
        proofPoints: [`Grounded in claim ${claimId}.`],
        firstAction: 'Draft a shortlist and confirm the buyer contact.',
      }),
      tokensIn: 50,
      tokensOut: 80,
    }))
    const playbook = await generatePlaybook(card.id, { provider })

    expect(playbook.generatedBy).toBe('DETERMINISTIC')

    const run = await prisma.lLMRun.findFirstOrThrow({
      where: { taskType: 'OPPORTUNITY_PLAYBOOK_GENERATION' },
      orderBy: { createdAt: 'desc' },
    })
    expect(run.status).toBe('REJECTED_VALIDATION')
    expect(run.outputSummary).not.toContain('guaranteed conversion')
    expect(run.outputSummary).toContain('redacted')
  })

  it('with a card that has no evidence, an ungrounded LLM playbook is rejected (stays DETERMINISTIC)', async () => {
    const { card } = await seedCard() // no evidence chain → evidenceClaimIds() empty
    const provider = new FakeProvider(() => ({
      text: JSON.stringify({
        targetBuyer: 'Recruiters',
        commercialHypothesis: 'Recruiters may find candidate availability opening up.',
        painStatement: 'Organisations may face disruption releasing experienced staff.',
        offerAngle: 'A recruiter could prepare a shortlist of available candidates.',
        discoveryQuestions: ['What is the current headcount trend?'],
        outreachAngle: 'A tailored note referencing the recent workforce pattern.',
        likelyObjections: ['We already have a recruiter relationship.'],
        proofPoints: ['Observed signal pattern.'],
        firstAction: 'Draft a shortlist and confirm the buyer contact.',
      }),
      tokensIn: 50,
      tokensOut: 80,
    }))
    const playbook = await generatePlaybook(card.id, { provider })
    // requireGrounding is always on: no evidence ids means grounding cannot pass.
    expect(playbook.generatedBy).toBe('DETERMINISTIC')
  })
})

describe('renderExecutiveBrief / renderOutreachDraft', () => {
  beforeEach(resetDb)

  it('renders guard-clean text derived from the playbook', async () => {
    const { card } = await seedCard()
    await generatePlaybook(card.id, { provider: null })
    const brief = await renderExecutiveBrief(card.id)
    const outreach = await renderOutreachDraft(card.id)
    expect(brief).toBeTruthy()
    expect(outreach).toBeTruthy()
    expect(findAdviceLanguage(brief!)).toEqual([])
    expect(findAdviceLanguage(outreach!)).toEqual([])
  })
})

describe('exportMarkdown / exportJson', () => {
  beforeEach(resetDb)

  it('exportMarkdown contains the title and first action', async () => {
    const { card } = await seedCard()
    const playbook = await generatePlaybook(card.id, { provider: null })
    const md = exportMarkdown(playbook)
    expect(md).toContain(playbook.title)
    expect(md).toContain(playbook.firstAction)
  })

  it('exportJson round-trips the core fields', async () => {
    const { card } = await seedCard()
    const playbook = await generatePlaybook(card.id, { provider: null })
    const json = exportJson(playbook)
    expect(json.title).toBe(playbook.title)
    expect(json.generatedBy).toBe(playbook.generatedBy)
    expect(json.discoveryQuestions).toBeInstanceOf(Array)
  })
})
