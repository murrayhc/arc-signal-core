ALTER TABLE public.scan_runs
  ADD COLUMN IF NOT EXISTS triggered_by uuid,
  ADD COLUMN IF NOT EXISTS trigger_kind text NOT NULL DEFAULT 'system';

CREATE INDEX IF NOT EXISTS idx_scan_runs_trigger_details
  ON public.scan_runs (triggered_by, trigger_kind, started_at DESC);