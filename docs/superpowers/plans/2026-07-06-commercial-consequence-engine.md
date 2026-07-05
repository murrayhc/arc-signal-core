# Commercial Consequence Engine Implementation Plan

> **For agentic workers:** Implement task-by-task with TDD. Steps use checkbox (`- [ ]`) syntax. Full algorithms/rationale live in the design spec: `docs/superpowers/specs/2026-07-06-commercial-consequence-engine-design.md`. This plan locks file structure, cross-task interfaces, test cases, and commit points.

**Goal:** For every meaningful event, explain who benefits, who is harmed, why they're named (grounded in evidence), historic/present/future context, strategic positioning examples, and watch signals — as investigative intelligence, never financial advice.

**Architecture:** New `src/server/consequence/` module on the Pass 2 evidence foundation. Company impacts are named only from evidence entities + sector/commodity/regulatory categories (never invented); the Entity table is finally populated. Context/scenarios/positioning are deterministic templates grounded in evidence ids, with dormant LLM assist via the existing router. Runs after event creation in the scan, non-fatally. Every generated string passes the advice-language guard.

**Tech Stack:** Next.js 15, TypeScript (strict), Prisma + SQLite, Zod, Vitest.

## Global Constraints

- Additive only. Do NOT remove/rename existing models, routes, services, the Evidence Depth Engine, or the dashboard. Existing models edited only additively: `StrategicPositioningExample` (+`companyImpactId`), `LLMRun` (+`outputHash`), `ScanRun` (+3 counters), `Entity` (populated, no shape change).
- All 396 existing tests stay green; `npm run typecheck` clean after every task.
- **Never invent company exposure.** Named companies come only from an event's evidence entities; everything else is a sector/commodity/regulatory category. Do not fabricate specific company names.
- **No financial advice.** Every generated string passes `assertNoAdviceLanguage`. Forbidden (extend the guard): should buy/sell, buy/sell/hold rating, target price, guaranteed profit, **certain return**, **portfolio allocation**, **investment recommendation**. Positioning uses could/may/might/monitor/prepare/investigate.
- Deterministic-first; LLM dormant, schema-validated, evidence-grounded, fail-open. LLM never overwrites evidence.
- JSON stored as `String` `...Json` columns (SQLite). Cross-refs to existing tables are plain indexed strings.
- Files under ~500 lines. Commit after each green task. Branch `feat/commercial-consequence-engine`; no push to `main` without owner approval. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

**New — consequence module:**
- `src/server/consequence/types.ts` — shared result types + `ConsequenceCounts`, `ConsequenceError`.
- `src/server/consequence/watch-signals.ts` — claim-type → watch-signals map; impact-type + direction helpers; org-vs-place entity filter.
- `src/server/consequence/company-impact.ts` — `resolveCompanyImpacts`.
- `src/server/consequence/context.ts` — `synthesiseContext` (+ scenarios + historic lookup).
- `src/server/consequence/positioning.ts` — `generatePositioningFromImpacts`.
- `src/server/consequence/report.ts` — `assembleReport`.
- `src/server/consequence/consequence-pipeline.ts` — `runConsequenceSynthesis`.
- `src/server/services/consequence.ts` — read services (impacts/beneficiaries/harmed/entity-pathways/summary/deep-report).

**New — API routes:** `src/app/api/events/[id]/company-impacts/route.ts`, `.../beneficiaries/route.ts`, `.../harmed/route.ts`, `.../report/route.ts`, `src/app/api/entities/[id]/impact-pathways/route.ts`.

**New — UI:** `src/components/EventReportTabs.tsx` (client shell) + `src/components/consequence/{CompaniesPanel,ScenariosPanel,PositioningPanel,WatchSignalsPanel}.tsx` (server-rendered section bodies passed as children/props).

**New — tests/docs:** the six unit tests + `tests/deep-commercial-consequence.e2e.test.ts`; `docs/commercial-consequence-engine.md`, `docs/llm-routing-and-guardrails.md`, `docs/deep-commercial-consequence-proof.md`.

**Modified:** `src/shared/enums.ts`, `prisma/schema.prisma`, `src/server/safety/advice-language.ts`, `src/server/seed.ts`, `src/server/pipeline/orchestrator.ts`, `src/app/events/[id]/page.tsx`, the dashboard event-card component (located in Task 9), `tests/helpers.ts`, `tests/factories.ts`.

## Shared interfaces (locked)

