# Fork Handoff — Archlight claude-fable-5 deep-intelligence upgrade

**Date:** 2026-07-09 · **Author:** claude-fable-5 session · **Repo:** `github.com/murrayhc/archlight`
**HEAD at handoff:** `2d48cc8` (local == `origin/main`, in parity)
**State:** 573/573 tests green · typecheck clean · `next build` clean · deterministic-scan invariant intact.

This is a self-contained handoff so a fresh session can continue with zero re-derivation.

---

## 0. READ THIS FIRST — operating rules (they caught real problems this session)

- **Workspace is `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight New/Archlight`** (note the SPACE in "Archlight New" — always quote paths). This is a **fresh clone**, chosen over the older polluted `~/Desktop/Websites/Archlight` tree.
- **NEVER route Archlight commands/builds/writes to `~/Projects/replit-pygar`** (the session's primary cwd is Pygar; cwd can silently reset). Anchor every Bash command with an explicit `cd "<absolute Archlight path>" && …`.
- **DO NOT use the browser preview MCP tools (`preview_start` etc.) for Archlight.** They anchor `.claude/launch.json` to the Pygar session root and will start the **Pygar** dev server, not Archlight's. This happened this session — verify UI via `next build` (routes compile-check their component trees) + vitest instead. If a live browser is truly needed, start the dev server manually via `cd "<archlight>" && npm run dev`. (See the memory `archlight-preview-anchors-to-pygar`.)
- **Prisma CLI needs `DATABASE_URL` inline.** `.env` isn't picked up by the CLI in this setup; prefix migrations with `DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --name <name>`.
- **Three-location parity does NOT apply here** — Archlight is LOCAL-ONLY on `github murrayhc/archlight`, NO Replit (unlike Pygar). Just commit + push to `origin/main`.
- Owner: Murray Hewitt-Coleman, non-coder operator — plain-English summaries, surface plans before large/destructive changes.

## 1. What this session did (the arc)

Owner gave full authority to turn Archlight from a "surface-level news radar" into a deep public-intelligence engine ("the most dangerous pre-cognitive engine"). I:

1. **Audited** the whole codebase via 6 parallel subsystem investigators → `docs/claude-fable-5-archlight-audit.md`.
2. **Planned** a staged upgrade (reordered from the brief's suggested order) → `docs/claude-fable-5-upgrade-plan.md`.
3. **Implemented all 11 stages (0–10)**, each a separately-committed, test-pinned unit, all pushed.

### The audit's three structural truths (and their status now)
- **T1 — the deep evidence layer didn't drive events.** Events ranked off the legacy regex spine (hardcoded credibility 0.7); the good reliability engine only decorated the consequence layer. → **CLOSED (Stage 2).**
- **T2 — one live source (BBC RSS), manual button-press scans.** → **CLOSED (Stage 3): 5 source categories + scheduler.**
- **T3 — every amplifier off** (investigation loop had zero adapters; LLM/market/embeddings dormant). → investigation loop now **live + bounded (Stage 4)**; LLM/embedding/market remain **owner-gated by design** (cost decision).

## 2. Stage-by-stage summary (commit → what shipped)

| Commit | Stage | What shipped |
|---|---|---|
| `f5ab832` | docs | Audit + upgrade plan |
| `251e545` | 0 Truth & hygiene | router `enabled` filtering + new `SKIPPED_UNROUTED`; token-priced daily **monetary** budget (`LLM_DAILY_SPEND_CAP_USD`); enrichment now schema+evidence-ID-grounded + parsed-field re-guard; collectorStatus/error-detail truth; 3 doc-drift fixes; removed dead `/api/revenue-lenses` + dead code |
| `2b10c43` | 1 Reliability maths | **publisher independence groups** (`Source.independenceGroup`); **SimHash** doc fingerprints (`Document.simhash`, hamming≤14); **manipulation-risk** copy-burst score (`ClaimCluster.manipulationRiskScore`); origin-confidence into reliability; factuality rollup |
| `2c75376` | 2 Spine unification | signals link `canonicalClaimId`, confidence = 0.25+0.75×reliability; RECYCLED/CONTRADICTED **quarantined**; publisher-group diversity; event `commoditiesJson`/`instrumentsJson`/`momentumScore`; continuous novelty |
| `e97a499` | 3 Source depth | Atom/RDF parse + conditional GET (ETag/If-Modified-Since); **live pack** = BBC×2, Guardian, Sky, FCA, Bank of England, GOV.UK CMA, Contracts Finder (OCDS), GDELT; per-source cadence+backoff; `scripts/scan-worker.ts` (`npm run worker`); recency-gated LIVE indicator |
| `bb41d19` | 4 Live loop | enforced `maxRuntimeMs`/`maxCostBudget`/`allowedSourceTypes`; **GDELT search adapter** (`SEARCH_ADAPTERS` env); LLM query-gen reachable; interrogate→investigate bridge (`POST /api/interrogate/investigate`) |
| `365dce1` | 5 Entity resolution | `evidence/entities.ts` — legal-suffix folding, alias/keyword classifier, honest UNKNOWN excluded from named impacts; `Entity.canonicalKey`; populated `EventCandidateEntity`/`SignalClusterEntity` join tables |
| `b6e113f` | 6 Review queue | `ReviewItem` model, 5 producers, `/review` UI + `GET/PATCH /api/review` |
| `bb49f94` | 7 Synthesis depth | event-specific scenario narratives (`scenario-narrative.ts`); historic-analogue retrieval (`historic-analogue.ts`); differentiated report types (`REPORT_SECTIONS`); `getConfidenceHistory` + event-page momentum/↑↓ |
| `01d9bfe` | 8 LLM expansion | **embedding provider seam** (`evidence/embeddings/registry.ts`, dormant, lexical fallback, removes the Jaccard ceiling); `ANTHROPIC_BASE_URL` multi-provider; JSON-repair one-shot retry (schema-only failures) |
| `af7e5e3` | 9 Arc cache + dashboard | `getEventArc` cached (no write-on-GET); `buildArcsForEvents` warms at scan; dashboard `sourceCategories` + `pendingReviewCount` |
| `2d48cc8` | 10 Guardrail + proof | full brief forbidden-list at runtime + rating registers; cross-stage acceptance e2e (disputed-claim-caught + corroborated-claim-drives-named-exposure); 6-degree arc `=== 6` already present |

## 3. Architecture map (where things live)

- **Scan orchestration:** `src/server/pipeline/orchestrator.ts` — 15+ stages, all per-stage non-fatal. Manual `POST /api/scans/run`; scheduled `runFullScan({dueOnly:true})` from `scripts/scan-worker.ts`.
- **Evidence depth:** `src/server/evidence/{extraction,canonical,lineage,reliability,fingerprint,independence,entities,depth-pipeline}.ts` + `embeddings/registry.ts` + `search/{registry,gdelt}.ts` + `investigation-loop.ts`.
- **Consequence:** `src/server/consequence/{company-impact,context,scenario-narrative,historic-analogue,positioning,report,enrich}.ts`.
- **Graph:** `src/server/graph/{builder,arc,timeline}.ts`. **Review:** `src/server/review/{service,producers}.ts`.
- **LLM:** `src/server/llm/{router,provider,run,validate,budget}.ts`. **Safety:** `src/server/safety/advice-language.ts` (27+ patterns, runtime, fail-closed, called before every persist).
- **Data:** `prisma/schema.prisma` (SQLite; ~48 models). Tests: `tests/stage{0..10}-*.test.ts` + the pre-existing suites.

## 4. Dormant-by-design (owner activation = cost decision, all plumbing built + tested)

| Layer | Turn on with | Fallback when off |
|---|---|---|
| LLM enrichment | `ANTHROPIC_API_KEY` + `npx tsx scripts/llm-activate.ts on` | deterministic templates |
| Search / investigation loop | `SEARCH_ADAPTERS=gdelt` (default ON outside tests) | generates queries, no fetch |
| Embeddings (semantic similarity) | register provider + `EMBEDDING_PROVIDER=<name>` | lexical Jaccard blend |
| Market data | implement adapter in `market/provider.ts` `ADAPTER_REGISTRY` | dormant sentinel, no prices |

Deterministic-scan invariant (`tests/scan-deterministic-invariant.test.ts`) proves a scan is byte-identical with everything off. **Do not break it.**

## 5. Standing invariants (do not regress)

- No fabrication — `isFixture` propagates end-to-end; dormant layers self-label; named companies come only from resolved evidence entities.
- No financial advice — `assertNoAdviceLanguage` before every persist; GBP-only if currency ever appears.
- Reliability penalties are **multiplicative** (contradiction/copy-loop/manipulation can only lower a score, never inflate).
- Independence counts **publishers (groups)**, never source rows.
- Pre-flight before commit: scoped typecheck clean, tests clean, zero inline hex/advice-language in generated text, deterministic invariant intact.

## 6. Recommended next work (commercial roadmap — the "worth millions" direction)

Discussed with owner at session end; **not yet started.** Ranked:

1. **Outcome-resolution + verified track record (the moat).** Every scenario/event gets a resolution deadline; later evidence auto-resolves it; compute Brier/calibration + **lead-time** (days ahead of mainstream coverage). Then feed resolved outcomes back to *learn* the Stage-1 reliability weights. This is the single biggest gap between "impressive" and "seven-figure."
2. **Primary UK data (the fuel):** full article-body fetch (biggest depth gap — still headline-level); **Companies House streaming** (director exits, *charges registered* = distress signal), **The Gazette** (statutory insolvency first-print), CCJs, planning, job-posting deltas. Enables an **entity relationship graph** (supplier/customer/competitor) → contagion inference.
3. **Per-customer exposure maps + push delivery (the reason to pay):** load a customer's suppliers/customers/competitors, score every event against it, deliver only threshold-crossing hits via email/Slack/Teams/webhook/API. RevenueLens is half of this already.
4. **Turn the brain on WITH an eval harness** (golden datasets, measured precision/recall per release — the 573 tests pin behaviour, not accuracy).
5. **Enterprise plumbing:** multi-tenant auth/orgs/roles, Postgres + queue (SQLite ceiling is deliberate + mechanical to lift), SSO, audit logs, SOC 2 path. Sell the **auditability** (every score explains itself, every claim traces to origin) as the anti-hallucination differentiator.

**If asked to continue building:** the owner offered a choice between writing `docs/commercial-roadmap.md` (staged, with effort estimates) or starting the **outcome-resolution engine** now. Either is a clean starting point.

## 7. Quick commands

```bash
cd "/Users/murrayhewitt-coleman/Desktop/Websites/Archlight New/Archlight"
npm test                    # 573 tests (~50s)
npm run typecheck
DATABASE_URL="file:./prisma/dev.db" npm run build
DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --name <name>
npm run worker              # continuous scan loop (WORKER_TICK_SECONDS=…)
```
