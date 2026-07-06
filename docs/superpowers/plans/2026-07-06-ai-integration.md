# AI Integration — On-Demand Consequence Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the dormant multi-model LLM so an event's deep report can be enriched on demand with AI-written company-impact rationale and historic/present/future narrative — fail-open, advice-guarded, scans untouched.

**Architecture:** New code sits beside the deterministic Commercial Consequence Engine. A single `enrichEventConsequence(eventId, {provider?})` orchestrator calls the existing `runLLMTask` entrypoint through a thin `enrichText` wrapper, writes results into new nullable `llm*` columns on `CompanyImpact` / `EventContextSynthesis`, and falls back to the deterministic value on any failure. A `POST /api/events/[id]/enrich` route + an "Enhance" button trigger it. Scans never inject a provider, so they stay deterministic.

**Tech Stack:** Next.js 15 (App Router), TypeScript (strict), Prisma + SQLite, Zod, Vitest, `@anthropic-ai/sdk`.

## Global Constraints

- Every generated string passes `validateLLMOutput` (schema + `findAdviceLanguage` advice guard + grounding), fail-closed; `runLLMTask` returns text ONLY on `SUCCEEDED`. Validation is the single centralised rejection point — no post-hoc advice check needed after a SUCCEEDED result.
- Named companies come ONLY from evidence (Pass 3 rule); enrichment reasons over existing `CompanyImpact` rows and never invents a company.
- Dormant-safe: no `ANTHROPIC_API_KEY` / no enabled config → `getActiveProvider()` is null → `runLLMTask` logs `SKIPPED_NO_PROVIDER`, no network call, deterministic output stands.
- Scans make ZERO live LLM calls (no provider injected in the scan pipeline).
- No secrets committed. Key lives only in git-ignored `.env`.
- GBP only anywhere currency appears; no prices; no advice.
- Real Anthropic model IDs only: `claude-haiku-4-5`, `claude-opus-4-8`, `claude-sonnet-5`. No `temperature`/`budget_tokens` in provider calls (rejected on these models).
- Every commit: scoped typecheck (`npm run typecheck`) clean + tests (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npm test`) green. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Baseline at branch start: 66 files / 418 tests green.

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `package.json` | Modify | Add `@anthropic-ai/sdk` dependency. |
| `prisma/schema.prisma` | Modify | 4 nullable columns on `CompanyImpact` + `EventContextSynthesis`. |
| `prisma/migrations/*_ai_enrichment/` | Create | Generated migration. |
| `src/server/seed.ts` | Modify | 5 placeholder configs → 3 real-ID configs. |
| `src/server/llm/enrich-text.ts` | Create | `enrichText()` wrapper over `runLLMTask`. |
| `src/server/consequence/enrich.ts` | Create | `enrichEventConsequence()` orchestrator. |
| `src/server/consequence/types.ts` | Modify | `CompanyImpactView` gains `llmRationale`/`aiEnhanced`; add `EnrichmentResult`. |
| `src/server/services/consequence.ts` | Modify | Views prefer `llm*` fields; expose `aiEnhanced`. |
| `src/server/consequence/report.ts` | Modify | Prefer enriched context; prepend executive narrative. |
| `src/app/api/events/[id]/enrich/route.ts` | Create | `POST` → `enrichEventConsequence`. |
| `src/components/consequence/RunEnrichmentButton.tsx` | Create | Client button (mirrors `RunInvestigationButton`). |
| `src/components/EventReportTabs.tsx` | Modify | Render the button on the Companies panel. |
| `scripts/llm-activate.ts` | Create | Toggle config `enabled`. |
| `docs/ai-activation.md` | Create | Owner runbook. |
| `docs/llm-routing-and-guardrails.md` | Modify | Real IDs + enrichment + on-demand note. |
| Tests | Create/Modify | Per task below. |

---

### Task 1: Enrichment schema columns + SDK dependency

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `prisma/schema.prisma` (models `CompanyImpact`, `EventContextSynthesis`)
- Create: `prisma/migrations/<ts>_ai_enrichment/migration.sql` (via Prisma)
- Test: `tests/ai-enrichment-schema.test.ts`

**Interfaces:**
- Produces: `CompanyImpact.llmRationale String?`, `CompanyImpact.enrichedByLLMRunId String?`, `EventContextSynthesis.llmNarrativeJson String?`, `EventContextSynthesis.enrichedByLLMRunId String?`.

- [ ] **Step 1: Write the failing test** — `tests/ai-enrichment-schema.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

describe('ai-enrichment schema columns', () => {
  beforeEach(resetDb)

  it('persists llmRationale + enrichedByLLMRunId on CompanyImpact', async () => {
    const { event } = await makeEventGraph('Voltcore is cutting 400 jobs.', { eventClass: 'RISK' })
    const impact = await prisma.companyImpact.create({
      data: {
        eventCandidateId: event.id, companyName: 'Voltcore', impactType: 'HARMED',
        impactPathway: 'deterministic', confidence: 0.5, evidenceIdsJson: '[]',
        riskScore: 0.7, opportunityScore: 0.3, watchSignalsJson: '[]', metadataJson: '{}',
        llmRationale: 'AI-written why.', enrichedByLLMRunId: 'run_abc',
      },
    })
    expect(impact.llmRationale).toBe('AI-written why.')
    expect(impact.enrichedByLLMRunId).toBe('run_abc')
  })

  it('persists llmNarrativeJson + enrichedByLLMRunId on EventContextSynthesis', async () => {
    const { event } = await makeEventGraph('Voltcore is cutting 400 jobs.', { eventClass: 'RISK' })
    const ctx = await prisma.eventContextSynthesis.create({
      data: {
        eventCandidateId: event.id, historicContext: 'h', presentContext: 'p', futureContext: 'f',
        confidence: 0.5, evidenceIdsJson: '[]',
        llmNarrativeJson: JSON.stringify({ historic: 'H', present: 'P', future: 'F', executive: 'E' }),
        enrichedByLLMRunId: 'run_xyz',
      },
    })
    expect(JSON.parse(ctx.llmNarrativeJson!).executive).toBe('E')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run tests/ai-enrichment-schema.test.ts` → FAIL (Prisma: `Unknown argument llmRationale`).

- [ ] **Step 3: Add the columns** — in `prisma/schema.prisma`, add to `model CompanyImpact`:

```prisma
  llmRationale       String?
  enrichedByLLMRunId String?
```

and to `model EventContextSynthesis`:

```prisma
  llmNarrativeJson   String?
  enrichedByLLMRunId String?
```

- [ ] **Step 4: Generate migration + client** — `npx prisma migrate dev --name ai_enrichment` (regenerates client). If it prompts, it is non-interactive-safe here (dev DB). Expected: migration created, client regenerated.

- [ ] **Step 5: Add SDK dependency** — in `package.json` `dependencies`, add `"@anthropic-ai/sdk": "^0.65.0"` (latest available on install), then `npm install`. (Tests never call it; it's for runtime activation. The provider's guarded import degrades gracefully if a future install omits it.)

- [ ] **Step 6: Run test + typecheck** — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run tests/ai-enrichment-schema.test.ts` → PASS; `npm run typecheck` → clean.

- [ ] **Step 7: Full suite** — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npm test` → all green (419 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json prisma/schema.prisma prisma/migrations tests/ai-enrichment-schema.test.ts
git commit -m "feat(ai): enrichment columns + @anthropic-ai/sdk dep

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Seed 3 real-ID provider configs

**Files:**
- Modify: `src/server/seed.ts:90-155` (the `providerConfigs` block)
- Test: `tests/seed-provider-configs.test.ts`

**Interfaces:**
- Produces: exactly 3 `LLMProviderConfig` rows — `claude-haiku-4-5` (LOW), `claude-opus-4-8` (HIGH), `claude-sonnet-5` (MEDIUM), all `enabled: false`. Every LLM task type routes to exactly one.

- [ ] **Step 1: Write the failing test** — `tests/seed-provider-configs.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { loadRouterConfigs, routeTask } from '@/server/llm/router'
import { resetDb } from './helpers'

const REAL_IDS = ['claude-haiku-4-5', 'claude-opus-4-8', 'claude-sonnet-5']

describe('seed provider configs (real model IDs)', () => {
  beforeEach(resetDb)

  it('seeds exactly 3 configs, all disabled, all real model IDs', async () => {
    await runSeed({ includeLive: false })
    const rows = await prisma.lLMProviderConfig.findMany()
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.enabled === false)).toBe(true)
    expect(rows.map((r) => r.modelName).sort()).toEqual([...REAL_IDS].sort())
  })

  it('routes representative task types to the intended real model', async () => {
    await runSeed({ includeLive: false })
    const c = await loadRouterConfigs()
    expect(routeTask('COMPANY_IMPACT_ANALYSIS', c)?.modelName).toBe('claude-opus-4-8')
    expect(routeTask('PRESENT_CONTEXT', c)?.modelName).toBe('claude-sonnet-5')
    expect(routeTask('CLAIM_NORMALISATION', c)?.modelName).toBe('claude-haiku-4-5')
    expect(routeTask('SAFETY_REVIEW', c)?.modelName).toBe('claude-haiku-4-5')
  })

  it('re-seeding preserves an enabled config (does not force-disable)', async () => {
    await runSeed({ includeLive: false })
    await prisma.lLMProviderConfig.update({ where: { modelName: 'claude-opus-4-8' }, data: { enabled: true } })
    await runSeed({ includeLive: false })
    const opus = await prisma.lLMProviderConfig.findUnique({ where: { modelName: 'claude-opus-4-8' } })
    expect(opus?.enabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run tests/seed-provider-configs.test.ts` → FAIL (5 rows, placeholder names).

- [ ] **Step 3: Replace the `providerConfigs` block** in `src/server/seed.ts`. Before the loop, delete old placeholders; then define 3 real configs:

```typescript
  // Retire the old placeholder-named configs (one-time; no-op on a fresh DB).
  await prisma.lLMProviderConfig.deleteMany({
    where: { modelName: { in: ['claude-fast', 'claude-reasoning', 'claude-longcontext', 'claude-creative', 'claude-safety'] } },
  })

  // Seed 3 real-model configs (Balanced tier — all enabled:false, dormant until owner activates).
  const providerConfigs = [
    {
      providerName: 'Anthropic',
      modelName: 'claude-haiku-4-5',
      taskTypesJson: JSON.stringify(['FAST_CLASSIFICATION', 'SIGNAL_CLASSIFICATION_ASSIST', 'CLAIM_EXTRACTION_ASSIST', 'CLAIM_NORMALISATION', 'JSON_REPAIR', 'SAFETY_REVIEW']),
      costTier: 'LOW',
      latencyTier: 'FAST',
      strengthsJson: JSON.stringify(['Speed', 'Cost-effective']),
      weaknessesJson: JSON.stringify(['Less reasoning depth']),
    },
    {
      providerName: 'Anthropic',
      modelName: 'claude-opus-4-8',
      taskTypesJson: JSON.stringify(['CONTRADICTION_ANALYSIS', 'EVIDENCE_ARC_SUMMARY', 'RISK_OPPORTUNITY_SYNTHESIS', 'SOURCE_COMPARISON', 'COMPANY_IMPACT_ANALYSIS', 'FUTURE_SCENARIOS']),
      costTier: 'HIGH',
      latencyTier: 'SLOW',
      strengthsJson: JSON.stringify(['Deep reasoning', 'Complex analysis']),
      weaknessesJson: JSON.stringify(['Higher cost', 'Slower']),
    },
    {
      providerName: 'Anthropic',
      modelName: 'claude-sonnet-5',
      taskTypesJson: JSON.stringify(['LONG_CONTEXT_REVIEW', 'MARKET_CONTEXT_SYNTHESIS', 'OPPORTUNITY_PLAYBOOK_GENERATION', 'STRATEGIC_POSITIONING_GENERATION', 'EXECUTIVE_BRIEF_GENERATION', 'OUTREACH_DRAFT_GENERATION', 'GRAPH_NODE_SUMMARY', 'GRAPH_EDGE_EXPLANATION', 'STRATEGIC_POSITIONING', 'REPORT_SYNTHESIS', 'HISTORIC_CONTEXT', 'PRESENT_CONTEXT']),
      maxContextTokens: 200000,
      costTier: 'MEDIUM',
      latencyTier: 'MEDIUM',
      strengthsJson: JSON.stringify(['Balanced reasoning + writing', 'Large context']),
      weaknessesJson: JSON.stringify(['Mid-cost']),
    },
  ]
```

The existing upsert loop (keyed on `modelName`, `update` NOT touching `enabled`) stays unchanged.

- [ ] **Step 4: Run the new test** → PASS.

- [ ] **Step 5: Run seed-dependent tests** — `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npx vitest run tests/llm-router.test.ts tests/seed.test.ts` → PASS (router test's cost tiers are unchanged: HIGH/LOW/MEDIUM per task type; `seed.test.ts` asserts ≥1 disabled config).

- [ ] **Step 6: Full suite + typecheck** → green.

- [ ] **Step 7: Commit**

```bash
git add src/server/seed.ts tests/seed-provider-configs.test.ts
git commit -m "feat(ai): seed 3 real-model provider configs (Balanced)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `enrichText` primitive

**Files:**
- Create: `src/server/llm/enrich-text.ts`
- Test: `tests/llm/enrich-text.test.ts`

**Interfaces:**
- Consumes: `runLLMTask` (`src/server/llm/run.ts`), `LLMProvider`/`LLMRequest` (`src/server/llm/types.ts`), `ValidateOptions` (`src/server/llm/validate.ts`), `LLMTaskType` (`@/shared/enums`).
- Produces: `enrichText(opts: EnrichTextOptions): Promise<{ text: string; llmRunId: string } | null>` where `EnrichTextOptions = { taskType: LLMTaskType; system: string; prompt: string; provider?: LLMProvider | null; maxTokens?: number; validate?: ValidateOptions }`.

- [ ] **Step 1: Write the failing test** — `tests/llm/enrich-text.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { prisma } from '@/server/db'
import type { LLMProvider } from '@/server/llm/types'
import { enrichText } from '@/server/llm/enrich-text'
import { resetDb } from '../helpers'

function fake(text: string): LLMProvider {
  return { name: 'fake', async generate() { return { text, tokensIn: 1, tokensOut: 1 } } }
}
const throwing: LLMProvider = { name: 'boom', async generate() { throw new Error('network') } }

describe('enrichText', () => {
  beforeEach(resetDb)

  it('returns text + llmRunId on clean output', async () => {
    const out = await enrichText({ taskType: 'COMPANY_IMPACT_ANALYSIS', system: 's', prompt: 'p', provider: fake('Voltcore may face pressure as the situation develops.') })
    expect(out).not.toBeNull()
    expect(out!.text).toContain('Voltcore')
    const run = await prisma.lLMRun.findUnique({ where: { id: out!.llmRunId } })
    expect(run?.status).toBe('SUCCEEDED')
  })

  it('returns null on advice language (rejected by validation)', async () => {
    const out = await enrichText({ taskType: 'COMPANY_IMPACT_ANALYSIS', system: 's', prompt: 'p', provider: fake('You should buy this stock now.') })
    expect(out).toBeNull()
  })

  it('returns null on schema failure', async () => {
    const out = await enrichText({ taskType: 'PRESENT_CONTEXT', system: 's', prompt: 'p', provider: fake('not json'), validate: { schema: z.object({ historic: z.string() }) } })
    expect(out).toBeNull()
  })

  it('returns null when the provider throws', async () => {
    const out = await enrichText({ taskType: 'COMPANY_IMPACT_ANALYSIS', system: 's', prompt: 'p', provider: throwing })
    expect(out).toBeNull()
  })

  it('returns null when dormant (no provider)', async () => {
    const out = await enrichText({ taskType: 'COMPANY_IMPACT_ANALYSIS', system: 's', prompt: 'p', provider: null })
    expect(out).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `… npx vitest run tests/llm/enrich-text.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/server/llm/enrich-text.ts`:

```typescript
import { runLLMTask } from './run'
import type { LLMProvider } from './types'
import type { ValidateOptions } from './validate'
import type { LLMTaskType } from '@/shared/enums'

export type EnrichTextOptions = {
  taskType: LLMTaskType
  system: string
  prompt: string
  /** Omit → getActiveProvider(); null → dormant. */
  provider?: LLMProvider | null
  maxTokens?: number
  validate?: ValidateOptions
}

