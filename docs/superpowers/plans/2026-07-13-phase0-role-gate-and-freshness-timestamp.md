# Phase 0 — Role Gate + Freshness Timestamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the fragile shared owner-token, gate operator actions by admin role, and replace the redundant top-nav "Run scan" button with a global engine-freshness timestamp — resolving the reported "scan button doesn't work" bug.

**Architecture:** A new `requireAdmin` server middleware composes the existing `requireSupabaseAuth` with the existing `has_role('admin', userId)` Postgres RPC. All 45 `requireOwner` call sites (16 files) migrate to `requireAdmin`. The manual global-scan trigger leaves the top nav (replaced by a freshness timestamp read from `scan_runs`); a manual admin fallback stays on `/scans`. The owner-token client/server middleware and its `window.prompt` provisioning are deleted.

**Tech Stack:** TanStack Start (React) server functions + function middleware; Supabase (Postgres, `user_roles` + `has_role` RPC); Vite; deployed via Lovable.

## Global Constraints

- **Product:** `arc-signal-core` (Project Arklight). Repo edited locally, pushed to `origin/main`; Lovable auto-pulls and builds. Always `git fetch origin main` before pushing; rebase if behind.
- **No local test harness:** repo has only `dev`/`build`/`lint`/`format` scripts, no test framework, and `node_modules` is not installed in this clone. Verification = `npm install` then `npx vite build` (typecheck/build) and `npx eslint .`, Supabase `get_advisors`, plus functional checks on the deployed site. Do **not** invent a unit-test framework.
- **Migrations:** add to `supabase/migrations/` following the existing `YYYYMMDDHHMMSS_<uuid>.sql` naming; they apply through Lovable.
- **Copy rules (reader-facing text):** no em dashes, no AI-writing tells, benefit-first, GBP, no financial advice. Copy changes need owner sign-off (SR4).
- **Scope:** Phase 0 only. Do not build member scans, quotas, cron reschedule, or timestamps-on-items (later phases). Keep all currently owner-gated functions admin-only for now (blanket swap); re-gating specific ones (digest/divergence → cron, ask-graph → member) happens in later phases.
- **Spec reference:** `docs/superpowers/specs/2026-07-13-member-scoped-scans-tiers-design.md` (§4.0 Part D, §4.8).

---

### Task 1: `requireAdmin` middleware

**Files:**
- Create: `src/lib/archlight/require-admin.server.ts`

**Interfaces:**
- Consumes: `requireSupabaseAuth` from `@/integrations/supabase/auth-middleware` (sets `context.userId`, `context.supabase`, `context.claims`); the `has_role(_role, _user_id)` Postgres RPC (returns boolean).
- Produces: `export const requireAdmin` — a function middleware that throws `Error("Forbidden: admin role required")` for non-admins and otherwise calls `next()` with the inherited auth context. Import path: `@/lib/archlight/require-admin.server`.

- [ ] **Step 1: Create the middleware**

```typescript
// Admin-only middleware for operator/mutating server functions.
// Composes requireSupabaseAuth (authenticates the user) with the has_role
// Postgres RPC. Replaces the retired owner-token middleware (requireOwner).
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = context.userId as string | undefined;
    if (!userId) throw new Error("Forbidden: admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("has_role", {
      _role: "admin",
      _user_id: userId,
    });
    if (error) throw new Error(`Forbidden: role check failed (${error.message})`);
    if (data !== true) throw new Error("Forbidden: admin role required");

    return next();
  });
```

- [ ] **Step 2: Typecheck the new file**

