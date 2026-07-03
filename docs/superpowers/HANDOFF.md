# Archlight — Project Handoff & State (upgrade COMPLETE)

Written: 2026-07-03. Rewrites the earlier mid-upgrade handoff. Purpose: let a
fresh session act with full knowledge of a finished system — resume, extend,
activate the dormant layers, or start the deferred security pass, autonomously.

---

## 0. TL;DR — where things stand

- **Project:** Archlight — an autonomous public-intelligence radar. Standalone
  app, **NOT linked to Pygar** (Pygar's repo rules / parity do not apply).
  Next.js 15 (App Router) + TypeScript + Prisma/**SQLite** + Vitest + Tailwind 4.
  **Deterministic, rule-based engine** — no LLM in the core path (the LLM layer
  is an optional, dormant enrichment).
- **Location:** `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight`
  (git `main`, remote `https://github.com/murrayhc/archlight`, private).
- **Current HEAD:** `52b7df5`. Working tree **clean**, **origin/main == HEAD**
  (Mac + GitHub in parity; Replit resyncs via `git fetch && git reset --hard
  origin/main`). **342 tests green** (44 files). `npm run typecheck` + `next
  build` clean.
- **Status: THE FULL 15-STAGE IN-PLACE UPGRADE IS COMPLETE.** Spine + Phase 2a
  (base) → 3a → 3b → 3c → 3d → 3e → 3f → Final Delivery. Built via superpowers
  subagent-driven development, every phase spec→plan→build→review→verify→push.
- **Two layers ship DORMANT by design** (activate by env, owner-funded later):
  the multi-model LLM layer and the live market-data layer. No key → clean
  "not configured" state; nothing fabricated.
- **The app is LOCAL-ONLY.** Scan/interrogate + all mutating routes are
  UNAUTHENTICATED; RSS fetching is not hardened. A dedicated **security pass**
  is the one true production blocker — see §6. Do NOT deploy exposed.
- **Owner:** Murray Hewitt-Coleman — non-coder operator, wants plain-English
  summaries, runs architecture decisions through Claude. Standing instruction
  through this build: **"Proceed through all phases to completion. Do not ask
  permission."** (There is no in-flight phase now; the upgrade is done.)

---

## 1. FIRST THINGS TO DO ON RESUME

1. Read the SDD ledger — the recovery map: `cat .superpowers/sdd/progress.md`
   (git-ignored local scratch). It has the full task-by-task history, every
   commit, review verdicts, and the deferred-minor rollups. Trust it + `git log`
   over any recollection.
2. Confirm state: `git -C ~/Desktop/Websites/Archlight status -sb` (clean,
   up-to-date with origin at `52b7df5`) and `npm test` (342 pass).
3. Read `docs/final-system-audit.md` (the direct Stage-15 audit — what works,
   what's fragile, what blocks production) and `docs/roadmap.md` (Done +
   Deferred). These define the honest state and the next-work menu.
4. Decide the goal for the new session (nothing is half-done):
   - **Activate the LLM layer** → §5.
   - **Activate market data** → §5.
   - **Security-hardening pass** (the production blocker) → §6.
   - **A deferred minor / new feature** → §6 backlog, and use the build
     methodology in §7.

---

## 2. What the app is (product + stack)

An autonomous radar that scans public sources and turns them into a living
intelligence graph, a commercial opportunity engine, and (dormant) multi-model
interpretation — WITHOUT requiring manual company upload. Deterministic and
explainable by design; SQLite-local; rule-based scoring.

The autonomous pipeline (per scan): collect → parse → extract claims → derive
signals → cluster → score event candidates → classify risk/opportunity →
dashboard feed → data gaps + trigger conditions → commercial opportunity cards →
strategic positioning examples → project into the graph (nodes/edges) →
six-degree evidence arcs → record graph-event timeline + momentum. Manual
interrogation lets a user query companies/commodities/instruments/tickers/
sectors/themes against the graph.

---

## 3. The system, stage by stage (all delivered)

Upgrade-doc stage → phase → what shipped (design specs in
`docs/superpowers/specs/`, plans in `docs/superpowers/plans/`):

| Stage(s) | Phase | Delivered |
|---|---|---|
| — | **Spine** | Full scan pipeline; `/` dashboard, `/events/[id]`, `/admin/sources`. `runFullScan`. |
| — | **2a Living Radar** | Event lifecycle across scans (merge/RISING/sticky statuses), warnings-vs-errors split, per-source SourceHealth, `/scans`. |
| 2–3 | **3a Opportunity + Positioning** | RevenueLens, OpportunityCard, StrategicPositioningExample; the **non-advisory guard** (`src/server/safety/advice-language.ts`, fail-closed, adversarially tested); commercial Opportunity Radar; `/opportunities/[id]` with mandatory disclaimer. |
| 4–5 | **3b Evidence Graph + Arcs** | GraphNode/GraphEdge projection (dedupe on refType+refId); six-degree **EvidenceArc** BFS + true-potential scoring + chain classification; `/api/graph/*`; `/graph` stats. |
| 6–7,13 | **3c 3D Graph + Interrogation** | Interactive 3D/2D force-graph (`react-force-graph-2d`/`-3d` standalone), GraphExplorer, `/interrogate` + query classifier, additive dashboard restructure. |
| 9–10 | **3d dormant LLM + Playbooks** | Multi-model LLM orchestration (Claude-native, dormant), fail-closed validation (schema+advice+grounding), audited runs (promptHash only), deterministic playbooks with optional validated LLM upgrade, `/admin/llm`. |
| 8 | **3e dormant Market Data** | `MarketDataProvider` + `NullProvider` + env-gated resolution, boundary Zod validation, COMMODITY/INSTRUMENT graph nodes, `/interrogate` market panel, `/admin/market`. |
| 11–13 | **3f Watch/Portfolio/Replay + Lens CRUD** | WatchMarket, OpportunityPortfolioItem, GraphSnapshot, GraphEvent; watch/portfolio services + APIs; graph-event timeline + momentum/confidence-decay + replay; RevenueLens CRUD + the `averageDealSize` weighting; `/lenses` `/watch` `/portfolio` + replay panel; Stage-13 additive dashboard. |
| 14–15 | **Final Delivery** | Consolidated **18-point proof suite** (`tests/proof/`), all **9 required docs**, minor-hardening sweep, direct **Stage-15 audit**, audit-fix wave. |

---

## 4. Where things live (map)

**`src/server/`** (the engine):
- `pipeline/` (13 files) — the scan: `orchestrator.ts` (`runFullScan`; the graph
  sync + `recordGraphEvents` hook are ~lines 135–145), collect/parse/claims/
  signals/cluster/events/classify/gaps/opportunity/positioning/health.
- `graph/` — `builder.ts` (node+edge projection, `upsertNode`/`upsertEdge`/
  `freshness`, `syncGraphForEvents`/`rebuildGraph`; 694 lines — do NOT grow it),
  `arc.ts` (`buildArc` six-degree BFS), `timeline.ts` (`recordGraphEvents`,
  `getEventReplay`, snapshots), `momentum.ts` (pure scorers), `types.ts`.
- `market/` — `provider.ts` (`MarketDataProvider`, `NullProvider`,
  `getActiveMarketProvider`, empty `ADAPTER_REGISTRY`), `service.ts`, `validate.ts`
  (Zod boundary), `graph.ts` (COMMODITY/INSTRUMENT projection), `graph-evidence.ts`, `types.ts`.
- `llm/` — `provider.ts` (NullProvider + guarded lazy Anthropic adapter,
  `getActiveProvider`, `DEFAULT_ANTHROPIC_MODEL`), `router.ts` (`routeTask`),
  `validate.ts` (`validateLLMOutput`, `extraCheckers`), `run.ts` (`runLLMTask`),
  `types.ts`.
- `playbook/` — `service.ts` (`generatePlaybook` + guarded LLM upgrade), `templates.ts`.
- `watch/`, `portfolio/`, `lens/` — the 3f services (+ `lensValueSignal` in lens).
- `interrogate/` — `service.ts` (`interrogate`, market wiring), `classify.ts`.
- `safety/advice-language.ts` — the fail-closed non-advisory guard (`assertNoAdviceLanguage`, `findAdviceLanguage`).
- `services/` — read/serialise layer (dashboard, events, graph, opportunities, playbook, scans).
- `db.ts`, `seed.ts` (`runSeed`).

**`src/app/`** — pages: `/` (dashboard), `/events/[id]`, `/opportunities/[id]`,
`/graph`, `/interrogate`, `/scans`, `/lenses`, `/watch`, `/portfolio`,
`/admin/{sources,llm,market}`. API routes under `src/app/api/` (dashboard, events,
graph/*, interrogate, scans/*, sources, opportunities/*, lenses/*, watch/*,
portfolio/*, llm/status, market/{status,search}).

**`prisma/schema.prisma`** — all models (SQLite; `*Json` String columns; string
enums live in `src/shared/enums.ts`). **`tests/`** — 44 files incl. `tests/proof/`
(the 18-point suite) and `tests/e2e-proof.test.ts`.

**`docs/`** (15 md) — the 9 Stage-14 required + phase engine docs. Key ones:
`final-upgrade-proof.md` (proof + row counts), `final-system-audit.md` (the audit),
`market-context-safety.md`, `multi-model-llm-routing.md`, `roadmap.md`.

---

## 5. The dormant layers — how to ACTIVATE (owner-funded, later)

Both are built dormant and fully tested via injected fakes (no key/spend). With
no key: clean "not configured" everywhere, nothing invented.

**LLM layer** (Claude-native): with no `ANTHROPIC_API_KEY`, `getActiveProvider()`
returns null → `runLLMTask` returns `SKIPPED_NO_PROVIDER` → deterministic
everywhere. To activate: (1) set `ANTHROPIC_API_KEY`; (2) `npm i
@anthropic-ai/sdk` (it is NOT a dependency — a guarded lazy `import()` degrades
to not-configured); (3) enable an `LLMProviderConfig` row and set a REAL model id
(seeded `modelName`s like `claude-creative` are PLACEHOLDERS; `provider.ts`
defaults to `DEFAULT_ANTHROPIC_MODEL`); (4) **ensure ≥1 enabled config supports
each task type you use** — `routeTask` PREFERS but does not REQUIRE `enabled`, so
a sole disabled supporter would still be selected. See `docs/multi-model-llm-routing.md`.
The output guard is fail-closed on BOTH the raw provider text AND the parsed
fields (a JSON-escape bypass was found + closed in the final audit — keep it).

**Market-data layer:** with no `MARKET_DATA_API_KEY`, `getActiveMarketProvider()`
returns null → `NOT_CONFIGURED`, no fabricated price. To activate: register a real
adapter in `ADAPTER_REGISTRY` (`src/server/market/provider.ts`) keyed by provider
name, then set `MARKET_DATA_PROVIDER` + `MARKET_DATA_API_KEY`. **Pre-activation
gate** (in `docs/market-data-adapters.md` + `market-context-safety.md`):
provider-error degradation on `/interrogate` (must not 500), symbol extraction for
`SHARE_PRICE`/`TICKER` queries, and a seed-then-fetch-live integration test.
Market output stays CONTEXT ONLY — the advice guard runs before any provider data
is persisted (guard-before-persist). Providers only, never scrape.

---

## 6. What's next — the deferred backlog (nothing blocking; all documented)

**THE production blocker — Security-hardening pass (own phase):**
- Auth on the scan/interrogate endpoints + all mutating routes (currently
  unauthenticated — app is LOCAL-ONLY until this).
- RSS-link scheme allowlist (http/https only) + fetch size cap + content-type
  check (currently unhardened; feed URLs render as raw hrefs).
- Then it could be considered for exposed deployment. Everything else below is
  optional polish.

**Deferred moderates (from `docs/final-system-audit.md` — none are Critical):**
- LLM grounding is one-substring-deep (id-echo) — a claim-text overlap check
  would strengthen it (only relevant once LLM is active).
- `getEventArc` re-runs full BFS on every GET and writes-on-GET; add caching +
  `@@unique([rootNodeId])` + a transaction on arc delete/recreate.
- Full-table `findMany` scans in market/watch resolution (fine at fixture scale;
  push into SQL at Postgres/scale).
- `builder.ts` ↔ `market/graph.ts` circular import (runtime-safe; resolve if the
  686→ builder is ever decomposed — the market projection duplicates a tiny
  `findNodeId`/`safeUpsertEdge` because builder doesn't export them).
- Replay panel renders GraphEvent counts, not the stored GraphSnapshot contents.
- `estimatedValue` not in the `/portfolio` inline-edit form (service supports it).
- Dead/dedupe nits: `getNodeDetail` unwired; `renderExecutiveBrief`/
  `renderOutreachDraft` implemented+tested but unsurfaced.

**Bigger optional:** Postgres/Supabase migration (schema uses string-enum columns
specifically to make this mechanical); worker/queue for the inline scan
orchestrator (already isolated from Next.js).

---

## 7. Build methodology (how every phase was built — keep doing this)

Superpowers **subagent-driven development**. Per phase:
1. **Design spec** → `docs/superpowers/specs/YYYY-MM-DD-phase-<x>-...-design.md`
   (committed). Then **implementation plan** → `docs/superpowers/plans/...md`
   (committed): `### Task N:` headers, full/precise code, binding enums/formulas
   verbatim, exact test assertions.
2. Per task: `scripts/task-brief PLAN N` → brief file (rename with a phase prefix,
   e.g. `task-3f-2-brief.md`); dispatch a fresh **implementer** subagent, then an
   independent **reviewer** subagent (`scripts/review-package BASE HEAD` → diff
   file; BASE = commit before the implementer ran, never `HEAD~1`). Fix findings.
   Log one line to the ledger per clean task.
3. **Controller CDP browser-verify** for UI phases (see §8) — server-side checks
   miss hydration crashes.
4. **Whole-phase review on the most capable model (`fable`)** at phase end; fix
   findings; push; update memory + roadmap.
- Scripts dir: `/Users/murrayhewitt-coleman/.claude/plugins/cache/claude-plugins-official/superpowers/6.0.3/skills/subagent-driven-development/scripts/`.
- Model selection: **haiku** for near-verbatim transcription (migrations); **sonnet**
  for logic/UI/services + reviews; **fable** for whole-phase/final reviews + audits.
  ALWAYS pass `model:` explicitly. Tell every subagent to **work directly, NOT
  delegate**, and to operate in the Archlight dir (subagents default to the
  session cwd, which may be a different project).
- File-handoff discipline: hand briefs/reports/diffs as FILES; keep dispatch
  prompts lean (they persist in your context). Reviews returned real value — an
  independent whole-phase/audit pass caught defects (an audit-log honesty gap in
  3d, a fixture-label + guard-order bug in 3e, a JSON-escape advice bypass in the
  final audit) that per-task reviews missed.

---

## 8. Hard-won gotchas (READ before touching these areas)

- **Browser-verify UI yourself with real rendering.** SSR 200 + unit tests +
  code review can ALL pass while the page crashes on hydration (happened in 3c).
  Use the CDP console-capture script at `<scratchpad>/cdp-console.mjs` (Node 24
  has a built-in WebSocket; drives headless Chrome via DevTools Protocol, dumps
  `Runtime.exceptionThrown` + console errors). **nvm quirk:** inside a bash
  `for`-loop the `node` command isn't on PATH — resolve `NODE=$(which node)` and
  call `"$NODE"`. Run the dev server on **`PORT=3214`** (`PORT=3214 npm run dev`,
  no DATABASE_URL export) — **port 3000 is squatted** by an unrelated process.
  Kill the dev server after. The `Claude_Preview`/preview_* MCP tools are bound
  to the session's OTHER project (Pygar) and cannot target Archlight — use the
  CDP script.
- **3c force-graph rules:** gate ForceGraph render on a `useState(false)`+
  `useEffect(setMounted(true))` mount flag (NOT `typeof window` — causes a
  hydration mismatch); import the **standalone** `react-force-graph-2d`/`-3d`
  (the umbrella `react-force-graph` bundles VR/AR → `AFRAME` ReferenceError); a
  paused graph needs `warmupTicks > 0`. New client components: seed `useState`
  from server props, no `typeof window` in render.
- **Non-advisory guard is safety-critical + fail-closed.**
  `src/server/safety/advice-language.ts`; every generated opportunity/positioning/
  playbook/market field passes `assertNoAdviceLanguage` before persist. Adversarially
  hardened (strong buy / price target / "20% returns" / guaranteed). The LLM
  playbook path guards BOTH raw provider text AND the JSON-**parsed** output (a
  `buy`→"buy" escape bypass was found + fixed). Never weaken the guard to
  make output pass — reword the template.
- **DATABASE_URL trap:** Prisma resolves `file:` relative to `prisma/`. Do NOT
  `export DATABASE_URL="file:./prisma/dev.db"` (→ nested phantom DB). Let `.env`
  (`file:./dev.db`) drive it; `sqlite3 prisma/dev.db` reads the real one.
- **Prisma migrate is AI-guarded** (`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`,
  owner consent already in `tests/global-setup.ts`, scoped to `prisma/test.db`).
  `prisma migrate dev` ran clean for every phase; if it AI-blocks in a subagent
  that's a genuine halt — report it, don't widen scope.
- **SQLite has no case-insensitive `mode`** — Prisma `mode:'insensitive'` throws.
  Use the fetch-then-filter-in-JS convention (`findMatchingNodes` in
  `interrogate/service.ts`) for case-insensitive matching.
- **The graph is a projection** — never duplicate underlying records; `GraphNode`
  unique on (refType,refId), `GraphEdge` on (src,tgt,type). Upsert. `GraphEvent`
  is a plain-String-`graphNodeId` timeline (NOT an FK) so it survives re-projection.
- **P2002 pattern:** unique-name POST/PATCH catch `Prisma.PrismaClientKnownRequestError
  && code==='P2002'` → 409, `throw err` else (see `collect.ts` + the watch/lenses
  routes). Don't use a bare catch-all.
- **Timeline invariants:** `recordGraphEvents` is hooked NON-FATALLY after the
  graph sync (per-event try/catch, never throws out), records ONLY real diffs
  (each change event's metadata is the next diff baseline), freshness/decay
  reference SUPPORTING events only (POSITIVE ∪ FIRST_DETECTED).
- **Headless screenshots can't render WebGL** (no GPU) — the 3D canvas shows black
  + logs a benign "WebGL context could not be created"; the 2D/data paths ARE
  verifiable. Every page logs a benign favicon 404. Both are expected, not bugs.
- **Prisma client accessor casing:** double-letter models lowercase-first →
  `prisma.lLMRun`, `lLMProviderConfig`, `lLMOutputValidation`; everything else is
  normal camelCase (`prisma.watchMarket`, `opportunityPortfolioItem`, etc.).

---

## 9. Owner decisions + standing constraints
- Deterministic phases first; paid providers (LLM, market data) built DORMANT
  behind clean "not configured" states, activated later by the owner. Nothing
  needed owner spend to build.
- Non-advisory is a hard rule everywhere (no buy/sell/hold/target-price/
  guaranteed); GBP for currency; en-GB dates/spelling.
- Additive only (never regress a prior route/section); string enums in
  `src/shared/enums.ts`; JSON as `*Json` String columns (no `*Json` leak in APIs);
  files < 500 lines; full suite + typecheck + build clean before every commit;
  scoped commit messages.
- **Three-location parity is a hard prerequisite:** Mac (`~/Desktop/Websites/
  Archlight`), GitHub `origin/main`, Replit (`~/workspace`) on the SAME SHA before
  new work. Commit to origin/main; Replit resyncs via `git fetch && git reset
  --hard origin/main`.
- No parallel architecture / second competing dashboard — this is an in-place
  upgrade of one app.

## 10. Quick resume checklist
- [ ] Read `.superpowers/sdd/progress.md` + `git log`; confirm HEAD `52b7df5`,
      clean, pushed, 342 tests, typecheck+build clean.
- [ ] Read `docs/final-system-audit.md` + `docs/roadmap.md` for the honest state.
- [ ] Ensure three-location parity (Replit `git fetch && reset --hard`).
- [ ] Pick the goal: activate LLM (§5) / activate market (§5) / **security pass
      (§6, the production blocker)** / a deferred minor.
- [ ] For any multi-file work: spec → plan → subagent build with review gates →
      CDP browser-verify (UI) → whole-phase review (fable) → push (§7).
- [ ] Update the ledger + memory + roadmap as you go.
