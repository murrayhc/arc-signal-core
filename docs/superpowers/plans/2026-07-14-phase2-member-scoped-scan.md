# Phase 2 — Member "Scan my items" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in member trigger a scan scoped to *their* tracked entities (book + watchlist), fold the results into the shared global graph, surface their signals, and count it against a per-tier daily quota.

**Architecture:** Extract the reusable "claims → events" synthesis core out of the `runScanImpl` monolith into `synthesizeClaimsIntoEvents()`, called by both the global scan (unchanged behaviour) and a new per-user `scanMyItems`. `scanMyItems` reuses Interrogate's targeted-collection front-end to gather documents for the member's entities, runs them through the shared synthesis, then re-scores that user's exposures. Quota is enforced by the Phase-2-foundation `quota.functions.ts`.

**Tech Stack:** TanStack Start server functions + middleware; Supabase (Postgres); Vite; deployed via Lovable (builds with **bun**).

## Global Constraints

- **Repo/deploy:** `arc-signal-core` (Project Arklight). Edit locally → push `origin/main` → Lovable auto-pulls/builds. **Always `git fetch origin main` immediately before every push; rebase if behind; never force-push.** The owner sometimes edits in Lovable in parallel — confirm they are paused before a session.
- **Builds with bun** (`bun.lock`). Do NOT commit `package-lock.json`. No test framework and `node_modules` may be uninstalled — verify with `npm install` then `npx vite build` + functional checks on the live site. Do not invent a unit-test framework.
- **Live product:** this touches the core engine. Work on a **feature branch**, build-verify, merge to `main` as ONE complete change. The global scan's behaviour MUST be proven unchanged after the refactor before anything else ships.
- **Migrations:** `supabase/migrations/YYYYMMDDHHMMSS_<uuid>.sql`; hand-update `src/integrations/supabase/types.ts` to match (Lovable regenerates on deploy). iCloud may spawn `* 2.*` conflict copies — delete any before committing.
- **Copy (reader-facing):** no em dashes, no AI-writing tells, benefit-first, GBP, no financial advice; use the existing `formatDateTimeUK` helper for dates. Copy needs owner sign-off (SR4).
- **Auth/quota (already built):** operator actions use `requireAdmin`; member actions use `requireSupabaseAuth` (sets `context.userId`). Quota via `assertWithinQuota(userId, "scan_my_items")` / `getMyQuotas` in `src/lib/archlight/quota.functions.ts`. `scan_runs` has `triggered_by` + `trigger_kind`. Tier via `isProUser(userId)` (`billing.functions.ts`).
- **Spec:** `docs/superpowers/specs/2026-07-13-member-scoped-scans-tiers-design.md` (§4.2, §4.5, §4.6).

---

### Task 1: Extract `synthesizeClaimsIntoEvents()` from `runScanImpl` (behaviour-preserving)

**Why first:** this is the enabling refactor and the highest-risk change. It must land and be proven neutral before building on it.

**Files:**
- Modify: `src/lib/archlight/pipeline.functions.ts` (extract the SYNTHESIS PHASE, lines ~446-762, into a new exported function; call it from `runScanImpl` at the original site)

**Interfaces:**
- Produces: `export async function synthesizeClaimsIntoEvents(db, newClaims, settings, ctx): Promise<{ atomic_claims_created: number; events_created: number; events_skipped: number; notes: string[] }>` where `db = Awaited<ReturnType<typeof admin>>`, `newClaims` is the existing in-scan `NewClaim[]` (defined ~line 184), `settings = Awaited<ReturnType<typeof loadScanSettings>>`, and `ctx = { scanRunId: string; deadlineAtMs: number; recentShingleSets: ... }` (whatever shared state the synthesis block reads — determine exactly by reading 446-762).
- Consumes: nothing new.

- [ ] **Step 1: Read the synthesis block (lines 446-762) end to end.** List every outer-scope variable it reads/mutates (e.g. `newClaims`, `settings`, `documentsCollected`, `eventsCreated`, `eventsSkipped`, `notes`, `deadlineAtMs`/`hasBudget`, `recentShingleSets`). These become parameters or return values. Do not guess — enumerate them.

- [ ] **Step 2: Create the function** with the exact block moved verbatim, parameters replacing the outer-scope reads, and a return object replacing the counter mutations. Keep logic byte-identical otherwise.

