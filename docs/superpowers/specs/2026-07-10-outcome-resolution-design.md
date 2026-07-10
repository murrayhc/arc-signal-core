# Outcome-Resolution Engine — Design Spec

**Date:** 2026-07-10 · **Status:** Approved by owner (approach A, sections 1–6)
**Repo:** `github.com/murrayhc/archlight` · **Builds on:** Stage 0–10 deep-intelligence upgrade (HEAD `31e29e3`)

## Purpose

Turn Archlight's predictions into a **verified track record** — the commercial moat.
Every event and scenario gets a frozen prediction with a resolution deadline; later
evidence auto-resolves it; the system computes Brier accuracy, calibration, and
lead-time versus mainstream coverage; resolved outcomes feed an **owner-gated**
reliability-weight learner.

Owner decisions locked in:
1. **Grading unit: both levels** — the event ("did it materialise?") and its scenario paths.
2. **Resolution: auto + review queue** — clear cases resolve automatically; ambiguous cases queue as ReviewItems.
3. **Weight learning: computed but owner-gated** — suggestions persist with evidence; nothing applies until the owner does so explicitly.

## Architecture (Approach A: additive Prediction Ledger)

Self-contained additive layer, same discipline as Stages 0–10: plain string
cross-references to existing tables, no relations to frozen models, non-fatal
orchestrator stage, `isFixture` propagation, advice-language guard on all
generated text.

### New models (Prisma)

**`OutcomePrediction`** — immutable receipt, frozen when a scan first creates an
event (and its freshly built scenarios). Fields:

- `subjectKind`: `'EVENT' | 'SCENARIO'`; `eventCandidateId` (string, indexed); `scenarioType` (null for EVENT rows)
- `predictionText` — plain-English statement of what was predicted
- `predictedProbability` — frozen at creation (event: `probability`; scenario: `confidence`)
- `finalProbability` — the ONLY mutable pre-resolution field; updated each scan while open
- `evidenceIdsJson` — canonical claim ids at prediction time
- `dimensionsJson` — aggregated reliability dimensions of the underpinning claims at prediction time (input for weight backtesting)
- `confirmingSignalsJson` / `weakeningSignalsJson` — frozen copies (scenarios) or derived from trigger conditions (events)
- `predictedAt`, `deadline`
- `status`: `'OPEN' | 'RESOLVED' | 'PENDING_REVIEW'`
- Resolution fields (null until settled): `outcome` (`'HAPPENED' | 'DID_NOT_HAPPEN' | 'UNRESOLVABLE'`), `resolvedBy` (`'AUTO_EVIDENCE' | 'AUTO_DEADLINE' | 'REVIEW'`), `resolvedAt`, `resolutionRationale`, `resolutionEvidenceJson`, `brierFirst`, `brierFinal`, `leadTimeDays`
- `dedupeKey` unique (`eventCandidateId:subjectKind:scenarioType`) — one prediction per subject; re-scans update `finalProbability`, never create duplicates. The scenario tables being wiped/recreated each scan no longer matters: the ledger keeps the receipt.
- `isFixture` propagated from the event.

The **LOW_CONFIDENCE scenario is never graded** ("we're not sure" is not a falsifiable
prediction). Each event yields 5 predictions: 1 event-level + 4 scenario paths
(CONSERVATIVE, BASE_CASE, ACCELERATED, REVERSAL).

**`TrackRecordSnapshot`** — one summary row per scan (`scanRunId`, resolved counts,
mean Brier first/final, calibration buckets JSON, mean lead-time, before-mainstream
count, by-event-type JSON) so the dashboard can chart the record improving over time.

**`ReliabilityWeightSuggestion`** — owner-gated learning output: `computedAt`,
`scanRunId`, `basedOnResolvedCount`, `currentWeightsJson`, `suggestedWeightsJson`,
`expectedBrierImprovement`, `rationaleJson` (per-dimension plain-English evidence),
`status` (`'SUGGESTED' | 'APPLIED' | 'DISMISSED'`), `appliedAt`.

Active weights live in a small config record; `reliability.ts` gains a
`getActiveWeights()` seam that reads it and falls back to today's hardcoded
constants. **No applied suggestion → byte-identical scoring** (deterministic-scan
invariant re-pinned by test).

