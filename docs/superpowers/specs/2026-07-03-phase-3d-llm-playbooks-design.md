# Archlight Phase 3d — Multi-Model LLM Layer & Playbooks: Design

Date: 2026-07-03
Status: Approved direction (owner: Claude-native LLM layer built DORMANT; proceed
to completion). Implements upgrade Stages 9 (multi-model LLM orchestration) and
10 (opportunity playbooks & revenue actions). Predecessors: spine+2a+3a+3b+3c
(135 tests, HEAD fe55404).

## 1. Goal & core principle

Add an LLM orchestration layer that INTERPRETS and RENDERS on top of the
deterministic engine — it never replaces deterministic scoring, citation, DB
records, or the rule-based safety checks. The system gathers evidence
deterministically, stores it, scores it, THEN (optionally) asks a model to
summarise/classify/draft against that stored evidence. No model output enters the
graph/dashboard as fact without passing validation.

**Built DORMANT:** with no provider configured (no `ANTHROPIC_API_KEY`), the whole
layer returns a clean "not configured" state and the existing DETERMINISTIC
templates are used everywhere. Adding a key activates enrichment. This is a hard
requirement (the doc's "no-provider state must be handled cleanly") and makes the
phase fully buildable/testable WITHOUT any key or spend.

## 2. Non-negotiable LLM safety rules (from the doc)

1. All structured outputs validated with Zod schemas → invalid = rejected, not published.
2. Factual claims must reference stored evidence IDs (evidence-grounding check).
3. Strategic/positioning/playbook outputs pass the advice-language guard (reuse `assertNoAdviceLanguage` from 3a).
4. Outputs failing validation are NOT published to graph/dashboard (fail closed).
5. Every LLM call is auditable (LLMRun row: task, provider, model, hashes, token counts, cost, latency, status, error).
6. Prompts/outputs never expose secrets; API keys via env only, never logged/committed.
7. Provider errors fall back gracefully (to the deterministic template).
8. A no-provider-configured state is handled cleanly.
9. Cost and latency logged.
10. Deterministic services remain the source of truth.

## 3. New models

- `LLMProviderConfig` — id, providerName, modelName, taskTypesJson (supported), maxContextTokens, costTier, latencyTier, strengthsJson, weaknessesJson, enabled, fallbackProviderId?, createdAt, updatedAt. (Config rows; a Claude-native default set is seeded but `enabled=false` until a key exists.)
- `LLMRun` — id, taskType, provider, model, promptHash, inputSummary, outputSummary, status, tokenCountInput, tokenCountOutput, estimatedCost, latencyMs, errorMessage?, createdAt.
- `LLMOutputValidation` — id, llmRunId (FK), validationStatus, schemaValid, evidenceGrounded, prohibitedLanguageDetected, unsupportedClaimsDetected, reviewNotes, createdAt.
- `OpportunityPlaybook` — id, opportunityCardId (FK, unique), title, targetBuyer, commercialHypothesis, painStatement, offerAngle, discoveryQuestionsJson, outreachAngle, likelyObjectionsJson, proofPointsJson, firstAction, confidence, generatedBy ('DETERMINISTIC' | 'LLM'), isFixture, createdAt, updatedAt.

### Enums (append)
- `LLM_TASK_TYPES` (17): CLAIM_EXTRACTION_ASSIST, ENTITY_RESOLUTION_ASSIST, SIGNAL_CLASSIFICATION_ASSIST, CONTRADICTION_ANALYSIS, EVIDENCE_ARC_SUMMARY, STRATEGIC_POSITIONING_GENERATION, OPPORTUNITY_PLAYBOOK_GENERATION, EXECUTIVE_BRIEF_GENERATION, GRAPH_NODE_SUMMARY, GRAPH_EDGE_EXPLANATION, MARKET_CONTEXT_SYNTHESIS, RISK_OPPORTUNITY_SYNTHESIS, OUTREACH_DRAFT_GENERATION, TRANSLATION, LONG_CONTEXT_REVIEW, FAST_CLASSIFICATION, SAFETY_REVIEW.
- `LLM_RUN_STATUSES`: PENDING, SUCCEEDED, FAILED, SKIPPED_NO_PROVIDER, REJECTED_VALIDATION.
- `VALIDATION_STATUSES`: PASSED, FAILED, NOT_RUN.
- `PLAYBOOK_GENERATORS`: DETERMINISTIC, LLM.

## 4. LLM orchestration (`src/server/llm/`)

- `provider.ts` — `type LLMProvider = { name; generate(req: LLMRequest): Promise<LLMResponse> }` where `LLMRequest = { taskType; system; prompt; schema?; maxTokens? }`, `LLMResponse = { text; tokensIn; tokensOut }`. A `NullProvider` (always throws `NoProviderConfiguredError`), and an `AnthropicProvider` (uses `@anthropic-ai/sdk` if `ANTHROPIC_API_KEY` set; the SDK import + client is lazy so the package being absent/unused doesn't break anything). Provider resolution: `getActiveProvider(): LLMProvider | null` — returns the Anthropic provider ONLY if `ANTHROPIC_API_KEY` is set AND a config row is enabled; else null (dormant).
- `router.ts` — `routeTask(taskType): { model; costTier; latencyTier } | null` (pure, deterministic selection from the seeded config, per the doc's routing logic: fast/small for classification, strong-reasoning for contradiction/arc, long-context for multi-source, low-cost for summaries, creative for drafts, safety model for advice checks). Testable without any key.
- `validate.ts` — `validateLLMOutput(raw: string, opts: { schema?: ZodSchema; evidenceIds?: string[]; requireGrounding?: boolean }): { validationStatus; schemaValid; evidenceGrounded; prohibitedLanguageDetected; unsupportedClaimsDetected; parsed?: unknown; notes }`. Runs: Zod parse (schemaValid); advice-language guard over the text (prohibitedLanguageDetected via `findAdviceLanguage`); evidence-grounding (if requireGrounding, the output must reference ≥1 provided evidenceId); unsupported-claims heuristic (flags fabricated-looking specifics not deferred here — conservative: pass unless grounding fails). Overall PASSED only if schema+advice+grounding all ok.
- `run.ts` — `runLLMTask(taskType, req, validateOpts): Promise<{ status; text?: string; llmRunId; validation }>` — the orchestrator: if no active provider → returns `{ status: 'SKIPPED_NO_PROVIDER' }` + logs an LLMRun with that status (dormant path). Else calls the provider, hashes the prompt, logs an LLMRun (tokens/cost/latency), runs `validateLLMOutput`; if validation fails → status REJECTED_VALIDATION, output NOT returned for publication; else SUCCEEDED. Provider throw → FAILED (logged), caller falls back to deterministic. Secrets never logged (only prompt HASH + summaries).

The provider is INJECTABLE (default resolves from env) so tests pass a `FakeProvider` to exercise SUCCEEDED / REJECTED / FAILED paths without a real key.

## 5. Playbooks (Stage 10)

`src/server/playbook/service.ts`:
- `generatePlaybook(cardId): Promise<OpportunityPlaybook>` — builds a DETERMINISTIC playbook from the OpportunityCard + its event evidence (targetBuyer from likelyBuyers, painStatement from buyerPain, offerAngle from suggestedOffer, discoveryQuestions/objections/proofPoints from per-opportunityType templates, firstAction from nextBestAction), `generatedBy='DETERMINISTIC'`, every text field guard-clean. THEN, if an LLM provider is active, attempt `runLLMTask('OPPORTUNITY_PLAYBOOK_GENERATION', …)` with a Zod schema + the card's evidence IDs; on SUCCEEDED + validated, upgrade the playbook fields and set `generatedBy='LLM'`; on any non-success, keep the deterministic version (graceful). Unique on opportunityCardId (regenerate = update).
- Actions (deterministic renderers, LLM-enhanced when active): sales play (the playbook itself), executive brief, market brief, outreach draft — each a guard-clean text render; export as Markdown / JSON. "Save to portfolio" is Phase 3f (WatchMarket/Portfolio) — a stub link now.
- Rules: evidence-linked; no invented account/contact data; no guaranteed-conversion language (advice guard covers the financial subset; add a light "no guaranteed outcome" phrase check to the playbook guard).

## 6. API + UI

- `GET /api/opportunities/[id]/playbook` → the playbook (generate on first request, cached; regenerate via `POST`). `GET ...?format=md|json` exports.
- `GET /api/llm/status` → `{ configured: boolean; activeProvider: string | null; enabledTaskTypes: string[] }` (dormant-honest; never leaks the key).
- `/opportunities/[id]` page gains a "Playbook" section: targetBuyer, pain, offer angle, discovery questions, objections, proof points, first action, a `generatedBy` badge (DETERMINISTIC vs AI-assisted), export buttons (MD/JSON), and — when the LLM layer is dormant — a small "AI enrichment not configured; showing the deterministic playbook" note.
- An `/admin/llm` read-only page: provider configs, enabled state, recent LLMRun audit rows (task, provider, status, tokens, cost, latency), validation outcomes — the auditability surface.

## 7. Dormancy & honesty

- With no `ANTHROPIC_API_KEY`: `getActiveProvider()` returns null; every `runLLMTask` returns SKIPPED_NO_PROVIDER (logged); playbooks/positioning/summaries all use the deterministic path; `/api/llm/status` reports `configured:false`; the UI shows the "not configured" note. NOTHING breaks, nothing is invented.
- The Anthropic adapter + `@anthropic-ai/sdk` dependency: added but only imported lazily inside the adapter, and only when a key exists — so the dormant build has zero runtime dependence on it. (If installing the SDK is undesirable, the adapter uses a lazy dynamic import guarded by the key so a missing package degrades to "not configured" rather than crashing.)
- Verification is fully deterministic: FakeProvider drives the SUCCEEDED/REJECTED/FAILED/dormant paths; no real API call, no key, no spend in tests or CI.

## 8. Out of scope (later)
Real live LLM calls (owner adds `ANTHROPIC_API_KEY` post-phase to activate);
market data (3e); watch-markets/portfolio/replay (3f). LLM enrichment of
claim-extraction/clustering (the pipeline stays deterministic; those task types
exist in the enum for future use but 3d wires enrichment only for playbooks +
positioning/summary rendering surfaces).

## 9. Success criteria
1. With no key: full suite green; every route works; playbooks render
   deterministically; `/api/llm/status` says not configured; UI shows the note.
2. `routeTask` selects the expected model class per task type (unit-tested).
3. `validateLLMOutput` rejects schema-invalid, advice-language, and ungrounded
   output (unit-tested); `runLLMTask` with a FakeProvider exercises SUCCEEDED /
   REJECTED_VALIDATION / FAILED / SKIPPED_NO_PROVIDER and logs an LLMRun each.
4. Playbook generates from a card, guard-clean, `generatedBy` correct; export
   MD/JSON works; regenerate updates not duplicates.
5. `/admin/llm` shows configs + audit rows. Typecheck + build clean; docs
   (`docs/multi-model-llm-routing.md`) written.
