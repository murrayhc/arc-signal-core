# Final system audit (Stage 15)

Date: 2026-07-03 · Auditor: independent principal-engineer pass (read-only)
· HEAD at audit: `acb1d99` · 341/341 tests green · proof suite 19/19 green
· `tsc --noEmit` clean · `next build` clean (all routes emitted).

This is the direct, unsoftened Stage-15 audit of the Archlight upgrade
(spine + Phase 2a + upgrade Phases 3a–3f + final delivery). Everything below
was verified against the code and by running the suites — not taken from the
phase reports. One additional empirical probe was run for this audit (§3,
outcome 8) against a throwaway database; no source, test, or dev data was
modified.

**Verdict up front: the upgrade is acceptance-complete for its stated scope
— a local, single-operator, fixture-scale intelligence radar with two
honestly-dormant paid layers.** 13 of 15 acceptance outcomes are MET, 2 are
DORMANT-BY-DESIGN and correctly so. It is NOT production-deployable: the
security pass (authentication, RSS hardening) is genuinely deferred and is
the one true blocker. Beyond that, this audit found two Important defects
the per-phase reviews missed — a post-parse guard gap in the LLM playbook
path and a proof-suite under-assertion on the six-degree arc — plus a
routing semantics trap for LLM activation. None is reachable in the shipped
dormant build; all three must be fixed before the layers they sit in are
switched on.

## 1. How this was verified

- `npm test` → 341 passed / 341 (44 files). `npx vitest run tests/proof` →
  19/19 (the 18 Stage-14 proofs + the row-count log test).
- `npm run typecheck` and `npm run build` → both clean, exit 0.
- Code-level reads of every safety-relevant module (guard, arc, builder,
  interrogation, LLM run/validate/router/provider, market service/provider,
  playbook, timeline, watch/portfolio, all mutating API routes).
- An audit-only probe (seed → `runFullScan()` → `buildArc()` per EVENT root,
  throwaway SQLite DB in the session scratchpad) to test the six-degree
  claim empirically rather than trusting the proof suite.
- Git state at audit: working tree clean, 3 commits ahead of `origin/main`
  (unpushed: `73d282c`, `3c4cdc3`, `acb1d99`).

## 2. The 15 Stage-15 acceptance outcomes

