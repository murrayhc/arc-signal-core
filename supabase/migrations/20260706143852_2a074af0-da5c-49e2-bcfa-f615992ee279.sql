
CREATE TABLE public.scan_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  sources_per_scan integer NOT NULL DEFAULT 14,
  items_per_feed integer NOT NULL DEFAULT 1,
  copy_loop_jaccard numeric NOT NULL DEFAULT 0.55,
  bucketing_strategy text NOT NULL DEFAULT 'type_sector',
  cluster_merge_cosine numeric NOT NULL DEFAULT 0.72,
  max_claims_per_cluster integer NOT NULL DEFAULT 0,
  min_evidence_count integer NOT NULL DEFAULT 1,
  min_source_diversity numeric NOT NULL DEFAULT 0.0,
  min_confidence numeric NOT NULL DEFAULT 0.0,
  interrogation_cache_ms bigint NOT NULL DEFAULT 604800000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bucketing_strategy_check CHECK (bucketing_strategy IN ('type_sector','type','sector'))
);

GRANT SELECT, INSERT, UPDATE ON public.scan_settings TO authenticated;
GRANT ALL ON public.scan_settings TO service_role;

ALTER TABLE public.scan_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read scan settings"
  ON public.scan_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert scan settings"
  ON public.scan_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update scan settings"
  ON public.scan_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER scan_settings_set_updated_at
  BEFORE UPDATE ON public.scan_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.scan_settings (singleton) VALUES (true) ON CONFLICT DO NOTHING;
