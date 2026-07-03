# Archlight Phase 3d — Multi-Model LLM Layer & Playbooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Add a Claude-native multi-model LLM orchestration layer built DORMANT (graceful no-key), with a fail-closed validation pipeline and full audit, plus deterministic opportunity playbooks that the LLM enriches only when a provider is configured. The deterministic engine stays the source of truth.

**Architecture:** New models (LLMProviderConfig, LLMRun, LLMOutputValidation, OpportunityPlaybook). `src/server/llm/` = provider (NullProvider + lazy Anthropic adapter, `getActiveProvider`), router (deterministic `routeTask`), validate (`validateLLMOutput` — schema+advice+grounding, fail closed), run (`runLLMTask`, injectable provider, logs every call). `src/server/playbook/` = deterministic playbook + optional LLM upgrade. APIs + playbook UI + `/admin/llm` audit page. NO new npm dependency (Anthropic SDK loaded via guarded lazy `import()` only when a key exists).

**Tech Stack:** unchanged. Baseline: 135 tests, HEAD fe55404.

**Spec:** `docs/superpowers/specs/2026-07-03-phase-3d-llm-playbooks-design.md`.

## Global Constraints
- Working dir: `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight`.
- DORMANT is mandatory: with no `ANTHROPIC_API_KEY`, everything works deterministically, `runLLMTask` returns SKIPPED_NO_PROVIDER, nothing breaks, nothing invented. Tests run with NO key and use a FakeProvider to exercise active paths.
- Deterministic services remain source of truth; LLM only interprets/renders and fails closed on any validation failure.
- Every LLM call logs an LLMRun (task/provider/model/promptHash/token counts/cost/latency/status) — NEVER the raw prompt or key. Reuse `assertNoAdviceLanguage`/`findAdviceLanguage` from `@/server/safety/advice-language`.
- No new npm dep; Anthropic SDK via guarded lazy `import('@anthropic-ai/sdk')` that degrades to "not configured" if absent.
- String enums via `src/shared/enums.ts`; `*Json` String columns; files < 500 lines; no *Json leak in APIs; en-GB; GBP.
- Full suite green + typecheck + build clean before each commit; messages as given.

---

### Task 1: Migration — LLM + playbook models, enums, provider seed

**Files:** Modify `prisma/schema.prisma`, `src/shared/enums.ts`, `src/server/seed.ts`, `tests/helpers.ts`; Test: `tests/schema.test.ts` (+1), `tests/seed.test.ts` (+1).

**Interfaces:** `LLMProviderConfig`, `LLMRun`, `LLMOutputValidation`, `OpportunityPlaybook` models; enums `LLM_TASK_TYPES`(17), `LLM_RUN_STATUSES`(5), `VALIDATION_STATUSES`(3), `PLAYBOOK_GENERATORS`(2); seeded Claude-native provider configs (all `enabled=false`).

- [ ] **Step 1: Enums** — append to `src/shared/enums.ts`:
```ts
export const LLM_TASK_TYPES = [
  'CLAIM_EXTRACTION_ASSIST','ENTITY_RESOLUTION_ASSIST','SIGNAL_CLASSIFICATION_ASSIST',
  'CONTRADICTION_ANALYSIS','EVIDENCE_ARC_SUMMARY','STRATEGIC_POSITIONING_GENERATION',
  'OPPORTUNITY_PLAYBOOK_GENERATION','EXECUTIVE_BRIEF_GENERATION','GRAPH_NODE_SUMMARY',
  'GRAPH_EDGE_EXPLANATION','MARKET_CONTEXT_SYNTHESIS','RISK_OPPORTUNITY_SYNTHESIS',
  'OUTREACH_DRAFT_GENERATION','TRANSLATION','LONG_CONTEXT_REVIEW','FAST_CLASSIFICATION','SAFETY_REVIEW',
] as const
export type LLMTaskType = (typeof LLM_TASK_TYPES)[number]

export const LLM_RUN_STATUSES = ['PENDING','SUCCEEDED','FAILED','SKIPPED_NO_PROVIDER','REJECTED_VALIDATION'] as const
export type LLMRunStatus = (typeof LLM_RUN_STATUSES)[number]

export const VALIDATION_STATUSES = ['PASSED','FAILED','NOT_RUN'] as const
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number]

export const PLAYBOOK_GENERATORS = ['DETERMINISTIC','LLM'] as const
export type PlaybookGenerator = (typeof PLAYBOOK_GENERATORS)[number]
```