- [ ] **Step 3: Replace lines 446-762 in `runScanImpl`** with a call:
```ts
const synth = await synthesizeClaimsIntoEvents(db, newClaims, settings, { scanRunId: run.id, deadlineAtMs, recentShingleSets });
atomicClaimsCreated += synth.atomic_claims_created;
eventsCreated += synth.events_created;
eventsSkipped += synth.events_skipped;
notes.push(...synth.notes);
```
(Adjust to the real variable set from Step 1.)

- [ ] **Step 4: Build.** `npx vite build` → success.

- [ ] **Step 5: Prove behaviour unchanged (critical).** Deploy to the feature branch preview or run a global scan via the `/scans` admin button. Compare a scan's `scan_runs` output row (sources/docs/claims/events counts + notes) against a pre-refactor run on similar inputs. They must match in shape. Record the before/after in the PR/commit message. If they differ, STOP and reconcile (superpowers:systematic-debugging).

- [ ] **Step 6: Commit** `refactor(pipeline): extract synthesizeClaimsIntoEvents from runScanImpl (behaviour-neutral)`.

---

### Task 2: Reusable targeted collection for a set of entities

**Files:**
- Modify: `src/lib/archlight/pipeline.functions.ts` (add `collectDocumentsForEntities`, reusing the Interrogate helpers `classifySubject` / `buildQueries` / `fetchGoogleNews` already in this file; export them if they are module-private)

**Interfaces:**
- Produces: `async function collectDocumentsForEntities(db, entities, opts): Promise<{ newClaims: NewClaim[]; documents_collected: number; notes: string[] }>` where `entities: Array<{ name: string; kind: string }>` and `opts = { fetchBudget: number; perEntityQueries?: number }`.
- Consumes: `ingestDocument` (existing), the collection helpers, `NewClaim` shape.

- [ ] **Step 1: Write `collectDocumentsForEntities`.** For each entity (respecting `opts.fetchBudget`): `classifySubject(name)` → `buildQueries(...)` → `fetchGoogleNews(q, N)`; dedup links; `ingestDocument(...)` each; accumulate `NewClaim[]` exactly as the intake phase does (lines ~245-370). Stop when the fetch budget is exhausted and note what was skipped (never silently truncate — Global Constraint / spec §4.6).

- [ ] **Step 2: Build.** `npx vite build` → success.

- [ ] **Step 3: Commit** `feat(pipeline): add collectDocumentsForEntities (targeted per-entity collection)`.

---

### Task 3: `scanMyItems` server function

**Files:**
- Modify: `src/lib/archlight/pipeline.functions.ts` (add `scanMyItems`)

**Interfaces:**
- Consumes: `assertWithinQuota` (`quota.functions.ts`), `collectDocumentsForEntities` (Task 2), `synthesizeClaimsIntoEvents` (Task 1), `scoreExposures({ userId })` (`exposure.functions.ts`).
- Produces: `export const scanMyItems = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])` returning `{ status: string; entities_scanned: number; documents_collected: number; events_created: number; hits_created: number; scans_remaining: number; notes: string[] }`.

- [ ] **Step 1: Implement the handler:**
```ts
export const scanMyItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId as string;
    const quota = await assertWithinQuota(userId, "scan_my_items"); // throws QUOTA:… if over
    const db = await admin();

    // Gather this user's tracked entities (book items + watchlists), capped.
    const MAX_ENTITIES = 25; // cost guardrail (spec §4.6)
    const { data: items } = await db.from("exposure_items")
      .select("name, kind").eq("user_id", userId).limit(MAX_ENTITIES);
    const entities = (items ?? []).map((i) => ({ name: i.name, kind: i.kind }));
    if (entities.length === 0) {
      return { status: "no_items", entities_scanned: 0, documents_collected: 0, events_created: 0, hits_created: 0, scans_remaining: quota.remaining, notes: ["Add book or watchlist items before scanning."] };
    }

    // Open a member-scoped scan_runs row (this is what the quota counts).
    const { data: run } = await db.from("scan_runs")
      .insert({ status: "running", started_at: new Date().toISOString(), triggered_by: userId, trigger_kind: "member_scoped" })
      .select().single();

    const settings = await loadScanSettings();
    const collected = await collectDocumentsForEntities(db, entities, { fetchBudget: 40 });
    const synth = await synthesizeClaimsIntoEvents(db, collected.newClaims, settings, { scanRunId: run!.id, deadlineAtMs: Date.now() + 4 * 60 * 1000, recentShingleSets: [] });
    const scored = await scoreExposures({ userId });

    await db.from("scan_runs").update({
      status: "completed", finished_at: new Date().toISOString(),
      documents_collected: collected.documents_collected,
      atomic_claims_created: synth.atomic_claims_created,
      events_created: synth.events_created,
      notes: [...collected.notes, ...synth.notes].join(" | ").slice(0, 2000),
    }).eq("id", run!.id);

    return {
      status: "completed", entities_scanned: entities.length,
      documents_collected: collected.documents_collected, events_created: synth.events_created,
      hits_created: scored.hits_created, scans_remaining: quota.remaining - 1, notes: synth.notes,
    };
  });
```
(Confirm `recentShingleSets` handling — if synthesis needs the recent-doc window for copy-loop detection, load it here as `runScanImpl` does at line ~204, rather than passing `[]`.)

