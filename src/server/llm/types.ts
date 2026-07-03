import type { LLMTaskType } from '@/shared/enums'

/** A single LLM invocation request. system+prompt are NEVER persisted raw —
 *  only a sha256 hash and short, non-sensitive summaries are logged (see run.ts). */
export type LLMRequest = {
  taskType: LLMTaskType
  system: string
  prompt: string
  maxTokens?: number
  /** The model to invoke, normally resolved by routeTask() and threaded in by
   *  runLLMTask — callers do not usually set this directly. Optional so
   *  existing call sites/tests that construct an LLMRequest without a model
   *  keep compiling; the provider falls back to a documented default when
   *  absent (see provider.ts's DEFAULT_ANTHROPIC_MODEL). */
  model?: string
}

export type LLMResponse = {
  text: string
  tokensIn: number
  tokensOut: number
}

/** Provider abstraction. Real providers (e.g. Anthropic) and test doubles
 *  (FakeProvider) both implement this so runLLMTask never depends on a
 *  concrete SDK. */
export interface LLMProvider {
  name: string
  generate(req: LLMRequest): Promise<LLMResponse>
}

/** Thrown whenever no usable provider is available — missing API key,
 *  no enabled LLMProviderConfig, or the provider SDK isn't installed.
 *  Never thrown for business/content reasons; always means "dormant". */
export class NoProviderConfiguredError extends Error {
  constructor(message = 'No LLM provider is configured — orchestration is dormant.') {
    super(message)
    this.name = 'NoProviderConfiguredError'
  }
}
