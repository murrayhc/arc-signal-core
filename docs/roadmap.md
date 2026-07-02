# Archlight Roadmap

Last updated: 2026-07-02 · Current state: spine + Phase 2a shipped, 74/74 tests
green, deployed to `origin/main` (private repo). Source of truth for phase
history: `.superpowers/sdd/progress.md` (local ledger) and
`docs/superpowers/specs/`/`docs/superpowers/plans/` (design docs).

## Done

- **Spine (2026-07-02)** — the full autonomous pipeline: collect → parse →
  claims → signals → clusters → scored events → risk/opportunity
  classification → dashboard feed → data gaps + trigger conditions. Live
  dashboard (`/`), event interrogation (`/events/[id]`), read-only admin
  sources page. Proven end-to-end (recorded verdict: PASS).
- **Phase 2a — Living Radar (2026-07-02)** — repeated scans now update
  existing events instead of duplicating them (RISING lifecycle, sticky
  analyst statuses); scan warnings separated from genuine errors; per-source
  health tracking; `/scans` audit history page. Signed off with one
  same-session fix (merge-transaction atomicity).

## Fast-follows (small, queued from Phase 2a's final review)

Cheap, scoped items — good candidates for the very next session, in no
particular order:

1. **SourceHealth cold-start refinement** — on a `SUCCESS` outcome with 0
   newly-stored documents, also check `documentsStoredLastRun` history / a
   `Document` count for that source before marking it `DEGRADED`. Fixes the
   known quirk where a source that already had documents before health
   tracking existed shows amber forever.
2. **Status provenance for machine-set `NEEDS_REVIEW`** — currently
   indistinguishable from an analyst's manual `NEEDS_REVIEW`, so it's sticky
   forever and can never transition to `RISING` even as evidence corroborates
   it. Needs a provenance flag (machine vs analyst) before Phase 2b's review
   queue lands.
3. **Surface "M updated" in scan results** — the Run-scan button message and
   dashboard header currently report only newly-created events; a
   merge-heavy rescan looks like "0 events detected" even when several were
   meaningfully updated.
4. **Preserve `resolvedAt` on trigger regeneration** — event merges delete
   and recreate `TriggerCondition` rows, silently resetting any future
   resolution bookkeeping. No-op today (nothing sets `resolvedAt` yet) but
   must be fixed before the watchlist/alerts feature relies on it.
5. **Fixture item-shape validation** — the malformed-fixture-file check
   (added in 2a) validates the `items` array exists but not each item's
   shape; a fixture with a missing `title`/`content` silently stores
   `"undefined\n\nundefined"`. A cheap Zod schema closes this.
6. **Document the pre-2a duplicate-open-events class** — if a database
   predates the event-lifecycle change, any duplicate open events with the
   same identity key that already existed will never be merged together
   (only future clusters merge into the most recent one). One doc line for
   anyone reusing the current dev database.
7. **`package.json#prisma` → `prisma.config.ts`** — clears a Prisma
   deprecation warning; mechanical, do alongside the next Prisma major bump.

## Phase 2b — Analyst Workflows (not started)

The next substantive phase — turns the radar from "detect and score" into
"detect, triage, and act on."

- **Human Review Queue** — `ReviewItem` model; queue + detail pages; approve
  / reject / needs-more-evidence actions with an audit log; weak claims,
  uncertain signals, and high-impact-low-confidence events route here before
  they influence strong conclusions. Depends on fast-follow #2 (status
  provenance) landing first so the queue can tell machine-flagged review from
  analyst-flagged review.
- **Watchlist & Alerts** — watch an event, sector, region, event type, or
  source category; alert rules on probability/risk/opportunity/confidence
  thresholds, new contradictions, source failures, forecast changes; internal
  alerts page with acknowledge action. No external email/Slack in this phase.
  Depends on fast-follow #4 (`resolvedAt` preservation).
- **Backtesting & Learning Loop** — record real-world outcomes
  (`HAPPENED`/`DID_NOT_HAPPEN`/`PARTIAL`/`TOO_EARLY`/`UNKNOWN`) against
  events; Brier score, precision/recall, false positive/negative tracking,
  signal- and source-usefulness ranking; a backtest dashboard. Manual outcome
  entry is acceptable for this phase; no LLM required.

## Phase 3 — Production Readiness (not started)

The app is explicitly local-only and unauthenticated until this phase lands
— do not deploy it exposed to a network before completing it.

- **Security Hardening** — authentication + admin route protection; rate
  limiting on scan endpoints; RSS-link scheme allowlist (http/https only,
  closes a low-severity `javascript:`-link vector flagged in the spine
  review); response-size cap and content-type check on RSS fetches; audit
  logging for admin changes; dependency vulnerability scan; a
  `docs/security-hardening-report.md`.
- **Deployment & Runbook** — production deployment docs, environment
  variable template, health-check endpoints (API/DB/worker/source-registry/
  pipeline), backup notes, troubleshooting guide.
- **Final System Audit** — a direct, unsoftened audit of the whole system:
  what works, what's fragile, what's overbuilt/underbuilt, what still blocks
  production use, prioritised recommendations with file paths.

## Deferred indefinitely (design decisions, not gaps)

These were deliberately scoped out of the spine and every phase since, and
aren't scheduled — revisit only if a real need emerges:

- **Entity resolution** — events intentionally work at the
  sector/region/pattern level without requiring a company match; this is a
  product principle (the registry is a support layer, not the centre), not
  a missing feature.
- **LLM enrichment** — claim extraction, clustering, and scoring are
  deterministic rule-based logic by design (explainable, offline,
  reproducible). An LLM layer could be added later as a clearly-labelled
  optional upgrade, never a silent replacement.
- **Worker/queue architecture** — the scan orchestrator runs inline by
  design for the MVP; it's already isolated from Next.js so a move behind a
  background worker/queue is a later, mechanical step if scan volume ever
  demands it.
- **Postgres/Supabase migration** — SQLite was chosen for a zero-setup local
  radar; the schema uses string-enum columns specifically to make this
  migration mechanical whenever it's actually needed.

## How this file works

Update it whenever a phase starts, a fast-follow lands, or scope changes.
Each completed phase's detailed design lives in
`docs/superpowers/specs/YYYY-MM-DD-<phase>-design.md` and its full
implementation plan in `docs/superpowers/plans/YYYY-MM-DD-<phase>.md` — this
file is the short, current-state summary; those are the durable record.
