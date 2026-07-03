# Archlight Upgrade — Session Handoff

Written: 2026-07-03. Purpose: let a fresh session resume the in-place upgrade of
Archlight autonomously, with full context and the exact resume procedure.

---

## 0. TL;DR / where things stand

- **Project:** Archlight — an autonomous public intelligence radar. Standalone
  app (NOT linked to Pygar). Next.js 15 (App Router) + TypeScript + Prisma/SQLite
  + Vitest + Tailwind 4. Deterministic rule-based engine (no LLM in the core).
- **Location:** `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight`
  (git `main`, remote `https://github.com/murrayhc/archlight`, private).
- **Current HEAD:** `825cdce`. Working tree clean, **everything pushed**
  (origin/main == HEAD). **168 tests green.** typecheck + build clean.
- **What's happening:** executing a large in-place upgrade from
  `~/Downloads/existing_app_upgrade_intelligence_radar_prompt.md` (15 stages).
  Done through the equivalent of that doc's Stages 0–10. Remaining: doc Stage 8
  (market data, my "Phase 3e"), Stages 11–12 (watch/portfolio/replay, "3f"),
  Stages 14–15 (final proof + audit). Plus one interrupted review to re-run.
- **Why the session ended:** the Phase 3d *whole-phase* review subagent hit the
  **account session/agent quota** ("resets 5:10am Europe/London"). The
  subagent-driven build loop (implementer + reviewer per task) is what's
  rate-limited. Code is safe and pushed.
- **Owner:** Murray Hewitt-Coleman — non-coder operator, wants plain-English
  summaries, runs architecture decisions through Claude. Instruction in force:
  **"Proceed with all phases in order. Do not ask permission. Do not ask for
  sign-off. Proceed to completion."** So: resume and keep building, don't
  re-prompt him for go-aheads.

---

## 1. THE FIRST THING TO DO ON RESUME

1. Read the SDD ledger — it is the recovery map:
   `cat .superpowers/sdd/progress.md` (git-ignored scratch). It lists every task,
   its commits, and review status. Trust it + `git log` over any recollection.
2. Confirm state: `git -C ~/Desktop/Websites/Archlight status -sb` (should be
   clean, up to date with origin/main at 825cdce) and `npm test` (168 pass).
3. **Re-run the interrupted Phase 3d whole-phase review** (it never completed).
   Range `7e0e56e..825cdce`. Then continue to Phase 3e. (Phase 3d's three tasks
   were each individually reviewed AND approved, including a full LLM-safety
   audit, so 3d is solid — the whole-phase pass is the only missing gate.)

---

## 2. Build methodology (how every phase has been built — keep doing this)

Superpowers **subagent-driven development**. Per phase:

1. **Design spec** → `docs/superpowers/specs/YYYY-MM-DD-phase-<x>-...-design.md`
   (committed). Then **implementation plan** →
   `docs/superpowers/plans/YYYY-MM-DD-phase-<x>-...md` (committed): tasks with
   full/precise code, binding formulas/enums verbatim, exact test assertions.
2. For each task: extract a brief, dispatch a fresh **implementer** subagent,
   then an independent **reviewer** subagent. Fix findings. Log to the ledger.
3. **My own browser verification** for UI phases (see gotchas — this has caught
   crashes that every server-side check passed).
4. A **whole-phase final review** on the most capable model (fable) at the end,
   fix its findings, push, update memory + roadmap.

**The exact commands (SDD scripts live at**
`/Users/murrayhewitt-coleman/.claude/plugins/cache/claude-plugins-official/superpowers/6.0.3/skills/subagent-driven-development/scripts/`**):**
- Task brief: `./scripts/task-brief <PLAN_FILE> <N>` → prints a brief file path.
  Then `mv .superpowers/sdd/task-N-brief.md .superpowers/sdd/task-3X-N-brief.md`
  (rename with the phase prefix — briefs collide across phases otherwise).
- Review package: `./scripts/review-package <BASE_SHA> <HEAD_SHA>` → prints a
  diff-file path to hand the reviewer. BASE = the commit before the task's
  implementer ran (NOT `HEAD~1` for multi-commit tasks).
- Dispatch implementers on `general-purpose`; use **haiku** for near-verbatim
  transcription tasks (migrations, guard code), **sonnet** for logic/UI/services,
  **fable** for the whole-phase final review. ALWAYS pass `model:` explicitly.
- Tell every implementer/reviewer to **do the work directly, NOT spawn/delegate**
  (one implementer once wrongly delegated; caught by review).
