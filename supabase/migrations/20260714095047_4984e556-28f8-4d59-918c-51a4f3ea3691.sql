-- Foundation for member-triggered scoped scans (Phase 2): record who triggered
-- a scan and what kind, so per-user daily scan quotas can be counted from
-- scan_runs. Existing rows default to 'system' (they were cron/system scans).
alter table public.scan_runs
  add column if not exists triggered_by uuid,
  add column if not exists trigger_kind text not null default 'system';

-- Index for per-user quota counts (triggered_by + kind + time window).
create index if not exists idx_scan_runs_triggered_by_kind_time
  on public.scan_runs (triggered_by, trigger_kind, started_at desc);

comment on column public.scan_runs.triggered_by is
  'User who triggered a member-scoped scan; null for system/cron scans.';
comment on column public.scan_runs.trigger_kind is
  'system | member_scoped | admin_manual - drives per-user scan quotas.';
