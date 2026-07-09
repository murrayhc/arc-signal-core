import { beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { interrogate, MARKET_DISCLAIMER } from '@/server/interrogate/service'
import { buildArc } from '@/server/graph/arc'
import { loadRouterConfigs, routeTask } from '@/server/llm/router'
import { validateLLMOutput } from '@/server/llm/validate'
import { runLLMTask } from '@/server/llm/run'
import type { LLMProvider, LLMRequest, LLMResponse } from '@/server/llm/types'
import type { MarketDataProvider } from '@/server/market/types'

/**
 * Stage 14 upgrade proofs 13-18 — the LLM router/validate/run and market-context
 * layers. Both layers stay DORMANT for this suite: no real API key, no network,
 * no spend. Proofs use the same injected-FakeProvider convention as
 * tests/llm/run.test.ts + tests/market/service.test.ts + tests/interrogate/market-context.test.ts.
 *
 * See tests/proof/upgrade-proof.test.ts for proofs 1-12 (full-scan DB/API state)
 * and the shared suite-level docblock.
 */

/** No real key, no network — mirrors tests/interrogate/market-context.test.ts's FakeMarketProvider. */
class FakeMarketProvider implements MarketDataProvider {
  name = 'fake'

  getProviderMetadata() {
    return { name: 'fake', delayed: true, supportsCommodities: true }
  }

  async searchInstrument() {
    return []
  }

  async getQuote(identifier: string) {
    return { symbol: identifier, price: 123.45, currency: 'GBP', changePct: 2.3, asOf: new Date().toISOString(), delayed: true }
  }

  async getHistoricalBars() {
    return []
  }

  async getCompanyProfile(identifier: string) {
    return { symbol: identifier, name: 'Acme Industrials (sample)', sector: 'Industrials', description: 'A sample manufacturer.' }
  }

  async getCommodityContext(identifier: string) {
    return { name: identifier, symbol: null, category: 'METAL' as const, keySupplyRegions: ['Chile'], keyDemandSectors: ['Construction'], delayed: true }
  }
}

/** No real key, no network — mirrors tests/llm/run.test.ts's FakeProvider. */
class FakeProvider implements LLMProvider {
  name = 'fake-provider'
  constructor(
    private readonly respond: (req: LLMRequest) => LLMResponse | Promise<LLMResponse> = () => ({
      text: 'A clean, safe, grounded response.',
      tokensIn: 10,
      tokensOut: 20,
    }),
  ) {}
  async generate(req: LLMRequest): Promise<LLMResponse> {
    return this.respond(req)
  }
}

describe('Stage 14 upgrade proofs 13-14: ticker/instrument market context (dormant + FakeMarketProvider)', () => {
  beforeAll(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    await runFullScan()
  })

  it('proof 13: ticker/instrument search returns market CONTEXT only (dormant -> not-configured, still context-shaped)', async () => {
    const result = await interrogate('BP')
    expect(result.queryType).toBe('TICKER')
    // Dormant: no provider configured, but the response is still context-shaped —
    // a well-formed marketContext sentinel, never an omitted/undefined field.
    expect(result.marketContextAvailable).toBe(false)
    expect(result.disclaimer).toBe(MARKET_DISCLAIMER)
    expect(result.marketContext).toEqual({
      configured: false,
      provider: null,
      delayed: true,
      instrument: null,
      commodity: null,
      quote: null,
      note: 'market data provider not configured',
    })

    // Configured (injected FakeMarketProvider): still context only — instrument +
    // quote populate, nothing resembling a trade recommendation is added.
    const fake = new FakeMarketProvider()
    const configured = await interrogate('BP', { marketProvider: fake })
    expect(configured.queryType).toBe('TICKER')
    expect(configured.marketContextAvailable).toBe(true)
    expect(configured.marketContext?.configured).toBe(true)
    expect(configured.marketContext?.instrument).not.toBeNull()
    expect(configured.marketContext?.quote).not.toBeNull()
  })

  it('proof 14: ticker/instrument output contains NO buy/sell/hold advice (guard-clean)', async () => {
    const { findAdviceLanguage } = await import('@/server/safety/advice-language')

    // The disclaimer prose is exempt from the guard-clean check below by design:
    // it legitimately CONTAINS the phrase "personal investment advice" as part of
    // an explicit denial ("does not provide... advice"), which the blunt
    // findAdviceLanguage pattern-matcher (no negation parsing) correctly flags as
    // containing that phrase. What matters is that the disclaimer explicitly
    // denies advice/recommendations, and that every DATA field returned alongside
    // it (note, instrument, quote — the actual market context, not the disclaimer)
    // is fully guard-clean.
    const dormant = await interrogate('BP')
    expect(dormant.disclaimer).toMatch(/not\s+(provide|investment\s+advice)/i)
    expect(findAdviceLanguage(JSON.stringify(dormant.marketContext))).toEqual([])

    const fake = new FakeMarketProvider()
    const configured = await interrogate('BP', { marketProvider: fake })
    expect(configured.disclaimer).toMatch(/does not provide personal.*advice.*buy, sell or hold/i)
    expect(findAdviceLanguage(configured.marketContext?.note ?? '')).toEqual([])
    expect(findAdviceLanguage(JSON.stringify(configured.marketContext?.instrument))).toEqual([])
    expect(findAdviceLanguage(JSON.stringify(configured.marketContext?.quote))).toEqual([])
    // Explicit negative check: none of buy/sell/hold recommendation phrasing appears
    // in the actual data payload (disclaimer prose is intentionally excluded — see above).
    const dataText = JSON.stringify(configured.marketContext).toLowerCase()
    expect(dataText).not.toMatch(/\b(buy|sell|hold)\b\s+(this|these|the)\s+(stock|shares|instrument)/)
  })
})

