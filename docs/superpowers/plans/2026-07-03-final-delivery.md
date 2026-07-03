# Archlight — Final Delivery (upgrade Stages 14–15) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Close out the in-place intelligence-radar upgrade: a consolidated 18-point proof suite (Stage 14), the missing required docs + roadmap refresh, a recommended minor-hardening sweep (folding the deferred 3a–3f minors), the Stage-15 direct system audit, and a final whole-branch review of the ENTIRE upgrade. Deterministic; no new features.

**Spec = the upgrade doc Stages 14–15** (`~/Downloads/existing_app_upgrade_intelligence_radar_prompt.md` lines 1264–1341). Baseline: **311 tests, HEAD 1b5395f**, clean, pushed.

## Global Constraints
- Working dir `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight`. Additive-only except the explicit hardening in Task 3 (each behaviour change tested). String enums; `*Json` columns; files < 500; en-GB; GBP; non-advisory guard + SR10/SR11. Full suite green + typecheck + build clean before each commit. The LLM + market layers stay DORMANT (FakeProviders in tests; no key/spend).

---

### Task 1: Consolidated upgrade-proof test suite (the 18 Stage-14 proofs)

**Files:** Create `tests/proof/upgrade-proof.test.ts`. Reuse the existing fixture scan harness (see `tests/e2e-proof.test.ts` + `tests/pipeline/orchestrator.test.ts` for the pattern) + injected FakeProviders for the LLM/market asserts (dormant). Do NOT duplicate deep unit tests — this suite proves the 18 end-to-end outcomes explicitly, each as one named test mapping 1:1 to the doc.

**The 18 required proof tests (assert each explicitly; most are already covered elsewhere — this suite makes them auditable in one place):**
1. Full scan creates event candidates. 2. Full scan updates the dashboard feed. 3. An event candidate becomes a graph node. 4. Claim + source + signal become connected graph nodes. 5. EvidenceArc traces ≥3 degrees on fixture data. 6. EvidenceArc supports 6-degree traversal where data allows. 7. Positioning examples generated with NO advice language (`findAdviceLanguage` empty). 8. OpportunityCard created from a detected event. 9. OpportunityCard links back to evidence. 10. 3D graph API returns nodes + edges. 11. Manual company search creates/finds a graph root. 12. Manual commodity search returns graph context. 13. Ticker/instrument search returns market CONTEXT only (dormant → not-configured, still context-shaped). 14. Ticker/instrument output contains NO buy/sell/hold advice (guard-clean). 15. Multi-model router selects the expected model class per task type. 16. LLM structured output fails closed on schema-invalid. 17. LLM output with unsupported claims (ungrounded) is rejected. 18. LLM output with prohibited financial-advice language is rejected.

- [ ] **Step 1:** Write the suite; run one full fixture scan in `beforeAll`, assert 1–12 against the resulting DB/API state, use injected Fake LLM/market providers for 13–18. Each test named `proof N: <description>`.
- [ ] **Step 2:** Capture and LOG (via a test that `console.log`s, or a comment) the real row counts after the scan (events, graph nodes, edges, opportunities, positioning, arcs, LLM runs, market profiles) — Task 2's `final-upgrade-proof.md` cites them.
- [ ] **Step 3:** Verify + commit — full suite green, typecheck clean.
```bash
git add -A && git commit -m "test(final): consolidated 18-point upgrade-proof suite (Stage 14)"
```

---

### Task 2: Required docs — market-context-safety, final-upgrade-proof, roadmap refresh

**Files:** Create `docs/market-context-safety.md`, `docs/final-upgrade-proof.md`; rewrite `docs/roadmap.md`.