- [ ] **Step 2: Schema** — append models:
```prisma
model LLMProviderConfig {
  id               String   @id @default(cuid())
  providerName     String
  modelName        String   @unique
  taskTypesJson    String   @default("[]")
  maxContextTokens Int      @default(0)
  costTier         String   @default("MEDIUM")
  latencyTier      String   @default("MEDIUM")
  strengthsJson    String   @default("[]")
  weaknessesJson   String   @default("[]")
  enabled          Boolean  @default(false)
  fallbackProviderId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}

model LLMRun {
  id               String              @id @default(cuid())
  taskType         String
  provider         String
  model            String
  promptHash       String
  inputSummary     String              @default("")
  outputSummary    String              @default("")
  status           String
  tokenCountInput  Int                 @default(0)
  tokenCountOutput Int                 @default(0)
  estimatedCost    Float               @default(0)
  latencyMs        Int                 @default(0)
  errorMessage     String?
  createdAt        DateTime            @default(now())
  validations      LLMOutputValidation[]
}

model LLMOutputValidation {
  id                        String   @id @default(cuid())
  llmRunId                  String
  llmRun                    LLMRun   @relation(fields: [llmRunId], references: [id])
  validationStatus          String
  schemaValid               Boolean  @default(false)
  evidenceGrounded          Boolean  @default(false)
  prohibitedLanguageDetected Boolean @default(false)
  unsupportedClaimsDetected Boolean  @default(false)
  reviewNotes               String   @default("")
  createdAt                 DateTime @default(now())
}

model OpportunityPlaybook {
  id                    String          @id @default(cuid())
  opportunityCardId     String          @unique
  opportunityCard       OpportunityCard @relation(fields: [opportunityCardId], references: [id])
  title                 String
  targetBuyer           String
  commercialHypothesis  String
  painStatement         String
  offerAngle            String
  discoveryQuestionsJson String         @default("[]")
  outreachAngle         String
  likelyObjectionsJson  String          @default("[]")
  proofPointsJson       String          @default("[]")
  firstAction           String
  confidence            Float
  generatedBy           String          @default("DETERMINISTIC")
  isFixture             Boolean         @default(false)
  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt
}
```
Add back-relation to `model OpportunityCard`: `playbook OpportunityPlaybook?`.

- [ ] **Step 3: Migrate** — `npx prisma migrate dev --name phase3d_llm_playbooks` (BLOCKED + report if AI-guarded).

- [ ] **Step 4: Seed** — in `runSeed`, after the lens upsert, seed Claude-native provider configs (all `enabled: false` — dormant), e.g. models `claude-fast` (FAST_CLASSIFICATION/SIGNAL_CLASSIFICATION_ASSIST/CLAIM_EXTRACTION_ASSIST), `claude-reasoning` (CONTRADICTION_ANALYSIS/EVIDENCE_ARC_SUMMARY/RISK_OPPORTUNITY_SYNTHESIS), `claude-longcontext` (LONG_CONTEXT_REVIEW/MARKET_CONTEXT_SYNTHESIS), `claude-creative` (OPPORTUNITY_PLAYBOOK_GENERATION/STRATEGIC_POSITIONING_GENERATION/EXECUTIVE_BRIEF_GENERATION/OUTREACH_DRAFT_GENERATION/GRAPH_NODE_SUMMARY/GRAPH_EDGE_EXPLANATION), `claude-safety` (SAFETY_REVIEW). Upsert on `modelName`. Use placeholder model ids (e.g. `claude-*`) — real model ids are wired when the owner activates. `sourcesSeeded` return unchanged.

- [ ] **Step 5: resetDb** — add at the top (FK-safe): `prisma.lLMOutputValidation.deleteMany()`, `prisma.lLMRun.deleteMany()`, and `prisma.opportunityPlaybook.deleteMany()` BEFORE `opportunityCard.deleteMany()`; `prisma.lLMProviderConfig.deleteMany()` anywhere (no inbound FK).

- [ ] **Step 6: Tests** — schema test: create a provider config, an LLMRun + a linked validation, and a playbook linked to a card (assert unique on opportunityCardId rejects a dupe). Seed test: assert ≥1 `LLMProviderConfig` seeded with `enabled=false`.

- [ ] **Step 7: Verify + commit** — `npm test`, typecheck clean.
```bash
git add -A && git commit -m "feat(3d): migration — LLM provider/run/validation + OpportunityPlaybook models + dormant provider seed"
```

---

### Task 2: LLM orchestration core (dormant + validation + audit)

**Files:** Create `src/server/llm/types.ts`, `provider.ts`, `router.ts`, `validate.ts`, `run.ts`, `src/app/api/llm/status/route.ts`; Test: `tests/llm/router.test.ts`, `tests/llm/validate.test.ts`, `tests/llm/run.test.ts`.

