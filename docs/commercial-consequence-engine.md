# Commercial Consequence & Deep Synthesis Engine

Pass 3 turns Archlight from "risk detected" into an investigative report that shows the whole chain: **source → claim → evidence → affected company → consequence → strategic positioning**, plus historic/present/future context and the watch signals that would confirm or weaken the analysis. It builds on the Evidence Depth Engine (`docs/evidence-depth-engine.md`) and is **additive** — the scan spine, evidence-depth layer, dashboard, and opportunity-card positioning are untouched.

Built: 2026-07 (Pass 3). Deterministic-first; the LLM layer stays dormant. **No financial advice** is ever produced.

## Where it runs

Inside `runFullScan()` (`src/server/pipeline/orchestrator.ts`), after event creation and **before** graph sync, a non-fatal block runs `runConsequenceSynthesis()` (`src/server/consequence/consequence-pipeline.ts`): for each event → resolve company impacts → synthesise context + scenarios → generate impact positioning. `ScanRun` gains `companyImpactsCreated`, `contextSynthesesCreated`, `futureScenariosCreated`. The Stage-3/9 API routes also run these on demand.

## Company impacts — who benefits, who is harmed

`CompanyImpactResolver` (`src/server/consequence/company-impact.ts`) answers "who is affected and why", **without inventing companies**:

- **Named companies come only from an event's evidence.** It collects organisations from the atomic-claim entities (Pass 2), filters out places (`isLikelyOrganisation`), and upserts each as an `Entity` — finally populating the Entity table. Each named company gets an `impactType` (BENEFICIARY / HARMED / MIXED / EXPOSED / WATCH_ONLY), a grounded "why it's named" pathway, the evidence ids that mention it, a confidence equal to the claim's reliability, and claim-type-specific watch signals.
- **Everything else is a category, clearly labelled.** Sector / commodity / regulatory relationships become category impacts ("Competing firms in <sector> (category)", "Commodity-exposed firms (category)") with `entityId = null` and watch-level confidence. Never a fabricated specific company.
- Low confidence is labelled; every string passes the advice-language guard.

APIs: `GET /api/events/[id]/company-impacts | beneficiaries | harmed`, `GET /api/entities/[id]/impact-pathways`.

## Context synthesis & future scenarios

`ContextSynthesisService` (`src/server/consequence/context.ts`) produces, grounded in the event's own evidence:

- **Present context** — reliability, strongest/weakest claim, contradictions, who is exposed now.
- **Historic context** — a real lookup over Archlight's **own** prior events of the same type/sector; honest "no prior comparable pattern" when there is none.
- **Future context + 5 `FutureScenario`s** — CONSERVATIVE / BASE_CASE / ACCELERATED / REVERSAL / LOW_CONFIDENCE, each with confirming/weakening watch signals (from the event's trigger conditions) and likely beneficiaries/harmed. REVERSAL confidence rises with contradictions.

## Strategic positioning

`StrategicPositioningService` (`src/server/consequence/positioning.ts`) generates positioning examples per company impact × user role (sales, procurement, risk manager, consultant, supplier, founder, analyst…), in **could / may / might / monitor / prepare / investigate** language only, each advice-guarded and linked via `companyImpactId`. The existing opportunity-card positioning is untouched.

## Reports

`assembleReport(eventId, reportType)` (`src/server/consequence/report.ts`) → `POST /api/events/[id]/report`. Six report types (executive / sales / risk / procurement / market-context / company-exposure), each a deterministic, advice-guarded markdown document showing summary → reliability → origin → who benefits / is harmed → historic/present context → scenarios → positioning → watch signals → sources.

## User-facing surface

The event page (`src/app/events/[id]/page.tsx`) is now a **tabbed deep report**: Overview / Evidence / Lineage / **Companies** / **Scenarios** / **Positioning** / **Watch Signals**. The dashboard risk and opportunity cards gain compact consequence indicators (evidence-depth score, origin-traced, beneficiaries/harmed/contradictions/scenario counts) — no redesign.

## Safety

Every generated string (impact pathways, context, scenarios, positioning, reports) passes `assertNoAdviceLanguage` (`src/server/safety/advice-language.ts`), extended in Pass 3 with `certain return`, `portfolio allocation`, `investment recommendation`. See `docs/llm-routing-and-guardrails.md`. The dedicated `tests/financial-advice-guardrails.test.ts` and the e2e assert no forbidden language is ever produced.

## What's intentionally limited

Named third-party beneficiaries (specific competitors/suppliers) appear only when they are in an event's evidence; otherwise "who benefits/is harmed" is expressed at the category level. Richer named lists require a curated company/relationship dataset or the (dormant) LLM. This is the non-fabricating trade-off (owner decision).

## Tests

`company-impact-resolver`, `company-impact-api`, `context-synthesis`, `strategic-positioning`, `llm-router`, `consequence-wiring`, `consequence-report`, `event-interrogation-deep-output`, `financial-advice-guardrails`, and the end-to-end `deep-commercial-consequence.e2e` (see `docs/deep-commercial-consequence-proof.md`).