Run: `cd "<repo>" && npm install --no-audit --no-fund && npx vite build`
Expected: build succeeds (no type errors referencing `require-admin.server.ts`). If `has_role` args mismatch, confirm arg names against `src/integrations/supabase/types.ts` (`_role`, `_user_id`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/archlight/require-admin.server.ts
git commit -m "feat(auth): add requireAdmin middleware (role-based operator gate)"
```

---

### Task 2: Migrate all `requireOwner` call sites to `requireAdmin`

**Files (16 — replace import + every `[requireOwner]`):**
- Modify: `src/lib/archlight/registry.functions.ts`, `reviewers.functions.ts`, `beliefs.functions.ts`, `backtest.functions.ts`, `analysis.functions.ts`, `signatures.functions.ts`, `forensic.functions.ts`, `pipeline.functions.ts`, `graph-query.functions.ts`, `divergence.functions.ts`, `source-learning.functions.ts`, `precognition.functions.ts`, `track-record.functions.ts`, `outcome.functions.ts`, `briefing.functions.ts`, `settings.functions.ts`

**Interfaces:**
- Consumes: `requireAdmin` (Task 1).
- Produces: no signature changes — the same server fns, now admin-gated. `runScan` remains exported and callable; its middleware becomes `requireAdmin`.

- [ ] **Step 1: Replace the import line in each of the 16 files**

In every file above, change:
```typescript
import { requireOwner } from "@/lib/archlight/owner-auth.server";
```
to:
```typescript
import { requireAdmin } from "@/lib/archlight/require-admin.server";
```

- [ ] **Step 2: Replace every middleware reference**

In every file above, replace all occurrences of `[requireOwner]` with `[requireAdmin]`. Exact command from repo root:
```bash
grep -rl "requireOwner" src | grep -v owner-auth.server.ts | while read f; do
  sed -i '' 's#@/lib/archlight/owner-auth.server#@/lib/archlight/require-admin.server#g; s#requireOwner#requireAdmin#g' "$f"
done
```

- [ ] **Step 3: Verify no `requireOwner` references remain outside the (soon-deleted) source file**

Run: `grep -rn "requireOwner" src | grep -v owner-auth.server.ts`
Expected: no output. (Count of `[requireAdmin]` sites should be 45.)

- [ ] **Step 4: Typecheck/build**

Run: `npx vite build`
Expected: build succeeds; no unresolved `requireOwner` imports.

- [ ] **Step 5: Commit**

```bash
git add src/lib/archlight/*.functions.ts
git commit -m "refactor(auth): migrate 45 owner-gated server fns to requireAdmin"
```

---

### Task 3: Seed the operator's admin role

**Files:**
- Create: `supabase/migrations/<new-timestamp>_seed_operator_admin_role.sql`

**Interfaces:**
- Consumes: `user_roles` table (`user_id`, `role app_role`), `auth.users`.
- Produces: an `admin` `user_roles` row for the operator, enabling `requireAdmin`.

- [ ] **Step 1: Confirm the operator's Arklight login email**

Required input — the email the operator signs into Arklight with. Ask the owner if unknown. Substitute for `<OPERATOR_EMAIL>` below. (Do not guess.)

- [ ] **Step 2: Write the migration**

```sql
-- Seed the operator account with the admin role so requireAdmin authorises them.
insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role
from auth.users u
where u.email = '<OPERATOR_EMAIL>'
on conflict (user_id, role) do nothing;
```
(If `user_roles` has no unique constraint on `(user_id, role)`, drop the `on conflict` clause or add the constraint first — check `list_tables` before applying.)

- [ ] **Step 3: Apply via Lovable and verify**

After the migration deploys, verify: the operator, logged in, can trigger an admin action (see Task 5 `/scans` fallback) without a "Forbidden" error; a non-admin account gets "Forbidden: admin role required".

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(auth): seed operator admin role"
```

---

### Task 4: Engine-freshness server function

**Files:**
- Modify: `src/lib/archlight/pipeline.functions.ts` (add near `getScanHistory`, ~line 1945)

**Interfaces:**
- Consumes: `scan_runs` table (`status`, `finished_at`, `started_at`).
- Produces: `export const getEngineFreshness = createServerFn({ method: "GET" })` returning `{ lastCompletedAt: string | null }` — the ISO time of the most recent successful global scan. No auth middleware (safe, read-only, non-sensitive).

- [ ] **Step 1: Add the server function**

```typescript
export const getEngineFreshness = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ lastCompletedAt: string | null }> => {
    const db = await admin();
    const { data } = await db
      .from("scan_runs")
      .select("finished_at, started_at, status")
      .in("status", ["completed", "ok", "completed_with_errors"])
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    return { lastCompletedAt: data?.finished_at ?? data?.started_at ?? null };
  },
);
```
(Confirm the `scan_status` enum values in `types.ts`; include whichever of `completed`/`ok`/`completed_with_errors` exist.)

- [ ] **Step 2: Build**

Run: `npx vite build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/archlight/pipeline.functions.ts
git commit -m "feat(scans): add getEngineFreshness (last global scan time)"
```

---

### Task 5: Replace top-nav "Run scan" with the freshness timestamp

**Files:**
- Modify: `src/components/archlight/AppShell.tsx` (remove `TopBtn` "Run scan" at line 65; drop `onRunScan`/`scanning` props on `AppShell` line 10, `TopNav` lines 28/40; add `EngineFreshness` component)
- Modify: `src/routes/app.tsx` (remove `scan` mutation + `onRunScan`/`scanning` props at line 33-45; keep the rest)
- Modify: `src/routes/scans.tsx` (keep its own "Run scan now" button as the admin fallback; remove the `onRunScan`/`scanning` props passed to `AppShell` at line 37)

**Interfaces:**
- Consumes: `getEngineFreshness` (Task 4).
- Produces: top nav shows "Engine updated: <time>"; `AppShell` no longer accepts `onRunScan`/`scanning`.

- [ ] **Step 1: Add the `EngineFreshness` component to AppShell.tsx**

```tsx
function EngineFreshness() {
  const { data } = useQuery({
    queryKey: ["archlight", "engineFreshness"],
    queryFn: () => getEngineFreshness(),
    staleTime: 60_000,
  });
  const iso = data?.lastCompletedAt ?? null;
  const label = iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        timeZone: "UTC",
      }) + " GMT"
    : "pending first run";
  return (
    <div
      title="Last completed global scan"
      className="hidden xl:flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] border border-border/60 text-muted-foreground"
    >
      <Radar className="h-3.5 w-3.5" />
      Engine updated: {label}
    </div>
  );
}
```

- [ ] **Step 2: Wire it in + remove the Run scan button**

In `AppShell.tsx`: add the import `import { getDashboard, getUnseenAlertCount, getEngineFreshness } from "@/lib/archlight/pipeline.functions";` (extend the existing import). Change the `AppShell` signature to `export function AppShell({ children }: { children: ReactNode })` and `<TopNav />` (no props). Change `TopNav` to `function TopNav()` (no props). Replace the line 65 `<TopBtn … label={scanning ? "Scanning…" : "Run scan"} … onClick={onRunScan} …/>` with `<EngineFreshness />`. Remove the now-unused `TopBtn` and `Play` imports if nothing else uses them (grep first).

- [ ] **Step 3: Update `app.tsx`**

Remove the `scan` mutation block (lines 33-42) and the `runScan` import (line 6). Change line 45 `<AppShell onRunScan={() => scan.mutate()} scanning={scan.isPending}>` to `<AppShell>`. Remove now-unused imports (`useMutation` if unused elsewhere, `toast` if unused, `runScan`) — grep each before removing.

- [ ] **Step 4: Update `scans.tsx`**

Change line 37 `<AppShell onRunScan={() => mut.mutate()} scanning={mut.isPending}>` to `<AppShell>`. Keep the page's own `mut` mutation and the "Run scan now" button (lines 30-55) — this is the admin fallback trigger (now `requireAdmin`-gated via `runScan`).

- [ ] **Step 5: Build + confirm no dangling props**

Run: `npx vite build`
Expected: success. Then `grep -rn "onRunScan\|scanning=" src` → only the `scans.tsx` internal `mut.isPending` button state should remain (no `AppShell` prop usage).

- [ ] **Step 6: Commit**

```bash
git add src/components/archlight/AppShell.tsx src/routes/app.tsx src/routes/scans.tsx
git commit -m "feat(ui): replace top-nav Run scan button with engine-freshness timestamp"
```

---

### Task 6: Remove owner-token infrastructure

**Files:**
- Delete: `src/lib/archlight/owner-auth.server.ts`, `src/lib/archlight/owner-auth-attach.ts`
- Modify: `src/start.ts` (remove `attachOwnerToken` from `functionMiddleware`)
- Modify: `src/routes/narrative-divergence.tsx` (remove the `window.prompt`/`localStorage.owner_token` block at lines 34-38)

**Interfaces:**
- Consumes: nothing new. Precondition: Task 2 done (no `requireOwner` references remain).

- [ ] **Step 1: Remove `attachOwnerToken` from start.ts**

Change line 23 to `functionMiddleware: [attachSupabaseAuth],` and delete the import on line 5 (`import { attachOwnerToken } from "@/lib/archlight/owner-auth-attach";`).

- [ ] **Step 2: Remove the owner-token prompt in narrative-divergence.tsx**

Replace the `mutationFn` (lines 33-40) so it no longer prompts:
```tsx
  const analyse = useMutation({
    mutationFn: () => autoAnalyseTopConvergence({ data: { limit: 5 } }),
```
(The action now authorises via admin login. Leave `onSuccess`/`onError` unchanged.)

- [ ] **Step 3: Delete the owner-token files**

```bash
git rm src/lib/archlight/owner-auth.server.ts src/lib/archlight/owner-auth-attach.ts
```

- [ ] **Step 4: Verify nothing references the deleted files or symbols**

Run: `grep -rn "owner-auth\|owner_token\|attachOwnerToken\|requireOwner\|OWNER_TOKEN" src`
Expected: no output.

- [ ] **Step 5: Build**

Run: `npx vite build`
Expected: success.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(auth): remove retired owner-token middleware and prompt"
```

---

### Task 7: Full verification + deploy

- [ ] **Step 1: Lint + build**

Run: `npx eslint . && npx vite build`
Expected: both pass (pre-existing lint warnings unrelated to these files are acceptable; do not claim to have fixed them — SR3).

- [ ] **Step 2: Push and let Lovable deploy**

```bash
git fetch origin main   # rebase if behind
git push origin main
```

- [ ] **Step 3: Supabase advisors after DDL**

Run `get_advisors(security)` for the project; confirm no new RLS gaps from the `user_roles` seed migration.

- [ ] **Step 4: Functional check on the deployed site**

As the operator (admin): the top nav shows "Engine updated: <time>" (no Run scan button); `/scans` "Run scan now" works without a token prompt. As a non-admin account: `/scans` "Run scan now" returns "Forbidden: admin role required" (a friendly-toast wording pass can follow). Confirm no console references to `owner_token`.

- [ ] **Step 5: Verify three-location parity**

Confirm `origin/main` tip matches the local clone (`git rev-list --left-right --count origin/main...HEAD` → `0 0`).

---

## Self-Review notes
- **Spec coverage:** Implements spec §4.0 (Part D role gate) and §4.8 (top-nav timestamp + `/scans` admin fallback + owner-token removal). Later phases (A instant re-match, B member scan, C cron/digest/divergence, quotas, item timestamps) are explicitly out of scope here.
- **Carry-over risk (spec §1.3/§9):** the cron `-dev` hook URL is NOT addressed in Phase 0 (it's a Phase 4 item) — flagged separately for the owner; can be verified independently at any time.
- **Type consistency:** `requireAdmin` reuses `context.userId` exactly as `requireSupabaseAuth` sets it; `has_role` args (`_role`, `_user_id`) match `types.ts`; `getEngineFreshness` returns `{ lastCompletedAt }` consumed verbatim in `EngineFreshness`.