/** Thin, fail-open wrapper over runLLMTask for enrichment call sites: returns
 *  the generated text ONLY when the run SUCCEEDED (schema + advice + grounding
 *  all passed — validation is the single centralised rejection point), else
 *  null so the caller keeps its deterministic value. Never throws for content
 *  or provider reasons. */
export async function enrichText(opts: EnrichTextOptions): Promise<{ text: string; llmRunId: string } | null> {
  const result = await runLLMTask(
    { taskType: opts.taskType, system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens },
    { provider: opts.provider, validate: opts.validate ?? {} },
  )
  if (result.status === 'SUCCEEDED' && result.text) {
    return { text: result.text, llmRunId: result.llmRunId }
  }
  return null
}
```

- [ ] **Step 4: Run test** → PASS. **Step 5: typecheck** → clean.

- [ ] **Step 6: Commit**

```bash
git add src/server/llm/enrich-text.ts tests/llm/enrich-text.test.ts
git commit -m "feat(ai): enrichText fail-open wrapper over runLLMTask

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `enrichEventConsequence` orchestrator

**Files:**
- Create: `src/server/consequence/enrich.ts`
- Modify: `src/server/consequence/types.ts` (add `EnrichmentResult`)
- Test: `tests/consequence-enrich.test.ts`

