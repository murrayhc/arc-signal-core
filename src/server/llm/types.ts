import type { LLMTaskType } from '@/shared/enums'

/** A single LLM invocation request. system+prompt are NEVER persisted raw —
 *  only a sha256 hash and short, non-sensitive summaries are logged (see run.ts). */
export type LLMRequest = {
  taskType: LLMTaskType
  system: string
  prompt: string
  maxTokens?: number
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
