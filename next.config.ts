import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // @anthropic-ai/sdk is loaded via a guarded, non-literal dynamic import in
  // src/server/llm/provider.ts (see createAnthropicProvider) so the LLM layer
  // stays dormant with no key and no package installed. Declaring it as a
  // server-external package makes Next.js resolve it via native Node
  // require() at runtime once installed, instead of trying to bundle it into
  // the server chunk. (The build-time "Critical dependency: the request of a
  // dependency is an expression" warning that a fully-dynamic import()
  // otherwise triggers is suppressed separately, via webpackIgnore/
  // turbopackIgnore magic comments on the import call itself — see
  // provider.ts. This entry alone does not silence that warning.)
  serverExternalPackages: ['@anthropic-ai/sdk'],
}

export default nextConfig