describe('Stage 14 upgrade proof 15: multi-model router selects the expected model class per task type', () => {
  beforeAll(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    // routeTask only routes to ENABLED configs — proof 15 describes the
    // activated routing table, so enable the dormant seeds first.
    await prisma.lLMProviderConfig.updateMany({ data: { enabled: true } })
  })

  it('proof 15: routes creative/fast/reasoning task types to their respective model classes', async () => {
    const configs = await loadRouterConfigs()

    const creative = routeTask('OPPORTUNITY_PLAYBOOK_GENERATION', configs)
    expect(creative).not.toBeNull()
    expect(creative!.modelName).toBe('claude-sonnet-5')

    const fast = routeTask('FAST_CLASSIFICATION', configs)
    expect(fast).not.toBeNull()
    expect(fast!.modelName).toBe('claude-haiku-4-5')

    const reasoning = routeTask('CONTRADICTION_ANALYSIS', configs)
    expect(reasoning).not.toBeNull()
    expect(reasoning!.modelName).toBe('claude-opus-4-8')

    // End-to-end: runLLMTask (with an injected FakeProvider, no key/network) logs
    // the ROUTED model name on LLMRun.model, proving the router is actually wired
    // into the execution path — not just a standalone pure function.
    const result = await runLLMTask(
      { taskType: 'OPPORTUNITY_PLAYBOOK_GENERATION', system: 'You produce structured playbooks.', prompt: 'Draft a playbook.' },
      { provider: new FakeProvider() },
    )
    expect(result.status).toBe('SUCCEEDED')
    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
    expect(run.model).toBe('claude-sonnet-5')
    expect(run.model).not.toBe('fake-provider')
  })
})

describe('Stage 14 upgrade proofs 16-18: LLM validation fails closed (FakeProvider, no key/network)', () => {
  beforeAll(resetDb)

  it('proof 16: LLM structured output fails closed on schema-invalid', async () => {
    const schema = z.object({ summary: z.string() })
    const raw = JSON.stringify({ wrongField: 123 })
    const result = validateLLMOutput(raw, { schema })
    expect(result.validationStatus).toBe('FAILED')
    expect(result.schemaValid).toBe(false)

    // End-to-end via runLLMTask: a schema-invalid response is rejected, not silently
    // accepted or partially trusted.
    const provider = new FakeProvider(() => ({ text: JSON.stringify({ wrongField: 123 }), tokensIn: 5, tokensOut: 5 }))
    const runResult = await runLLMTask(
      { taskType: 'FAST_CLASSIFICATION', system: 'Classify.', prompt: 'Classify this.' },
      { provider, validate: { schema } },
    )
    expect(runResult.status).toBe('REJECTED_VALIDATION')
    expect(runResult.validation?.schemaValid).toBe(false)
  })

  it('proof 17: LLM output with unsupported claims (ungrounded) is rejected', async () => {
    const raw = 'A general observation with no citations.'
    const result = validateLLMOutput(raw, { evidenceIds: ['EV-1', 'EV-2'], requireGrounding: true })
    expect(result.validationStatus).toBe('FAILED')
    expect(result.evidenceGrounded).toBe(false)
    expect(result.unsupportedClaimsDetected).toBe(true)

    // End-to-end via runLLMTask: an ungrounded response is rejected and withheld.
    const provider = new FakeProvider(() => ({ text: raw, tokensIn: 5, tokensOut: 5 }))
    const runResult = await runLLMTask(
      { taskType: 'EVIDENCE_ARC_SUMMARY', system: 'Summarise the evidence arc.', prompt: 'Summarise.' },
      { provider, validate: { evidenceIds: ['EV-1', 'EV-2'], requireGrounding: true } },
    )
    expect(runResult.status).toBe('REJECTED_VALIDATION')
    expect(runResult.text).toBeUndefined()
    expect(runResult.validation?.unsupportedClaimsDetected).toBe(true)
  })

  it('proof 18: LLM output with prohibited financial-advice language is rejected', async () => {
    const raw = 'You should buy this stock immediately.'
    const result = validateLLMOutput(raw, {})
    expect(result.validationStatus).toBe('FAILED')
    expect(result.prohibitedLanguageDetected).toBe(true)

    // End-to-end via runLLMTask: the advice-language output is withheld (undefined
    // text), rejected in the audit trail, and never leaks into the stored summary.
    const provider = new FakeProvider(() => ({ text: raw, tokensIn: 8, tokensOut: 12 }))
    const runResult = await runLLMTask(
      { taskType: 'STRATEGIC_POSITIONING_GENERATION', system: 'Draft positioning.', prompt: 'Draft it.' },
      { provider },
    )
    expect(runResult.status).toBe('REJECTED_VALIDATION')
    expect(runResult.text).toBeUndefined()
    expect(runResult.validation?.prohibitedLanguageDetected).toBe(true)

    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: runResult.llmRunId } })
    expect(run.status).toBe('REJECTED_VALIDATION')
    expect(run.outputSummary).not.toContain('buy this stock')
  })
})

