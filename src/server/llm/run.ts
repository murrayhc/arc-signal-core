import { createHash } from 'node:crypto'
import { prisma } from '@/server/db'
import type { LLMRunStatus } from '@/shared/enums'
import { getActiveProvider } from './provider'
import { loadRouterConfigs, routeTask } from './router'
import { NoProviderConfiguredError, type LLMProvider, type LLMRequest } from './types'
import { validateLLMOutput, type ValidateOptions, type ValidationResult } from './validate'

/** Logged in LLMRun.model when routeTask found no config supporting the task
 *  type — an honest "nothing was routed" marker, never a fabricated model id. */
const UNROUTED_MODEL = 'unrouted'

export type RunLLMTaskOptions = {
  /** Injectable provider for tests/dormant callers. Pass null explicitly to
   *  force the dormant (SKIPPED_NO_PROVIDER) path. Omit to fall back to
   *  getActiveProvider(). */
  provider?: LLMProvider | null
  validate?: ValidateOptions
}

export type RunLLMTaskResult = {
  status: LLMRunStatus
  /** Present ONLY when validation PASSED — fail closed. */
  text?: string
  parsed?: unknown
  llmRunId: string
  validation: ValidationResult | null
}

/** Per-token cost estimate constants, keyed by costTier. Deliberately crude —
 *  good enough for relative cost tracking, not a billing system. */
const COST_PER_TOKEN_BY_TIER: Record<string, number> = {
  LOW: 0.000001,
  MEDIUM: 0.000005,
  HIGH: 0.000015,
}

function hashPrompt(system: string, prompt: string): string {
  return createHash('sha256').update(system + prompt).digest('hex')
}

/** Non-sensitive metadata about the input — NEVER the raw prompt/system
 *  text itself, only its shape (character length). */
function summarizeInput(system: string, prompt: string): string {
  return `system:${system.length}chars prompt:${prompt.length}chars`
}

function summarize(text: string, maxLen = 120): string {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > maxLen ? collapsed.slice(0, maxLen) + '…' : collapsed
}

/** Runs a single LLM task end-to-end: resolves the provider, calls it,
 *  validates the output, and logs an audited LLMRun (+ LLMOutputValidation
 *  when applicable). NEVER logs the raw prompt/system text or any API key —
 *  only a sha256 promptHash and short, non-sensitive summaries.
 *
 *  Fail-closed: `text` is populated ONLY when validation status is PASSED.
 *  Dormant-safe: when no provider is available (opts.provider === undefined
 *  and getActiveProvider() resolves null, or opts.provider === null is
 *  passed explicitly), this logs SKIPPED_NO_PROVIDER and returns no text —
 *  no network call is ever attempted. */
export async function runLLMTask(req: LLMRequest, opts: RunLLMTaskOptions): Promise<RunLLMTaskResult> {
  const provider = opts.provider === undefined ? await getActiveProvider() : opts.provider
  const promptHash = hashPrompt(req.system, req.prompt)
  const inputSummary = summarizeInput(req.system, req.prompt)

  if (!provider) {
    const run = await prisma.lLMRun.create({
      data: {
        taskType: req.taskType,
        provider: 'none',
        model: 'none',
        promptHash,
        inputSummary,
        outputSummary: '',
        status: 'SKIPPED_NO_PROVIDER' satisfies LLMRunStatus,
        tokenCountInput: 0,
        tokenCountOutput: 0,
        estimatedCost: 0,
        latencyMs: 0,
      },
    })
    return { status: 'SKIPPED_NO_PROVIDER', llmRunId: run.id, validation: null }
  }

  // Resolve which model this task routes to BEFORE calling the provider, so both
  // the audit row and the request sent to the provider agree on the same model —
  // routeTask is pure/DB-read-only, never a network call, so this stays dormant-safe.
  const routed = routeTask(req.taskType, await loadRouterConfigs())
  const routedModel = routed?.modelName ?? UNROUTED_MODEL
  const routedCostTier = routed?.costTier ?? 'MEDIUM'
  const routedReq: LLMRequest = routed ? { ...req, model: routed.modelName } : req

  const startedAt = Date.now()
  let response
  try {
    response = await provider.generate(routedReq)
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    // A key was set (so getActiveProvider() returned a live-looking provider) but the
    // provider itself couldn't actually run — e.g. @anthropic-ai/sdk isn't installed.
    // This is the documented "dormant" meaning, not a genuine call failure — log it
    // as SKIPPED_NO_PROVIDER so it doesn't read as a broken integration.
    const isNoProvider = err instanceof NoProviderConfiguredError
    const run = await prisma.lLMRun.create({
      data: {
        taskType: req.taskType,
        provider: provider.name,
        model: routedModel,
        promptHash,
        inputSummary,
        outputSummary: '',
        status: (isNoProvider ? 'SKIPPED_NO_PROVIDER' : 'FAILED') satisfies LLMRunStatus,
        tokenCountInput: 0,
        tokenCountOutput: 0,
        estimatedCost: 0,
        latencyMs,
        errorMessage: err instanceof Error ? err.message : 'Unknown provider error',
      },
    })
    return {
      status: isNoProvider ? 'SKIPPED_NO_PROVIDER' : 'FAILED',
      llmRunId: run.id,
      validation: null,
    }
  }
  const latencyMs = Date.now() - startedAt

  const validation = validateLLMOutput(response.text, opts.validate ?? {})
  const finalStatus: LLMRunStatus = validation.validationStatus === 'PASSED' ? 'SUCCEEDED' : 'REJECTED_VALIDATION'
  // Rejected output may contain the very prohibited/advice content we blocked —
  // redact it from the audit row rather than retaining the snippet verbatim.
  const outputSummary = finalStatus === 'SUCCEEDED' ? summarize(response.text) : '[redacted: output failed validation]'

  const estimatedCost =
    (response.tokensIn + response.tokensOut) *
    (COST_PER_TOKEN_BY_TIER[routedCostTier] ?? COST_PER_TOKEN_BY_TIER.MEDIUM)

  const run = await prisma.lLMRun.create({
    data: {
      taskType: req.taskType,
      provider: provider.name,
      model: routedModel,
      promptHash,
      inputSummary,
      outputSummary,
      status: finalStatus,
      tokenCountInput: response.tokensIn,
      tokenCountOutput: response.tokensOut,
      estimatedCost,
      latencyMs,
    },
  })

  await prisma.lLMOutputValidation.create({
    data: {
      llmRunId: run.id,
      validationStatus: validation.validationStatus,
      schemaValid: validation.schemaValid,
      evidenceGrounded: validation.evidenceGrounded,
      prohibitedLanguageDetected: validation.prohibitedLanguageDetected,
      unsupportedClaimsDetected: validation.unsupportedClaimsDetected,
      reviewNotes: validation.notes,
    },
  })

  if (validation.validationStatus !== 'PASSED') {
    return { status: 'REJECTED_VALIDATION', llmRunId: run.id, validation }
  }

  return { status: 'SUCCEEDED', text: response.text, parsed: validation.parsed, llmRunId: run.id, validation }
}