| # | Outcome | Status | Evidence |
|---|---|---|---|
| 1 | Same application, upgraded in place | **MET** | One app, one dashboard (`src/app/page.tsx`) — new Watch Markets / lens / replay actions added additively to the existing radar page; no second dashboard or parallel architecture exists. `docs/existing-architecture-map.md` documents the reuse plan; the code matches it. |
| 2 | Existing foundations reused | **MET** | All 17 pre-upgrade models still carry the pipeline; the graph is a projection over them, not a replacement (`src/server/graph/builder.ts` traverses the original `EventCandidate→SignalCluster→Signal→Claim→Document→Source` chain). 36 models total = 17 original + 19 additive. |
| 3 | Autonomous scan pipeline end to end | **MET** | `src/server/pipeline/orchestrator.ts` (collect→parse→claims→signals→clusters→events→classify→gaps→opportunities→positioning→graph→timeline, per-stage non-fatal errors). Proofs 1–2; `tests/e2e-proof.test.ts`. |
| 4 | Events on dashboard without manual upload | **MET** | Proof 2: `runFullScan()` creates `DashboardFeedItem` rows; `getDashboardData()` (`src/server/services/dashboard.ts`) renders them at `/`. The only manual act is pressing Run scan. |
| 5 | Events interrogable via evidence/claims/signals/sources | **MET** | `getEventDetail()` (`src/server/services/events.ts`) returns claims, documents, sources, direction and evidence-against; rendered at `/events/[id]` with the evidence arc and graph links. |
| 6 | Opportunities where commercially valid | **MET** (see note) | Proofs 8–9; `src/server/pipeline/opportunity.ts` — deterministic type mapping + commercial scores + evidence-linked cards. Note: the validity gate is generous — unmappable event types still yield a CONTENT card at confidence ≥ 0.45 (`isEligible`), so "commercially valid" is expressed mostly through scores, thinly through gating. |
| 7 | Positioning without direct financial advice | **MET** | Proof 7; every persisted field is guard-asserted pre-persist (`src/server/pipeline/positioning.ts:127-132`); templates are hedged ("could/might/may") and INVESTOR_WATCH explicitly says "not a trading signal". |
| 8 | Six-degree evidence arc | **MET** — probe-verified; **proof under-asserts** (§4.2) | `buildArc()` (`src/server/graph/arc.ts`) traverses both directions to a 6-degree cap. Audit probe: **all 5 fixture event roots reach maxDegree = 6** (25–55 steps each). But no test anywhere asserts beyond ≥ 3 degrees — see finding I-2. |
| 9 | 3D graph displays living connections | **MET** | `/graph` (`src/components/GraphExplorer.tsx` + `ForceGraph.tsx`) — bundled `react-force-graph-3d`/`-2d` (no CDN), SSR-safe mount gate, 2D fallback. Proof 10 verifies `/api/graph/live` returns nodes+edges with no dangling edge refs. All required node classes exist (EVENT/SOURCE/CLAIM/SIGNAL/COMPANY/OPPORTUNITY + SECTOR/REGION/COMMODITY/INSTRUMENT…). |
| 10 | Manual search: companies, commodities, instruments, tickers, sectors, themes | **MET** (shallow classifier — see note) | Proofs 11–13; `src/server/interrogate/classify.ts` + `service.ts`. Notes: COMMODITY recognition is a 10-word hardcoded list; COMPANY classification requires an `Entity` row (automatic entity resolution is deferred — proof 11 had to create one manually); TICKER = any 1–5 all-caps token. Graph substring matching still returns honest results for unclassified terms. |
| 11 | Multi-model LLM for specialised interpretation | **DORMANT-BY-DESIGN — correctly** | `getActiveProvider()` (`src/server/llm/provider.ts:100-107`) requires BOTH a key and ≥ 1 enabled config; seeds are all `enabled: false`. Router/adapter/validation proven with injected FakeProviders (proofs 15–18). `/api/llm/status` reports not-configured without leaking anything. Activation trap in `routeTask` — finding I-3. |
| 12 | LLM outputs validated, auditable, grounded | **DORMANT-BY-DESIGN — with two pre-activation defects** | Validation is real and fail-closed (`src/server/llm/validate.ts`, `run.ts`: schema, advice-language, grounding; rejected output redacted from audit; prompt stored only as sha256 + lengths). Defects: post-parse guard gap (finding I-1) and shallow grounding (finding M-1). |
| 13 | Market outputs remain context only | **DORMANT-BY-DESIGN — contract holds** | `ADAPTER_REGISTRY` empty ⇒ `getActiveMarketProvider()` always null (`src/server/market/provider.ts:48-73`); dormant sentinel is byte-stable, never a fabricated price (proof 13). Configured path (FakeProvider): guard-before-persist on the exact name+summary about to be written (`src/server/market/service.ts` — verified in both `getInstrumentContext` and `getCommodityContext`), structured-fields-only templating, `CompanyProfile.description` structurally excluded. Contract documented in `docs/market-context-safety.md` and matches the code. |
| 14 | Registries remain support tools | **MET** | `/admin/sources` is read-only; `/api/sources` is GET-only; `Entity` has no UI surface at all. The user journey is dashboard → event → graph/interrogation, with registries linked from the footer of the dashboard only. |
| 15 | Tests and proof documents demonstrate the upgrade | **MET** — with two honesty blemishes | 341 tests green; 19/19 proof suite; 9/9 Stage-14 docs present; `docs/final-upgrade-proof.md` row counts (88 nodes / 120 edges / 5 cards…) reproduce. Blemishes: proof 6's comment claims coverage that does not exist (finding I-2) and `docs/roadmap.md` is stale (finding m-2). |

## 3. What genuinely works (verified, not vibes)

- **The deterministic core is real.** One fixture scan produces 5 events, 88
  graph nodes, 120 edges, 5 opportunity cards, 6 positioning examples — and
  the audit probe reproduced these numbers independently. The pipeline is
  idempotent where it claims to be (upserts keyed on stable uniques), and
  per-stage failures degrade to recorded `PipelineError`s instead of failing
  the scan (`orchestrator.ts`, `recordGraphEvents` non-fatal hook).