**Interfaces:**
- Consumes: `enrichText` (Task 3), `prisma`, `CompanyImpact`/`EventContextSynthesis` rows, `LLMProvider`.
- Produces:
  - `EnrichmentResult = { status: 'ENRICHED' | 'DORMANT'; impactsEnriched: number; contextEnriched: boolean; skipped: number }` (in `types.ts`).
  - `enrichEventConsequence(eventCandidateId: string, opts?: { provider?: LLMProvider | null }): Promise<EnrichmentResult>`.

- [ ] **Step 1: Write the failing test** — `tests/consequence-enrich.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import type { LLMProvider, LLMRequest } from '@/server/llm/types'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { synthesiseContext } from '@/server/consequence/context'
import { enrichEventConsequence } from '@/server/consequence/enrich'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'

/** Task-aware fake: rationale = plain prose; context = JSON narrative. */
function fake(byTask: Record<string, string>): LLMProvider {
  return {
    name: 'fake',
    async generate(req: LLMRequest) {
      return { text: byTask[req.taskType] ?? '', tokensIn: 1, tokensOut: 1 }
    },
  }
}
const GOOD_CONTEXT = JSON.stringify({
  historic: 'Prior comparable layoffs in the sector resolved slowly.',
  present: 'Voltcore is currently the named exposed party.',
  future: 'Watch for confirming reports before drawing conclusions.',
  executive: 'A layoff signal at Voltcore that a supplier or recruiter may wish to monitor.',
})

async function seedDeterministic(eventId: string) {
  await resolveCompanyImpacts(eventId)
  await synthesiseContext(eventId)
}

describe('enrichEventConsequence', () => {
  beforeEach(resetDb)

  it('writes llmRationale on named-org impacts and llmNarrativeJson on context', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    const provider = fake({
      COMPANY_IMPACT_ANALYSIS: 'Voltcore may face pressure as the situation develops; verify against primary sources.',
      PRESENT_CONTEXT: GOOD_CONTEXT,
    })
    const res = await enrichEventConsequence(event.id, { provider })

    expect(res.status).toBe('ENRICHED')
    expect(res.contextEnriched).toBe(true)
    expect(res.impactsEnriched).toBeGreaterThan(0)

    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    expect(named?.llmRationale).toContain('Voltcore')
    expect(named?.enrichedByLLMRunId).toBeTruthy()

    const ctx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId: event.id } })
    expect(JSON.parse(ctx!.llmNarrativeJson!).executive).toContain('Voltcore')
    for (const s of Object.values(JSON.parse(ctx!.llmNarrativeJson!))) {
      expect(findAdviceLanguage(s as string)).toEqual([])
    }
  })

  it('does NOT enrich category-level impacts (entityId null)', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    await enrichEventConsequence(event.id, {
      provider: fake({ COMPANY_IMPACT_ANALYSIS: 'Some category prose.', PRESENT_CONTEXT: GOOD_CONTEXT }),
    })
    const category = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: null } })
    expect(category?.llmRationale).toBeNull()
  })

  it('falls back (no llm fields) when output is advice/invalid', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    const res = await enrichEventConsequence(event.id, {
      provider: fake({ COMPANY_IMPACT_ANALYSIS: 'You should buy Voltcore now.', PRESENT_CONTEXT: 'not json' }),
    })
    expect(res.impactsEnriched).toBe(0)
    expect(res.contextEnriched).toBe(false)
    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    expect(named?.llmRationale).toBeNull()
    const ctx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId: event.id } })
    expect(ctx?.llmNarrativeJson).toBeNull()
    expect(ctx?.presentContext).toContain('Voltcore') // deterministic prose intact
  })

  it('is a dormant no-op with no provider', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await seedDeterministic(event.id)
    const res = await enrichEventConsequence(event.id, { provider: null })
    expect(res.status).toBe('DORMANT')
    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    expect(named?.llmRationale).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (module not found).

- [ ] **Step 3a: Add `EnrichmentResult` to `src/server/consequence/types.ts`:**

```typescript
export type EnrichmentResult = {
  status: 'ENRICHED' | 'DORMANT'
  impactsEnriched: number
  contextEnriched: boolean
  skipped: number
}
```

- [ ] **Step 3b: Implement** — `src/server/consequence/enrich.ts`:

```typescript
import { z } from 'zod'
import { prisma } from '@/server/db'
import { enrichText } from '@/server/llm/enrich-text'
import { getActiveProvider } from '@/server/llm/provider'
import type { LLMProvider } from '@/server/llm/types'
import type { EnrichmentResult } from './types'