**Interfaces:**
- `types.ts`: `type LLMRequest = { taskType: LLMTaskType; system: string; prompt: string; maxTokens?: number }`; `type LLMResponse = { text: string; tokensIn: number; tokensOut: number }`; `interface LLMProvider { name: string; generate(req: LLMRequest): Promise<LLMResponse> }`; `class NoProviderConfiguredError extends Error`.
- `provider.ts`: `NullProvider` (generate throws NoProviderConfiguredError); `createAnthropicProvider(): LLMProvider | null` — returns null unless `process.env.ANTHROPIC_API_KEY` is set; when set, its `generate` does a guarded `const sdk = await import('@anthropic-ai/sdk').catch(() => null)` → if null, throws NoProviderConfiguredError (SDK not installed); else calls the API. `getActiveProvider(): Promise<LLMProvider | null>` — Anthropic provider if key set AND an enabled LLMProviderConfig exists, else null.
- `router.ts`: `routeTask(taskType, configs): { modelName; costTier; latencyTier } | null` (pure) — picks the config whose `taskTypesJson` includes the task (prefer enabled; deterministic tie-break by modelName). `loadRouterConfigs()` reads configs from DB.
- `validate.ts`: `validateLLMOutput(raw, opts: { schema?: ZodSchema<unknown>; evidenceIds?: string[]; requireGrounding?: boolean }): { validationStatus: ValidationStatus; schemaValid; evidenceGrounded; prohibitedLanguageDetected; unsupportedClaimsDetected; parsed?: unknown; notes: string }`. schemaValid = schema.safeParse ok (or true if no schema); prohibitedLanguageDetected = `findAdviceLanguage(raw).length>0`; evidenceGrounded = !requireGrounding || evidenceIds.some(id => raw.includes(id)); unsupportedClaimsDetected = requireGrounding && !evidenceGrounded; validationStatus PASSED iff schemaValid && !prohibited && (!requireGrounding || evidenceGrounded).
- `run.ts`: `runLLMTask(req: LLMRequest, opts: { provider?: LLMProvider | null; validate?: Parameters<typeof validateLLMOutput>[1] }): Promise<{ status: LLMRunStatus; text?: string; parsed?: unknown; llmRunId: string; validation: ReturnType<typeof validateLLMOutput> | null }>`. Provider = opts.provider ?? await getActiveProvider(). If null → log LLMRun status SKIPPED_NO_PROVIDER, return that (dormant). Else: promptHash = sha256(system+prompt) (NEVER store raw prompt), try generate; on throw → log FAILED, return FAILED. On success → validate; log LLMRun (SUCCEEDED or REJECTED_VALIDATION) + an LLMOutputValidation row; return text ONLY when PASSED (fail closed). estimatedCost from a simple per-token constant by costTier. Secrets never logged.
- Route `GET /api/llm/status` → `{ configured: boolean; activeProvider: string | null; enabledTaskTypes: string[] }` (from getActiveProvider + enabled configs; never leaks the key).

- [ ] **Step 1: Failing tests.**
  `router.test.ts`: routeTask returns the creative model for OPPORTUNITY_PLAYBOOK_GENERATION, the fast model for FAST_CLASSIFICATION, the reasoning model for CONTRADICTION_ANALYSIS, null for a task no config supports (given seeded configs).
  `validate.test.ts`: PASSED for clean grounded schema-valid text; FAILED (prohibitedLanguageDetected) for text containing "you should buy this stock"; FAILED (schemaValid false) for schema mismatch; FAILED (evidenceGrounded false) when requireGrounding and no evidence id present.
  `run.test.ts` (FakeProvider): SUCCEEDED path returns text + logs a SUCCEEDED LLMRun + PASSED validation; a FakeProvider returning advice language → REJECTED_VALIDATION, text NOT returned, LLMRun REJECTED_VALIDATION; a throwing FakeProvider → FAILED logged; `runLLMTask` with provider=null (dormant) → SKIPPED_NO_PROVIDER logged, no text. Assert promptHash is a 64-char hash and the raw prompt is NOT stored anywhere on the LLMRun.
  Run → RED.
- [ ] **Step 2: Implement** per interfaces. `zod` already available. FakeProvider lives in the test.
- [ ] **Step 3: Verify + commit** — `npm test`, typecheck clean. With NO key set, all paths that hit `getActiveProvider()` must return dormant.
```bash
git add -A && git commit -m "feat(3d): dormant multi-model LLM orchestration — router, fail-closed validation, audited runs"
```

---

### Task 3: Playbooks + APIs + UI + docs

**Files:** Create `src/server/playbook/service.ts`, `src/server/services/playbook.ts` (serialized read), `src/app/api/opportunities/[id]/playbook/route.ts`, `src/app/api/llm/status/route.ts` (if not in T2), `src/app/admin/llm/page.tsx`, `src/components/PlaybookPanel.tsx`; Modify `src/app/opportunities/[id]/page.tsx`; Create `docs/multi-model-llm-routing.md`; Test: `tests/playbook/service.test.ts`, `tests/api/playbook-api.test.ts`.