- Reviewer prompt template + implementer template are in the skill dir. Reviews
  should include an **adversarial/safety pass** for safety-critical tasks (advice
  guard, LLM validation) and **hand-verify formulas** for scoring tasks.

**Ledger discipline:** after each task's review comes back clean, append one line:
`3X Task N: complete (commits <base7>..<head7>, review clean; <notes>)` and roll
up minors. This is what survives compaction.

---

## 3. Phases completed (all reviewed, pushed)

| Phase | What | Verdict | Tests |
|---|---|---|---|
| **Spine** (2026-07-02) | Full scan pipeline: collect→parse→claims→signals→clusters→scored events→risk/opp→dashboard feed→data gaps/triggers. `runFullScan`, `/`, `/events/[id]`, `/admin/sources`. | PASS proof | 60 |
| **2a Living Radar** | Event lifecycle across scans (same-key clusters merge, RISING, sticky statuses); warnings vs errors split; per-source SourceHealth; `/scans` audit page. | Signed off | 74 |
| **3a Opportunity** (doc St.2–3) | RevenueLens, OpportunityCard, StrategicPositioningExample; **hardened financial-advice guard (fails closed)**; commercial Opportunity Radar; `/opportunities/[id]` with mandatory non-advisory disclaimer. | Signed off | 94 |
| **3b Evidence Graph** (doc St.4–5) | GraphNode/GraphEdge projection (deduped refType+refId); GraphBuilderService synced in scans; `/api/graph/*`; six-degree **EvidenceArc** BFS + true-potential scoring + chain classification; event-page arc view + `/graph` stats. | Signed off | 120 |
| **3c 3D Graph + Search** (doc St.6–7,13) | Interactive 3D/2D force-graph (`react-force-graph-2d`/`-3d`), GraphExplorer (filters/detail/fallback), manual interrogation (`/interrogate`, query classifier), additive dashboard restructure. | Signed off | 135 |
| **3d LLM Layer + Playbooks** (doc St.9–10) | **Dormant** multi-model LLM orchestration (Claude-native, no key → deterministic), fail-closed validation (schema+advice+grounding), audited runs (promptHash only), deterministic playbooks with optional validated LLM upgrade, `/admin/llm` audit page. | 3 tasks approved; **whole-phase review interrupted — re-run** | 168 |

Design spec + plan for every phase are in `docs/superpowers/`. Product docs:
`docs/{existing-architecture-map, autonomous-pipeline-proof, opportunity-conversion-engine, strategic-positioning-rules, living-intelligence-graph, evidence-arc-engine, graph-ui-and-interrogation, multi-model-llm-routing, roadmap}.md`.

---

## 4. WHAT'S NEXT — remaining work, in order

Owner sequencing decision: **deterministic phases first; paid providers deferred
behind graceful "not configured" states.** Roadmap in `docs/roadmap.md`.
Upgrade-doc→my-phase mapping in `docs/existing-architecture-map.md` §8.

0. **(pending) Re-run the Phase 3d whole-phase review** (`7e0e56e..825cdce`,
   fable). Fix anything Important, push.

1. **Phase 3e — Market/Commodity/Instrument data adapters (doc Stage 8).**
   Interface `MarketDataProvider` (searchInstrument/getQuote/getHistoricalBars/
   getCompanyProfile/getCommodityContext/getProviderMetadata). Models
   `InstrumentProfile, CommodityProfile, MarketSearchQuery, MarketSearchResult`.
   **Build a NullProvider + clean "market data provider not configured" empty
   state now** (real provider is owner-funded later; provider via env vars only).
   Wire into the existing interrogation `marketContextAvailable:false` path
   (ticker/commodity/instrument queries already return that + the non-advisory
   disclaimer — 3e populates real data when configured). DO NOT scrape market
   pages; provider APIs only. Instrument output = market CONTEXT only (no
   buy/sell/hold/target-price — the advice guard applies). Populate the
   COMMODITY/INSTRUMENT graph node types (defined in enums, unpopulated today).
   Deterministic + dormant → fully buildable/testable with no key.

2. **Phase 3f — Watch Markets, Opportunity Portfolio, Graph Replay/Momentum
   (doc Stages 11–12).** Models `WatchMarket, OpportunityPortfolioItem,
   GraphSnapshot, GraphEvent`. Watch a sector/theme/region/opportunity-category;
   portfolio statuses (NEW/INVESTIGATING/QUALIFIED/REJECTED/ACTING/WON/LOST/
   WATCHING); graph replay ("first source → current state"), momentum score,
   confidence decay, freshness ageing, stale-fade. Wire the "Save to portfolio"
   stub from 3d playbooks. Also the RevenueLens CRUD UI lands here (unblocks the
   `lensValueSignal`/averageDealSize weighting deferred from 3a). Deterministic.

