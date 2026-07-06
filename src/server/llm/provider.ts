import { prisma } from '@/server/db'
import { NoProviderConfiguredError, type LLMProvider, type LLMRequest, type LLMResponse } from './types'

/** Fallback model id used ONLY when a request reaches the Anthropic adapter
 *  with no routed req.model (e.g. routeTask found no config for the task
 *  type). Seeded LLMProviderConfig.modelName values are now real Anthropic
 *  model ids (claude-haiku-4-5 / claude-opus-4-8 / claude-sonnet-5 — see
 *  src/server/seed.ts and docs/ai-activation.md), so a routed model passes
 *  straight to the SDK. This constant is a clearly-named current default, not
 *  the retired 'claude-3-5-sonnet-latest' id. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5'

/** Always-dormant provider. Used as an explicit fallback; generate() always
 *  throws NoProviderConfiguredError so callers degrade the same way whether
 *  they hold a NullProvider or got null from getActiveProvider(). */
export const NullProvider: LLMProvider = {
  name: 'null-provider',
  async generate(): Promise<LLMResponse> {
    throw new NoProviderConfiguredError()
  },
}

/** Builds the Anthropic-backed provider WITHOUT importing the SDK at module
 *  load time. Returns null immediately if no API key is present — dormant
 *  by default. The SDK import itself is guarded: if @anthropic-ai/sdk is not
 *  installed, generate() degrades to NoProviderConfiguredError instead of
 *  crashing the build or the request. */
export function createAnthropicProvider(): LLMProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  return {
    name: 'anthropic',
    async generate(req: LLMRequest): Promise<LLMResponse> {
      // Guarded lazy import via a non-literal specifier so TypeScript never
      // needs @anthropic-ai/sdk's type declarations to compile this file —
      // it stays an optional peer dependency. Degrades to
      // NoProviderConfiguredError (dormant) if the package isn't installed;
      // never crashes the build or the request.
      //
      // The webpackIgnore/turbopackIgnore magic comments tell each bundler's
      // parser to skip static analysis of this import() entirely — since the
      // specifier is a variable (not a string literal), the parser can never
      // resolve a request string anyway, and without these comments it emits
      // "Critical dependency: the request of a dependency is an expression"
      // while walking the AST. serverExternalPackages in next.config.ts
      // (which controls how an already-resolved import is bundled at runtime)
      // does not reach this — it operates one phase later than the parser
      // warning this suppresses. Both comments are needed: webpackIgnore for
      // `next build`'s current webpack default, turbopackIgnore for Turbopack.
      const sdkModuleName = '@anthropic-ai/sdk'
      const sdk: unknown = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ sdkModuleName).catch(
        () => null,
      )
      if (!sdk) throw new NoProviderConfiguredError('@anthropic-ai/sdk is not installed — orchestration is dormant.')

      const AnthropicCtor = (sdk as { default: new (opts: { apiKey: string }) => AnthropicClient }).default
      const client = new AnthropicCtor({ apiKey })
      const response = await client.messages.create({
        model: req.model ?? DEFAULT_ANTHROPIC_MODEL,
        max_tokens: req.maxTokens ?? 1024,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
      })

      const text = response.content
        .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
        .map((block) => block.text)
        .join('')

      return {
        text,
        tokensIn: response.usage?.input_tokens ?? 0,
        tokensOut: response.usage?.output_tokens ?? 0,
      }
    },
  }
}

/** Minimal shape of the Anthropic SDK client this module relies on. Declared
 *  locally so this file type-checks without @anthropic-ai/sdk installed. */
type AnthropicClient = {
  messages: {
    create(params: {
      model: string
      max_tokens: number
      system: string
      messages: { role: 'user'; content: string }[]
    }): Promise<{
      content: { type: string; text?: string }[]
      usage?: { input_tokens?: number; output_tokens?: number }
    }>
  }
}

/** The single source of truth for "is orchestration live". Returns the
 *  Anthropic provider only when BOTH an API key is set AND at least one
 *  LLMProviderConfig is enabled in the DB. With the seeded (all-disabled)
 *  configs and no key, this is null — dormant. */
export async function getActiveProvider(): Promise<LLMProvider | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null

  const enabledCount = await prisma.lLMProviderConfig.count({ where: { enabled: true } })
  if (enabledCount === 0) return null

  return createAnthropicProvider()
}
