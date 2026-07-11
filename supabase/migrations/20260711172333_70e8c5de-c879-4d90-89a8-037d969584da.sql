
CREATE TABLE public.distress_cohort (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  company_number text,
  flagged_at timestamptz NOT NULL DEFAULT now(),
  profile_score numeric,
  matched_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text NOT NULL DEFAULT 'open' CHECK (outcome IN ('open','failed','survived')),
  outcome_detail text,
  survive_after date NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id)
);
GRANT SELECT ON public.distress_cohort TO anon, authenticated;
GRANT ALL ON public.distress_cohort TO service_role;
ALTER TABLE public.distress_cohort ENABLE ROW LEVEL SECURITY;
CREATE POLICY "distress_cohort public read" ON public.distress_cohort FOR SELECT USING (true);

CREATE TRIGGER trg_distress_cohort_updated
BEFORE UPDATE ON public.distress_cohort
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_distress_cohort_outcome ON public.distress_cohort (outcome);
CREATE INDEX idx_distress_cohort_flagged_at ON public.distress_cohort (flagged_at DESC);
