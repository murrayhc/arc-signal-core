# Archlight Phase 2a — Living Radar: Design

Date: 2026-07-02
Status: Proceeding under owner instruction ("Proceed with next phases"); requirements
sourced from the original build prompt (stages 12/14/17 excerpts) and the final
whole-branch review of the spine (see `.superpowers/sdd/progress.md` follow-ups).
Predecessor: `2026-07-02-archlight-radar-spine-design.md` (spine, complete, PASS).

## 1. Goal

Turn the one-shot radar into a living one: repeated scans must UPDATE existing
events instead of duplicating them, expected skips must stop polluting the error
channel, and the user must be able to see source health and scan history.
Also land the final review's queued follow-up fixes.

## 2. In scope

### A. Warnings vs errors (final-review Important #4, plan amendment)
- New `ScanRun.warningsJson` column. By-design skips (`collect:skip`) are
  recorded as warnings, not errors.
- Scan status: `COMPLETED` when errors is empty (warnings allowed);
  `COMPLETED_WITH_ERRORS` only for genuine failures; `FAILED` unchanged.
- Dashboard: amber banner reserved for errors; warnings render as a calm
  slate note. Scan API returns both arrays.
- Orchestrator FAILED branch gains a test (mock a stage-level throw).

### B. Small-gaps batch (final-review triage: fix-now/follow-up items)
1. Collector registry entries carry their `documentType`
   (`{ collect, documentType }`) — collect.ts stops inferring it from
   accessMethod.
2. `collectFixture` validates the fixture file shape: missing/invalid `items`
   → clear `Malformed fixture file` error.
3. Tests for claims.ts skip paths (non-PARSED parsed docs; missing document
   in docsById).
4. `services/events.ts` narrows `triggerConditions[].direction` to
   `'RAISES' | 'LOWERS'`.
5. New `getSources()` service; `/api/sources` and `/admin/sources` stop
   paying for full `getDashboardData()`.
6. Event page: evidence timeline heading labelled in claims
   (`Evidence timeline (N claims)`) — the header stat remains distinct
   documents; the two counts are now visibly different measures.
7. `SECTORS.technology` drops the fixture-company literal `grid systems`
   (fixture corpus still matches via "technology manufacturer/supplier").
8. `documentsFetched` counter documented in-code as "newly stored documents
   (deduped)" — no schema rename.

### C. Event lifecycle across scans (final-review Important #3 — the feature)
- Extract pure `computeEventMetrics(members: Signal[], cluster)` used by both
  create and merge paths (formulas unchanged from the spine).
- In `createEventCandidates`, before creating: find an existing OPEN event
  with the same identity key `eventType + affectedSector + affectedRegion`.
  OPEN = status NOT `DISMISSED`. (Dismissed events stay dismissed; genuinely
  new evidence on the same key creates a FRESH event — the analyst's dismissal
  is respected.)
- If found → MERGE: attach the new cluster to the event; recompute all scores
  over the UNION of member signals across all of the event's clusters;
  update evidenceCount / sourceDiversityScore / timeWindow / isFixture
  (`some()` union) / summary; set status `RISING` when max(riskScore,
  opportunityScore) or confidence increased vs the stored values, else leave
  status unchanged; regenerate the event's RiskOpportunity, DashboardFeedItem,
  DataGap, and TriggerCondition rows (delete + recreate — they must reflect
  current evidence); `createdFromScanRunId` stays original.
- New `ScanRun.eventCandidatesUpdated` counter; `eventCandidatesCreated`
  counts only new events. Dashboard "Rising" stat now live.

### D. Source health + scan history (build-prompt stage 17, reduced)
- New `SourceHealth` model (1:1 Source): status HEALTHY | DEGRADED | FAILING |
  UNSUPPORTED | UNKNOWN, lastSuccessfulFetchAt, lastFailedFetchAt,
  failureCount (consecutive), documentsStoredLastRun, healthScore 0–1, notes.
- Health service runs at the end of every scan from that scan's per-source
  outcomes: SUCCESS → HEALTHY (score 1.0, failureCount 0); FAILED →
  failureCount+1, score max(0, 1 − 0.34×failureCount), status DEGRADED
  (1 failure) / FAILING (≥2); SKIPPED_UNSUPPORTED → UNSUPPORTED (score 0);
  never-run → UNKNOWN. A source that has never produced a document can never
  be HEALTHY.
- `GET /api/scans` (list, newest first, take 20). New `/scans` page: scan
  history table (id, type, status, started/completed, all counters, error +
  warning counts). Dashboard source strip now driven by SourceHealth status
  colours; admin sources page shows health columns.

## 3. Out of scope (Phase 2b / 3 — unchanged deferrals)
Human review queue, watchlist & alerts, backtesting/learning loop, security
hardening (auth, RSS scheme allowlist + size caps, rate limiting), deployment
runbook, final system audit, entity resolution, LLM enrichment, worker/queue.

## 4. Standing constraints (carried from spine spec — all still bind)
Fixture labelling everywhere (conservative `some()` union on merge);
explainable scores; no arbitrary URL fetching; strategic-intelligence copy
only; SQLite string enums via `src/shared/enums.ts`; `*Json` string columns;
files < 500 lines; tests must pass before every commit; nothing may require
an entity or company selection.

## 5. Migration note
One migration adds: `ScanRun.warningsJson String @default("[]")`,
`ScanRun.eventCandidatesUpdated Int @default(0)`, and the `SourceHealth`
table. Existing rows are unaffected (defaults). Test DB is pushed fresh.

## 6. Success criteria
1. Two scan cycles over overlapping evidence produce ONE event whose status is
   RISING and whose evidenceCount grew — proven by unit/integration tests
   (fixture dedupe means the e2e path proves it via injected signals).
2. Default seed scan completes `COMPLETED` with 1 warning, 0 errors; a broken
   source still yields `COMPLETED_WITH_ERRORS`.
3. `/scans` lists real scan history; dashboard + admin show SourceHealth.
4. Full suite green (existing 60 + new), typecheck + build clean, README and
   proof doc updated (RISING active; deferred list shrinks).
