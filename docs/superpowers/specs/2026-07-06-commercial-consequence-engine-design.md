# Commercial Consequence & Deep Synthesis Engine — Design Spec

**Date:** 2026-07-06
**Branch:** `feat/commercial-consequence-engine`
**Status:** Approved (owner approved design 2026-07-06). Decisions: company naming = **evidence + categories only** (never invent; populate the Entity table); LLM logging = **reuse existing LLMRun + router** (no duplicate LLMTaskLog). Delivery = full engine, staged commits.
**Pass:** Pass 3, building on the Evidence Depth Engine (`docs/evidence-depth-engine.md`).

## Purpose

Archlight must not stop at "risk detected". For every meaningful event it must show the full chain: **source → claim → evidence → affected company → consequence → strategic positioning**, plus historic/present/future context and the watch signals that would confirm or weaken the analysis — all grounded in evidence, and **never** as financial advice.

## Guiding principles (carried from Pass 1/2)

1. **Additive.** The scan spine, the Evidence Depth Engine, the dashboard, and the existing opportunity-card positioning are untouched. All 396 existing tests stay green.
2. **Never invent company exposure.** Named companies come only from organisations that appear in an event's evidence (Pass 2 atomic-claim entities); everything else is expressed at the sector/commodity/regulatory **category** level. This finally populates the `Entity` table.
3. **Deterministic-first, LLM-dormant.** Every service produces real deterministic output with no API key; an LLM enhances (via the existing `runLLMTask`) only after structured evidence is prepared, is schema-validated and evidence-grounded, and never becomes the source of truth. Failed validation never crashes the pipeline.
4. **No financial advice — enforced.** Every generated string passes `assertNoAdviceLanguage` (`src/server/safety/advice-language.ts`), extended with the new forbidden phrases. Positioning uses could/may/might/monitor/prepare/investigate language only.
5. **Fault-isolated & joined by ids.** Consequence synthesis runs after event creation in the scan, non-fatally, joined to events via the Pass 2 `documentId` path.

## Reuse (verified)

- `assertNoAdviceLanguage` / `findAdviceLanguage` — already covers should buy/sell/hold, buy/sell/hold rating, target price, price target, guaranteed/expected/projected returns, % returns, sure thing, load up on, to the moon. **Extend** with `certain return`, `portfolio allocation`, `investment recommendation`.
- `routeTask` + `loadRouterConfigs` (`src/server/llm/router.ts`) and `runLLMTask` + `validateLLMOutput` — reuse for all LLM tasks. Seeded configs already tier models (fast/reasoning/longcontext/creative/safety).
- `LLMRun` + `LLMOutputValidation` — reuse as the task log (adds `outputHash`). No `LLMTaskLog`.
- `StrategicPositioningExample` model + `generatePositioning` (`src/server/pipeline/positioning.ts`) — extend the model with `companyImpactId`; add a new generator for impact-based positioning; leave the opportunity-card path intact.
- Pass 2: `getEventEvidenceDepth`, `canonicalIdsForEvent`, `AtomicClaim`/`CanonicalClaim`/`ClaimLineage`/`ClaimCluster`, reliability.

---

## Stage 1 — Models, enums, migration (additive)

New module: `src/server/consequence/`.

### Enums (`src/shared/enums.ts`, additive)
```
IMPACT_TYPES = [BENEFICIARY, HARMED, MIXED, EXPOSED, WATCH_ONLY, UNKNOWN]
SCENARIO_TYPES = [CONSERVATIVE, BASE_CASE, ACCELERATED, REVERSAL, LOW_CONFIDENCE]
REPORT_TYPES = [EXECUTIVE_BRIEF, SALES_OPPORTUNITY_BRIEF, RISK_BRIEF, PROCUREMENT_BRIEF,
  MARKET_CONTEXT_BRIEF, COMPANY_EXPOSURE_BRIEF]
```
Add to `LLM_TASK_TYPES`: `CLAIM_NORMALISATION`, `SOURCE_COMPARISON`, `COMPANY_IMPACT_ANALYSIS`,
`HISTORIC_CONTEXT`, `PRESENT_CONTEXT`, `FUTURE_SCENARIOS`, `STRATEGIC_POSITIONING`,
`REPORT_SYNTHESIS`, `JSON_REPAIR`.

