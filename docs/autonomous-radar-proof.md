# Autonomous Radar — Recorded End-to-End Proof

This document records a real, reproducible run of the full Archlight pipeline
against a fresh SQLite database, followed by manual verification that the
scan-created events are actually served by the dashboard and event-detail
routes. Every number below is copy-pasted from actual command output captured
during this run — nothing is invented, rounded, or assumed.

Run date: 2026-07-02.

## Commands run, in order

```bash
rm -f prisma/dev.db && npx prisma migrate deploy
```

## 1. Fresh database — before state (all zero)

Immediately after `migrate deploy` on the freshly-deleted `prisma/dev.db`,
before any seed or scan:

```
$ sqlite3 prisma/dev.db "SELECT 'documents', COUNT(*) FROM Document UNION ALL SELECT 'parsed', COUNT(*) FROM ParsedDocument UNION ALL SELECT 'claims', COUNT(*) FROM Claim UNION ALL SELECT 'signals', COUNT(*) FROM Signal UNION ALL SELECT 'clusters', COUNT(*) FROM SignalCluster UNION ALL SELECT 'events', COUNT(*) FROM EventCandidate UNION ALL SELECT 'riskopps', COUNT(*) FROM RiskOpportunity UNION ALL SELECT 'feeditems', COUNT(*) FROM DashboardFeedItem;"
documents|0
parsed|0
claims|0
signals|0
clusters|0
events|0
riskopps|0
feeditems|0
```

Confirmed: every pipeline-stage table is empty on the fresh, migrated database.

## 2. Seed

```
$ npm run db:seed
> archlight@0.1.0 db:seed
> prisma db seed

Environment variables loaded from .env
Running seed command `tsx prisma/seed.ts` ...
Seeded 4 sources.

🌱  The seed command has been executed.
```

`runSeed()` was called with its default options (`includeLive` defaults to
`true` in `prisma/seed.ts`), so all 4 sources were seeded: **Fixture Wire A**,
**Fixture Wire B** (both `FIXTURE`), **Companies House Filings** (`UNSUPPORTED`
— no collector exists for this access method), and **BBC News Business**
(`RSS`, live network source).

```
$ sqlite3 prisma/dev.db "SELECT name, accessMethod, isActive FROM Source;"
Fixture Wire A|FIXTURE|1
Fixture Wire B|FIXTURE|1
Companies House Filings|UNSUPPORTED|1
BBC News Business|RSS|1
```

## 3. Scan run

```
$ npx tsx -e "import('./src/server/pipeline/orchestrator').then(async (m) => { const s = await m.runFullScan(); console.log(JSON.stringify(s, null, 2)); process.exit(0) })"
{
  "scanRunId": "cmr3wou0o0000wwfby0ahx2q4",
  "status": "COMPLETED_WITH_ERRORS",
  "startedAt": "2026-07-02T19:37:18.073Z",
  "completedAt": "2026-07-02T19:37:18.376Z",
  "message": "Scan completed with errors: 6 event candidate(s) detected.",
  "counts": {
    "sourcesScanned": 3,
    "sourcesSkipped": 1,
    "documentsFetched": 57,
    "claimsExtracted": 24,
    "signalsCreated": 24,
    "clustersCreated": 6,
    "eventCandidatesCreated": 6,
    "dashboardFeedItemsCreated": 12
  },
  "errors": [
    {
      "stage": "collect:skip",
      "sourceId": "cmr3wor9i0002wwerp0exl0k0",
      "message": "No compatible collector for access method UNSUPPORTED (UNSUPPORTED)"
    }
  ]
}
```

**Sources skipped and why:** 1 source skipped — `Companies House Filings`
(`sourceId cmr3wor9i0002wwerp0exl0k0`), reason: `No compatible collector for
access method UNSUPPORTED (UNSUPPORTED)`. This is the seeded UNSUPPORTED
source and is skipped by design (no collector exists for it yet).

**Network-dependent source:** the run recorded `sourcesScanned: 3`, i.e. both
fixture wires **and** the live BBC RSS source were scanned this run (the
network allowed the BBC fetch to proceed) — this is why `documentsFetched`
(57) is larger than the fixture corpora alone would produce. The scan status
is `COMPLETED_WITH_ERRORS` **solely** because of the one recorded
`collect:skip` error above (the UNSUPPORTED source) — the errors array
contains exactly one entry, and it is that skip, not a BBC RSS failure. Per
the brief: either a BBC RSS success or failure is acceptable and must be
reported as it actually happened — in this run, it succeeded and contributed
documents; no BBC-specific error appears in the `errors` array.

## 4. Row counts — after

