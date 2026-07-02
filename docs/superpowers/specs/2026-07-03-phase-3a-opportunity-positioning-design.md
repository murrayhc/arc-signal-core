# Archlight Phase 3a — Opportunity & Positioning Engine: Design

Date: 2026-07-03
Status: Approved direction (owner chose "deterministic phases first"). Implements
upgrade-document Stages 2 (Opportunity Conversion Engine) and 3 (Strategic
Positioning Examples).
Predecessors: spine + Phase 2a (74 tests green). Upgrade audit:
`docs/existing-architecture-map.md`, `docs/autonomous-pipeline-proof.md`.

## 1. Goal

Turn detected events into **commercial opportunity cards** and **non-advisory
strategic positioning examples**, generated deterministically as a new pipeline
stage, surfaced on the dashboard's Opportunity Radar and the event page. Every
opportunity traces back to event evidence; weak evidence yields low confidence;
not every event produces an opportunity; and no output may contain financial
advice — enforced by tests that fail if prohibited language appears.

## 2. Non-negotiables (adopted as hard constraints)

From the upgrade document's non-advisory rule. Outputs may say a signal "may be
useful", "could create a commercial opening", "may help prepare strategically".
Outputs must NEVER say buy / sell / hold / target price / expected return /
guaranteed / risk-free / "will definitely happen" / personal financial advice /
"act now". A shared guard (`assertNoAdviceLanguage`) enforces this and is unit-
tested against every generated string surface.

Plus carried spine/2a constraints: deterministic (no LLM in 3a); explainable
scores; evidence trails preserved; fixture/live labelling; string enums via
`src/shared/enums.ts`; `*Json` string columns; files < 500 lines; nothing
requires an entity/company selection; GBP where currency appears.

## 3. New models

### RevenueLens (commercial context)
`id, name, description, userType, targetSectorsJson, targetRegionsJson,
offerTypesJson, buyerPersonasJson, averageDealSize?, salesCycle?,
excludedSectorsJson, riskAppetite, active, isDefault, createdAt, updatedAt.`
A **default lens** (`isDefault: true`, broad — all sectors/regions, generic
offers) is seeded so opportunity conversion works out-of-the-box with zero user
config. `userType` ∈ POSITIONING_USER_TYPES.

### OpportunityCard (commercial projection of an event)
`id, eventCandidateId (FK), revenueLensId? (FK), title, opportunityType,
summary, buyerPain, likelyBuyersJson, affectedSectorsJson, affectedRegionsJson,
suggestedOffer, urgencyScore, commercialValueScore, confidence, evidenceScore,
actionabilityScore, opportunityLogic, riskLogic, nextBestAction, status,
isFixture, createdAt, updatedAt.` Unique on `(eventCandidateId, revenueLensId)`
so a rescan updates rather than duplicates (mirrors Phase 2a lifecycle).

### StrategicPositioningExample (non-advisory interpretation)
`id, eventCandidateId (FK), opportunityCardId? (FK), evidenceArcId? (nullable —
arcs arrive in Phase 3b), revenueLensId? (FK), title, userType, positioningAngle,
howItCouldBeUsed, whyItMayMatter, evidenceSummary, confidence, constraints,
isFixture, createdAt, updatedAt.`

### Enums (append to `src/shared/enums.ts`)
- `OPPORTUNITY_TYPES` (14): SALES, PARTNERSHIP, PROCUREMENT, INVESTMENT_WATCH,
  HIRING, TALENT_ACQUISITION, M_AND_A, CONTENT, ADVISORY, PRODUCT_GAP,
  MARKET_ENTRY, COMPETITOR_DISPLACEMENT, COMPLIANCE, CRISIS_SUPPORT.
- `OPPORTUNITY_STATUSES` (7): NEW, RISING, STABLE, DECLINING, DISMISSED,
  ESCALATED, ACTIONED.