const NarrativeSchema = z.object({
  historic: z.string().min(1),
  present: z.string().min(1),
  future: z.string().min(1),
  executive: z.string().min(1),
})

const IMPACT_SYSTEM =
  'You explain, in two or three sentences, why a specifically-named company may be affected by an event, ' +
  'using ONLY the facts provided. Invent no company, number, or fact not present. No investment advice of any kind. ' +
  'Hedge appropriately (may, could) and end by noting the reader should verify against primary sources.'

const CONTEXT_SYSTEM =
  'You write grounded context for an event using ONLY the facts provided. Return ONLY JSON ' +
  '{"historic":string,"present":string,"future":string,"executive":string}. "executive" is a one-sentence brief. ' +
  'Invent nothing. No investment advice, price targets, or buy/sell/hold language.'

function parseArr(json: string): string[] {
  try {
    const j = JSON.parse(json)
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** On-demand AI enrichment of ONE event's consequence view. Reasons only over
 *  the event's already-resolved impacts + evidence; never invents a company.
 *  Fail-open: any failed/rejected/dormant call leaves the deterministic row
 *  untouched. Enriched text lands in the llm* columns with an audit run id. */
export async function enrichEventConsequence(
  eventCandidateId: string,
  opts: { provider?: LLMProvider | null } = {},
): Promise<EnrichmentResult> {
  const provider = opts.provider === undefined ? await getActiveProvider() : opts.provider
  if (!provider) return { status: 'DORMANT', impactsEnriched: 0, contextEnriched: false, skipped: 0 }

  const event = await prisma.eventCandidate.findUnique({ where: { id: eventCandidateId } })
  if (!event) return { status: 'DORMANT', impactsEnriched: 0, contextEnriched: false, skipped: 0 }

  let impactsEnriched = 0
  let skipped = 0

  // ── Named-org impact rationale (reasoning tier). Category impacts (entityId
  //    null) are never enriched — they are inferential, not a specific company. ──
  const namedImpacts = await prisma.companyImpact.findMany({ where: { eventCandidateId, entityId: { not: null } } })
  for (const impact of namedImpacts) {
    const evidenceIds = parseArr(impact.evidenceIdsJson)
    const claims = evidenceIds.length
      ? await prisma.atomicClaim.findMany({ where: { id: { in: evidenceIds } }, select: { claimText: true } })
      : []
    const facts = claims.map((c) => `- ${c.claimText}`).join('\n') || `- ${event.summary}`
    const out = await enrichText({
      taskType: 'COMPANY_IMPACT_ANALYSIS',
      system: IMPACT_SYSTEM,
      prompt: `Company: ${impact.companyName}\nEvent: ${event.summary}\nImpact direction: ${impact.impactType}\nEvidence:\n${facts}`,
      provider,
      maxTokens: 512,
    })
    if (out) {
      await prisma.companyImpact.update({ where: { id: impact.id }, data: { llmRationale: out.text, enrichedByLLMRunId: out.llmRunId } })
      impactsEnriched += 1
    } else {
      skipped += 1
    }
  }

  // ── Context narrative (creative tier), one structured call. ──
  let contextEnriched = false
  const ctx = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId } })
  if (ctx) {
    const impacts = await prisma.companyImpact.findMany({ where: { eventCandidateId } })
    const named = impacts.filter((i) => i.entityId).map((i) => i.companyName)
    const out = await enrichText({
      taskType: 'PRESENT_CONTEXT',
      system: CONTEXT_SYSTEM,
      prompt:
        `Event: ${event.summary}\n` +
        `Type: ${event.eventType} (${event.eventClass})\n` +
        `Named parties in evidence: ${named.join(', ') || 'none'}\n` +
        `Deterministic present read: ${ctx.presentContext}\n` +
        `Deterministic historic read: ${ctx.historicContext}`,
      provider,
      maxTokens: 1200,
      validate: { schema: NarrativeSchema },
    })
    if (out) {
      await prisma.eventContextSynthesis.update({ where: { eventCandidateId }, data: { llmNarrativeJson: out.text, enrichedByLLMRunId: out.llmRunId } })
      contextEnriched = true
    } else {
      skipped += 1
    }
  }

  return { status: 'ENRICHED', impactsEnriched, contextEnriched, skipped }
}
```

- [ ] **Step 4: Run test** → PASS. **Step 5: typecheck + full suite** → green.

- [ ] **Step 6: Commit**

```bash
git add src/server/consequence/enrich.ts src/server/consequence/types.ts tests/consequence-enrich.test.ts
git commit -m "feat(ai): on-demand consequence enrichment orchestrator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Read path prefers enriched fields

