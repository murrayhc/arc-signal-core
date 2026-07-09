# LLM Routing & Guardrails

Archlight supports multiple LLM models, routes each task to the right one, logs every call, and validates every output — while remaining **dormant by default** (no key, no SDK) and **never letting an LLM become the source of truth**. Pass 3 reuses the existing router and logging rather than adding a parallel system.

## Routing

`routeTask(taskType, configs)` (`src/server/llm/router.ts`) picks the `LLMProviderConfig` whose `taskTypesJson` includes the task, preferring enabled configs. `runLLMTask` (`src/server/llm/run.ts`) resolves the route, calls the provider (if live), validates, and logs.

## Model-role map (real models, Balanced tier)

Each task class routes to one of **three** seeded provider configs (`src/server/seed.ts`), keyed by the real Anthropic model id. All are `enabled: false` (dormant) until an owner activates them (see `docs/ai-activation.md`). Because the Balanced tier uses only three distinct models, the roles below collapse onto them.

| Role / tier | Model | Cost | Task classes |
|---|---|---|---|
| **Fast / batch + safety** | `claude-haiku-4-5` | LOW | `FAST_CLASSIFICATION`, `SIGNAL_CLASSIFICATION_ASSIST`, `CLAIM_EXTRACTION_ASSIST`, `CLAIM_NORMALISATION`, `JSON_REPAIR`, `SAFETY_REVIEW` |
| **Reasoning** | `claude-opus-4-8` | HIGH | `CONTRADICTION_ANALYSIS`, `SOURCE_COMPARISON`, `COMPANY_IMPACT_ANALYSIS`, `FUTURE_SCENARIOS`, `EVIDENCE_ARC_SUMMARY`, `RISK_OPPORTUNITY_SYNTHESIS` |
| **Long context + synthesis** | `claude-sonnet-5` | MEDIUM | `LONG_CONTEXT_REVIEW`, `MARKET_CONTEXT_SYNTHESIS`, `STRATEGIC_POSITIONING`, `REPORT_SYNTHESIS`, `HISTORIC_CONTEXT`, `PRESENT_CONTEXT`, playbook / brief / outreach / graph-summary generation |

Principle: cheap/fast models (Haiku) for tagging, classification and first-pass extraction; a strong reasoning model (Opus) for contradiction, company-impact and scenario analysis; a balanced model (Sonnet) for long packs and prose synthesis. `modelName` is both the routing key and the id sent to the SDK; every task type routes to exactly one config.

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

## On-demand enrichment (consequence engine)

There are two live-LLM paths, both on-demand: (1) `POST /api/events/[id]/enrich` → `enrichEventConsequence` (`src/server/consequence/enrich.ts`), triggered by the **Enhance with AI** button on an event's deep report; and (2) opportunity playbook generation → `generatePlaybook` (`src/server/playbook/service.ts`), reached via `GET/POST /api/opportunities/[id]/playbook`, which upgrades the deterministic playbook when a provider is active. It enriches that one event — named-company impact rationale (reasoning tier) and a structured historic/present/future/executive narrative (synthesis tier) — via `enrichText` (`src/server/llm/enrich-text.ts`), writing the `llmRationale` / `llmNarrativeJson` columns **only** when validation passes. Since the Stage-0 truth pass both enrich calls are schema-validated AND evidence-grounded: evidence lines are passed with their ids (`- [<id>] <claim>`), the output must cite them (`citedEvidenceIds`), grounding is enforced by `validateLLMOutput` (fraction-aware), the parsed fields are re-guarded against advice language before persist, and an impact/context with no claim evidence is skipped rather than enriched from thin air. Category impacts are never enriched (they are inferential, not a specific company). Everything falls back to the deterministic row on failure or when dormant.

**Scans never call the LLM.** `runFullScan` injects no provider, so every LLM touchpoint during a scan logs `SKIPPED_NO_PROVIDER`. This is locked by `tests/scan-deterministic-invariant.test.ts` (a full fixture scan must produce zero `SUCCEEDED` LLMRun rows).

## Activation

See **`docs/ai-activation.md`** for the owner runbook. In short: `npm install`, put `ANTHROPIC_API_KEY` in the git-ignored `.env`, run `npm run db:seed` (writes the real model ids), then `npx tsx scripts/llm-activate.ts on`. The deterministic output remains the fallback for any task the LLM does not (or cannot validly) handle. Turn off with `npx tsx scripts/llm-activate.ts off` or by removing the key.