```
$ sqlite3 prisma/dev.db "SELECT 'documents', COUNT(*) FROM Document UNION ALL SELECT 'parsed', COUNT(*) FROM ParsedDocument UNION ALL SELECT 'claims', COUNT(*) FROM Claim UNION ALL SELECT 'signals', COUNT(*) FROM Signal UNION ALL SELECT 'clusters', COUNT(*) FROM SignalCluster UNION ALL SELECT 'events', COUNT(*) FROM EventCandidate UNION ALL SELECT 'riskopps', COUNT(*) FROM RiskOpportunity UNION ALL SELECT 'feeditems', COUNT(*) FROM DashboardFeedItem;"
documents|57
parsed|57
claims|24
signals|24
clusters|6
events|6
riskopps|6
feeditems|12
```

| Stage | Before | After |
|---|---|---|
| Document | 0 | 57 |
| ParsedDocument | 0 | 57 |
| Claim | 0 | 24 |
| Signal | 0 | 24 |
| SignalCluster | 0 | 6 |
| EventCandidate | 0 | 6 |
| RiskOpportunity | 0 | 6 |
| DashboardFeedItem | 0 | 12 |

Every row count matches the `ScanSummary.counts` object above exactly
(confirmed separately by the `records accurate counters on the ScanRun` test
in `tests/e2e-proof.test.ts`, which asserts this equality against live
Prisma counts, not just the JSON summary).

The 6 event candidates created:

```
$ sqlite3 prisma/dev.db "SELECT id, title, eventType, eventClass FROM EventCandidate;"
cmr3wou8h00aawwfbl69esnms|Layoff pressure — technology (UK)|LAYOFF_SIGNAL|RISK
cmr3wou8j00agwwfblr776rg7|Procurement growth — public-sector (UK)|PROCUREMENT_INCREASE|OPPORTUNITY
cmr3wou8k00amwwfbc7x6yvnq|Regulatory pressure — retail (UK)|REGULATORY_PRESSURE|RISK
cmr3wou8m00aswwfbnw7d2h2h|Demand growth — energy (EU)|DEMAND_SPIKE|OPPORTUNITY
cmr3wou8n00aywwfby5c56ooq|Regulatory pressure — cross-sector|REGULATORY_PRESSURE|RISK
cmr3wou8p00b4wwfbnmvkv0gb|Regulatory pressure — energy|REGULATORY_PRESSURE|WATCH
```

Both RISK and OPPORTUNITY classes are present, confirming the risk/opportunity
classification stage produced a real mix, not a single-sided result.

## 5. Automated test suite

```
$ npm test
...
 ✓ tests/api/api.test.ts (7 tests) 329ms
 ✓ tests/pipeline/orchestrator.test.ts (3 tests) 176ms
 ✓ tests/e2e-proof.test.ts (5 tests) 78ms
 ✓ tests/pipeline/collect.test.ts (5 tests) 48ms
 ✓ tests/pipeline/events.test.ts (4 tests) 29ms
 ✓ tests/pipeline/gaps.test.ts (4 tests) 30ms
 ✓ tests/pipeline/cluster.test.ts (5 tests) 30ms
 ✓ tests/schema.test.ts (3 tests) 22ms
 ✓ tests/pipeline/claims.test.ts (6 tests) 12ms
 ✓ tests/pipeline/signals.test.ts (4 tests) 11ms
 ✓ tests/pipeline/parse.test.ts (3 tests) 10ms
 ✓ tests/seed.test.ts (2 tests) 9ms
 ✓ tests/pipeline/classify.test.ts (3 tests) 10ms
 ✓ tests/pipeline/rss-parser.test.ts (3 tests) 3ms
 ✓ tests/smoke.test.ts (1 test) 1ms

 Test Files  15 passed (15)
      Tests  58 passed (58)
```

58/58 tests pass (5 new in `tests/e2e-proof.test.ts` + 53 pre-existing). Note:
the test suite runs against its own isolated `prisma/test.db` (reset on every
run via the Prisma datasource configured for tests), completely separate from
the `prisma/dev.db` used for the manual proof above — the two do not share
state.

## 6. UI verification — dashboard and event-detail routes actually serve scan output

A dev server was started against the same `prisma/dev.db` populated above
(`npm run dev -- -p 3100`, since port 3000 was occupied by an unrelated
process on this machine):

```
$ npm run dev -- -p 3100
   ▲ Next.js 15.5.20
   - Local:        http://localhost:3100
 ✓ Ready in 993ms
```

**Home / dashboard route:**

