
CREATE TABLE public.track_record_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id uuid REFERENCES public.scan_runs(id) ON DELETE SET NULL,
  resolved_count int NOT NULL DEFAULT 0,
  happened_count int NOT NULL DEFAULT 0,
  pending_review_count int NOT NULL DEFAULT 0,
  open_count int NOT NULL DEFAULT 0,
  graded_count int NOT NULL DEFAULT 0,
  mean_brier_first numeric,
  mean_brier_final numeric,
  base_rate numeric,
  calibration jsonb NOT NULL DEFAULT '[]'::jsonb,
  mean_lead_time_days numeric,
  scenario_count int NOT NULL DEFAULT 0,
  scenario_mean_brier numeric,
  by_horizon jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX track_record_snapshots_created_idx ON public.track_record_snapshots(created_at DESC);

GRANT SELECT ON public.track_record_snapshots TO anon, authenticated;
GRANT ALL ON public.track_record_snapshots TO service_role;

ALTER TABLE public.track_record_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Track record readable by all"
  ON public.track_record_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);