- **Six degrees is not marketing.** Every fixture event root genuinely
  traverses to degree 6 (probe, §1). The BFS dedupes correctly (shortest
  degree wins), applies degree decay and a breadth cap, and its scoring
  (`scoreArc`) is pure and hand-verifiable.
- **The safety spine is enforced in code, not by discipline.** A single
  shared guard (`src/server/safety/advice-language.ts`) runs **before
  persistence** on every deterministic text surface: opportunity cards,
  positioning, arc titles/summaries/steps, market names+summaries. The 3e
  fix wave verifiably landed (assert-before-upsert in both market context
  getters).
- **Dormancy is honest at every layer.** No key ⇒ null provider ⇒ explicit
  `SKIPPED_NO_PROVIDER` / `NOT_CONFIGURED` sentinels; no env-var name or key
  has a type-level path into any response; dormant market queries still
  return real graph evidence with the verbatim non-advisory disclaimer.
- **The LLM audit trail is better than it needed to be.** Prompt stored only
  as sha256 + character counts; rejected output redacted from
  `outputSummary`; a validation row per applicable run; routed model (not
  provider name) recorded.
- **Timeline/replay records only real diffs.** `diffState`
  (`src/server/graph/timeline.ts`) uses epsilons, strictly-increasing
  counters and status sets; all 10 GraphEventTypes are reachable after
  `acb1d99`; freshness/decay correctly reference supporting events only, so
  a fresh contradiction cannot masquerade as fresh support.
- **Build hygiene.** Typecheck and production build clean; the optional
  `@anthropic-ai/sdk` is a guarded lazy import that cannot crash the build
  or a request when absent.

## 4. Findings — prioritised

### Critical (production blockers — known, deferred, and real)

**C-1 · The app must not be exposed to a network in its current state.**
Confirmed exactly as the roadmap describes — this is a genuine deferral, not
a hidden break, but it is absolute:
- **Zero authentication anywhere.** No auth/session/token code exists in any
  of the 11 mutating API routes (`grep` across `src/app/api` returns
  nothing). Anyone who can reach the port can run scans
  (`POST /api/scans/run` → outbound fetches), and create/modify/delete
  watch markets, lenses, portfolio items and event statuses.
- **RSS fetch is unhardened** (`src/server/pipeline/collectors/rss.ts:56-64`):
  no scheme allowlist on `Source.url`, no response-size cap (`res.text()`
  unbounded; the 10 s `AbortSignal.timeout` is the only bound), no
  content-type check.
- **Feed-supplied link URLs render as raw hrefs**
  (`src/app/events/[id]/page.tsx:24` — `href={item.documentUrl}`). A
  malicious or compromised feed could plant `javascript:`/`data:` links.
  Mitigation today: the source list is operator-curated and seed-only (no
  API creates sources); the only live feed is BBC News Business.
- Verdict: acceptable for a local-only single-operator tool; **the first
  work item before any deployment** (auth, scheme allowlist on stored and
  rendered URLs, size cap, content-type check, rate limiting).

### Important (integration-level defects the phase reviews missed — all
unreachable in the dormant build, all mandatory before activation)

**I-1 · LLM playbook upgrade persists parsed output that was never
guard-checked post-parse.** `validateLLMOutput` runs `findAdviceLanguage` +
`extraCheckers` on the **raw** provider text (`src/server/llm/validate.ts:48-52`)
but returns `parsed` from `JSON.parse` (`:39`, `:75-81`).
`generatePlaybook` then persists the **parsed** fields directly
(`src/server/playbook/service.ts:248-262`) with no re-guard — only a schema
re-parse. JSON escape sequences decouple the two representations: raw
`"should buy this stock"` does not match `/\bshould\s+buy\b/` on the
raw string, but parses to "should buy this stock" and would be persisted and
rendered. The docstring (`service.ts:172-177`) claims "the parsed output
independently passes the playbook's own guard checks" — **the code does not
do this**. Fix (small): run `assertGuardClean` over every parsed field (or
over `JSON.stringify(parsed)`) before the `generatedBy: 'LLM'` update; fix
the docstring. Dormant today (no provider can be configured), so not a live
hole — but it is precisely the safety substrate Phase 3d exists to provide.

