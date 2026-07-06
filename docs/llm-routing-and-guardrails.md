# LLM Routing & Guardrails

Archlight supports multiple LLM models, routes each task to the right one, logs every call, and validates every output — while remaining **dormant by default** (no key, no SDK) and **never letting an LLM become the source of truth**. Pass 3 reuses the existing router and logging rather than adding a parallel system.

## Routing

`routeTask(taskType, configs)` (`src/server/llm/router.ts`) picks the `LLMProviderConfig` whose `taskTypesJson` includes the task, preferring enabled configs. `runLLMTask` (`src/server/llm/run.ts`) resolves the route, calls the provider (if live), validates, and logs.

## Model-role map (seeded tiers)

Each task class routes to a cost/latency tier via the seeded provider configs (`src/server/seed.ts`). All seeded configs are `enabled: false` (dormant) until an owner activates one.

| Role / tier | Cost | Task classes |
|---|---|---|
| **Fast / batch** | LOW | `FAST_CLASSIFICATION`, `SIGNAL_CLASSIFICATION_ASSIST`, `CLAIM_EXTRACTION_ASSIST`, `CLAIM_NORMALISATION`, `JSON_REPAIR` |
| **Reasoning** | HIGH | `CONTRADICTION_ANALYSIS`, `SOURCE_COMPARISON`, `COMPANY_IMPACT_ANALYSIS`, `FUTURE_SCENARIOS`, `EVIDENCE_ARC_SUMMARY`, `RISK_OPPORTUNITY_SYNTHESIS` |
| **Long context** | MEDIUM | `LONG_CONTEXT_REVIEW`, `MARKET_CONTEXT_SYNTHESIS` |
| **Synthesis** | MEDIUM | `STRATEGIC_POSITIONING`, `REPORT_SYNTHESIS`, `HISTORIC_CONTEXT`, `PRESENT_CONTEXT`, playbook / brief / outreach / graph-summary generation |
| **Safety** | MEDIUM | `SAFETY_REVIEW` |

Principle: cheap/fast models for tagging, classification and first-pass extraction; stronger reasoning models for contradiction, company-impact and scenario analysis; long-context models for filings/long packs; synthesis models for prose. Premium synthesis is reserved for final executive-grade output.

## Logging

Every invocation writes an `LLMRun` (`taskType`, `provider`, `model`, `promptHash`, `outputHash`, `status`, tokens, `estimatedCost`, `latencyMs`) plus an `LLMOutputValidation` row. Raw prompts/outputs are never stored — only sha256 hashes and short summaries. In the dormant state every call logs `SKIPPED_NO_PROVIDER`.

## Guardrails

`validateLLMOutput` (`src/server/llm/validate.ts`) is fail-closed:

1. **Schema-validated** — output must parse against the caller's Zod schema.
2. **Evidence-grounded** — when `requireGrounding` is set, the output must cite a supplied evidence id; otherwise it is rejected or marked speculative.
3. **No financial advice** — the advice-language guard (below) runs on the raw output.

If validation fails, the run is logged `REJECTED_VALIDATION`, no text is returned, and the pipeline **falls back to the deterministic output** — a failed LLM call never crashes the pipeline and never overwrites evidence. LLMs synthesise and interpret; the structured evidence remains the source of truth.

## Financial-advice guard

`assertNoAdviceLanguage` / `findAdviceLanguage` (`src/server/safety/advice-language.ts`) is deterministic, case-insensitive, and applied to **every** generated string (claim/impact pathways, context, scenarios, positioning, reports, and any LLM output). It rejects: should buy/sell/hold, buy/sell/hold rating or recommendation, target price / price target, guaranteed/expected/projected/certain returns or profit, "% returns", risk-free, sure thing, load up on, to the moon, **portfolio allocation**, **investment recommendation**, personalised financial advice, and more. Covered by `tests/safety/advice-language.test.ts` and `tests/financial-advice-guardrails.test.ts`.

## Activation

Set `ANTHROPIC_API_KEY`, install `@anthropic-ai/sdk`, and flip one `LLMProviderConfig.enabled` with a real model id (see `docs/multi-model-llm-routing.md`). The deterministic output remains the fallback for any task the LLM does not (or cannot validly) handle.
