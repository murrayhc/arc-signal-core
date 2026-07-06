import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { prisma } from '@/server/db'
import type { LLMProvider } from '@/server/llm/types'
import { enrichText } from '@/server/llm/enrich-text'
import { resetDb } from '../helpers'

function fake(text: string): LLMProvider {
  return { name: 'fake', async generate() { return { text, tokensIn: 1, tokensOut: 1 } } }
}
const throwing: LLMProvider = { name: 'boom', async generate() { throw new Error('network') } }

describe('enrichText', () => {
  beforeEach(resetDb)

  it('returns text + llmRunId on clean output', async () => {
    const out = await enrichText({
      taskType: 'COMPANY_IMPACT_ANALYSIS',
      system: 's',
      prompt: 'p',
      provider: fake('Voltcore may face pressure as the situation develops.'),
    })
    expect(out).not.toBeNull()
    expect(out!.text).toContain('Voltcore')
    const run = await prisma.lLMRun.findUnique({ where: { id: out!.llmRunId } })
    expect(run?.status).toBe('SUCCEEDED')
  })

  it('returns null on advice language (rejected by validation)', async () => {
    const out = await enrichText({
      taskType: 'COMPANY_IMPACT_ANALYSIS',
      system: 's',
      prompt: 'p',
      provider: fake('You should buy this stock now.'),
    })
    expect(out).toBeNull()
  })

  it('returns null on schema failure', async () => {
    const out = await enrichText({
      taskType: 'PRESENT_CONTEXT',
      system: 's',
      prompt: 'p',
      provider: fake('not json'),
      validate: { schema: z.object({ historic: z.string() }) },
    })
    expect(out).toBeNull()
  })

  it('returns null when the provider throws', async () => {
    const out = await enrichText({
      taskType: 'COMPANY_IMPACT_ANALYSIS',
      system: 's',
      prompt: 'p',
      provider: throwing,
    })
    expect(out).toBeNull()
  })

  it('returns null when dormant (no provider)', async () => {
    const out = await enrichText({
      taskType: 'COMPANY_IMPACT_ANALYSIS',
      system: 's',
      prompt: 'p',
      provider: null,
    })
    expect(out).toBeNull()
  })
})