**Files:**
- Modify: `src/server/consequence/types.ts` (`CompanyImpactView`)
- Modify: `src/server/services/consequence.ts` (`toView`, `EventDeepReport`, `getEventDeepReport`)
- Modify: `src/server/consequence/report.ts` (`assembleReport`)
- Test: `tests/consequence-read-enriched.test.ts`

**Interfaces:**
- `CompanyImpactView` gains `llmRationale: string | null` and `aiEnhanced: boolean`.
- `EventDeepReport.context` gains optional `llmNarrative: { historic; present; future; executive } | null` and the report exposes `aiEnhanced: boolean`.

- [ ] **Step 1: Write the failing test** — `tests/consequence-read-enriched.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { synthesiseContext } from '@/server/consequence/context'
import { getEventDeepReport } from '@/server/services/consequence'
import { assembleReport } from '@/server/consequence/report'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'

describe('read path surfaces enriched fields', () => {
  beforeEach(resetDb)

  it('deep report prefers llmRationale + llmNarrative and sets aiEnhanced', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    await synthesiseContext(event.id)
    const named = await prisma.companyImpact.findFirst({ where: { eventCandidateId: event.id, entityId: { not: null } } })
    await prisma.companyImpact.update({ where: { id: named!.id }, data: { llmRationale: 'AI rationale for Voltcore.', enrichedByLLMRunId: 'r1' } })
    await prisma.eventContextSynthesis.update({
      where: { eventCandidateId: event.id },
      data: { llmNarrativeJson: JSON.stringify({ historic: 'H', present: 'P', future: 'F', executive: 'E brief' }), enrichedByLLMRunId: 'r2' },
    })

    const report = await getEventDeepReport(event.id)
    const enriched = report.companies.find((c) => c.aiEnhanced)
    expect(enriched?.llmRationale).toBe('AI rationale for Voltcore.')
    expect(report.context?.llmNarrative?.executive).toBe('E brief')

    const assembled = await assembleReport(event.id, 'EXECUTIVE_BRIEF')
    expect(assembled!.markdown).toContain('E brief') // executive narrative surfaced
  })

  it('unenriched event reports aiEnhanced=false, deterministic prose', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    await synthesiseContext(event.id)
    const report = await getEventDeepReport(event.id)
    expect(report.companies.every((c) => c.aiEnhanced === false)).toBe(true)
    expect(report.context?.llmNarrative ?? null).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (`aiEnhanced`/`llmNarrative` undefined; executive not in markdown).

- [ ] **Step 3a: `CompanyImpactView`** in `types.ts` — add:

```typescript
  llmRationale: string | null
  aiEnhanced: boolean