- `POSITIONING_USER_TYPES`: SUPPLIER, RECRUITER, PRODUCT_TEAM, PROCUREMENT,
  INVESTOR_WATCH, ADVISOR, ANALYST, GENERAL.
- `RISK_APPETITES`: LOW, MEDIUM, HIGH.

## 4. Advice-language guard (foundation)

`src/server/safety/advice-language.ts`:
- `PROHIBITED_ADVICE_PATTERNS: RegExp[]` — buy/sell/hold recommendations, target
  price, expected/guaranteed return, risk-free, profit guarantee, "act now",
  "will definitely", personal financial/portfolio advice.
- `findAdviceLanguage(text: string): string[]` — returns matched phrases (empty
  = clean).
- `assertNoAdviceLanguage(text, context): void` — throws
  `AdviceLanguageError` listing matches; used in services after rendering each
  card/example, so a violating output is never persisted (fails closed).
- Unit tests: clean strategic language passes; each prohibited category is
  caught; the guard runs over real generated output in the service tests.

## 5. Deterministic conversion rules

### Eligibility (not every event → opportunity)
Skip when: event `status` DISMISSED; event `affectedSector` ∈ lens
`excludedSectors`; OR event has no mappable opportunityType AND confidence <
0.45. Otherwise convert (low-evidence events still convert but at low
confidence, per "if evidence is weak, confidence must be low").

### eventType → opportunityType(s) (rule table)
LAYOFF_SIGNAL → TALENT_ACQUISITION (primary), CRISIS_SUPPORT, ADVISORY;
PROCUREMENT_INCREASE → PROCUREMENT, SALES, MARKET_ENTRY;
REGULATORY_PRESSURE → COMPLIANCE, ADVISORY;
DEMAND_SPIKE → SALES, PRODUCT_GAP, MARKET_ENTRY;
SUPPLY_CHAIN_PRESSURE → COMPETITOR_DISPLACEMENT, PARTNERSHIP;
CASH_PRESSURE → ADVISORY, M_AND_A, CRISIS_SUPPORT;
EXECUTIVE_EXIT → HIRING, ADVISORY; EXECUTIVE_HIRE → SALES, PARTNERSHIP;
FUNDING_SIGNAL → SALES, PARTNERSHIP; LEGAL_PRESSURE → ADVISORY, CRISIS_SUPPORT;
HIRING_SLOWDOWN → TALENT_ACQUISITION, ADVISORY; HIRING_ACCELERATION → SALES,
CONTENT; PRODUCT_MOMENTUM → PARTNERSHIP, CONTENT; default → CONTENT (watch).
The PRIMARY type becomes the card's `opportunityType`; the card lists the others
as alternate angles in `summary`. `INVESTMENT_WATCH` is used only for
market-context flavour, never as a buy/sell prompt.

### Scores (each an explicit formula over event fields + lens fit, 2dp)
- `evidenceScore` = event.sourceDiversityScore weighted by evidenceCount:
  `min(1, event.sourceDiversityScore * (0.6 + 0.1*min(evidenceCount,4)))`.
- `confidence` = event.confidence (opportunity is never more confident than its
  event) × lensFitFactor (1.0 if sector matches lens targets or lens is default;
  0.85 if neutral; 0.7 if only region matches).
- `urgencyScore` = `min(1, 0.4*event.probability + 0.4*event.severity +
  0.2*(event.noveltyScore))`.
- `commercialValueScore` = `min(1, 0.5*max(event.riskScore,
  event.opportunityScore) + 0.3*lensValueSignal + 0.2*urgencyScore)` where
  lensValueSignal reflects averageDealSize bucket (default 0.5).
- `actionabilityScore` = `min(1, 0.5*confidence + 0.3*evidenceScore +
  0.2*(hasNamedEntity?1:0.5))`.
- `status` = mirrors event lifecycle: NEW on create; RISING when a rescan raises
  commercialValueScore or confidence; sticky ESCALATED/DISMISSED/ACTIONED never
  overwritten.