```ts
// src/server/consequence/types.ts
export type ConsequenceError = { stage: string; message: string; eventCandidateId?: string; entityId?: string }
export type ConsequenceCounts = { companyImpactsCreated: number; contextSynthesesCreated: number; futureScenariosCreated: number }

// company-impact.ts
export async function resolveCompanyImpacts(eventCandidateId: string): Promise<{ impacts: CompanyImpact[]; errors: ConsequenceError[] }>
// context.ts
export async function synthesiseContext(eventCandidateId: string, opts?: { now?: Date }): Promise<{ synthesis: EventContextSynthesis | null; scenarios: FutureScenario[]; errors: ConsequenceError[] }>
// positioning.ts
export async function generatePositioningFromImpacts(eventCandidateId: string): Promise<{ created: StrategicPositioningExample[]; errors: ConsequenceError[] }>
// consequence-pipeline.ts
export async function runConsequenceSynthesis(events: { id: string }[]): Promise<{ counts: ConsequenceCounts; errors: ConsequenceError[] }>
// report.ts
export async function assembleReport(eventCandidateId: string, reportType: ReportType): Promise<{ reportType: ReportType; markdown: string; sections: Record<string, unknown> } | null>
// services/consequence.ts
export async function getEventCompanyImpacts(eventId: string): Promise<CompanyImpactView[]>
export async function getEntityImpactPathways(entityId: string): Promise<CompanyImpactView[]>
export async function getEventConsequenceSummary(eventId: string): Promise<{ evidenceDepthScore: number; originTraced: boolean; beneficiaries: number; harmed: number; contradictions: number; scenarioPaths: number; lastInvestigationAt: string | null }>
```
`CompanyImpactView = { id, companyName, impactType, confidence, impactPathway, evidenceIds: string[], watchSignals: string[], riskScore, opportunityScore, entityId: string | null, lowConfidence: boolean, lastUpdated: string }`.

---

## Task 1 — Schema, enums, guard extension, migration

**Files:** Modify `src/shared/enums.ts`, `prisma/schema.prisma`, `src/server/safety/advice-language.ts`, `tests/helpers.ts`. Test: extend `tests/safety/advice-language.test.ts`.

**Produces:** enums `IMPACT_TYPES`, `SCENARIO_TYPES`, `REPORT_TYPES` (+types); 9 new `LLM_TASK_TYPES`. Models `CompanyImpact`, `EventContextSynthesis`, `FutureScenario`; `StrategicPositioningExample.companyImpactId?`, `LLMRun.outputHash?`, 3 `ScanRun` counters.

- [ ] Add enums + LLM task types to `src/shared/enums.ts`.
- [ ] Add 3 models + additive columns + `ScanRun` counters to `prisma/schema.prisma` per spec Stage 1.
- [ ] Extend `advice-language.ts` `PROHIBITED_ADVICE_PATTERNS` with: `/\b(certain|guaranteed)\s+(return|returns|profit|gains?)\b/i`, `/\bportfolio\s+allocation\b/i`, `/\binvestment\s+recommendation\b/i`. Add a test asserting each new phrase is caught and a clean positioning sentence passes.
- [ ] Add the 3 new tables to `resetDb` (`tests/helpers.ts`), children-first.
- [ ] `npx prisma format && npx prisma migrate dev --name commercial_consequence_engine`; `npm run typecheck`; `npm test`. Expected: clean, 396+ pass.
- [ ] Commit: `feat(consequence): schema + enums + guard extension (Stage 1)`.

## Task 2 — CompanyImpactResolver

**Files:** Create `src/server/consequence/types.ts`, `watch-signals.ts`, `company-impact.ts`. Test `tests/company-impact-resolver.test.ts`. Add `makeEventGraph` helper to `tests/factories.ts` (source→doc→parsed→[evidence-depth]→event over the doc).

**Consumes:** `canonicalIdsForEvent` (Pass 2), `AtomicClaim`, reliability. **Produces:** `resolveCompanyImpacts` (see interfaces); `watch-signals.ts` exports `watchSignalsForClaimType(t): string[]`, `impactTypeFor(direction, claimType, hasContradiction): ImpactType`, `isLikelyOrganisation(name): boolean`.

- [ ] **Test first:** an event whose evidence names an org (e.g. "Voltcore" in a layoff) → `resolveCompanyImpacts` returns ≥1 impact with `companyName='Voltcore'`, non-empty `evidenceIds`, non-empty `impactPathway`, `impactType` in the enum; an `Entity` row is created for it; a place-only token ("Manchester") does NOT become a company; a category impact (sector) is present with `entityId=null`; low reliability → `metadata.lowConfidence=true`.
- [ ] Run → FAIL. Implement per spec Stage 2 (evidence entities filtered by `isLikelyOrganisation`; upsert Entity; impact type from direction+claimType; grounded pathway; category impacts; advice-guard every string).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(consequence): company impact resolver (Stage 2)`.

## Task 3 — Company-impact read service + API routes

**Files:** Create `src/server/services/consequence.ts` + 4 route files (`company-impacts`, `beneficiaries`, `harmed`, `entities/[id]/impact-pathways`). Test `tests/company-impact-api.test.ts`.

**Produces:** `getEventCompanyImpacts`, `getEventBeneficiaries`, `getEventHarmed`, `getEntityImpactPathways` (returning `CompanyImpactView[]`).

- [ ] **Test first:** after resolving impacts for an event, `getEventBeneficiaries` returns only BENEFICIARY/MIXED, `getEventHarmed` returns HARMED/MIXED/EXPOSED, each view has `evidenceIds` (array) and `watchSignals` (array); `getEntityImpactPathways(entityId)` returns the entity's impacts.
- [ ] Run → FAIL. Implement service (parse `...Json`, map to view) + routes (`Response.json`, awaited params).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(consequence): beneficiary/harmed read service + API (Stage 3)`.