**I-2 · No test proves six-degree traversal; proof 6's comment claims one
exists.** The strongest arc-depth assertion anywhere is `maxDegree >= 3`
(`tests/graph/arc.test.ts:21-29`; `tests/proof/upgrade-proof.test.ts:106-128`
asserts `bestMaxDegree >= 3 && <= 6`). Proof 6's comment states "fixture
data guarantees at least one reaches the full 6-degree cap (proven
deterministically in tests/graph/arc.test.ts)" — **false**: that file also
only asserts ≥ 3. The behaviour itself is real (audit probe: all 5 roots
reach 6), so this is a proof-integrity defect, not a functional one — a
regression capping traversal at 3 degrees would pass the entire 341-test
suite. Fix: assert `=== 6` (or ≥ 6-reaching root exists) in proof 6 and
correct the comment.

**I-3 · `routeTask` routes to disabled configs — `enabled` has no routing
semantics.** The filter (`src/server/llm/router.ts:24-33`) ignores
`enabled`; the sort merely prefers enabled configs. Today (all 5 seeds
`enabled: false`) every task routes to a disabled config's model — which is
what lets proof 15 pass in the dormant build. At activation this becomes a
trap: `getActiveProvider` only checks that *some* config is enabled, so an
owner enabling `claude-fast` but deliberately leaving `claude-creative`
disabled (cost control) would still have playbook tasks routed to
`claude-creative`. Fix before activation: filter to enabled configs, fall
back to `unrouted` (already an honest marker in `run.ts:11`); adjust the
dormant tests to inject enabled fakes.

### Moderate (fragile or thin, acceptable at current scale/scope)

**M-1 · "Grounding" is one-substring-deep.** `evidenceGrounded` passes if
**any single** supplied evidence id appears anywhere in the raw output
(`src/server/llm/validate.ts:54`). An output citing one real claim id and
fabricating ten assertions counts as grounded. Proof 17 honestly tests only
the zero-citation case. Fine as a dormant-layer skeleton; strengthen
(per-claim citation coverage, or at minimum a required-fraction check)
before any LLM output reaches users. Also known: `evidenceGrounded: true`
is recorded when grounding wasn't requested — misleading audit rows.

**M-2 · Page-render writes.** Viewing `/events/[id]` calls `getEventArc` →
`buildArc` → `deleteMany` + `create` (`src/app/events/[id]/page.tsx:48`,
`src/server/services/graph.ts:340`, `src/server/graph/arc.ts:269-272`), and
`/api/graph/event/[id]` (a GET) does the same. Every view rewrites arc rows;
two concurrent views of one event race delete/create (no unique constraint
on `rootNodeId`). Harmless single-user; fix (cache or move behind POST /
recompute-on-scan) before multi-user.

**M-3 · Full-table scans and N+1 loops are pervasive.**
`findMatchingNodes` loads every GraphNode (`interrogate/service.ts:114-118`);
`getLiveGraph` loads all nodes + all edges; arc BFS issues two queries per
frontier node per degree; `getInstrumentContext` does
`instrumentProfile.findMany().find()`. All fine at 88 nodes / 120 edges;
none survives real scale. Known deferral (confirmed) — tie remediation to
the Postgres migration.