### Text fields (templated, non-advisory)
`buyerPain`, `likelyBuyers`, `suggestedOffer`, `nextBestAction`,
`opportunityLogic`, `riskLogic` are composed from opportunityType + sector +
region templates using the permitted verbs (may/could/watch/prepare/investigate/
review/monitor/consider). Every rendered field passes `assertNoAdviceLanguage`
before persistence. `nextBestAction` is a strategic step ("review which buyer
groups face new pressure"), never "act now"/"buy".

## 6. Strategic positioning (Stage 3)

`StrategicPositioningService` produces 1–3 examples per OpportunityCard, each
keyed to a `userType` derived from the opportunityType (e.g. TALENT_ACQUISITION
→ RECRUITER; PROCUREMENT → PROCUREMENT/SUPPLIER; COMPLIANCE → ADVISOR). Fields:
`positioningAngle`, `howItCouldBeUsed` (permitted-verb sentence),
`whyItMayMatter`, `evidenceSummary` (cites evidenceCount + source diversity +
the event title), `confidence` = card.confidence, `constraints` (always
includes the non-advisory caveat: "Strategic positioning example, not investment
advice; verify against primary sources."). Every field passes the guard.

## 7. Pipeline integration

New stage in `runFullScan`, after classify + gaps, before finalize:
`generateOpportunities(events, lens)` where `events` = new + updated events and
`lens` = the active/default RevenueLens. It creates/updates OpportunityCards
(unique on eventCandidateId+revenueLensId, lifecycle-safe) and their positioning
examples. New ScanRun counters: `opportunityCardsCreated`,
`opportunityCardsUpdated`, `positioningExamplesCreated`. Per-card errors recorded
(never abort the scan). isFixture propagates from the event.

## 8. API + UI

- `GET /api/opportunities` — Opportunity Radar feed (cards, newest/highest-value
  first, DISMISSED excluded), serialized.
- `GET /api/opportunities/[id]` — card detail + linked event + positioning
  examples + evidence summary.
- `PATCH /api/opportunities/[id]` — status actions (ESCALATE/DISMISS/ACTION),
  Zod-validated.
- `GET /api/revenue-lenses` — list; the default lens always present.
- Dashboard: the existing "Opportunity Radar" section is UPGRADED to show
  OpportunityCards (commercial) — title, opportunityType, buyerPain,
  suggestedOffer, commercialValue/urgency/confidence/evidence scores, nextBest
  Action, FIXTURE badge, link to `/opportunities/[id]`. Event-level risk cards
  and inbox stay. No second dashboard.
- `/opportunities/[id]` page — full card + positioning examples + link back to
  the source event. Non-advisory disclaimer footer.
- Event page (`/events/[id]`) gains an "Opportunities & positioning" section
  listing cards derived from that event.

## 9. Docs

`docs/opportunity-conversion-engine.md` (rules, scores, eligibility),
`docs/strategic-positioning-rules.md` (permitted/prohibited language, the guard,
how examples are generated).

## 10. Out of scope (later phases)
Evidence graph + arcs (3b — `evidenceArcId` stays nullable now); 3D graph &
interrogation (3c); LLM-enhanced rendering (3d — templates now, AI later);
market data (3e); playbooks/watch-markets/portfolio (3d/3f). Full RevenueLens
CRUD UI is minimal in 3a (read + default); create/edit UI lands with Watch
Markets in 3f.

## 11. Success criteria
1. Fresh scan creates OpportunityCards from eligible events, each linked to its
   event, with all five scores and non-advisory text — proven by tests.
2. `assertNoAdviceLanguage` catches every prohibited category; service tests
   assert generated output is clean; a deliberately-bad template would fail CI.
3. Strategic positioning examples generated, keyed to user types, guard-clean.
4. Opportunity Radar renders commercial cards; `/opportunities/[id]` opens with
   positioning + evidence + disclaimer; event page shows derived opportunities.
5. Rescan updates cards (RISING) rather than duplicating; sticky statuses
   preserved. Full suite green; typecheck + build clean; two docs written.