**Interfaces:**
- `playbook/service.ts`: `generatePlaybook(cardId, opts?: { provider?: LLMProvider | null }): Promise<OpportunityPlaybook>` — load the card + its event evidence; build the DETERMINISTIC playbook (targetBuyer from likelyBuyers[0], painStatement from buyerPain, offerAngle from suggestedOffer, commercialHypothesis composed, discoveryQuestions/likelyObjections/proofPoints from per-opportunityType templates, firstAction from nextBestAction, confidence = card.confidence), every field guard-clean (advice guard + a "no guaranteed outcome" check), `generatedBy='DETERMINISTIC'`; upsert unique on opportunityCardId. THEN if `getActiveProvider()` (or opts.provider) active, `runLLMTask('OPPORTUNITY_PLAYBOOK_GENERATION', …, { validate:{ schema: PlaybookSchema, evidenceIds:[…claim/doc ids], requireGrounding:true }})`; on SUCCEEDED, overwrite fields from the validated parsed output + set `generatedBy='LLM'`; else keep deterministic. Also `renderExecutiveBrief(cardId)`, `renderOutreachDraft(cardId)`, `exportMarkdown(playbook)`, `exportJson(playbook)` — deterministic, guard-clean.
- `services/playbook.ts`: `getPlaybookData(cardId): Promise<serialized playbook | null>`; `getLLMAudit(limit=30): Promise<{ configs; runs }>` for the admin page.
- Route `GET /api/opportunities/[id]/playbook` → generate-if-absent + return serialized; `?format=md|json` → export; `POST` → regenerate. Follows the events route pattern.
- UI: `/opportunities/[id]` gains a Playbook section (PlaybookPanel: targetBuyer, pain, offer angle, discovery questions, objections, proof points, first action, a `generatedBy` badge, MD/JSON export links, and when dormant a "AI enrichment not configured — deterministic playbook" note read from `/api/llm/status`). `/admin/llm` read-only: provider configs (name/model/enabled/tasks), recent LLMRun rows (task/provider/status/tokens/cost/latency), validation outcomes.

- [ ] **Step 1: Failing tests.**
  `playbook/service.test.ts`: generatePlaybook from a scanned card yields a DETERMINISTIC playbook (generatedBy DETERMINISTIC), all text fields guard-clean, discoveryQuestions non-empty; regenerate updates (count stays 1); with a FakeProvider returning a valid grounded schema-correct playbook JSON → generatedBy LLM and fields upgraded; with a FakeProvider returning advice language → stays DETERMINISTIC (rejected). exportMarkdown contains the title + first action.
  `api/playbook-api.test.ts`: `GET /api/opportunities/[id]/playbook` 200 with the playbook; `?format=json` returns JSON; 404 unknown card.
  Run → RED.
- [ ] **Step 2: Implement** the service, exports, routes, UI, and the admin page.
- [ ] **Step 3: Docs** — `docs/multi-model-llm-routing.md`: the task-type→model routing table, the dormancy model (no key → deterministic, `/api/llm/status`), the validation pipeline (schema/advice/grounding, fail closed), the audit (LLMRun/LLMOutputValidation), how to ACTIVATE (set `ANTHROPIC_API_KEY`, `npm i @anthropic-ai/sdk`, enable a config), and the safety guarantees. Honest about what's deferred.
- [ ] **Step 4: Verify + commit** — `npm test`, typecheck, `npm run build` (routes listed). Dev-server curl: `/api/llm/status` says configured:false; `/opportunities/[id]` shows the playbook + the not-configured note; `/admin/llm` lists dormant configs.
```bash
git add -A && git commit -m "feat(3d): deterministic playbooks with dormant LLM enrichment + playbook API/UI + LLM audit page + docs"
```

---

## Plan Self-Review Notes
- Spec §3 models ↔ T1; §4 orchestration ↔ T2; §5 playbooks + §6 API/UI ↔ T3; §7 dormancy verified across all (no-key default + FakeProvider for active paths).
- Safety: T2 validate fails closed (schema+advice+grounding); T2 run never returns text unless PASSED and never logs raw prompt/key; T3 playbook guard-clean + LLM output re-validated before upgrade.
- Determinism/dormant: NO real API call in tests; NO new npm dep (lazy guarded import); no key → SKIPPED_NO_PROVIDER everywhere; deterministic templates always present.
- Type flow: LLMProvider/LLMRequest/LLMResponse (T2 → T3); runLLMTask result (T2 → T3 playbook); PlaybookSchema (T3). Deferred (not gaps): live calls (owner activates), market (3e), portfolio "save" (3f).
