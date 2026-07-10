# Scan Settings

A new `/settings/scan` page that exposes the pipeline knobs currently hard-coded in `pipeline.functions.ts`, persists them, and applies them on the next scan. A "Return to Default" button restores the original baseline in one click.

## What the user sees

New route **`/settings/scan`** (linked from the header alongside the existing nav). Groups of controls, each with an inline description of what it does and its default value shown as a muted hint:

**Signal intake**
- Sources per scan — slider 5 → 60 (default **14**)
- Items pulled per RSS feed — slider 1 → 8 (default **1**)
- Copy-loop Jaccard threshold — slider 0.30 → 0.90 (default **0.55**) — lower = more aggressive de-dup

**Clustering / event creation**
- Bucketing strategy — radio: `Type + Sector` (default) · `Type only` · `Sector only`
- Cluster merge cosine — slider 0.50 → 0.95 (default **0.72**) — higher = fewer merges, more distinct events
- Max claims per cluster before it splits — slider 0 (off) → 20 (default **0**)

**Event quality floor** (all default off, i.e. keep everything the model synthesises)
- Minimum evidence count — 1 → 10 (default **1**)
- Minimum source diversity — 0.0 → 1.0 (default **0.0**)
- Minimum confidence — 0.0 → 1.0 (default **0.0**)

**Interrogation cache**
- Cache TTL — 1 hour / 1 day / 1 week (default) / 1 month

**Footer actions**
- `Save changes` (primary) — writes to DB, toast on success
- `Return to Default` (secondary, destructive-outline) — one-click restore + save
- Small note: "Applies to the next scan. In-flight scans are unaffected."

At the top of the dashboard, a small "Scan tuned — N knobs off default · Edit" pill appears when settings differ from baseline, linking to the page.

## Data model

New table `scan_settings` (single-row-per-workspace; this app is single-tenant demo so one row keyed by a fixed id):

```
id uuid pk default gen_random_uuid()
sources_per_scan int default 14
items_per_feed int default 1
copy_loop_jaccard numeric default 0.55
bucketing_strategy text default 'type_sector'  -- 'type_sector' | 'type' | 'sector'
cluster_merge_cosine numeric default 0.72
max_claims_per_cluster int default 0            -- 0 = unlimited
min_evidence_count int default 1
min_source_diversity numeric default 0.0
min_confidence numeric default 0.0
interrogation_cache_ms bigint default 604800000 -- 1 week
updated_at timestamptz default now()
```

GRANTs for `authenticated` + `service_role`, RLS on, policy allowing authenticated read/write (matches the pattern already used across the app).

## Server functions

New file `src/lib/archlight/settings.functions.ts`:
- `getScanSettings()` — returns the row (creates default row on first read).
- `updateScanSettings(patch)` — validates with Zod, upserts.
- `resetScanSettings()` — writes the baseline defaults back.

A shared `DEFAULT_SCAN_SETTINGS` constant lives in `src/lib/archlight/settings.defaults.ts` so both the UI and `resetScanSettings` share one source of truth.

## Wiring into the pipeline

`runScan` in `src/lib/archlight/pipeline.functions.ts` loads settings first and threads them through:
- `sources ... .limit(settings.sources_per_scan)`
- RSS collector loops up to `items_per_feed` picks per source (one doc row per pick).
- Copy-loop check compares against `settings.copy_loop_jaccard`.
- Cluster seed key derived from `bucketing_strategy`.
- Merge cosine uses `settings.cluster_merge_cosine`.
- If `max_claims_per_cluster > 0`, oversized clusters are split by region/entity before synthesis.
- After synthesis, an event is only inserted when `evidence_count >= min_evidence_count`, `source_diversity_score >= min_source_diversity`, and `confidence >= min_confidence`. Skipped events are logged into `scan_runs.notes` with the reason, so the user can see *why* the number is low.

`getCachedInterrogation` uses `settings.interrogation_cache_ms` in place of the current constant.

## Route + navigation

- `src/routes/settings.tsx` — pathless layout with `<Outlet />` (so future settings sub-pages slot in cleanly).
- `src/routes/settings.scan.tsx` — the page. Loader calls `getScanSettings` under the existing auth pattern (protected via `_authenticated` if the app uses it; otherwise plain).
- Header gets a `Settings` link.
- Dashboard tuning-pill component reads settings via TanStack Query and diffs against `DEFAULT_SCAN_SETTINGS`.

## Files touched

Created:
- `supabase/migrations/<ts>_scan_settings.sql`
- `src/lib/archlight/settings.defaults.ts`
- `src/lib/archlight/settings.functions.ts`
- `src/routes/settings.tsx`
- `src/routes/settings.scan.tsx`

Edited:
- `src/lib/archlight/pipeline.functions.ts` (load + apply settings, log skips)
- `src/integrations/supabase/types.ts` (regen for new table)
- Header component (add Settings link)
- `src/routes/index.tsx` (tuning-pill)

Want me to build it as scoped, or adjust any of the ranges / defaults first?