```
$ curl -s http://localhost:3100/ -o /tmp/archlight-home.html -w "HTTP %{http_code}\n"
HTTP 200

$ grep -o "Layoff pressure[^<]*" /tmp/archlight-home.html
Layoff pressure — technology (UK)
Layoff pressure — technology (UK)
...

$ grep -oi "fixture[a-z]*" /tmp/archlight-home.html | sort -u
Fixture
FixtureBadge
```

The scan-created event **"Layoff pressure — technology (UK)"**
(`EventCandidate.id = cmr3wou8h00aawwfbl69esnms`, created by the scan run
above, `eventType: LAYOFF_SIGNAL`, `eventClass: RISK`) is present verbatim in
the HTML returned by `GET /`, embedded in the page's serialized card data
(`"isFixture":true`) and rendered via a `FixtureBadge` component — confirming
the dashboard is honestly labelling scan output as fixture-derived rather than
presenting it as live evidence.

**Event-detail route:**

```
$ EVID=cmr3wou8h00aawwfbl69esnms
$ curl -s "http://localhost:3100/events/$EVID" -o /tmp/archlight-event.html -w "HTTP %{http_code}\n"
HTTP 200

$ grep -o "Suggested interrogation questions" /tmp/archlight-event.html
Suggested interrogation questions
Suggested interrogation questions
Suggested interrogation questions

$ grep -o "Layoff pressure[^\"\\]*" /tmp/archlight-event.html | head -3
Layoff pressure — technology (UK)</h1><span class=
Layoff pressure — technology (UK): 7 corroborating signal(s) across 2 independent source(s). Class RISK — confidence 0.68, severity 1.00, probability 0.74 ...
Layoff pressure — technology (UK)</p><p class=
```

`GET /events/cmr3wou8h00aawwfbl69esnms` returns HTTP 200 and renders the full
interrogation view for the same scan-created event, including the "Suggested
interrogation questions" section and the event's explanatory narrative
(confidence, severity, probability, risk/opportunity scores, evidence and
cluster reasoning).

The dev server was then stopped (`pkill -f "next dev -p 3100"`); port 3100
confirmed free afterward.

## Verdict

**PASS: autonomous event discovery works from scan to dashboard.**

Justification: a scan was run end-to-end (seed → `runFullScan()`) against a
fresh database with no manual data entry and no company selection. Every
pipeline stage produced rows (documents through dashboard feed items, data
gaps, and trigger conditions). The dashboard route (`GET /`) served the HTML
containing a scan-created event title ("Layoff pressure — technology (UK)"),
honestly badged as fixture-derived, and the event-detail route
(`GET /events/<id>`) served the full interrogation payload for that same
event, including the "Suggested interrogation questions" section. This
satisfies the PASS rule: the dashboard actually displayed an event created by
the scan pipeline, verified via curl against a running dev server, not just
asserted from unit tests.

## Phase 2a addendum (2026-07-02)

This addendum records a real Phase 2a run (event lifecycle, warnings/errors
split, per-source health) against the existing `prisma/dev.db` — the same
database populated by the original proof run above, now carrying data from
multiple prior scans.

```
$ npx tsx -e "import('./src/server/pipeline/orchestrator').then(async (m) => { const s = await m.runFullScan(); console.log(JSON.stringify(s, null, 2)); process.exit(0) })"
{
  "scanRunId": "cmr3znnaw0000ww2798j8fb6z",
  "status": "COMPLETED",
  "startedAt": "2026-07-02T21:00:21.559Z",
  "completedAt": "2026-07-02T21:00:21.739Z",
  "message": "Scan completed: 0 event candidate(s) detected (0 error(s), 1 warning(s)).",
  "counts": {
    "sourcesScanned": 3,
    "sourcesSkipped": 1,
    "documentsFetched": 1,
    "claimsExtracted": 0,
    "signalsCreated": 0,
    "clustersCreated": 0,
    "eventCandidatesCreated": 0,
    "eventCandidatesUpdated": 0,
    "dashboardFeedItemsCreated": 0
  },
  "errors": [],
  "warnings": [
    {
      "stage": "collect:skip",
      "sourceId": "cmr3wor9i0002wwerp0exl0k0",
      "message": "No compatible collector for access method UNSUPPORTED (UNSUPPORTED)"
    }
  ]
}
```

Status is `COMPLETED` (not `COMPLETED_WITH_ERRORS`) because the Phase 2a
errors/warnings split now correctly classifies the UNSUPPORTED-source skip as
a warning, not an error — `errors: []`, `warnings` has exactly the one
expected entry. `documentsFetched: 1` (not 57, as in the original fresh-DB
proof) because this run executed against a `dev.db` that already contains the
fixture corpora from earlier scans in this session — collector-level dedupe
correctly recognised the fixture documents as already stored and only the
live BBC RSS source contributed one new document. `eventCandidatesCreated: 0`
and `eventCandidatesUpdated: 0` for the same reason: no new claims/signals
were extracted from documents that were all duplicates, so no clustering
occurred on this particular run (this is expected dedupe behaviour, not a
regression — see the row counts and `SourceHealth` table below, which confirm
per-source outcomes precisely).