### Deadlines

- Event has `timeWindowEnd` → deadline = `timeWindowEnd` + 7 days grace (coverage lag).
- Otherwise → `firstDetectedAt` + 90 days (`DEFAULT_HORIZON_DAYS`, named constant).
- Scenario predictions inherit their event's deadline.

### Resolution stage (new orchestrator stage, non-fatal)

Runs every scan AFTER the consequence engine (so new events freeze predictions from
fresh scenarios). Deadline expiry is checked here too — the next scheduled scan
after a deadline settles it; no separate cron.

Steps each scan:
1. **Freeze** predictions for events created this scan (and any event lacking a ledger row).
2. **Update** `finalProbability` on open predictions.
3. **Evaluate** ALL open predictions (not just this scan's events) against post-prediction evidence.
4. **Write** `TrackRecordSnapshot`; compute a `ReliabilityWeightSuggestion` when the threshold is met.

New `ScanSummary` counts: `predictionsCreated`, `predictionsResolved`,
`predictionsPendingReview`, `weightSuggestionsCreated`.

### Event-level resolution rules (deterministic, ordered)

Evidence is "post-prediction" when its lineage `publishedAt` (fallback: row creation)
is after `predictedAt`.

1. **HAPPENED (AUTO_EVIDENCE)** — post-prediction corroboration from a primary/official
   source (authority ≥ 0.85), OR ≥ 2 new independent publisher groups with zero
   contradictions on record.
2. **DID_NOT_HAPPEN (AUTO_EVIDENCE)** — linked canonicals become `CONTRADICTED`, or
   reliability collapses below floor (< 0.25) with contradictions present.
3. **DID_NOT_HAPPEN (AUTO_DEADLINE)** — deadline passes with NO new post-prediction
   evidence at all ("no corroboration by deadline").
4. **PENDING_REVIEW** — deadline arrives with MIXED evidence (some corroboration AND
   some contradiction), or the event was manually DISMISSED → new ReviewItem type
   `PREDICTION_RESOLUTION`; owner verdict (happened / didn't / unresolvable) settles it.
   `UNRESOLVABLE` predictions are excluded from all aggregates.

Every resolution writes a plain-English `resolutionRationale` naming the evidence —
the auditability differentiator. All rationales pass `assertNoAdviceLanguage`.

### Scenario grading (path classification)

**Timing:** an event can resolve HAPPENED early, but whether it stayed contained
or widened is only observable over the full window. So scenario predictions
grade at the event's **deadline** — except REVERSED (contradiction-death), which
is terminal and grades immediately. The event-level row still resolves early,
preserving lead-time.

Path classification from observable post-prediction deltas over the window:

- **REVERSED** — event resolved DID_NOT_HAPPEN via contradiction.
- **CONTAINED** — HAPPENED, but new corroboration arrived on only one distinct
  (UTC) day and < 2 new affected entities appeared.
- **SUSTAINED** — HAPPENED, new corroboration across ≥ 2 distinct (UTC) days,
  and < 2 new affected entities.
- **WIDENED** — HAPPENED, and ≥ 2 new affected entities (EventCandidateEntity
  rows created post-prediction).

Each scenario prediction grades true iff its type matches the path
(CONSERVATIVE↔CONTAINED, BASE_CASE↔SUSTAINED, ACCELERATED↔WIDENED,
REVERSAL↔REVERSED). A quiet-deadline event (rule 3) took none of the four paths
(path NONE): all four scenarios grade false. Ambiguous events are settled by the
review verdict on the EVENT outcome (happened / didn't / unresolvable); the path
then auto-derives from the observed deltas — the reviewer never has to pick a
path by hand. All thresholds are named constants pinned by tests.

### Track-record maths

- **Brier** = (probability − outcome)², outcome ∈ {0,1}. Reported for `brierFirst`
  (headline) and `brierFinal` (convergence check). Benchmarks: coin-flip 0.25 and
  the observed base rate.
- **Calibration** — decile buckets of stated probability vs observed frequency.
- **Lead time** — HAPPENED events only: days from `firstDetectedAt` to the first
  mainstream-category publication (`publishedAt`) in linked lineage. Mainstream =
  named set of source categories (national press / broadcasters). Detection itself
  mainstream-sourced → 0. Mainstream never covered → `leadTimeDays` null, excluded
  from the mean, counted in the flagship "called before any mainstream coverage" stat.
- Fixtures excluded from every aggregate.

### Weight learning (owner-gated)

- Trigger: ≥ 30 resolved, non-fixture, non-UNRESOLVABLE event-level predictions
  (`MIN_RESOLVED_FOR_LEARNING`).
- Method: deterministic coordinate search over the six reliability weights using
  each prediction's frozen `dimensionsJson`; objective = mean Brier on the resolved
  set. Constraints: each weight ∈ [0.05, 0.40], max shift ±0.05 per dimension per
  suggestion, renormalised to sum 1. Suggest only if backtest improves mean Brier
  by ≥ 0.005.
- Output: one `ReliabilityWeightSuggestion` with per-dimension rationale
  (e.g. "authority-heavy claims resolved TRUE at 82% vs 65% predicted → +0.03 authority").
- Apply/dismiss via admin UI (owner click) → active-weights config record.
  `scoreReliability` reads `getActiveWeights()`; default = current constants.

### Surfaces

- **`GET /api/track-record`** — summary (counts, Brier vs benchmarks, calibration
  buckets, lead-time stats, per-event-type breakdown) + recent resolutions.
- **`/track-record` page** — headline tiles, calibration table, recent resolutions
  with rationales, snapshot trend.
- **Event pages** — prediction-ledger strip (open + settled predictions).
- **Review queue** — `PREDICTION_RESOLUTION` items; PATCH verdict resolves the prediction.
- **Admin** — weight-suggestion panel (list / apply / dismiss) via `GET/POST /api/weights`.

### Error handling

- The whole stage is try/caught in the orchestrator — a resolution failure never fails a scan.
- Per-prediction evaluation failures are collected as stage errors and skip that prediction (it stays OPEN for the next scan).
- Review verdicts validate the item is still PENDING before applying.
- Malformed frozen JSON (dimensions/evidence) → prediction marked PENDING_REVIEW with a rationale, never crashes the stage.

### Standing invariants (unchanged)

- No fabrication; `isFixture` end-to-end; no financial-advice language
  (`assertNoAdviceLanguage` before every persist); reliability penalties stay
  multiplicative; independence counts publisher groups; deterministic-scan
  invariant intact with no applied weight suggestion; GBP-only if currency appears.

## Testing (stage-11 test files, house style)

1. Ledger freezing: immutable `predictedAt`/`predictedProbability` across scans; scenario wipe cannot lose receipts; dedupeKey prevents duplicates; `finalProbability` updates.
2. Resolution rules: each branch (primary corroboration → HAPPENED; 2-group corroboration → HAPPENED; contradiction → DID_NOT_HAPPEN; quiet deadline → DID_NOT_HAPPEN; mixed → PENDING_REVIEW; dismissed → PENDING_REVIEW).
3. Path classification: REVERSED / CONTAINED / SUSTAINED / WIDENED fixtures; scenario true/false mapping; LOW_CONFIDENCE never graded; scenario rows stay OPEN until the deadline even when the event resolves HAPPENED early (REVERSED grades immediately).
4. Maths: Brier and calibration on hand-computed fixtures; lead-time with mainstream lineage, mainstream-first detection (0), and no-mainstream (null + flagship count); fixture exclusion.
5. Review round-trip: PREDICTION_RESOLUTION item created; verdict resolves prediction; UNRESOLVABLE excluded from aggregates.
6. Weight learning: below-threshold → no suggestion; bounds respected; deterministic output; improvement gate; owner-gate (suggestion alone changes nothing); apply → `getActiveWeights` returns applied weights.
7. Invariants: deterministic-scan invariant re-verified; advice-language guard on rationales; orchestrator counts wired.
8. E2E: scan → predictions frozen → contradicting fixture arrives → auto-resolves DID_NOT_HAPPEN → track record + snapshot update.

## Build order (staged commits)

1. Schema + enums + migration + ledger freezing (stage in orchestrator, counts).
2. Resolution rules + path classification + review integration.
3. Track-record maths + snapshot + `/api/track-record` + `/track-record` page + event-page strip.
4. Weight learning + admin panel + `getActiveWeights` seam + deterministic re-pin.
5. Docs + handoff update.