## Task 4 — ContextSynthesisService (+ scenarios)

**Files:** Create `src/server/consequence/context.ts`. Test `tests/context-synthesis.test.ts`.

**Consumes:** reliability, lineage, `resolveCompanyImpacts` results, `TriggerCondition`s, prior `EventCandidate`s. **Produces:** `synthesiseContext` (upserts `EventContextSynthesis`, creates `FutureScenario`s).

- [ ] **Test first:** for an event with impacts + triggers, `synthesiseContext` returns a synthesis with non-empty historic/present/future strings and **5** `FutureScenario`s (one per `SCENARIO_TYPES`); each scenario has confirming/weakening signal arrays; a canonical with contradictions makes the REVERSAL scenario confidence ≥ the ACCELERATED scenario confidence; every produced string passes `findAdviceLanguage` (empty). Historic context with no prior events says so.
- [ ] Run → FAIL. Implement per spec Stage 4 (present from reliability/lineage/impacts; historic from prior same-type events; 5 scenario templates; grounded; advice-guarded; LLM assist dormant).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(consequence): context synthesis + future scenarios (Stage 4)`.

## Task 5 — StrategicPositioningService (impact-based)

**Files:** Create `src/server/consequence/positioning.ts`. Test `tests/strategic-positioning.test.ts`.

**Consumes:** `CompanyImpact`. **Produces:** `generatePositioningFromImpacts` (writes `StrategicPositioningExample` with `companyImpactId`).

- [ ] **Test first:** for an event with a beneficiary impact, `generatePositioningFromImpacts` creates ≥1 `StrategicPositioningExample` with `companyImpactId` set, a `howItCouldBeUsed` containing soft language (could/may/might/monitor/prepare/investigate), and `findAdviceLanguage` empty on every field; an injected advice phrase in a template would throw (assert the guard is called by feeding a userType and checking clean output). The existing opportunity-card positioning is untouched (its rows remain).
- [ ] Run → FAIL. Implement per spec Stage 5. Reuse `assertNoAdviceLanguage` per field.
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(consequence): impact-based strategic positioning (Stage 5)`.

## Task 6 — LLM task classes + routing + seed + outputHash

**Files:** Modify `src/server/seed.ts` (route new task types to tiers), `src/server/llm/run.ts` (write `outputHash`). Test `tests/llm-router.test.ts`.

**Consumes:** `routeTask` (existing). **Produces:** routing coverage for the new task classes.

- [ ] **Test first:** `routeTask('COMPANY_IMPACT_ANALYSIS', configs)` and `routeTask('FUTURE_SCENARIOS', configs)` resolve to a reasoning-tier config; `routeTask('CLAIM_NORMALISATION', configs)` resolves to a fast/low-tier config; `routeTask('REPORT_SYNTHESIS', configs)` resolves to a synthesis-tier config — using seeded-shaped `RouterConfig[]`.
- [ ] Run → FAIL. Update `seed.ts` so the seeded provider configs' `taskTypesJson` include the new classes at the right tier; add `outputHash` (sha256 of output) to the `LLMRun.create` in `run.ts`.
- [ ] Run → PASS. `typecheck` clean; full `npm test` green (seed change). Commit: `feat(consequence): route new LLM task classes + outputHash (Stage 6)`.

## Task 7 — Consequence pipeline wiring into scan

**Files:** Create `src/server/consequence/consequence-pipeline.ts`. Modify `src/server/pipeline/orchestrator.ts`. Test `tests/consequence-wiring.test.ts`.

**Produces:** `runConsequenceSynthesis(events)` → `{ counts, errors }`.

