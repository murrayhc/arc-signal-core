CREATE TABLE public.event_panel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_candidate_id uuid NOT NULL REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  panel jsonb NOT NULL DEFAULT '[]'::jsonb,
  mean_probability numeric,
  disagreement numeric,
  consensus text CHECK (consensus IN ('unanimous','majority','split')),
  paneled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_candidate_id)
);

GRANT SELECT ON public.event_panel TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_panel TO authenticated;
GRANT ALL ON public.event_panel TO service_role;

ALTER TABLE public.event_panel ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_panel public read"
  ON public.event_panel FOR SELECT
  USING (true);

CREATE TRIGGER event_panel_set_updated_at
  BEFORE UPDATE ON public.event_panel
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();