### Models (`prisma/schema.prisma`)
Cross-references to existing tables (`eventCandidateId`, `claimClusterId`, `entityId`) are plain indexed `String` fields — existing models stay frozen (consistent with Pass 2).

**CompanyImpact** — `id`; `eventCandidateId String?` (idx), `claimClusterId String?`, `entityId String?` (idx), `companyName`, `impactType`, `impactPathway`, `confidence Float`, `evidenceIdsJson String "[]"`, `riskScore Float 0`, `opportunityScore Float 0`, `watchSignalsJson String "[]"`, `metadataJson String "{}"`, timestamps.

**EventContextSynthesis** — `id`; `eventCandidateId String @unique`, `historicContext`, `presentContext`, `futureContext`, `confidence Float`, `evidenceIdsJson String "[]"`, `metadataJson String "{}"`, timestamps.

**FutureScenario** — `id`; `eventCandidateId String` (idx), `scenarioType`, `title`, `summary`, `confirmingSignalsJson String "[]"`, `weakeningSignalsJson String "[]"`, `likelyBeneficiariesJson String "[]"`, `likelyHarmedPartiesJson String "[]"`, `confidence Float`, timestamps.

**Extend** `StrategicPositioningExample`: add `companyImpactId String?`. **Extend** `LLMRun`: add `outputHash String?`.

**`ScanRun`** additive counters: `companyImpactsCreated`, `contextSynthesesCreated`, `futureScenariosCreated` (Int @default 0).

Migration: `prisma migrate dev --name commercial_consequence_engine` (new tables + additive columns). Regenerate client. `resetDb` clears the new tables.

---

## Stage 2 — CompanyImpactResolver (`src/server/consequence/company-impact.ts`)

`resolveCompanyImpacts(eventCandidateId): Promise<{ impacts: CompanyImpact[]; errors }>`.

1. Resolve the event's canonical claims (`canonicalIdsForEvent`) → atomic claims + reliability + lineage + the event's signals (direction) + sector/region/commodity.
2. **Named organisations from evidence:** collect distinct entities from atomic-claim `entitiesJson`, **filtered** to drop geographic/region tokens (via the Pass 2 region detector) and generic single-caps. Upsert each survivor as an `Entity` (`entityType='ORGANISATION'`, sector/region from context). This populates the Entity table.
3. For each named org build a `CompanyImpact`:
   - `impactType` from event direction + claim type: subject of a negative/pressure event (layoffs, legal, regulatory, supply-chain, contradiction) → `HARMED`/`EXPOSED`; positive (funding, demand, procurement win) → `BENEFICIARY`; both directions present → `MIXED`; thin evidence → `WATCH_ONLY`.
   - `impactPathway` = grounded "why named" sentence (entity, its role in the event, source count, reliability).
   - `evidenceIdsJson` = the atomic-claim ids (+ source ids) that mention it.
   - `confidence` = the canonical claim's `reliabilityScore` (labelled low if `< 0.4`).
   - `riskScore`/`opportunityScore` from the event; `watchSignalsJson` from a claim-type→watch-signal map.
4. **Category-level impacts** (never a fabricated company): from the event's sector/commodity/regulatory/procurement signals, emit `CompanyImpact` rows whose `companyName` is a **category** ("cybersecurity suppliers (sector)", "lithium-exposed manufacturers (commodity)", "regulated firms in <sector>") with `entityId=null`, `impactType` `EXPOSED`/`WATCH_ONLY`/`BENEFICIARY`, lower confidence, and a pathway explaining the category relationship.
5. Every string advice-guarded; low-confidence flagged in `metadataJson`. Persist.

