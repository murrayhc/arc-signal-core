import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import { runLLMTask } from '@/server/llm/run'
import { getActiveProvider } from '@/server/llm/provider'
import type { LLMProvider, LLMRequest, LLMResponse } from '@/server/llm/types'

class FakeProvider implements LLMProvider {
  name = 'fake-provider'
  constructor(
    private readonly respond: (req: LLMRequest) => LLMResponse | Promise<LLMResponse> = () => ({
      text: 'A clean, safe response.',
      tokensIn: 10,
      tokensOut: 20,
    })
  ) {}
  async generate(req: LLMRequest): Promise<LLMResponse> {
    return this.respond(req)
  }
}

class ThrowingProvider implements LLMProvider {
  name = 'throwing-provider'
  async generate(): Promise<LLMResponse> {
    throw new Error('upstream exploded')
  }
}

const baseRequest: LLMRequest = {
  taskType: 'FAST_CLASSIFICATION',
  system: 'You are a careful classifier.',
  prompt: 'Classify this signal: hiring slowdown at Acme Corp.',
}

describe('runLLMTask', () => {
  beforeEach(resetDb)

  it('SUCCEEDED path: returns text, logs a SUCCEEDED LLMRun, and a PASSED validation', async () => {
    const result = await runLLMTask(baseRequest, { provider: new FakeProvider() })
    expect(result.status).toBe('SUCCEEDED')
    expect(result.text).toBe('A clean, safe response.')
    expect(result.validation).not.toBeNull()
    expect(result.validation!.validationStatus).toBe('PASSED')

    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
    expect(run.status).toBe('SUCCEEDED')

    const validations = await prisma.lLMOutputValidation.findMany({ where: { llmRunId: result.llmRunId } })
    expect(validations).toHaveLength(1)
    expect(validations[0].validationStatus).toBe('PASSED')
  })

  it('REJECTED_VALIDATION path: advice language withholds text and logs REJECTED_VALIDATION', async () => {
    const provider = new FakeProvider(() => ({
      text: 'You should buy this stock immediately.',
      tokensIn: 8,
      tokensOut: 12,
    }))
    const result = await runLLMTask(baseRequest, { provider })
    expect(result.status).toBe('REJECTED_VALIDATION')
    expect(result.text).toBeUndefined()
    expect(result.validation).not.toBeNull()
    expect(result.validation!.validationStatus).toBe('FAILED')
    expect(result.validation!.prohibitedLanguageDetected).toBe(true)

    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
    expect(run.status).toBe('REJECTED_VALIDATION')

    const validations = await prisma.lLMOutputValidation.findMany({ where: { llmRunId: result.llmRunId } })
    expect(validations).toHaveLength(1)
    expect(validations[0].validationStatus).toBe('FAILED')
    expect(validations[0].prohibitedLanguageDetected).toBe(true)
  })

  it('FAILED path: a throwing provider logs a FAILED LLMRun and returns no text', async () => {
    const result = await runLLMTask(baseRequest, { provider: new ThrowingProvider() })
    expect(result.status).toBe('FAILED')
    expect(result.text).toBeUndefined()
    expect(result.validation).toBeNull()

    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
    expect(run.status).toBe('FAILED')
    expect(run.errorMessage).toBeTruthy()
  })

  it('SKIPPED_NO_PROVIDER (dormant) path: provider=null logs SKIPPED_NO_PROVIDER and returns no text', async () => {
    const result = await runLLMTask(baseRequest, { provider: null })
    expect(result.status).toBe('SKIPPED_NO_PROVIDER')
    expect(result.text).toBeUndefined()
    expect(result.validation).toBeNull()

    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
    expect(run.status).toBe('SKIPPED_NO_PROVIDER')
  })

  it('defaults to getActiveProvider() when no provider is injected, and stays dormant with no key/enabled config', async () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(await getActiveProvider()).toBeNull()
    const result = await runLLMTask(baseRequest, {})
    expect(result.status).toBe('SKIPPED_NO_PROVIDER')
  })

  it('promptHash is a 64-char hex hash and the raw prompt/system text is never stored on the LLMRun', async () => {
    const secretPrompt = 'THIS-IS-THE-SECRET-RAW-PROMPT-CONTENT'
    const req: LLMRequest = { ...baseRequest, prompt: secretPrompt }
    const result = await runLLMTask(req, { provider: new FakeProvider() })

    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
    expect(run.promptHash).toMatch(/^[0-9a-f]{64}$/)

    const runJson = JSON.stringify(run)
    expect(runJson).not.toContain(secretPrompt)
    expect(runJson).not.toContain(req.system)
  })

  it('never stores an API key anywhere on the logged LLMRun', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-super-secret-test-key'
    try {
      const result = await runLLMTask(baseRequest, { provider: new FakeProvider() })
      const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
      expect(JSON.stringify(run)).not.toContain('sk-ant-super-secret-test-key')
    } finally {
      delete process.env.ANTHROPIC_API_KEY
    }
  })
})
