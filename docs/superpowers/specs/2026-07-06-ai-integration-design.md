# AI Integration — On-Demand Consequence Enrichment (Design)

**Date:** 2026-07-06
**Status:** Approved to build
**Depends on:** Evidence Depth Engine (Pass 2), Commercial Consequence Engine (Pass 3)

## Goal

Activate the already-built multi-model LLM layer so the deterministic
Commercial Consequence Engine gains real AI-written depth — on demand, per
event, fail-open, with every existing safety rail intact. Approving/building
this spends nothing until the owner sets a key and flips the switch.

## Current state (what's off, and how)

The LLM stack is fully plumbed but dormant at three independent points:

1. `@anthropic-ai/sdk` is **not installed** — `createAnthropicProvider()` does a
   guarded dynamic import that degrades to `NoProviderConfiguredError` if absent.
2. **No `ANTHROPIC_API_KEY`** — `getActiveProvider()` returns `null` without it.
3. All 5 `LLMProviderConfig` rows are `enabled: false`, and their `modelName`s
   are **placeholders** (`claude-fast`, `claude-reasoning`, …) — not real
   Anthropic IDs. `routeTask()` returns `modelName` and the provider passes it
   straight to `messages.create({ model })`, so a placeholder would 404.

`runLLMTask(req, { provider?, validate? })` is the single entrypoint: it
resolves the provider (or `null` → logs `SKIPPED_NO_PROVIDER`), routes the
model, calls the provider, validates fail-closed (`text` only on `PASSED`), and
writes an audited `LLMRun` + `LLMOutputValidation`. The scan pipeline never
injects a provider, and the consequence generators are pure-deterministic, so
**scans make zero live LLM calls by construction.**

## Decisions (owner-approved)

- **Model tier: Balanced.** Cheap models for mechanical work, Opus for hard
  reasoning, Sonnet for writing.
- **When it runs: On-demand only.** The AI runs solely via an "Enhance with AI"
  action on an event's deep report. Never during scans.

### Balanced tier → real model IDs (3 configs)

`LLMProviderConfig.modelName` is `@unique` and is passed straight to the SDK as
the model string. Balanced maps onto only **three** real models, so the five
placeholder configs collapse to **three real-ID configs**, each owning the union
of the task types that route to it. Routing is by task type (not config name),
so nothing is lost by merging; the audit log (`LLMRun.model`) now records the
real model rather than a placeholder label.

| Config `modelName` (real ID) | Cost tier | Owns task types (merged) |
|---|---|---|
| `claude-haiku-4-5` | LOW | FAST_CLASSIFICATION, SIGNAL_CLASSIFICATION_ASSIST, CLAIM_EXTRACTION_ASSIST, CLAIM_NORMALISATION, JSON_REPAIR, **SAFETY_REVIEW** (fast + safety merged) |
| `claude-opus-4-8` | HIGH | CONTRADICTION_ANALYSIS, EVIDENCE_ARC_SUMMARY, RISK_OPPORTUNITY_SYNTHESIS, SOURCE_COMPARISON, COMPANY_IMPACT_ANALYSIS, FUTURE_SCENARIOS |
| `claude-sonnet-5` | MEDIUM | LONG_CONTEXT_REVIEW, MARKET_CONTEXT_SYNTHESIS, OPPORTUNITY_PLAYBOOK_GENERATION, STRATEGIC_POSITIONING_GENERATION, EXECUTIVE_BRIEF_GENERATION, OUTREACH_DRAFT_GENERATION, GRAPH_NODE_SUMMARY, GRAPH_EDGE_EXPLANATION, STRATEGIC_POSITIONING, REPORT_SYNTHESIS, HISTORIC_CONTEXT, PRESENT_CONTEXT (longcontext + creative merged; Sonnet 5 is 1M-context) |

Every task type lands in exactly one config, so routing stays unambiguous.
`DEFAULT_ANTHROPIC_MODEL` stays `claude-sonnet-5` (already real). The v1 context
enrichment call is tagged `PRESENT_CONTEXT` (→ Sonnet); impact rationale is
tagged `COMPANY_IMPACT_ANALYSIS` (→ Opus).

## Architecture

