import { runLLMTask } from './run'
import type { LLMProvider } from './types'
import type { ValidateOptions } from './validate'
import type { LLMTaskType } from '@/shared/enums'

export type EnrichTextOptions = {
  taskType: LLMTaskType
  system: string
  prompt: string
  /** Omit → getActiveProvider(); null → dormant (forces SKIPPED_NO_PROVIDER). */
  provider?: LLMProvider | null
  maxTokens?: number
  validate?: ValidateOptions
}

/** Thin, fail-open wrapper over runLLMTask for enrichment call sites: returns
 *  the generated text ONLY when the run SUCCEEDED (schema + advice-language +
 *  grounding all passed — validation is the single centralised rejection point,
 *  so no post-hoc check is needed), otherwise null so the caller keeps its
 *  deterministic value. Never throws for content or provider reasons. */
export async function enrichText(
  opts: EnrichTextOptions,
): Promise<{ text: string; llmRunId: string } | null> {
  const result = await runLLMTask(
    { taskType: opts.taskType, system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens },
    { provider: opts.provider, validate: opts.validate ?? {} },
  )
  if (result.status === 'SUCCEEDED' && result.text) {
    return { text: result.text, llmRunId: result.llmRunId }
  }
  return null
}
