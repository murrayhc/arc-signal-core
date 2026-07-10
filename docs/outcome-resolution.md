# Outcome-Resolution Engine — owner guide

**Shipped:** 2026-07-10 (Stage 11). Spec: `docs/superpowers/specs/2026-07-10-outcome-resolution-design.md`.

## What it is, in one paragraph

Every event Archlight detects now leaves a **frozen receipt**: what was predicted, at what
probability, by what deadline — plus one receipt per scenario path (conservative / base case /
accelerated / reversal; "low confidence" is never graded because "we're not sure" can't come true
or false). Later scans check each open receipt against new evidence and settle it automatically
when the answer is clear, or put it in your **Review queue** when it isn't. From the settled
receipts Archlight computes a **verified track record** — accuracy, calibration, and how many days
it led mainstream coverage — and, once enough outcomes exist, suggests better reliability weights
that **never apply themselves**.

## How predictions settle

| Situation | Result |
|---|---|
| A regulator/government/official source corroborates after the prediction | **Happened** (automatic) |
| 2+ new independent publishers corroborate, no contradictions | **Happened** (automatic) |
| The underlying claims become formally contradicted | **Didn't happen** (automatic, "reversed") |
| Deadline passes with no new evidence at all | **Didn't happen** (automatic) |
| Deadline arrives with mixed evidence, or you dismissed the event | **Your verdict** — Review queue buttons: Happened / Didn't happen / Unresolvable / Needs more |

- Deadline = the event's own time window + 7 days grace, or 90 days from first detection.
- "Needs more" pushes the deadline out 30 days and re-queues if still unclear.
- "Unresolvable" (e.g. a duplicate event) is excluded from all statistics — it never pads the record.
- Scenario paths grade at the deadline (an early "happened" can still widen later): contained /
  sustained / widened / reversed, from observable evidence deltas.
- Every verdict — automatic or human — stores a written rationale naming the evidence.

## Where to look

- **/track-record** — the headline numbers: resolved count, hit rate, accuracy (Brier: lower is
  better, 0.25 = coin-flip guessing), calibration table ("of everything we said 70% on, how much
  happened"), mean lead time vs mainstream press, and the flagship count of events mainstream never
  covered at all. Every recent resolution is listed with its rationale.
- **Event pages → Predictions tab** — that event's receipts and how they settled.
- **/review** — pending prediction verdicts alongside the existing review items.
- **/admin/weights** — weight suggestions (see below).

## Weight learning (owner-gated — your switch)

Once **30+ real predictions have resolved**, each scan backtests whether different reliability
weights (authority vs independence vs freshness, etc.) would have predicted the realised outcomes
better. If the improvement is material, a suggestion appears at **/admin/weights** with the exact
proposed numbers and a per-dimension rationale.

- **Nothing changes until you click Apply.** Un-applied suggestions are inert.
- Applying changes how *future* scans score evidence. Shifts are capped (±0.05 per dimension) so
  the engine can never lurch.
- **Dismiss the applied row to restore the defaults exactly** — with nothing applied, scoring is
  byte-identical to the pre-Stage-11 engine (pinned by test).

## Constants (all in `src/server/outcome/constants.ts`, pinned by tests)

90d default horizon · 7d deadline grace · 30d review extension · 2 new publisher groups or one
≥0.85-authority source to auto-happen · 2 new entities = widened · 2 distinct days of new
corroboration = sustained · 30 resolved to learn · ≥0.005 Brier improvement to suggest ·
weights within [0.05, 0.40], ±0.05 max shift · mainstream = NEWS/WIRE source categories.

## Invariants kept

Fixture data is excluded from every statistic. Rationales pass the advice-language guard before
persisting. The deterministic-scan invariant holds with no applied weight suggestion. A resolution
failure never fails a scan (stage 15d is non-fatal, fault-isolated per prediction).