Everything new lives beside the deterministic engine; nothing rewrites it.

```
On-demand:  UI "Enhance" button → POST /api/events/[id]/enrich
              → enrichEventConsequence(eventId)          (getActiveProvider)
                  → enrichText(...) → runLLMTask(...)     (validate + advice-guard)
                  → writes llm* columns on existing rows  (fallback = leave deterministic)
Read:       getEventDeepReport / assembleReport prefer llm* fields when present,
              expose an `aiEnhanced` flag; else deterministic (unchanged).
Scan:       runFullScan — untouched, injects no provider → deterministic only.
```

### Components

| File | Responsibility |
|---|---|
| `package.json` | Add `@anthropic-ai/sdk` to `dependencies`. |
| `prisma/schema.prisma` + migration `ai_enrichment` | Nullable LLM columns (below). |
| `src/server/seed.ts` | `deleteMany` the 5 known placeholder-named configs (one-time cleanup; no-op on fresh DB); upsert 3 real-ID configs (Balanced), `enabled: false`. Upsert `update` branch does **not** touch `enabled`, so re-seeding preserves an owner's activated state. |
| `src/server/llm/enrich-text.ts` (new) | `enrichText()` primitive: wraps `runLLMTask`, applies validation + a final advice-guard, returns `{ text, llmRunId } | null`. Fail-open. |
| `src/server/consequence/enrich.ts` (new) | `enrichEventConsequence(eventId, { provider? })`: impact rationale (reasoning) + context narrative (creative); writes llm* columns; returns counts. |
| `src/server/services/consequence.ts` | `getEventDeepReport` / `CompanyImpactView` / views prefer llm* fields; add `aiEnhanced` flags. |
| `src/server/consequence/report.ts` | `assembleReport` prefers enriched context + prepends executive narrative when present. |
| `src/app/api/events/[id]/enrich/route.ts` (new) | `POST` → `enrichEventConsequence(id)` (live via `getActiveProvider`); returns `{ status, counts }`; dormant → `{ status: 'DORMANT' }`. |
| `src/components/consequence/RunEnrichmentButton.tsx` (new) | Client button on the deep report; mirrors `RunInvestigationButton`; shows dormant/enhanced state. |
| `scripts/llm-activate.ts` (new) | Toggle `enabled` on/off for configs (`tsx scripts/llm-activate.ts [on|off]`). |
| `docs/ai-activation.md` (new) | Plain-English owner runbook. |
| `docs/llm-routing-and-guardrails.md` | Update: real IDs, enrichment path, on-demand-only. |

### Data model (migration `ai_enrichment`)

Deterministic text is preserved; LLM output lands in new nullable columns.

- `CompanyImpact.llmRationale String?` — AI "why this company is affected".
- `CompanyImpact.enrichedByLLMRunId String?` — audit link to the `LLMRun`.
- `EventContextSynthesis.llmNarrativeJson String?` — `{ historic, present, future, executive }`.
- `EventContextSynthesis.enrichedByLLMRunId String?` — audit link.

No FK to `LLMProviderConfig`/`LLMRun` (consistent with existing string cross-refs).

## Data flow

**Dormant (default):** `enrichEventConsequence` with no provider → each
`enrichText` call logs `SKIPPED_NO_PROVIDER`, returns `null` → deterministic rows
untouched. Route returns `{ status: 'DORMANT' }`; button reads "AI is off".

**Active on-demand:** owner sets key + enables configs. Clicking "Enhance":
1. Impact rationale — for each **named-org** `CompanyImpact` (never categories),
   `COMPANY_IMPACT_ANALYSIS` (Opus) explains *why*, using only that event's
   evidence claims. Valid + advice-clean → `llmRationale`; else keep
   `impactPathway`.
2. Context narrative — one `HISTORIC_CONTEXT`/`PRESENT_CONTEXT` structured call
   (Sonnet) returns `{ historic, present, future, executive }` from the event's
   own evidence/impacts → `llmNarrativeJson`; else keep deterministic prose.

Enriched fields persist (click once, keep it). Re-clicking re-enriches.

### Grounding model for enrichment