**Rules honoured:** name only on evidence or clear category relationship; every named company has a why + evidence ids; do not invent; low confidence labelled.

## Stage 3 — Beneficiary/Harmed API

Read service `src/server/services/company-impact.ts`:
- `GET /api/events/[id]/company-impacts` — all impacts.
- `GET /api/events/[id]/beneficiaries` — `impactType ∈ {BENEFICIARY, MIXED}`.
- `GET /api/events/[id]/harmed` — `impactType ∈ {HARMED, MIXED, EXPOSED}`.
- `GET /api/entities/[id]/impact-pathways` — every impact for an entity across events.

Each item: `companyName, impactType, confidence, impactPathway, evidenceIds, watchSignals, riskScore, opportunityScore, lastUpdated`.

## Stage 4 — ContextSynthesisService (`src/server/consequence/context.ts`)

`synthesiseContext(eventCandidateId): Promise<{ synthesis, scenarios, errors }>`.

- **Present context** — deterministic from reliability (strongest/weakest evidence), lineage (contradictions, origin), company impacts (who is exposed today), and which claim is moving fastest (freshest/highest momentum).
- **Historic context** — real lookup over Archlight's **own** prior `EventCandidate`s of the same `eventType` (+ sector/region) that predate this event: how many, what became of them (status/score movement via the graph timeline). Honest "no prior comparable pattern recorded" when none.
- **Future context + `FutureScenario` rows** — five scenarios (CONSERVATIVE/BASE_CASE/ACCELERATED/REVERSAL/LOW_CONFIDENCE). `confirmingSignals`/`weakeningSignals` from the event's `TriggerCondition`s (RAISES → confirming, LOWERS → weakening) + watch signals; `likelyBeneficiaries`/`likelyHarmedParties` from the company impacts. Confidence from event confidence × reliability; REVERSAL/LOW_CONFIDENCE dominate when contradictions are high or evidence thin.
- Grounded in `evidenceIds`; weak evidence stated plainly; advice-guarded. Optional LLM assist (`HISTORIC_CONTEXT`/`PRESENT_CONTEXT`/`FUTURE_SCENARIOS`), dormant, schema-validated, evidence-grounded, fail-open to the deterministic text. Persist `EventContextSynthesis` (upsert per event) + `FutureScenario`s.

## Stage 5 — StrategicPositioningService (`src/server/consequence/positioning.ts`)

`generatePositioningFromImpacts(eventCandidateId): Promise<{ created, errors }>`.

For each meaningful `CompanyImpact` × relevant user type (sales/procurement/investor-researcher/consultant/recruiter/supplier/operator/founder/analyst/public-sector/risk-manager), render a `StrategicPositioningExample` (`companyImpactId` set) with `positioningAngle`, `howItCouldBeUsed`, `whyItMayMatter`, `evidenceSummary`, `constraints`, in could/may/might/monitor/prepare language — every field advice-guarded. The existing opportunity-card positioning generator is unchanged.

## Stage 6 — LLM routing + logging (reuse + extend)

- Add the new task classes to `LLM_TASK_TYPES`; update `src/server/seed.ts` so each routes to the right tier (extraction/classification/normalisation → fast/LOW; contradiction/source-comparison/company-impact/scenarios → reasoning/HIGH; long-context → longcontext; positioning/report synthesis → creative/MEDIUM; JSON repair → fast/LOW). Add `outputHash` to `LLMRun` writes.
- Document a **model-role map** (extraction / reasoning / synthesis / long-context / low-cost-batch → task classes) in `docs/llm-routing-and-guardrails.md`.
- Guardrails already enforced by `validateLLMOutput`: schema-valid + evidence-grounded (`requireGrounding`) or the output is rejected/marked speculative; `LLMRun` logs provider/model/task/latency/cost/validation. LLM never overwrites evidence (services persist deterministic output; LLM only replaces the human-readable prose when it PASSES validation).

## Stage 7 — Event page → tabbed deep report

