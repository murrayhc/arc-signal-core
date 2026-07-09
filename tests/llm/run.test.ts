import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from '../helpers'
import { runSeed } from '@/server/seed'
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
    // The rejected (prohibited) output must NOT be retained in the audit row.
    expect(run.outputSummary).not.toContain('buy this stock')
    expect(run.outputSummary).toContain('redacted')

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

  it('extraCheckers: a caller-supplied checker can fail validation for text the base advice-language guard misses', async () => {
    // "guaranteed conversion" is NOT matched by findAdviceLanguage's patterns (only
    // "guaranteed returns/profit/gains" and "guaranteed win") — this proves a
    // caller-supplied extraChecker centralises rejection for such phrases via the
    // normal REJECTED_VALIDATION + redaction path, rather than a post-hoc check.
    const provider = new FakeProvider(() => ({
      text: 'This campaign has a guaranteed conversion rate.',
      tokensIn: 8,
      tokensOut: 12,
    }))
    const guaranteedOutcomeChecker = (raw: string): string[] => {
      const m = raw.match(/\bguaranteed\s+conversion\b/i)
      return m ? [m[0]] : []
    }
    const result = await runLLMTask(baseRequest, {
      provider,
      validate: { extraCheckers: [guaranteedOutcomeChecker] },
    })

    expect(result.status).toBe('REJECTED_VALIDATION')
    expect(result.text).toBeUndefined()
    expect(result.validation).not.toBeNull()
    expect(result.validation!.validationStatus).toBe('FAILED')
    expect(result.validation!.prohibitedLanguageDetected).toBe(true)
    expect(result.validation!.notes).toContain('guaranteed conversion')

    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
    expect(run.status).toBe('REJECTED_VALIDATION')
    // Redacted — the same audit-safety path as the base advice-language guard.
    expect(run.outputSummary).not.toContain('guaranteed conversion')
    expect(run.outputSummary).toContain('redacted')
  })
})

describe('runLLMTask — model routing', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    // Routing only considers ENABLED configs — enable the dormant seeds so the
    // routed-model audit assertions below describe the activated state.
    await prisma.lLMProviderConfig.updateMany({ data: { enabled: true } })
  })

  it('logs the ROUTED model name on LLMRun.model for a task the seeded configs support, not the provider name', async () => {
    const req: LLMRequest = {
      taskType: 'OPPORTUNITY_PLAYBOOK_GENERATION',
      system: 'You produce structured playbooks.',
      prompt: 'Draft a playbook.',
    }
    const result = await runLLMTask(req, { provider: new FakeProvider() })
    expect(result.status).toBe('SUCCEEDED')

    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
    // The seeded Sonnet config (router.test.ts confirms routeTask picks this
    // for OPPORTUNITY_PLAYBOOK_GENERATION) — NOT 'fake-provider', the provider name.
    expect(run.model).toBe('claude-sonnet-5')
    expect(run.model).not.toBe('fake-provider')
  })

  it('when no seeded config supports the task, logs honestly rather than fabricating a model name', async () => {
    const req: LLMRequest = {
      taskType: 'TRANSLATION', // router.test.ts confirms no seeded config supports this
      system: 'Translate this.',
      prompt: 'Bonjour.',
    }
    // Injected provider: the caller takes responsibility, so the call proceeds
    // even unrouted — but the audit row never fabricates a model id.
    const result = await runLLMTask(req, { provider: new FakeProvider() })
    expect(result.status).toBe('SUCCEEDED')

    const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
    // Not the (wrong) provider name masquerading as a model, and not a fabricated model id.
    expect(run.model).not.toBe('fake-provider')
  })

  it('LIVE provider path: an unrouted task is SKIPPED_UNROUTED with no provider call — disabled configs are a cost contract', async () => {
    // Simulate the activation cost trap: the owner sets a key and enables ONLY
    // the fast/cheap config. A task class whose supporting configs remain
    // disabled must NOT fall back to a default model and spend money — it must
    // skip before any provider call. (The key is fake; if this gate ever
    // regressed, the run would surface as FAILED, not SKIPPED_UNROUTED.)
    process.env.ANTHROPIC_API_KEY = 'sk-ant-fake-test-key-never-called'
    try {
      await prisma.lLMProviderConfig.updateMany({ data: { enabled: false } })
      await prisma.lLMProviderConfig.updateMany({
        where: { modelName: 'claude-haiku-4-5' },
        data: { enabled: true },
      })
      // OPPORTUNITY_PLAYBOOK_GENERATION is supported only by the (still
      // disabled) sonnet config — so with only haiku enabled it is unrouted.
      const result = await runLLMTask(
        { taskType: 'OPPORTUNITY_PLAYBOOK_GENERATION', system: 's', prompt: 'p' },
        {}, // no injected provider → live getActiveProvider() path
      )
      expect(result.status).toBe('SKIPPED_UNROUTED')
      expect(result.text).toBeUndefined()

      const run = await prisma.lLMRun.findUniqueOrThrow({ where: { id: result.llmRunId } })
      expect(run.status).toBe('SKIPPED_UNROUTED')
      expect(run.model).toBe('unrouted')
      expect(run.tokenCountInput).toBe(0)
      expect(run.estimatedCost).toBe(0)
    } finally {
      delete process.env.ANTHROPIC_API_KEY
    }
  })
})