```

- [ ] **Step 3b: `toView` in `services/consequence.ts`** — set the two fields (prefer rationale for display):

```typescript
    llmRationale: i.llmRationale ?? null,
    aiEnhanced: !!i.llmRationale,
    impactPathway: i.llmRationale ?? i.impactPathway,
```

(Replace the existing `impactPathway: i.impactPathway,` line with the last line above, and add the first two lines.)

- [ ] **Step 3c: `EventDeepReport` + `getEventDeepReport`** — add to the `context` shape a parsed `llmNarrative`:

```typescript
// in EventDeepReport.context type:
context: { historicContext: string; presentContext: string; futureContext: string; confidence: number; llmNarrative: { historic: string; present: string; future: string; executive: string } | null } | null

// in getEventDeepReport, when building context:
context: ctx
  ? {
      historicContext: ctx.historicContext,
      presentContext: ctx.presentContext,
      futureContext: ctx.futureContext,
      confidence: ctx.confidence,
      llmNarrative: parseNarrative(ctx.llmNarrativeJson),
    }
  : null,
```

with a helper in the same file:

```typescript
function parseNarrative(json: string | null): { historic: string; present: string; future: string; executive: string } | null {
  if (!json) return null
  try {
    const j = JSON.parse(json)
    if (j && typeof j.historic === 'string' && typeof j.present === 'string' && typeof j.future === 'string' && typeof j.executive === 'string') return j
  } catch {
    /* fall through */
  }
  return null
}
```

- [ ] **Step 3d: `assembleReport` in `report.ts`** — after loading `context`, prepend the executive narrative when present. Replace the `## Summary` block source:

```typescript
const narrative = context?.llmNarrativeJson ? safeNarrative(context.llmNarrativeJson) : null
// ...in the markdown array, replace `event.summary` under `## Summary` with:
narrative?.executive ? `${narrative.executive}\n\n${event.summary}` : event.summary,
// ...and prefer enriched context in the three context sections:
narrative?.historic ?? context?.historicContext ?? 'Not yet synthesised.',
narrative?.present ?? context?.presentContext ?? 'Not yet synthesised.',
narrative?.future ?? context?.futureContext ?? 'Not yet synthesised.',
```

add a local `safeNarrative` helper (same shape as `parseNarrative`) in `report.ts`. Keep the trailing `assertNoAdviceLanguage(markdown, …)` — enriched text was already advice-validated at write time; the guard re-checks belt-and-suspenders.

- [ ] **Step 4: Run test** → PASS. **Step 5: typecheck + full suite** → green (confirm `event-interrogation-deep-output.test.ts` still passes; enriched fields default to deterministic when absent).

- [ ] **Step 6: Commit**

```bash
git add src/server/consequence/types.ts src/server/services/consequence.ts src/server/consequence/report.ts tests/consequence-read-enriched.test.ts
git commit -m "feat(ai): deep report + views prefer enriched fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Enrich route + button

**Files:**
- Create: `src/app/api/events/[id]/enrich/route.ts`
- Create: `src/components/consequence/RunEnrichmentButton.tsx`
- Modify: `src/components/EventReportTabs.tsx` (render the button on the Companies panel)
- Test: `tests/api/enrich-api.test.ts`

**Interfaces:**
- Consumes: `enrichEventConsequence` (Task 4).
- Route `POST /api/events/[id]/enrich` → `Response.json(EnrichmentResult)`; dormant (no key) → `{ status: 'DORMANT', … }`.

- [ ] **Step 1: Write the failing test** — `tests/api/enrich-api.test.ts` (no key in test env → dormant path, proving the route is wired + safe):

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/events/[id]/enrich/route'
import { resetDb } from '../helpers'
import { makeEventGraph } from '../factories'

describe('POST /api/events/[id]/enrich', () => {
  beforeEach(resetDb)

  it('returns DORMANT (no key/config) without error and writes nothing', async () => {
    const { event } = await makeEventGraph('Voltcore is cutting 400 jobs.', { eventClass: 'RISK' })
    const res = await POST(new Request('http://t/enrich', { method: 'POST' }), { params: Promise.resolve({ id: event.id }) })
    const body = await res.json()
    expect(body.status).toBe('DORMANT')
  })
})
```

- [ ] **Step 2: Run to verify it fails** → FAIL (route module not found).

- [ ] **Step 3a: Route** — `src/app/api/events/[id]/enrich/route.ts`:

```typescript
import { enrichEventConsequence } from '@/server/consequence/enrich'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await enrichEventConsequence(id)
  return Response.json(result)
}
```

- [ ] **Step 3b: Button** — `src/components/consequence/RunEnrichmentButton.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Result = { status: 'ENRICHED' | 'DORMANT'; impactsEnriched: number; contextEnriched: boolean; skipped: number }

export function RunEnrichmentButton({ eventId }: { eventId: string }) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<Result | null>(null)

  async function run() {
    setState('running')
    try {
      const res = await fetch(`/api/events/${eventId}/enrich`, { method: 'POST' })
      if (!res.ok) throw new Error('bad status')
      setResult(await res.json())
      setState('done')
      router.refresh()
    } catch {
      setState('error')
    }
  }

  return (
    <div className="mt-3">
      <button
        onClick={run}
        disabled={state === 'running'}
        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
      >
        {state === 'running' ? 'Enhancing…' : 'Enhance with AI'}
      </button>
      {state === 'done' && result?.status === 'DORMANT' && (
        <p className="mt-2 text-xs text-slate-400">AI is off — set an API key and enable a model config to enable enrichment.</p>
      )}
      {state === 'done' && result?.status === 'ENRICHED' && (
        <p className="mt-2 text-xs text-slate-400">
          Enhanced {result.impactsEnriched} company rationale(s){result.contextEnriched ? ' + context narrative' : ''}
          {result.skipped ? ` · ${result.skipped} left deterministic` : ''}.
        </p>
      )}
      {state === 'error' && <p className="mt-2 text-xs text-rose-400">Enhancement failed to start.</p>}
    </div>
  )
}
```

- [ ] **Step 3c: Wire into `EventReportTabs.tsx`** — import `RunEnrichmentButton` and render `<RunEnrichmentButton eventId={eventId} />` at the top of the Companies panel (mirror how `RunInvestigationButton` is placed on the Evidence panel; read the file to match the `eventId` prop name and panel structure).

- [ ] **Step 4: Run test** → PASS. **Step 5: typecheck + full suite** → green.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/events/[id]/enrich/route.ts" src/components/consequence/RunEnrichmentButton.tsx src/components/EventReportTabs.tsx tests/api/enrich-api.test.ts
git commit -m "feat(ai): enrich route + Enhance-with-AI button

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Scan-stays-deterministic invariant + activation script + docs

**Files:**
- Create: `tests/scan-deterministic-invariant.test.ts`
- Create: `scripts/llm-activate.ts`
- Create: `tests/llm-activate.test.ts`
- Create: `docs/ai-activation.md`
- Modify: `docs/llm-routing-and-guardrails.md`

**Interfaces:**
- `scripts/llm-activate.ts` exports `setConfigsEnabled(enabled: boolean): Promise<number>` (returns count updated) and runs it from argv when invoked directly.

- [ ] **Step 1: Write the invariant test** — `tests/scan-deterministic-invariant.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { resetDb } from './helpers'

