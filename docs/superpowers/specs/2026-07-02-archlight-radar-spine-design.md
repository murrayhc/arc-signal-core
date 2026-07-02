# Archlight — Autonomous Public Intelligence Radar: Spine-to-Live-Proof Design

Date: 2026-07-02
Status: Approved by owner (Murray Hewitt-Coleman) in design conversation
Source spec: `~/Downloads/autonomous_public_intelligence_radar_build_prompt.md` (v2026-07-02, standalone — not linked to Pygar)

## 1. Product intent

Archlight is an autonomous public intelligence radar. The system scans configured
public data sources, extracts evidence, converts evidence into signals, clusters
signals into emerging event candidates, scores those candidates by risk and
opportunity, and surfaces them on a main dashboard for deeper interrogation.

The user opens the dashboard and immediately sees what the machine has detected.
No manual company upload or selection is ever required. The registry (sources,
entities) is a support layer only; event discovery is the centre of the product.

Primary user journey:

```
Open dashboard
→ Review detected risk and opportunity events
→ Open an event for deeper interrogation
→ Inspect evidence, confidence, source diversity, data gaps, trigger conditions
→ Escalate, dismiss, or mark for review
```

## 2. Scope of this build (the "spine")

**Goal — the source spec's own acceptance test:** a user clicks Run scan on the
dashboard; the system collects documents from configured sources, parses them,
extracts claims, creates signals, clusters signals, creates scored event
candidates with risk/opportunity classification and dashboard feed items; the
dashboard displays the newly detected events; the user opens an event page that
shows evidence, confidence, source diversity, data gaps, and risk/opportunity
logic — all without a manually selected company.

**In scope (maps to source-spec stages 2, 4–16 in reduced form + proof of 23):**

- Project scaffold: Next.js 15 App Router + TypeScript, Prisma + SQLite, Zod,
  Vitest, Tailwind. Single runnable app.
- Event Discovery data layer (schema + migrations + typed services).
- Source registry with collector-compatibility awareness; seeded MVP sources.
- Full autonomous scan orchestrator (`runFullScan`) wiring every stage.
- Scan API (`POST /api/scans/run`, `GET /api/scans/[id]`) and dashboard Run
  scan action.
- Live Intelligence Dashboard at `/`.
- Event Interrogation view at `/events/[id]` with status actions.
- Data gap + trigger condition generation.
- Read-only `/admin/sources` page showing collector support and last-run status.
- End-to-end automated proof test (scan → rows at every stage → feed → event).

**Deferred to later sessions (source-spec stages 17–22, 24, and extras):**
human review queue, watchlist & alerts, backtesting/learning loop, full
source-health tables and scan-audit pages, security-hardening pass, deployment
runbook, final system audit, LLM enrichment layer, background worker/queue.

## 3. Non-negotiable principles (inherited from source spec)

1. Works outside-in: scan public information first, detect events, attach
   entities only where possible. Events may have zero, one, or many entities.
2. `EventCandidate` is never a child of `Entity`.
3. Synthetic/fixture data is always labelled and never presented as live
   evidence. Live and fixture records are never mixed without labels.
4. Uncertainty is visible: confidence, evidence count, source diversity, data
   gaps are surfaced everywhere events appear.
5. Opportunity is detected as well as risk.
6. Evidence trails are preserved: every event traces back through clusters →
   signals → claims → documents → sources. Raw evidence is stored before
   parsing and never overwritten.
7. Every score is explainable in plain language.
8. No arbitrary web scraping. No user-submitted URL fetching. Only configured,
   compatible sources are collected.
9. No financial advice; outputs are framed as strategic intelligence.
10. The build is only done when a scan creates a new EventCandidate visible on
    the dashboard without manual company upload.

## 4. Architecture decisions

