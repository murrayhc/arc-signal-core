CREATE TABLE public.narrative_divergence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_candidate_id uuid NOT NULL UNIQUE REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  baseline text,
  outlet_framings jsonb NOT NULL DEFAULT '[]'::jsonb,
  divergence_score numeric,
  divergence_label text,
  n_outlets integer NOT NULL DEFAULT 0,
  n_with_lean integer NOT NULL DEFAULT 0,
  distinct_lean_zones integer NOT NULL DEFAULT 0,
  model text,
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.narrative_divergence TO anon;
GRANT SELECT ON public.narrative_divergence TO authenticated;
GRANT ALL ON public.narrative_divergence TO service_role;

ALTER TABLE public.narrative_divergence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read narrative_divergence"
  ON public.narrative_divergence
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER update_narrative_divergence_updated_at
  BEFORE UPDATE ON public.narrative_divergence
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();