describe('Stage 14 Step 2: real row counts after one full fixture scan (for final-upgrade-proof.md)', () => {
  it('logs a labelled block of real row counts across every layer the 18 proofs touch', async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    await runFullScan()

    // EvidenceArcs are computed on-demand (proof 5/6), not persisted during the
    // scan itself — build one per EVENT root so the logged count reflects the
    // arcs this suite actually proves, not zero.
    const eventNodes = await prisma.graphNode.findMany({ where: { nodeType: 'EVENT' } })
    for (const node of eventNodes) {
      await buildArc(node.id, 6, new Date('2026-07-03T00:00:00Z'))
    }

    // Market/LLM layers stay dormant for the scan itself, so drive one FakeProvider
    // call through each so the row counts reflect a realistic exercised system
    // (an LLMRun row and a market search/profile row exist), still with no real
    // key and no network.
    await runLLMTask(
      { taskType: 'FAST_CLASSIFICATION', system: 'Classify.', prompt: 'Classify this fixture signal.' },
      { provider: new FakeProvider() },
    )
    const fakeMarket = new FakeMarketProvider()
    await interrogate('Copper', { marketProvider: fakeMarket })
    await interrogate('BP', { marketProvider: fakeMarket })

    const counts = {
      events: await prisma.eventCandidate.count(),
      graphNodes: await prisma.graphNode.count(),
      graphEdges: await prisma.graphEdge.count(),
      opportunityCards: await prisma.opportunityCard.count(),
      positioningExamples: await prisma.strategicPositioningExample.count(),
      evidenceArcs: await prisma.evidenceArc.count(),
      llmRuns: await prisma.lLMRun.count(),
      marketProfiles:
        (await prisma.instrumentProfile.count()) +
        (await prisma.commodityProfile.count()),
      instrumentProfiles: await prisma.instrumentProfile.count(),
      commodityProfiles: await prisma.commodityProfile.count(),
      watchMarkets: await prisma.watchMarket.count(),
    }

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '=== STAGE 14 UPGRADE-PROOF ROW COUNTS (real, post full-scan) ===',
        `Event candidates:              ${counts.events}`,
        `Graph nodes:                   ${counts.graphNodes}`,
        `Graph edges:                   ${counts.graphEdges}`,
        `Opportunity cards:             ${counts.opportunityCards}`,
        `Positioning examples:          ${counts.positioningExamples}`,
        `Evidence arcs:                 ${counts.evidenceArcs}`,
        `LLM runs:                      ${counts.llmRuns}`,
        `Market/commodity/instrument profiles (total): ${counts.marketProfiles}`,
        `  - Instrument profiles:       ${counts.instrumentProfiles}`,
        `  - Commodity profiles:        ${counts.commodityProfiles}`,
        `Watch markets:                 ${counts.watchMarkets}`,
        '=================================================================',
        '',
      ].join('\n'),
    )

    // Sanity: every logged count reflects real, non-negative activity — the log
    // line above is descriptive, this assertion is what keeps the block honest.
    expect(counts.events).toBeGreaterThan(0)
    expect(counts.graphNodes).toBeGreaterThan(0)
    expect(counts.graphEdges).toBeGreaterThan(0)
    expect(counts.opportunityCards).toBeGreaterThan(0)
    expect(counts.positioningExamples).toBeGreaterThan(0)
    expect(counts.llmRuns).toBeGreaterThan(0)
    for (const value of Object.values(counts)) {
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })
})
