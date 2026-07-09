import { beforeEach, describe, expect, it } from 'vitest'
import { runSeed } from '@/server/seed'
import { loadRouterConfigs, routeTask } from '@/server/llm/router'
import { resetDb } from './helpers'

describe('LLM routing for consequence task classes', () => {
  beforeEach(resetDb)

  it('routes each new task class to the intended cost tier', async () => {
    await runSeed({ includeLive: false })
    // Routing only considers ENABLED configs — this test describes the
    // activated routing table, so enable the seeded (dormant) configs first.
    const { prisma } = await import('@/server/db')
    await prisma.lLMProviderConfig.updateMany({ data: { enabled: true } })
    const configs = await loadRouterConfigs()

    // Reasoning tier (HIGH) — deep analysis.
    expect(routeTask('COMPANY_IMPACT_ANALYSIS', configs)?.costTier).toBe('HIGH')
    expect(routeTask('FUTURE_SCENARIOS', configs)?.costTier).toBe('HIGH')
    expect(routeTask('SOURCE_COMPARISON', configs)?.costTier).toBe('HIGH')

    // Fast tier (LOW) — tagging/repair.
    expect(routeTask('CLAIM_NORMALISATION', configs)?.costTier).toBe('LOW')
    expect(routeTask('JSON_REPAIR', configs)?.costTier).toBe('LOW')

    // Synthesis tier (MEDIUM) — prose generation.
    expect(routeTask('REPORT_SYNTHESIS', configs)?.costTier).toBe('MEDIUM')
    expect(routeTask('STRATEGIC_POSITIONING', configs)?.costTier).toBe('MEDIUM')
    expect(routeTask('HISTORIC_CONTEXT', configs)?.costTier).toBe('MEDIUM')
  })
})