**M-4 · The advice-language guard is a regex blocklist.**
(`src/server/safety/advice-language.ts`) — 21 patterns, adversarially probed
once, but still a blocklist: novel phrasings ("worth adding to your book",
"this will outperform") pass. It is the right tool for the deterministic
templates it currently guards (templates can't drift), and defence-in-depth
for LLM output — but it must not be the *primary* gate once an LLM is live.
Combined with I-1, treat "LLM activation" as its own small safety project.

**M-5 · "Replay" is a timeline, not a replay.** `GraphSnapshot` stores full
node/edge JSON blobs, but `ReplayPanel` renders only counts and timestamps
(`src/components/ReplayPanel.tsx:96-113`) — the captured graph states are
never visually replayed or diffed. Data layer over-built relative to its
rendering (or the rendering under-built relative to its name). Honest
labelling in the UI; no fabrication — just an ambition/delivery gap.

### Minor

- **m-1 · Duplicate lens endpoints.** `/api/revenue-lenses` (3a, GET via
  `services/opportunities`) and `/api/lenses` (3f CRUD via `lens/service`)
  both list the same table with different shapes. Retire the former.
- **m-2 · `docs/roadmap.md` is stale at HEAD.** Says "330 tests" (now 341)
  and lists the P2002 sweep / decay semantics / CLAIM_REPEATED
  reachability / whitespace-term filter as open — all four were fixed in
  `acb1d99`. One-commit refresh.
- **m-3 · `ForceGraph.tsx` GROUP_COLORS** lacks COMPANY, PERSON, COMMODITY,
  INSTRUMENT — these render default grey. Cosmetic.
- **m-4 · `estimatedValue`** supported by `updatePortfolioItem` but absent
  from the `/portfolio` edit form (known deferral, confirmed additive).
- **m-5 · Unpushed state.** 3 commits ahead of `origin/main` at audit time —
  push (with this audit) to restore the repo's stated parity discipline.
- **m-6 · Query-classifier quirks.** Any 1–5 all-caps token is a TICKER
  (e.g. "AI" → market disclaimer); acceptable-but-odd UX, honest output.

## 5. Known-deferred items — confirmation

Each item the ledger lists as deferred was checked for being a disguised
Critical. Verdicts:

| Deferred item | Verdict |
|---|---|
| LLM + market layers dormant, owner-funded activation | Genuine and honest. Gating verified at source (`provider.ts` both layers); no fabrication on any dormant path; FakeProviders test the configured paths. **But activation inherits I-1/I-3/M-1/M-4 — treat the pre-activation gate lists as mandatory, not advisory.** |
| Security pass (auth, RSS allowlist, size cap) | Genuinely deferred, correctly documented as local-only. It is the production blocker (C-1) — nothing hidden, nothing worse than documented. |
| `estimatedValue` not in portfolio form | Confirmed trivial/additive (m-4). |
| builder↔market/graph circular import | Confirmed runtime-safe: `builder.ts:6` imports `syncMarketNodes`; `market/graph.ts:2` imports `upsertNode`/`upsertEdge`; both used at call time only. `findNodeId`/`safeUpsertEdge` duplication is documented in-file. Resolve at builder decomposition. |
| Full-table findMany at fixture scale | Confirmed real but harmless today (M-3). |
| Postgres migration | Confirmed mechanical by design (string-enum columns); no schema decision blocks it. |

## 6. Prioritised recommendations

1. **Before any network exposure:** the security pass (C-1) in full —
   authentication, URL-scheme allowlist (stored + rendered), fetch size cap
   + content-type check, rate limiting on scan/interrogate.
2. **Before LLM activation (do together, small):** post-parse guard on
   playbook persistence + docstring fix (I-1); `routeTask` disabled-config
   exclusion (I-3); grounding strengthened past one-substring (M-1); decide
   whether the regex blocklist is sufficient as a secondary gate (M-4).
3. **Proof integrity now (cheap):** assert the 6-degree traversal explicitly
   and fix proof 6's false comment (I-2); refresh `docs/roadmap.md` (m-2);
   push the unpushed commits (m-5).
4. **Before multi-user:** stop rewriting arcs on GET (M-2).
5. **At Postgres migration:** replace full-table scans with indexed queries
   (M-3); dedupe the graph helpers and break the circular import.
6. **Housekeeping when convenient:** retire `/api/revenue-lenses` (m-1);
   graph colours (m-3); portfolio `estimatedValue` field (m-4); decide
   whether snapshot rendering (M-5) is worth building or the stored blobs
   should be trimmed.

## 7. Closing statement

The system does what its documentation says it does, and — rarer — declines
to claim what it does not do. The deterministic core is proven end to end on
fixture data; the two paid layers are dormant in a way that is verifiably
incapable of fabricating output; the safety guard runs before persistence on
every live text surface. The honest weaknesses are: it is unsecured (by
documented choice), fixture-scale (by documented choice), its opportunity
"validity" gate is generous, its LLM safety substrate has two real defects
that dormancy currently masks (I-1, I-3), and one of its 18 proofs asserts
less than it announces (I-2). Fix the three Important findings and the
security pass, and this is a deployable single-operator radar; until then it
is exactly what it says it is — a proven local prototype with the paid
integrations pre-built and switched off.