Refactor `src/app/events/[id]/page.tsx` into a tabbed deep report (new client `EventReportTabs` shell wrapping server-fetched sections). Tabs and their 22 covered items:
- **Overview** — summary, evidence-reliability score, confidence movement, data gaps.
- **Evidence** — atomic facts, weak/disputed claims, supporting vs contradicting (reuse Pass 2 panel).
- **Lineage** — origin trace + claim lineage (reuse Pass 2).
- **Companies** — beneficiary / harmed / mixed / exposed companies; per company: name, type, pathway, confidence, evidence ids, watch signals, link to entity page if available; plus sector / commodity / instrument exposure.
- **Scenarios** — historic context, present context, future scenario paths.
- **Positioning** — strategic positioning examples.
- **Watch Signals** — confirming/weakening signals across scenarios + trigger conditions.

No dashboard change.

## Stage 8 — Dashboard card indicators (compact)

Add small indicators to existing risk/opportunity cards (no redesign): evidence-depth score, origin-traced (yes/no), beneficiaries count, harmed count, contradictions count, scenario-paths count, last-investigation time. Read from a lightweight `getEventConsequenceSummary(eventId)` (counts only). Cards stay compact.

## Stage 9 — Reports / export

`POST /api/events/[id]/report` (body `{ reportType }`). A deterministic assembler (`src/server/consequence/report.ts`) returns `{ reportType, markdown, sections }` pulling: event summary, evidence reliability, origin trace, who benefits, who is harmed, historic/present context, future scenarios, positioning examples, watch signals, source list. Each report type foregrounds different sections. Whole assembled text advice-guarded. No PDF.

## Stage 10 — Tests + docs

Unit: `company-impact-resolver.test.ts`, `context-synthesis.test.ts`, `strategic-positioning.test.ts`, `llm-router.test.ts`, `event-interrogation-deep-output.test.ts`, `financial-advice-guardrails.test.ts`.
E2E: `deep-commercial-consequence.e2e.test.ts` — proves (1) event → company impacts, (2) beneficiaries named with evidence, (3) harmed named with evidence, (4) low-confidence impact labelled, (5) historic context, (6) present context, (7) future scenarios, (8) positioning examples, (9) event API returns deep output, (10) forbidden financial-advice language is never produced (scan all generated strings against the forbidden list).
Docs: `docs/commercial-consequence-engine.md`, `docs/llm-routing-and-guardrails.md`, `docs/deep-commercial-consequence-proof.md`.

## Pipeline wiring

After event creation in `runFullScan()` (`orchestrator.ts`), a non-fatal block runs `runConsequenceSynthesis(events)` (`src/server/consequence/consequence-pipeline.ts`): for each new/updated event → resolve company impacts → synthesise context + scenarios → generate impact positioning. Spread the three new counters into `ScanRun`. A failure never fails the scan. The Stage 3/9 API routes also trigger on demand.

## Delivery — staged commits (each: typecheck clean + `vitest run` green)

1. Schema + enums + guard extension + migration.
2. CompanyImpactResolver + test.
3. Company-impact read service + API routes + test.
4. ContextSynthesisService (+ scenarios) + test.
5. StrategicPositioningService + test.
6. LLM task classes + routing + seed + outputHash + llm-router test.
7. Consequence pipeline wiring into scan.
8. Event page tabbed deep report.
9. Dashboard card indicators.
10. Reports endpoint + test.
11. Guardrails test + e2e + docs.

Feature branch only; no push to `main` without owner approval.

## Acceptance criteria

For any meaningful event, Archlight explains who benefits, who is harmed, why those entities/categories are named, what evidence supports the assessment, what remains uncertain, and what strategic positioning examples may be drawn — as investigative intelligence showing the chain from source to consequence, never as financial advice.

## Non-goals (this pass)

Curated third-party company/relationship dataset (owner chose evidence + categories); live LLM or web search (dormant); PDF export; dashboard redesign; naming specific competitors/suppliers not present in an event's evidence.