3. **Final delivery — doc Stages 14–15.** `docs/final-upgrade-proof.md` (run the
   full workflow, real row counts, all 18 required proof tests from Stage 14
   green) and `docs/final-system-audit.md` (direct, unsoftened audit). Verify the
   Stage 15 outcome list. Then a final whole-branch review of the entire upgrade.

Each phase: spec → plan → subagent build with review gates → my browser
verification (for UI) → whole-phase review → push. Right-size to ~3–4 tasks/phase.

---

## 5. Hard-won gotchas (READ before touching these areas)

- **Browser-verify UI phases yourself with real rendering.** In 3c, `/interrogate`
  returned HTTP 200 with correct SSR HTML, unit tests passed, AND the code review
  passed — but the page **crashed on hydration in the browser**. Server checks do
  NOT catch client crashes. Use the CDP console-capture script at
  `<scratchpad>/cdp-console.mjs` (Node 24 has a built-in WebSocket): it drives
  headless Chrome via DevTools Protocol and dumps `Runtime.exceptionThrown` +
  console errors. Two real root causes there: (1) a component branching on
  `typeof window` for its render → server/client HTML mismatch → hydration crash
  (fix: gate render on a `useState(false)`+`useEffect(setMounted(true))` mount
  flag so server and first client render are identical); (2) the umbrella
  `react-force-graph` package bundles VR/AR variants that reference a global
  `AFRAME` at module load → `ReferenceError` (fix: import the standalone
  `react-force-graph-2d`/`-3d` packages instead). Also: a paused force-graph needs
  `warmupTicks > 0` or nodes never get positioned and the renderer crashes.
- **Headless screenshots can't render WebGL** (no GPU) — the 3D canvas shows black
  and logs a benign "WebGL context could not be created". That's expected, not a
  bug. The 2D/data/structure paths ARE verifiable; state the 3D-pixel boundary
  honestly. Every page also logs a benign favicon 404 (no favicon file) — ignore.
- **DATABASE_URL trap:** Prisma resolves `file:` paths relative to the schema dir
  (`prisma/`). Do NOT `export DATABASE_URL="file:./prisma/dev.db"` — that resolves
  to `prisma/prisma/dev.db` (a nested phantom DB), while `sqlite3 prisma/dev.db`
  reads the real one → confusing mismatches. Just let `.env`
  (`file:./dev.db` → `prisma/dev.db`) drive it; don't export.
- **Non-advisory guard is safety-critical and adversarially tested.**
  `src/server/safety/advice-language.ts` — fails closed; every generated
  opportunity/positioning/playbook field passes `assertNoAdviceLanguage` before
  persist. It's been hardened against evasions (strong buy / price target /
  "20% returns" / load-up / moon). Keep new generated text guard-clean; never
  weaken the guard to make output pass — reword the template.
- **LLM layer is DORMANT by design.** No `ANTHROPIC_API_KEY` → `getActiveProvider`
  returns null → everything deterministic → `runLLMTask` returns
  SKIPPED_NO_PROVIDER. Tests use an injected FakeProvider (no real key/call).
  Fail-closed: text is returned ONLY when validation is PASSED. NEVER log the raw
  prompt or key (only `sha256` promptHash + char-count summaries); rejected output
  is redacted in the audit row. `@anthropic-ai/sdk` is NOT a dependency — the
  adapter uses a guarded lazy `import()` that degrades to "not configured". To
  ACTIVATE later: set `ANTHROPIC_API_KEY`, `npm i @anthropic-ai/sdk`, enable a
  config row (see `docs/multi-model-llm-routing.md`).
- **Prisma migrate is AI-guarded.** The test-DB reset uses
  `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` — the owner's consent is already
  recorded in `tests/global-setup.ts` (scoped to the disposable `prisma/test.db`).
  Don't re-ask, don't widen its scope. If `prisma migrate dev` AI-blocks in a
  subagent, that's a genuine halt — report it.
- **Port 3000 on this Mac is squatted** by an unrelated node process. Run dev
  servers with `PORT=321x` (any free port), no DATABASE_URL export. Kill your
  dev server after verifying.
- **The graph is a projection** — never duplicate the underlying records;
  `GraphNode` unique on (refType,refId), `GraphEdge` on the (src,tgt,type) triple;
  upsert. Never fabricate contradiction/entity nodes without a real record.