```
$ sqlite3 prisma/dev.db "SELECT status, sourcesScanned, sourcesSkipped, documentsFetched, eventCandidatesCreated, eventCandidatesUpdated FROM ScanRun ORDER BY startedAt DESC LIMIT 3;"
COMPLETED|3|1|1|0|0
COMPLETED_WITH_ERRORS|3|1|0|0|0
COMPLETED_WITH_ERRORS|3|1|0|0|0
```

The most recent row is the `runFullScan()` call above (`COMPLETED`, 0 new
event candidates on this dedupe-heavy rerun); the two older rows predate the
Phase 2a errors/warnings split (recorded as `COMPLETED_WITH_ERRORS` under the
pre-2a status semantics, from earlier sessions against this same `dev.db`).

```
$ sqlite3 prisma/dev.db "SELECT status, COUNT(*) FROM SourceHealth GROUP BY status;"
DEGRADED|2
HEALTHY|1
UNSUPPORTED|1
```

```
$ sqlite3 prisma/dev.db "SELECT s.name, sh.status, sh.failureCount, sh.documentsStoredLastRun, sh.healthScore FROM SourceHealth sh JOIN Source s ON s.id = sh.sourceId ORDER BY s.name;"
BBC News Business|HEALTHY|0|1|1.0
Companies House Filings|UNSUPPORTED|0|0|0.0
Fixture Wire A|DEGRADED|0|0|0.5
Fixture Wire B|DEGRADED|0|0|0.5
```

One `SourceHealth` row per seeded source (4 rows total), each reflecting the
per-source outcome of the run above: BBC News Business is `HEALTHY` (fetched
and stored 1 new document this run), the two fixture wires are `DEGRADED`
(their documents already existed from earlier scans, so this run stored 0 new
documents each — degraded rather than healthy despite zero failures, since
`documentsStoredLastRun` was 0), and Companies House Filings is `UNSUPPORTED`
(no collector exists for its access method — unchanged from the original
proof).

Dev server verification, `PORT=3210` (port 3000 is occupied by an unrelated
process on this Mac):

```
$ PORT=3210 npm run dev
   ▲ Next.js 15.5.20
   - Local:        http://localhost:3210
 ✓ Ready in 1080ms

$ curl -s http://localhost:3210/scans -o /tmp/archlight-scans.html -w "HTTP %{http_code}\n"
HTTP 200

$ grep -o "Scan History" /tmp/archlight-scans.html
Scan History
Scan History

$ grep -oE "COMPLETED[A-Z_]*" /tmp/archlight-scans.html | sort | uniq -c
   9 COMPLETED
   3 COMPLETED_WITH_ERRORS

$ grep -o "cmr3znnaw[a-z0-9]*" /tmp/archlight-scans.html
cmr3znnaw0000ww2798j8fb6z
```

`/scans` returns HTTP 200, renders "Scan History", and lists both status
values across the audit trail's rows — including `cmr3znnaw0000ww2798j8fb6z`,
the exact `scanRunId` from the `runFullScan()` call above, confirming the run
just executed is visible in the audit trail, not just asserted from the JSON
summary.

```
$ curl -s http://localhost:3210/ -o /tmp/archlight-home.html -w "HTTP %{http_code}\n"
HTTP 200

$ grep -oi "fixture[a-z]*" /tmp/archlight-home.html | sort -u
Fixture
FixtureBadge

$ grep -o "Layoff pressure[^<]*" /tmp/archlight-home.html | head -3
Layoff pressure — technology (UK)
Layoff pressure — technology (UK)
```

`/` still returns HTTP 200 and still serves the dashboard feed populated by
earlier scans in this database (the "Layoff pressure — technology (UK)"
event from the original proof run, still honestly badged `FixtureBadge`),
confirming the Phase 2a changes did not regress the dashboard route.

The dev server was then stopped and port 3210 confirmed free.

Verified: scan status semantics (COMPLETED with N warning(s), 0 errors on the
default seed), SourceHealth rows per source, /scans renders the audit trail,
dashboard unaffected. Event lifecycle (merge → RISING) is proven by unit tests
in tests/pipeline/events.test.ts (fixture dedupe means a plain rescan creates
no new signals, so the merge path is exercised at unit level).
Phase 2a verdict: PASS — the radar is a living radar.
