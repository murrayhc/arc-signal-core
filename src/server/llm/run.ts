import { createHash } from 'node:crypto'
import { prisma } from '@/server/db'
import type { LLMRunStatus } from '@/shared/enums'
import { isWithinDailyBudget } from './budget'
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

/** Per-model pricing in USD per token, split input/output (Anthropic bills the
 *  two at different rates — output is 5× input on current models). Source:
 *  Anthropic price list, 2026-06 — haiku-4-5 $1/$5, sonnet-5 $3/$15,
 *  opus-4-8 $5/$25 per million tokens. An estimate, not a billing system —
 *  but denominated in real prices so the daily monetary cap means something. */
const USD_PER_TOKEN_BY_MODEL: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1 / 1_000_000, output: 5 / 1_000_000 },
  'claude-sonnet-5': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  'claude-opus-4-8': { input: 5 / 1_000_000, output: 25 / 1_000_000 },
}

/** Fallback for models not in the pricing table: assume sonnet-tier rates —
 *  overestimating a cheap model is safer for a spend cap than underestimating
 *  an expensive one. */
const USD_PER_TOKEN_FALLBACK = { input: 3 / 1_000_000, output: 15 / 1_000_000 }

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const rates = USD_PER_TOKEN_BY_MODEL[model] ?? USD_PER_TOKEN_FALLBACK
  return tokensIn * rates.input + tokensOut * rates.output
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
  const routedReq: LLMRequest = routed ? { ...req, model: routed.modelName } : req

  // Cost-control gate for the LIVE activation path: when the provider came from
  // getActiveProvider() (not injected by the caller) and no ENABLED config routes
  // this task, do not call the provider at all — the owner's enable/disable
  // choices are the routing contract, and falling back to a default model would
  // spend money on a task class the owner never switched on. Explicitly injected
  // providers (tests, dependency-injected callers) bypass this gate by design —
  // injection is the caller taking responsibility for the provider.
  const providerWasInjected = opts.provider !== undefined
  if (!providerWasInjected && !routed) {
    const run = await prisma.lLMRun.create({
      data: {
        taskType: req.taskType,
        provider: provider.name,
        model: UNROUTED_MODEL,
        promptHash,
        inputSummary,
        outputSummary: '',
        status: 'SKIPPED_UNROUTED' satisfies LLMRunStatus,
        tokenCountInput: 0,
        tokenCountOutput: 0,
        estimatedCost: 0,
        latencyMs: 0,
      },
    })
    return { status: 'SKIPPED_UNROUTED', llmRunId: run.id, validation: null }
  }

  // Daily spend cap: over budget behaves like dormant — no provider call.
  if (!(await isWithinDailyBudget(new Date()))) {
    const run = await prisma.lLMRun.create({
      data: {
        taskType: req.taskType,
        provider: provider.name,
        model: routedModel,
        promptHash,
        inputSummary,
        outputSummary: '',
        status: 'SKIPPED_BUDGET' satisfies LLMRunStatus,
        tokenCountInput: 0,
        tokenCountOutput: 0,
        estimatedCost: 0,
        latencyMs: 0,
      },
    })
    return { status: 'SKIPPED_BUDGET', llmRunId: run.id, validation: null }
  }

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
  let latencyMs = Date.now() - startedAt

  let validation = validateLLMOutput(response.text, opts.validate ?? {})

  // JSON repair: ONE bounded retry when the ONLY failure is malformed
  // structure (schema invalid) and a schema was supplied. Prohibited-language
  // and grounding failures are NEVER repaired — those are hard rejects, and a
  // "repair" that scrubbed advice language into passing would defeat the
  // guard. The repair re-prompts the same provider to emit valid JSON for the
  // schema; the result is re-validated through the full gate (advice +
  // grounding still enforced). Only reached with a live provider.
  const schemaOnlyFailure =
    validation.validationStatus === 'FAILED' &&
    !validation.schemaValid &&
    !validation.prohibitedLanguageDetected &&
    !validation.unsupportedClaimsDetected &&
    !!opts.validate?.schema
  if (schemaOnlyFailure) {
    try {
      const repairReq: LLMRequest = {
        ...routedReq,
        system: 'You repair malformed JSON. Return ONLY valid JSON matching the required shape — no prose, no code fences.',
        prompt: `The following output was not valid JSON for the required schema. Return a corrected JSON object only:\n\n${response.text}`,
      }
      const repaired = await provider.generate(repairReq)
      const repairedValidation = validateLLMOutput(repaired.text, opts.validate ?? {})
      if (repairedValidation.validationStatus === 'PASSED') {
        response = { text: repaired.text, tokensIn: response.tokensIn + repaired.tokensIn, tokensOut: response.tokensOut + repaired.tokensOut }
        validation = repairedValidation
        latencyMs = Date.now() - startedAt
      }
    } catch {
      // Repair attempt failed — keep the original rejection, fail closed.
    }
  }

  const finalStatus: LLMRunStatus = validation.validationStatus === 'PASSED' ? 'SUCCEEDED' : 'REJECTED_VALIDATION'
  // Rejected output may contain the very prohibited/advice content we blocked —
  // redact it from the audit row rather than retaining the snippet verbatim.
  const outputSummary = finalStatus === 'SUCCEEDED' ? summarize(response.text) : '[redacted: output failed validation]'

  const estimatedCost = estimateCostUsd(routedModel, response.tokensIn, response.tokensOut)

  const run = await prisma.lLMRun.create({
    data: {
      taskType: req.taskType,
      provider: provider.name,
      model: routedModel,
      promptHash,
      outputHash: createHash('sha256').update(response.text).digest('hex'),
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