- [ ] **Step 1:** `docs/market-context-safety.md` — the market-safety contract (allowed instrument/commodity output list; the disallowed list — buy/sell/hold/target-price/expected-return/portfolio-advice/guaranteed; the verbatim non-advisory disclaimer; guard-before-persist; dormancy → NOT_CONFIGURED, no fabricated price; "market context only, never advice"). May cross-reference `market-data-adapters.md` (the how) — this doc is the SAFETY contract (the doc's required name).
- [ ] **Step 2:** `docs/final-upgrade-proof.md` — the proof narrative: the full workflow (scan → claims → signals → clusters → events → risk/opp → opportunities → positioning → graph → arcs → interrogation → dormant LLM/market → watch/portfolio/replay), the REAL row counts from Task 1's scan, the 18 proof tests listed with their pass status + the test file:name that proves each, and the dormancy/safety guarantees. Honest about what's dormant/deferred.
- [ ] **Step 3:** `docs/roadmap.md` — refresh to current reality (it still shows only spine+2a): a "Done" section (spine, 2a, and upgrade phases 3a Opportunity, 3b Evidence Graph, 3c 3D Graph+Interrogation, 3d dormant LLM+Playbooks, 3e dormant Market Data, 3f Watch/Portfolio/Replay+Lens CRUD), and a "Deferred / next" section (activate LLM + market providers; the security-hardening pass — RSS scheme allowlist + fetch size cap, auth on scan/interrogate; Postgres migration; the 3a–3f minor rollups). Keep it a short current-state summary.
- [ ] **Step 4:** commit.
```bash
git add -A && git commit -m "docs(final): market-context-safety + final-upgrade-proof + roadmap refresh (Stage 14 docs)"
```

---

### Task 3: Minor-hardening sweep (deferred 3a–3f rollups)

**Files:** the market/watch/lenses/portfolio API routes; `src/server/graph/timeline.ts` + `momentum.ts`; the interrogate/watch scope path. Read each before editing.

- [ ] **Step 1: P2002 sweep** — `POST`/`PATCH /api/watch`, `POST`/`PATCH /api/lenses` catch Prisma P2002 (unique `name`) → **409** with a friendly message (not an unhandled 500); `POST /api/portfolio` on the race → return the existing item (200). Add a route-level test per fixed route (duplicate name → 409; portfolio re-add → 200 existing).
- [ ] **Step 2: whitespace scope terms** — in `resolveWatchMarket`, trim + drop empty terms when building the lowercased term list so a `" "` term can't substring-match everything. Test: a whitespace-only queryTerm yields no spurious matches.
- [ ] **Step 3: freshness/decay semantics (M2)** — `confidenceDecay`/`freshness` in the replay/timeline path must reference the last **supporting** GraphEvent (POSITIVE ∪ FIRST_DETECTED), NOT any-polarity — so a fresh CONTRADICTION no longer resets freshness. Align the code with the `lastSupportingAt` param name + the doc's "time since last supporting evidence". Test the contradiction-doesn't-refresh case.
- [ ] **Step 4: complete GRAPH_EVENT_TYPES tracking (M3)** — add `claimCount` + a signal-strength measure to `diffState`'s metadata so `CLAIM_REPEATED` (claimCount ↑) and `SIGNAL_STRENGTHENED` (max signal strength ↑) actually fire — the doc's Stage-12 track list requires all 10. (If genuinely large, STOP and report — we then document them as deferred instead.) Test both fire on a second scan that adds a claim / strengthens a signal.
- [ ] **Step 5:** Verify + commit — full suite green, typecheck + build clean.
```bash
git add -A && git commit -m "fix(final): P2002->409 sweep, scope-term trim, supporting-evidence freshness, claim/signal timeline tracking"
```

---

## Capstone (controller-run, after Tasks 1–3): NOT subagent build tasks
- **Stage-15 audit** — dispatch an independent critical agent (fable) to write `docs/final-system-audit.md`: a direct, unsoftened audit of the whole system against the 15 Stage-15 outcomes — what works, what's fragile, what's over/under-built, what blocks production (the unauthenticated local-only posture, dormant paid layers), prioritised with file paths. Commit.
- **Final whole-branch review** — dispatch fable over `git merge-base main <spine-base>`..HEAD… i.e. the whole upgrade range from the pre-upgrade commit to HEAD; hand it the full deferred-minor list from the ledger. Fix any Critical/Important in ONE fix wave. 
- Then push; final memory + roadmap already current.

## Self-Review Notes
- Stage 14 proofs ↔ T1; Stage 14 docs ↔ T2; deferred-minor hardening ↔ T3; Stage 15 audit + whole-branch review ↔ capstone.
- Additive except T3's tested behaviour changes (P2002 status codes, freshness reference, 2 new event types). Dormant LLM/market unchanged. No key/spend.
```