### D1 — Single Next.js app, inline scan execution
`POST /api/scans/run` executes `runFullScan()` inline and returns when the scan
completes. The orchestrator is a self-contained module under `src/server/` with
no Next.js imports, so it can later move behind a queue/worker without rewrite.
Rationale: MVP sources are small and fast; zero extra infrastructure to prove
the spine. (Source spec's `apps/worker` is a suggestion, not a requirement.)

### D2 — SQLite + Prisma
Real migrations, zero cloud setup, runs offline on any machine. Postgres/
Supabase migration is a later, mechanical step. Test suite uses a separate
SQLite database file per run.

### D3 — Deterministic rule-based intelligence (no LLM in the spine)
Claim extraction, signal derivation, clustering, and risk/opportunity
classification are rule-based: keyword/pattern extractors with confidence
weights, type-mapping tables, and explicit scoring formulas. Rationale:
reliable, fully explainable (spec requires explainable scores; backtesting must
not require an LLM), works offline, tests are real. An LLM enrichment layer is
a clearly-labelled later upgrade.

### D4 — Sources for the proof
- One **fixture source** (`accessMethod: FIXTURE`): a small bundled corpus of
  realistic RSS-style items in `fixtures/`, flagged `isFixture: true`,
  badge-labelled in every UI surface. Guarantees the proof runs offline.
- One **real RSS source** seeded as `RSS` — default: BBC News Business feed
  (`https://feeds.bbci.co.uk/news/business/rss.xml`), a stable public feed —
  used when network is available. Failures are recorded, never fatal.
- Collector registry maps `accessMethod → collector`. Sources without a
  compatible collector are `UNSUPPORTED` and skipped with a recorded reason.

## 5. Data model (Prisma, spine subset)

Conventions: cuid ids, `createdAt`/`updatedAt` on all tables, enums as string
fields validated by Zod (SQLite has no native enums), all cross-stage links are
real foreign keys.

- **Source** — name, category, accessMethod (RSS | FIXTURE | UNSUPPORTED),
  url, isActive, isFixture, collectorStatus (FUNCTIONAL | PLACEHOLDER |
  UNSUPPORTED), lastRunStatus, lastRunAt, notes.
- **Entity** — name, entityType, sector?, region?. Support layer only.
- **Document** — sourceId, url, title, rawContent, rawContentHash (unique
  per source), normalisedContentHash, fetchedAt, publishedAt?, documentType,
  language, isFixture, metadata(JSON).
- **ParsedDocument** — documentId (unique), title, bodyText, publishedAt?,
  authors(JSON), language, links(JSON), entitiesMentioned(JSON),
  parserName, parserConfidence, status (PARSED | UNSUPPORTED | ERROR).
- **Claim** — documentId, entityId?, claimType (enum list from source spec §7),
  claimText, claimDate?, extractedValue?, unit?, location?, extractionMethod,
  extractionConfidence, credibilityScore, needsReview, isFixture, metadata.
- **Signal** — claimId (unique — 1:1 dedupe guard), documentId, sourceId,
  entityId?, signalType (enum list from source spec §8), signalValue?,
  signalDate, confidence, strength, direction (POSITIVE | NEGATIVE | NEUTRAL |
  MIXED | UNKNOWN), timeWindow?, explanation, isFixture, metadata.
- **SignalCluster** — title, clusterType, sector?, region?, strength,
  confidence, novelty, explanation, isFixture. M:N to Signal
  (`SignalClusterSignal`), M:N to Entity (`SignalClusterEntity`).
- **EventCandidate** — title, eventType, eventClass (RISK | OPPORTUNITY |
  MIXED | WATCH | UNKNOWN), summary, status (NEW | RISING | STABLE | DECLINING
  | CONFIRMED | DISMISSED | ESCALATED | NEEDS_REVIEW), severity, probability,
  confidence, timeWindowStart?, timeWindowEnd?, firstDetectedAt, lastUpdatedAt,
  primaryEntityId? (nullable by design), affectedSector?, affectedRegion?,
  evidenceCount, sourceDiversityScore, signalStrength, noveltyScore,
  opportunityScore, riskScore, createdFromScanRunId, isFixture. M:N to Entity;
  1:N from SignalCluster (cluster → eventCandidateId?).
- **RiskOpportunity** — eventCandidateId, type, title, explanation, riskLogic,
  opportunityLogic, suggestedInterrogationQuestions(JSON), confidence.
- **DashboardFeedItem** — eventCandidateId, feedType (RISK_RADAR |
  OPPORTUNITY_RADAR | INBOX | WATCHLIST), priority, title, summary, status.
- **ScanRun** — scanType, status (RUNNING | COMPLETED | COMPLETED_WITH_ERRORS
  | FAILED), startedAt, completedAt?, sourcesScanned, sourcesSkipped,
  documentsFetched, claimsExtracted, signalsCreated, clustersCreated,
  eventCandidatesCreated, dashboardFeedItemsCreated, errors(JSON array of
  {stage, sourceId?, message}).
- **DataGap** — eventCandidateId, title, description, impactOnConfidence,
  suggestedSourceCategory, severity.
- **TriggerCondition** — eventCandidateId, signalType, conditionText,
  direction, probabilityImpact, priority, resolvedAt?.

Explicitly deferred tables: SourceHealth, ReviewItem, Watchlist/Alert,
Forecast/ForecastOutcome, EventInterrogation (interrogation is a view over
existing data in the spine; a persisted interrogation log is a later stage).

## 6. Pipeline design (`src/server/pipeline/`)

`runFullScan(opts)` — the orchestrator, source-spec stage 12:

1. Create ScanRun (RUNNING).
2. Load active sources; partition into supported/unsupported (unsupported are
   skipped with recorded reason).
3. **Collect** per source (collector registry): fetch RSS or read fixture
   corpus → store raw content → hash → dedupe (skip existing
   sourceId+rawContentHash) → create Documents. Per-source errors recorded on
   ScanRun; scan continues.
4. **Parse** each new document (RSS-item/plain-text parsers) → ParsedDocument.
   Unsupported types marked UNSUPPORTED with reason; parse errors recorded.
5. **Extract claims** from parsed body text: rule-based matchers (keyword +
   pattern tables per claimType, e.g. layoffs, funding, executive change,
   regulatory, procurement, demand). Confidence from match specificity;
   low-confidence claims stored with needsReview=true. Empty parser output
   yields no claims.
6. **Create signals** 1:1 from qualifying claims (extractionConfidence ≥ 0.4;
   below the floor the claim is stored with needsReview=true and produces no
   signal) via claimType→signalType
   mapping with direction and strength; explanation string composed from the
   mapping rule. `claimId` unique constraint guarantees no duplicate signals.
7. **Cluster signals**: group by (signalType-family + sector/region/entity
   overlap) within the scan's time window. Strength = weighted sum of member
   strengths; confidence rises with distinct-source count (source diversity)
   and falls when all members share one source; novelty from prior-cluster
   comparison. Every cluster gets a plain-language explanation. Single weak
   signals do not form clusters.
8. **Create event candidates** from clusters meeting a threshold; below the
   confident threshold but high-impact → eventClass WATCH / status
   NEEDS_REVIEW. Scores: severity, probability, confidence, novelty, riskScore,
   opportunityScore — each an explicit formula over cluster/signal fields,
   rendered into the summary.
9. **Classify risk/opportunity** per candidate (rule table keyed on
   eventType/direction — e.g. competitor layoffs → talent opportunity;
   procurement growth → market opportunity) → RiskOpportunity record with
   riskLogic, opportunityLogic, suggested interrogation questions.
10. **Create dashboard feed items** for candidates (feedType by eventClass,
    priority by score).
11. **Generate data gaps** (single-source support, no evidence against, stale
    signals, missing sector coverage → each reduces confidence) and **trigger
    conditions** (from eventType template table).
12. Update Source.lastRunStatus/lastRunAt; finalize ScanRun counts + status.

Every stage function is independently unit-tested; the orchestrator has an
integration test using the fixture source (see §9).

## 7. API surface (Next.js route handlers, all Zod-validated)

- `POST /api/scans/run` → runs full scan inline; returns `{scanRunId, status,
  startedAt, message}`; 409 if a scan is already running.
- `GET /api/scans/[id]` → ScanRun status, counts, errors, completion time.
- `GET /api/dashboard` → aggregated feed: risk radar, opportunity radar, inbox
  (filterable), counts (new/rising/high-confidence/watch), last scan summary,
  source status summary.
- `GET /api/events/[id]` → full interrogation payload (event + risk/opportunity
  + clusters + signals + claims + documents + sources + gaps + triggers).
- `PATCH /api/events/[id]` → status actions: ESCALATED | DISMISSED |
  NEEDS_REVIEW.
- `GET /api/sources` → registry with collector support + last-run status.

No endpoint accepts a URL to fetch. Scan endpoint fetches only configured
active supported sources.

## 8. UI

### `/` — Live Intelligence Dashboard
- Header: Run scan button (calls POST /api/scans/run, shows running state,
  refreshes data on completion, surfaces errors in a controlled banner),
  last scan time + status + counts.
- Live Risk Radar: risk event cards (title, eventType, sector, region,
  severity, probability, confidence, riskScore, evidenceCount,
  sourceDiversityScore, lastUpdatedAt, status, link to event page).
- Opportunity Radar: opportunity cards (title, eventType, sector, region,
  opportunityScore, confidence, evidenceCount, "why this matters", link).
- Emerging Event Inbox: all candidates, filter chips (RISK / OPPORTUNITY /
  MIXED / WATCH / NEW / RISING / NEEDS_REVIEW / CONFIRMED).
- Source coverage strip: per-source status + fixture/live badges.
- Empty state: explains no scan data exists yet and offers Run scan.
- Every fixture-derived card carries a visible FIXTURE badge.

### `/events/[id]` — Event Interrogation
Sections: event summary; probability/confidence/severity/status;
risk logic; opportunity logic; evidence list (claims with source links and
timeline order); source diversity; related entities (may be none — page must
render fully with zero entities); related signal clusters with explanations;
data gaps; trigger conditions; suggested interrogation questions.
Actions: Escalate, Dismiss, Mark needs review (PATCH; status updates in place).
Empty states for missing evidence — never fake content.

### `/admin/sources` — read-only registry
Table: source, category, access method, active, fixture badge, collector
status, last run status/time. No mutation UI this round.

Styling: Tailwind, dark "radar room" aesthetic, no external font/CDN
dependencies. UI polish is explicitly subordinate to pipeline correctness.

## 9. Testing strategy (Vitest)

- **Unit**: each pipeline stage (collector dedupe, parser outputs, claim
  matchers incl. no-claims-from-empty-input, claim→signal mapping + dedupe,
  clustering incl. unrelated-signals-don't-cluster and diversity→confidence,
  event thresholds incl. weak-cluster→WATCH, classifier risk/opportunity/mixed
  cases, gap + trigger generation).
- **API**: scans/run creates ScanRun; scans/[id] reports counts; events PATCH
  updates status; dashboard returns detected events; invalid input rejected.
- **End-to-end proof test** (the spec's stage-23 analogue, automated): from an
  empty test DB — seed sources → `runFullScan` → assert row counts > 0 for
  documents, parsed docs, claims, signals, clusters, event candidates,
  risk/opportunity, feed items → assert ScanRun counters match → assert one
  source failure doesn't fail the scan → assert an event exists with
  primaryEntityId = null → assert dashboard API returns the new event.
- Proof run also executed manually against the dev DB; results recorded in
  `docs/autonomous-radar-proof.md` with commands, row counts, ScanRun id,
  routes verified, and a PASS/PARTIAL/FAIL verdict.

## 10. Repository layout

```
Archlight/
  prisma/schema.prisma, migrations/
  fixtures/            # fixture source corpus (clearly synthetic, labelled)
  src/
    app/               # routes: /, events/[id], admin/sources, api/*
    components/
    server/
      db.ts            # Prisma client
      pipeline/        # collectors/, parsers/, claims/, signals/,
                       # clustering/, events/, classify/, gaps/, orchestrator.ts
      services/        # dashboard-feed, event-interrogation, sources
    shared/            # zod schemas, enums, types
  tests/               # unit / api / e2e-proof
  docs/                # this spec, proof report
```

## 11. Error handling

- Per-source and per-document failures are caught, recorded in
  `ScanRun.errors[{stage, sourceId?, message}]`, and never abort the scan.
- ScanRun ends COMPLETED, COMPLETED_WITH_ERRORS, or FAILED (FAILED only for
  orchestrator-level faults, e.g. DB unavailable).
- API errors return typed JSON problems; the dashboard surfaces scan errors in
  a visible-but-controlled banner. No silent failures.
- Network absence: RSS source records failure; fixture source still proves the
  pipeline.

## 12. Success criteria

1. `npx prisma migrate dev` applies cleanly from zero.
2. `npm test` passes, including the end-to-end proof test.
3. `npm run dev` → dashboard at `/` → click Run scan → new event cards appear
   without any company upload; event page opens and shows evidence, confidence,
   source diversity, data gaps, and risk/opportunity logic.
4. An EventCandidate with no primary entity renders correctly end to end.
5. Fixture data visibly labelled everywhere it appears.
6. `docs/autonomous-radar-proof.md` records the proof with a verdict.