- [ ] **Test first:** after a scan produces an event with named-org evidence, `runConsequenceSynthesis([event])` returns counts with `companyImpactsCreated>0` and `futureScenariosCreated===5`; a `runFullScan()` over the Pass 2 fixtures ends `COMPLETED`/`COMPLETED_WITH_ERRORS` (never crashes) and its `ScanRun` has the 3 new counters populated; if consequence throws (inject), the scan still completes.
- [ ] Run → FAIL. Implement `runConsequenceSynthesis` (per event: resolve impacts → synthesise context → generate positioning). Insert a non-fatal block into `orchestrator.ts` after event creation (using `allEvents`), spread the 3 counters into `ScanRun`/`ScanSummary`.
- [ ] Run → PASS. Full `npm test` green. `typecheck` clean. Commit: `feat(consequence): wire consequence synthesis into scan (Stage 7)`.

## Task 8 — Reports endpoint

**Files:** Create `src/server/consequence/report.ts`, `src/app/api/events/[id]/report/route.ts`. Test `tests/consequence-report.test.ts`.

**Produces:** `assembleReport(eventId, reportType)`.

- [ ] **Test first:** `assembleReport(eventId, 'EXECUTIVE_BRIEF')` returns `{ reportType, markdown, sections }` where markdown contains the event title, a "Who benefits"/"Who is harmed" section, and passes `findAdviceLanguage` (empty); an unknown event → null; each `REPORT_TYPES` value produces markdown.
- [ ] Run → FAIL. Implement the deterministic assembler (pull summary/reliability/origin/impacts/context/scenarios/positioning/watch/sources; advice-guard the assembled markdown) + POST route (`{ reportType }` body, 400 on invalid type, 404 on unknown event).
- [ ] Run → PASS. `typecheck` clean. Commit: `feat(consequence): event report assembler + endpoint (Stage 9)`.

## Task 9 — Event page tabbed deep report + dashboard indicators

**Files:** Create `src/components/EventReportTabs.tsx` + `src/components/consequence/{CompaniesPanel,ScenariosPanel,PositioningPanel,WatchSignalsPanel}.tsx`. Modify `src/app/events/[id]/page.tsx`. Locate + modify the dashboard event-card component (grep `RISK_RADAR`/card in `src/components/dashboard/`). Add `getEventDeepReport(eventId)` + `getEventConsequenceSummary(eventId)` to `src/server/services/consequence.ts`.

- [ ] Add `getEventDeepReport` (aggregates event detail + Pass 2 depth + impacts + context + scenarios + positioning) and `getEventConsequenceSummary` (counts) to the read service.
- [ ] Refactor `page.tsx` to fetch the deep report and render `EventReportTabs` (Overview/Evidence/Lineage/Companies/Scenarios/Positioning/Watch Signals). Reuse `EvidenceDepthPanel` for Evidence/Lineage. Empty states per tab.
- [ ] Add the compact indicators (evidence-depth score, origin-traced, beneficiaries/harmed/contradictions/scenario counts, last-investigation) to the existing dashboard card via `getEventConsequenceSummary`. No redesign.
- [ ] `npm run typecheck` clean; `npm run build` succeeds (RSC/client boundary); `npm test` green. Commit: `feat(consequence): tabbed deep-report event page + dashboard indicators (Stages 7-8)`.

## Task 10 — Guardrails test + deep-output test + e2e + docs

**Files:** `tests/financial-advice-guardrails.test.ts`, `tests/event-interrogation-deep-output.test.ts`, `tests/deep-commercial-consequence.e2e.test.ts`, the 3 docs.

- [ ] **Guardrails test:** every forbidden phrase in the spec's list is caught by `findAdviceLanguage`; a full generated report/positioning/context for a scanned event contains none of them.
- [ ] **Deep-output test:** `getEventDeepReport(eventId)` returns all sections populated for a scanned event.
- [ ] **E2E** (`deep-commercial-consequence.e2e.test.ts`): run a full scan over fixtures, then assert the 10 spec behaviours (impacts; beneficiaries named w/ evidence; harmed named w/ evidence; low-confidence labelled; historic/present/future context; positioning; deep API output; no forbidden language across all generated strings).
- [ ] Write the 3 docs.
- [ ] Full `npm test` + `typecheck` + `build` green. Commit: `test+docs(consequence): guardrails, deep-output, e2e proof + docs (Stage 10)`.

---

## Self-Review (completed)

- **Spec coverage:** Tasks 1–10 map to spec Stages 1–10 + wiring + docs. Company-impact (2/3), context+scenarios (4), positioning (5), LLM routing (6), wiring (7), reports (8), UI+dashboard (9), tests+docs (10). ✓
- **Placeholders:** none — each task has concrete interfaces + named assertions; algorithms in the spec. ✓
- **Type consistency:** `ConsequenceError`, `ConsequenceCounts`, `CompanyImpactView`, `resolveCompanyImpacts`, `synthesiseContext`, `generatePositioningFromImpacts`, `runConsequenceSynthesis`, `assembleReport` used identically across tasks. ✓
