import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import type { LLMProvider, LLMRequest } from '@/server/llm/types'
import { isWithinDailyBudget } from '@/server/llm/budget'
import { runLLMTask } from '@/server/llm/run'
import { resetDb } from '../helpers'

async function seedRuns(n: number) {
  for (let i = 0; i < n; i++) {
    await prisma.lLMRun.create({
      data: {
        taskType: 'COMPANY_IMPACT_ANALYSIS', provider: 'x', model: 'm', promptHash: 'h',
        inputSummary: '', outputSummary: '', status: 'SUCCEEDED',
        tokenCountInput: 1, tokenCountOutput: 1, estimatedCost: 0, latencyMs: 1,
      },
    })
  }
}

describe('LLM daily budget', () => {
  beforeEach(resetDb)

  it('is within budget under the call cap and over at the cap', async () => {
    await seedRuns(2)
    expect(await isWithinDailyBudget(new Date(), { callCap: 3 })).toBe(true)
    expect(await isWithinDailyBudget(new Date(), { callCap: 2 })).toBe(false)
  })

  it('does not count SKIPPED runs', async () => {
    await prisma.lLMRun.create({
      data: {
        taskType: 'COMPANY_IMPACT_ANALYSIS', provider: 'none', model: 'none', promptHash: 'h',
        inputSummary: '', outputSummary: '', status: 'SKIPPED_NO_PROVIDER',
        tokenCountInput: 0, tokenCountOutput: 0, estimatedCost: 0, latencyMs: 0,
      },
    })
    expect(await isWithinDailyBudget(new Date(), { callCap: 1 })).toBe(true)
  })

  it('enforces the MONETARY cap independently of the call count', async () => {
    // One expensive run — far under the call cap, over a small spend cap.
    await prisma.lLMRun.create({
      data: {
        taskType: 'COMPANY_IMPACT_ANALYSIS', provider: 'x', model: 'claude-opus-4-8', promptHash: 'h',
        inputSummary: '', outputSummary: '', status: 'SUCCEEDED',
        tokenCountInput: 100_000, tokenCountOutput: 50_000, estimatedCost: 1.75, latencyMs: 1,
      },
    })
    expect(await isWithinDailyBudget(new Date(), { callCap: 100, spendCapUsd: 2 })).toBe(true)
    expect(await isWithinDailyBudget(new Date(), { callCap: 100, spendCapUsd: 1.5 })).toBe(false)
  })

  it('runLLMTask over budget logs SKIPPED_BUDGET and never calls the provider', async () => {
    await seedRuns(2)
    let called = false
    const provider: LLMProvider = {
      name: 'fake',
      async generate(_r: LLMRequest) {
        called = true
        return { text: 'x', tokensIn: 1, tokensOut: 1 }
      },
    }
    process.env.LLM_DAILY_CALL_CAP = '2'
    try {
      const res = await runLLMTask({ taskType: 'COMPANY_IMPACT_ANALYSIS', system: 's', prompt: 'p' }, { provider })
      expect(res.status).toBe('SKIPPED_BUDGET')
      expect(called).toBe(false)
    } finally {
      delete process.env.LLM_DAILY_CALL_CAP
    }
  })
})