Extraction grounds by echoing `documentId`; that is wrong for prose (it would
corrupt the narrative). Enrichment grounds by **restricted input** instead: the
prompt contains only the event's own evidence, the system prompt forbids
inventing any company/number/fact not present, and output still passes schema +
advice-language validation. `requireGrounding` (literal id-echo) is `false` for
prose tasks. This upholds "invent nothing" without polluting the text.

### Provider call

`provider.ts` is already correct for the Balanced models and needs **no change**:
`messages.create({ model, max_tokens, system, messages })` — no `temperature`,
no `budget_tokens` (both rejected on Opus 4.8 / Sonnet 5 / Haiku 4.5). `max_tokens`
per call ≤ ~1536 (well under the 16k non-streaming threshold). v1 sends no
`thinking` param (simple/cheap; tuning deferred).

## Safety & invariants (unchanged, enforced by tests)

- **Advice guard + grounding + schema, fail-closed.** Any failed validation →
  output discarded → deterministic value stands. Enriched text also passes a
  final `findAdviceLanguage` gate before persisting (defense in depth).
- **Named companies only from evidence.** Enrichment reasons over existing
  `CompanyImpact` rows; it never invents a company (Pass 3 rule holds).
- **Scans stay deterministic.** A dedicated test asserts a full `runFullScan`
  produces no live `LLMRun` (all `SKIPPED_NO_PROVIDER`/absent).
- **Dormant-safe.** No key → no network call, no error, deterministic output.
- **No secrets committed.** Key lives only in git-ignored `.env`; `runLLMTask`
  never logs raw prompts/keys (sha256 + summaries only).

## Testing strategy (FakeProvider — no live calls in CI)

A `makeFakeProvider(byTaskType)` test double returns canned text/JSON per task
type. All enrichment functions accept an injected provider, so tests never touch
`getActiveProvider`/the network.

- `enrichText`: grounded-clean → returns text; advice-laden → `null` (rejected);
  provider throws → `null`. Deterministic row intact in every case.
- `enrichEventConsequence`: enriches impact + context with a fake provider;
  bad/advice output → falls back, deterministic rows unchanged; **dormant
  (no provider) → no-op**, rows unchanged.
- Read path: `getEventDeepReport`/`assembleReport` prefer llm* fields when
  present and set `aiEnhanced`; else deterministic.
- **Scan invariant:** full scan → zero live `LLMRun`.
- Seed: 3 configs, all `enabled: false`, `modelName`s are real IDs; every LLM
  task type routes to exactly one config.
- `llm-activate` script flips `enabled`.
- Regression: adjust any seed-dependent test (router / upgrade-proof) to the
  real IDs; keep all Pass 2/3 tests green.

## Activation runbook (`docs/ai-activation.md`)

1. `npm install` (pulls `@anthropic-ai/sdk`).
2. Put `ANTHROPIC_API_KEY=sk-ant-…` in `.env` (git-ignored — never commit).
3. `npm run db:seed` (writes real model IDs; configs still disabled).
4. `npx tsx scripts/llm-activate.ts on` (enables the configs).
5. Open an event's deep report → **Enhance with AI**.
   Turn off any time: `npx tsx scripts/llm-activate.ts off` (or unset the key).

## Risks

- **Seed unique-key collision (resolved).** `modelName` is `@unique` and doubles
  as the SDK model string. Balanced uses only 3 real models, so keeping 5 configs
  would force two rows to share `claude-haiku-4-5` and two to share
  `claude-sonnet-5` → constraint violation. **Resolved by merging to 3 real-ID
  configs** (see the tier table), each owning the union of its task types. Seed
  deletes the 5 placeholder rows by their known names, then upserts the 3 real
  configs. No schema change to `LLMProviderConfig` is needed for this.
- **Sync-conflict duplicates.** iCloud "Desktop & Documents" is generating
  byte-identical "filename 2.ext" copies under `~/Desktop/Websites/Archlight`
  (build-cache copies break typecheck). Out of scope here; flagged to owner
  (durable fix: move repo out of a synced folder). Never stage these.

## Out of scope / deferred

Positioning-angle enrichment; investigation-query & extraction live-assist;
structured-output (`output_config.format`), adaptive-thinking, and streaming
tuning; per-tier thinking. All are clean follow-ups on the same primitive.
