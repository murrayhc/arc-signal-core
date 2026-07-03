import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from './helpers'
import { makeClaim, makeDocument, makeSignal, makeSource } from './factories'

describe('event discovery data layer', () => {
  beforeEach(resetDb)

  it('creates the full evidence chain: source → document → claim → signal → cluster → event', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    const signal = await makeSignal(claim.id, doc.id, source.id)

    const scanRun = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)',
        eventType: 'LAYOFF_SIGNAL',
        eventClass: 'RISK',
        summary: 'Test event',
        severity: 0.8,
        probability: 0.7,
        confidence: 0.8,
        evidenceCount: 1,
        sourceDiversityScore: 1,
        signalStrength: 0.7,
        noveltyScore: 0.9,
        opportunityScore: 0.2,
        riskScore: 0.7,
        createdFromScanRunId: scanRun.id,
        isFixture: true,
      },
    })
    const cluster = await prisma.signalCluster.create({
      data: {
        title: 'Layoff signals — technology (UK)',
        clusterType: 'LAYOFF_SIGNAL',
        strength: 0.7,
        confidence: 0.8,
        novelty: 0.9,
        explanation: 'Test cluster',
        isFixture: true,
        eventCandidateId: event.id,
        signals: { create: [{ signalId: signal.id }] },
      },
    })

    const loaded = await prisma.eventCandidate.findUniqueOrThrow({
      where: { id: event.id },
      include: {
        clusters: { include: { signals: { include: { signal: { include: { claim: true, document: { include: { source: true } } } } } } } },
      },
    })
    expect(loaded.primaryEntityId).toBeNull()
    expect(loaded.clusters).toHaveLength(1)
    expect(loaded.clusters[0].id).toBe(cluster.id)
    const chainSignal = loaded.clusters[0].signals[0].signal
    expect(chainSignal.claim.id).toBe(claim.id)
    expect(chainSignal.document.source.id).toBe(source.id)
  })

  it('enforces document dedupe on (sourceId, rawContentHash)', async () => {
    const source = await makeSource()
    await makeDocument(source.id, { rawContent: 'same content', rawContentHash: 'HASH1' })
    await expect(
      makeDocument(source.id, { rawContent: 'same content', rawContentHash: 'HASH1' }),
    ).rejects.toThrow()
  })

  it('enforces one signal per claim', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const claim = await makeClaim(doc.id)
    await makeSignal(claim.id, doc.id, source.id)
    await expect(makeSignal(claim.id, doc.id, source.id)).rejects.toThrow()
  })

  it('supports SourceHealth rows and the new ScanRun columns', async () => {
    const source = await makeSource()
    const health = await prisma.sourceHealth.create({
      data: { sourceId: source.id, status: 'HEALTHY', healthScore: 1, documentsStoredLastRun: 5 },
    })
    expect(health.failureCount).toBe(0)
    const run = await prisma.scanRun.create({ data: {} })
    expect(run.warningsJson).toBe('[]')
    expect(run.eventCandidatesUpdated).toBe(0)
  })

  it('creates an OpportunityCard and positioning example linked to an event, deduped per lens', async () => {
    const scanRun = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK',
        summary: 't', severity: 0.8, probability: 0.7, confidence: 0.8, evidenceCount: 2,
        sourceDiversityScore: 1, signalStrength: 0.8, noveltyScore: 0.9, opportunityScore: 0.2,
        riskScore: 0.7, createdFromScanRunId: scanRun.id, isFixture: true,
      },
    })
    const lens = await prisma.revenueLens.create({ data: { name: 'L1', isDefault: true } })
    const card = await prisma.opportunityCard.create({
      data: {
        eventCandidateId: event.id, revenueLensId: lens.id, title: 'Talent window', opportunityType: 'TALENT_ACQUISITION',
        summary: 's', buyerPain: 'p', suggestedOffer: 'o', urgencyScore: 0.6, commercialValueScore: 0.5,
        confidence: 0.8, evidenceScore: 0.7, actionabilityScore: 0.6, opportunityLogic: 'ol', riskLogic: 'rl',
        nextBestAction: 'review buyer groups', isFixture: true,
      },
    })
    await prisma.strategicPositioningExample.create({
      data: {
        eventCandidateId: event.id, opportunityCardId: card.id, revenueLensId: lens.id, title: 'For recruiters',
        userType: 'RECRUITER', positioningAngle: 'a', howItCouldBeUsed: 'may watch demand', whyItMayMatter: 'w',
        evidenceSummary: 'e', confidence: 0.8, constraints: 'Strategic example, not investment advice.', isFixture: true,
      },
    })
    expect(await prisma.opportunityCard.count()).toBe(1)
    await expect(
      prisma.opportunityCard.create({
        data: {
          eventCandidateId: event.id, revenueLensId: lens.id, title: 'dup', opportunityType: 'ADVISORY', summary: 's',
          buyerPain: 'p', suggestedOffer: 'o', urgencyScore: 0.5, commercialValueScore: 0.5, confidence: 0.5,
          evidenceScore: 0.5, actionabilityScore: 0.5, opportunityLogic: 'ol', riskLogic: 'rl', nextBestAction: 'review',
        },
      }),
    ).rejects.toThrow()
  })

  it('creates graph nodes/edges deduped on refType+refId and the edge triple', async () => {
    const a = await prisma.graphNode.create({ data: { nodeType: 'EVENT', refType: 'event', refId: 'e1', title: 'E1' } })
    const b = await prisma.graphNode.create({ data: { nodeType: 'SOURCE', refType: 'source', refId: 's1', title: 'S1' } })
    await expect(
      prisma.graphNode.create({ data: { nodeType: 'EVENT', refType: 'event', refId: 'e1', title: 'dup' } }),
    ).rejects.toThrow()
    await prisma.graphEdge.create({ data: { sourceNodeId: a.id, targetNodeId: b.id, edgeType: 'REPORTED_BY', label: 'reported by' } })
    await expect(
      prisma.graphEdge.create({ data: { sourceNodeId: a.id, targetNodeId: b.id, edgeType: 'REPORTED_BY', label: 'x' } }),
    ).rejects.toThrow()
    const arc = await prisma.evidenceArc.create({
      data: { rootNodeId: a.id, title: 'Arc', summary: 's', truePotentialScore: 0.5, confidence: 0.5, originStrength: 0.5, sourceDiversity: 0.5, contradictionScore: 0, momentumScore: 0.5, chainClass: 'WEAK_SIGNAL' },
    })
    await prisma.evidenceArcStep.create({ data: { evidenceArcId: arc.id, degree: 1, nodeId: b.id, relationshipType: 'REPORTED_BY', explanation: 'x', confidence: 0.5, sourceCount: 1, pathWeight: 0.5 } })
    expect(await prisma.evidenceArcStep.count()).toBe(1)
  })

  it('creates LLMProviderConfig, LLMRun + LLMOutputValidation, and OpportunityPlaybook linked to card', async () => {
    // Create a provider config
    const provider = await prisma.lLMProviderConfig.create({
      data: {
        providerName: 'Anthropic',
        modelName: 'claude-test',
        taskTypesJson: JSON.stringify(['CLAIM_EXTRACTION_ASSIST']),
        maxContextTokens: 100000,
        costTier: 'MEDIUM',
        latencyTier: 'MEDIUM',
        strengthsJson: JSON.stringify(['Test']),
        weaknessesJson: JSON.stringify(['None']),
        enabled: false,
      },
    })
    expect(provider.modelName).toBe('claude-test')
    expect(provider.enabled).toBe(false)

    // Create an LLMRun
    const run = await prisma.lLMRun.create({
      data: {
        taskType: 'CLAIM_EXTRACTION_ASSIST',
        provider: 'Anthropic',
        model: 'claude-test',
        promptHash: 'hash123',
        status: 'SUCCEEDED',
        tokenCountInput: 100,
        tokenCountOutput: 50,
        estimatedCost: 0.01,
        latencyMs: 500,
      },
    })
    expect(run.status).toBe('SUCCEEDED')

    // Create a validation linked to the run
    const validation = await prisma.lLMOutputValidation.create({
      data: {
        llmRunId: run.id,
        validationStatus: 'PASSED',
        schemaValid: true,
        evidenceGrounded: true,
      },
    })
    expect(validation.schemaValid).toBe(true)
    expect(validation.llmRunId).toBe(run.id)

    // Create opportunity card and linked playbook
    const scanRun = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Test event', eventType: 'HIRING_ACCELERATION', eventClass: 'OPPORTUNITY',
        summary: 't', severity: 0.5, probability: 0.6, confidence: 0.7, evidenceCount: 1,
        sourceDiversityScore: 0.8, signalStrength: 0.6, noveltyScore: 0.7, opportunityScore: 0.8,
        riskScore: 0.2, createdFromScanRunId: scanRun.id, isFixture: true,
      },
    })
    const card = await prisma.opportunityCard.create({
      data: {
        eventCandidateId: event.id, title: 'Test card', opportunityType: 'SALES',
        summary: 's', buyerPain: 'p', suggestedOffer: 'o', urgencyScore: 0.5, commercialValueScore: 0.6,
        confidence: 0.7, evidenceScore: 0.6, actionabilityScore: 0.7, opportunityLogic: 'ol', riskLogic: 'rl',
        nextBestAction: 'review', isFixture: true,
      },
    })
    const playbook = await prisma.opportunityPlaybook.create({
      data: {
        opportunityCardId: card.id,
        title: 'Test playbook',
        targetBuyer: 'Fortune 500 CIO',
        commercialHypothesis: 'If hiring surge, then procurement risk',
        painStatement: 'Talent cost pressure',
        offerAngle: 'Cost reduction',
        discoveryQuestionsJson: JSON.stringify(['Q1', 'Q2']),
        outreachAngle: 'Leadership change',
        likelyObjectionsJson: JSON.stringify(['Budget', 'Timeline']),
        proofPointsJson: JSON.stringify(['Case study A', 'Case study B']),
        firstAction: 'Call CFO',
        confidence: 0.8,
        generatedBy: 'DETERMINISTIC',
        isFixture: true,
      },
    })
    expect(playbook.opportunityCardId).toBe(card.id)
    expect(playbook.confidence).toBe(0.8)

    // Verify unique constraint on opportunityCardId
    await expect(
      prisma.opportunityPlaybook.create({
        data: {
          opportunityCardId: card.id,
          title: 'Dup playbook',
          targetBuyer: 'Buyer',
          commercialHypothesis: 'Hyp',
          painStatement: 'Pain',
          offerAngle: 'Angle',
          outreachAngle: 'Outreach',
          firstAction: 'Action',
          confidence: 0.5,
        },
      }),
    ).rejects.toThrow()
  })

  it('creates MarketSearchQuery + MarketSearchResult with proper relation loading', async () => {
    const query = await prisma.marketSearchQuery.create({
      data: {
        query: 'copper supply risks',
        queryType: 'COMMODITY',
        resultCount: 2,
      },
    })
    const result1 = await prisma.marketSearchResult.create({
      data: {
        queryId: query.id,
        resultType: 'COMMODITY',
        title: 'Copper supply chain',
        summary: 'Analysis of copper supply',
        confidence: 0.85,
        refType: 'commodity',
        refId: 'copper-fixture',
      },
    })
    const result2 = await prisma.marketSearchResult.create({
      data: {
        queryId: query.id,
        resultType: 'INSTRUMENT',
        title: 'Copper futures',
        summary: 'Trading analysis',
        confidence: 0.72,
        refType: 'instrument',
        refId: 'copper-future-fixture',
      },
    })

    const loaded = await prisma.marketSearchQuery.findUniqueOrThrow({
      where: { id: query.id },
      include: { results: true },
    })
    expect(loaded.query).toBe('copper supply risks')
    expect(loaded.results).toHaveLength(2)
    expect(loaded.results[0].id).toBe(result1.id)
    expect(loaded.results[1].id).toBe(result2.id)
  })

  it('enforces InstrumentProfile unique constraint on (provider, symbol)', async () => {
    const provider = 'FIXTURE'
    const symbol = 'TEST-EQUITY'
    await prisma.instrumentProfile.create({
      data: {
        provider,
        symbol,
        name: 'Test Equity',
        exchange: 'LSE',
        instrumentType: 'EQUITY',
        currency: 'GBP',
        isFixture: true,
      },
    })
    await expect(
      prisma.instrumentProfile.create({
        data: {
          provider,
          symbol,
          name: 'Duplicate Equity',
          exchange: 'NYSE',
          instrumentType: 'EQUITY',
          currency: 'USD',
          isFixture: false,
        },
      }),
    ).rejects.toThrow()
  })

  it('enforces CommodityProfile unique constraint on name', async () => {
    await prisma.commodityProfile.create({
      data: {
        name: 'Test Commodity',
        category: 'METAL',
        provider: 'FIXTURE',
        isFixture: true,
      },
    })
    await expect(
      prisma.commodityProfile.create({
        data: {
          name: 'Test Commodity',
          category: 'ENERGY',
          provider: 'FIXTURE',
          isFixture: true,
        },
      }),
    ).rejects.toThrow()
  })
})