- [ ] **Step 2: Build.** `npx vite build` → success.

- [ ] **Step 3: Functional check.** As a logged-in member with a couple of book items, call `scanMyItems` (via the Task 4 button, or temporarily from an existing page). Confirm: a `scan_runs` row appears with `trigger_kind='member_scoped'` and `triggered_by=<you>`; new events/hits appear; a second call within the day decrements `scans_remaining`; exceeding the limit throws the friendly `QUOTA:` message.

- [ ] **Step 4: Commit** `feat(scans): add member scanMyItems (scoped fetch → global graph, quota-gated)`.

---

### Task 4: UI — "Scan my items" button, confirmation, and counter

**Files:**
- Modify: `src/routes/exposures.tsx` (the "My book" page — add the button + counter) and/or `src/routes/app.tsx`
- Possibly create: `src/components/archlight/ScanMyItemsButton.tsx` (self-contained control)

**Interfaces:**
- Consumes: `scanMyItems` (Task 3), `getMyQuotas` (`quota.functions.ts`).

- [ ] **Step 1: Build `ScanMyItemsButton`** — a button that reads `getMyQuotas` (via `useQuery`) to show "Scans left today: N", disabled at 0 with "Resets midnight GMT · Upgrade to Pro". On click, show a confirmation dialog with the owner-approved copy (draft below, needs sign-off):
  > "This scans only what's on your list right now. Add every company, holding, sector and watchlist item you want covered before you run it. You have N scans left today."
  On confirm, `useMutation(() => scanMyItems())`; on success toast the summary and invalidate exposure/dashboard queries; on error toast the message (the `QUOTA:` text is already friendly).

- [ ] **Step 2: Place it** on the My book page header (and optionally the dashboard "Do next" area).

- [ ] **Step 3: Build.** `npx vite build` → success.

- [ ] **Step 4: Functional check.** Button shows the correct remaining count; confirmation appears; a scan runs and results show; at limit the button is disabled with the reset note.

- [ ] **Step 5: Commit** `feat(ui): Scan my items button with confirmation and daily counter`.

---

### Task 5: Cost guardrails + full verification + deploy

- [ ] **Step 1: Confirm the caps** are enforced and logged, not silent: `MAX_ENTITIES` (Task 3) and `fetchBudget` (Task 2). If a user has more items than the cap, the notes must say what was skipped.
- [ ] **Step 2: Lint the hand-edited files** (`npx eslint <files>`), ignoring the repo's pre-existing prettier noise; ensure no NEW `no-unused-vars` / real errors.
- [ ] **Step 3: Merge feature branch → `main`** (fetch first; rebase if behind), push; Lovable deploys + applies migrations.
- [ ] **Step 4: Post-deploy on the live site:** run a member scan end-to-end; confirm quota decrements and resets; confirm the global cron scan still runs (Task 1 neutrality holds in production).
- [ ] **Step 5: Parity** `git rev-list --left-right --count origin/main...HEAD` → `0 0`.

---

## Self-Review notes
- **Spec coverage:** implements §4.2 (scoped fetch → global graph), §4.5 (quota via the foundation module), §4.6 (entity/fetch caps, no silent truncation). Item `last_refreshed_at` timestamps (§4.4) and research/ask-graph quotas (§4.5) are later phases, out of scope here.
- **Biggest risk:** Task 1 (opening the monolith). Mitigation: behaviour-neutrality proof (Task 1 Step 5) before anything builds on it; feature branch; single merge.
- **Type consistency:** `synthesizeClaimsIntoEvents` return fields are consumed verbatim in Task 3; `scanMyItems` uses `assertWithinQuota`/`scoreExposures({ userId })`/`isProUser` exactly as defined in the foundation and Phase 1.
- **Open item for execution:** confirm whether `synthesizeClaimsIntoEvents` needs the recent-doc shingle window (copy-loop dedup) — if so, load it inside `scanMyItems` too, don't pass `[]`.