describe('scans never make live LLM calls', () => {
  beforeEach(resetDb)

  it('a full fixture scan produces zero non-dormant LLMRun rows', async () => {
    await runSeed({ includeLive: false })
    await runFullScan()
    const runs = await prisma.lLMRun.findMany()
    // Every run logged during a scan must be the dormant marker — never a live provider call.
    expect(runs.every((r) => r.status === 'SKIPPED_NO_PROVIDER' || r.provider === 'none')).toBe(true)
    const succeeded = runs.filter((r) => r.status === 'SUCCEEDED')
    expect(succeeded).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it** → PASS immediately (scan already injects no provider). This is a *regression lock*, not a red→green cycle; confirm it passes and would fail if a future change injected a live provider into the scan.

- [ ] **Step 3: Write the activation-script test** — `tests/llm-activate.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { setConfigsEnabled } from '@/../scripts/llm-activate'
import { resetDb } from './helpers'

describe('llm-activate', () => {
  beforeEach(resetDb)

  it('enables then disables all provider configs', async () => {
    await runSeed({ includeLive: false })
    const on = await setConfigsEnabled(true)
    expect(on).toBe(3)
    expect((await prisma.lLMProviderConfig.findMany()).every((c) => c.enabled)).toBe(true)
    const off = await setConfigsEnabled(false)
    expect(off).toBe(3)
    expect((await prisma.lLMProviderConfig.findMany()).every((c) => !c.enabled)).toBe(true)
  })
})
```

(Confirm `@/../scripts/...` resolves under the vitest tsconfig path alias; if not, import via a relative path `../scripts/llm-activate`.)

- [ ] **Step 4: Run to verify it fails** → FAIL (module not found).

- [ ] **Step 5: Implement** — `scripts/llm-activate.ts`:

```typescript
import { prisma } from '@/server/db'

/** Flip `enabled` on every LLMProviderConfig. Returns the number updated. */
export async function setConfigsEnabled(enabled: boolean): Promise<number> {
  const res = await prisma.lLMProviderConfig.updateMany({ data: { enabled } })
  return res.count
}

// Run from the CLI: `npx tsx scripts/llm-activate.ts on|off`
if (process.argv[1] && process.argv[1].endsWith('llm-activate.ts')) {
  const arg = (process.argv[2] ?? 'on').toLowerCase()
  const enabled = arg !== 'off'
  setConfigsEnabled(enabled)
    .then((n) => {
      console.log(`${enabled ? 'Enabled' : 'Disabled'} ${n} LLM provider config(s).`)
      return prisma.$disconnect()
    })
    .catch(async (e) => {
      console.error(e)
      await prisma.$disconnect()
      process.exit(1)
    })
}
```

- [ ] **Step 6: Run tests** → PASS. **typecheck + full suite** → green.

- [ ] **Step 7: Write `docs/ai-activation.md`** (owner runbook):

```markdown
# Activating Archlight's AI enrichment

Everything below is off by default and free until you complete all of steps 1–4.

1. Install the SDK (once): `npm install`
2. Add your key to `.env` (this file is git-ignored — never commit it):
   `ANTHROPIC_API_KEY=sk-ant-...`
3. Write the real model IDs into the database: `npm run db:seed`
4. Turn the models on: `npx tsx scripts/llm-activate.ts on`

Then open any event's deep report and click **Enhance with AI**. It enriches
that one event: an AI "why" for each named company and a historic/present/future
narrative. Enriched text is saved, shown with an "AI-enhanced" marker, and only
kept if it passes the no-advice + grounding checks (otherwise the built-in
deterministic version stands).

**Models (Balanced tier):** Opus 4.8 for the hard reasoning, Sonnet 5 for the
writing, Haiku 4.5 for mechanical tasks.

**Turn it off any time:** `npx tsx scripts/llm-activate.ts off` (or remove the
key from `.env`). Scans never call the AI — enrichment is on-demand only.
```

- [ ] **Step 8: Update `docs/llm-routing-and-guardrails.md`** — add a short "Real model IDs (Balanced)" table (Haiku 4.5 / Opus 4.8 / Sonnet 5), a note that enrichment is on-demand via `POST /api/events/[id]/enrich`, and that scans stay deterministic (locked by `tests/scan-deterministic-invariant.test.ts`).

- [ ] **Step 9: Commit**

```bash
git add tests/scan-deterministic-invariant.test.ts scripts/llm-activate.ts tests/llm-activate.test.ts docs/ai-activation.md docs/llm-routing-and-guardrails.md
git commit -m "feat(ai): scan-determinism lock + activation script + runbook

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (after Task 7)

- [ ] `npm run typecheck` → clean.
- [ ] `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=1 npm test` → all green (baseline 418 + new tests).
- [ ] `git status` shows only intended files (never the ` 2.` sync-conflict copies).
- [ ] Then use superpowers:finishing-a-development-branch → merge to main + push origin.

## Self-review notes

- **Spec coverage:** foundation (T1–T2), primitive (T3), orchestrator (T4), read path (T5), route+button (T6), invariant+activation+docs (T7) — all spec sections covered.
- **Grounding:** enrichment uses restricted-input + no-invent system prompts + advice/schema validation; `requireGrounding` stays false for prose (validated in T3/T4 by advice-rejection + deterministic-fallback tests).
- **Type consistency:** `enrichText` returns `{ text, llmRunId } | null`; `enrichEventConsequence` returns `EnrichmentResult`; `CompanyImpactView` gains `llmRationale`/`aiEnhanced`; route returns `EnrichmentResult`. Names consistent across tasks.