- **Prisma client accessor casing:** `LLMRun` → `prisma.lLMRun`,
  `LLMOutputValidation` → `prisma.lLMOutputValidation`,
  `LLMProviderConfig` → `prisma.lLMProviderConfig` (lowercase-first → double-L
  becomes `lL`).

---

## 6. Owner decisions locked in
- Deterministic phases first; paid providers (LLM, market data) built dormant
  behind clean "not configured" states, activated later by the owner.
- LLM layer: Claude-native default, built dormant. (Model IDs in the seeded
  configs are placeholders like `claude-creative`; wire real IDs on activation.)
- All money/keys deferred; nothing needs owner spend to keep building.
- Non-advisory is a hard rule everywhere (no buy/sell/hold/target-price/
  guaranteed); GBP for currency; en-GB dates/spelling.

## 7. Standing constraints (every phase)
Additive only (never regress a prior route/section); string enums in
`src/shared/enums.ts`; JSON as `*Json` String columns; no `*Json` leak in APIs;
files < 500 lines; no external fonts/CDN/images (bundled npm deps are fine); full
suite green + typecheck + build clean before every commit; commit messages scoped.

## 8. Follow-up backlog (deferred, non-blocking — fold in where a phase touches them)
- 3e/3f-adjacent: RevenueLens CRUD UI (unblocks `lensValueSignal`/averageDealSize
  weighting, currently hardcoded 0.5); STABLE/DECLINING opportunity statuses unused.
- Graph/perf (revisit at Postgres/scale): push `getLiveGraph` cap into SQL
  (currently in-memory sort + unbounded findMany); cap the interrogation subgraph;
  `getEventArc` re-runs full BFS on every GET (no cache; also writes on GET);
  add `@@unique([rootNodeId])` + a transaction to arc delete+recreate.
- Dead code: remove `getNodeDetail` (unwired) + a dead `getGraphForRender`
  re-export in interrogate/service; dedupe `toRenderNode`.
- UI polish: EVENT double-click → `/events/[id]` (currently a link); restore the
  stats tiles on `/graph`; reuse `SearchBar` on the `/graph` header; render arc
  `sourceCount`; node-detail fetch cancellation guard.
- LLM: wire router→provider model selection (adapter currently hardcodes a model).
- Security pass (own phase, doc Stage 21-equivalent, deferred): RSS-link scheme
  allowlist + fetch size cap; the scan/interrogate endpoints are unauthenticated
  (app is LOCAL-ONLY until this pass — README says do not deploy exposed).
- Misc: `package.json#prisma` → `prisma.config.ts` (Prisma deprecation warning).

---

## 9. SEPARATE side-fix this session (NOT Archlight) — the Pygar preview server

The session's primary cwd is the **Pygar** repo
(`/Users/murrayhewitt-coleman/Projects/replit-pygar`), a different project. The
`preview_start` tool kept failing with `ERR_PNPM_UNSUPPORTED_ENGINE` (pnpm 11.7.0
vs the project's pinned `engines.pnpm: 10.26.1`). Root cause: **three `pnpm`
binaries on PATH** — a corepack shim at `/usr/local/bin/pnpm` (10.26.1) plus two
nvm ones (11.7.0); the preview process picked up an 11.7.0. **Fixes applied to
pygar** (uncommitted working-tree changes there — NOT pushed; up to Murray whether
to keep): added `"packageManager": "pnpm@10.26.1"` to `package.json`; changed
`.claude/launch.json` `runtimeExecutable` from `pnpm` to **`corepack`** (args
`["pnpm","--filter","@workspace/pygar","run","dev"]`) so it always honours the
pinned version regardless of PATH, plus `autoPort:true`. Preview now runs on
port 3000 and the homepage renders. This is unrelated to the Archlight upgrade.

---

## 10. Quick resume checklist
- [ ] Read `.superpowers/sdd/progress.md` + `git log`. Confirm HEAD 825cdce, clean, pushed, 168 tests.
- [ ] Re-run Phase 3d whole-phase review (7e0e56e..825cdce); fix Important; push.
- [ ] Phase 3e: spec → plan → build (3–4 tasks, dormant market provider) → review → verify → push. Update roadmap + memory.
- [ ] Phase 3f: watch/portfolio/replay + RevenueLens CRUD. Same loop.
- [ ] Final delivery: Stage 14 proof (18 tests) + Stage 15 audit + whole-branch review. Push.
- [ ] Keep going without asking permission (owner's standing instruction).
