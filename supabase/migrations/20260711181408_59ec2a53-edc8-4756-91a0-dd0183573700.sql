CREATE TABLE public.event_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_candidate_id uuid NOT NULL REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  red_team_case text,
  red_team_strength text CHECK (red_team_strength IN ('weak','moderate','strong')),
  hypotheses jsonb NOT NULL DEFAULT '[]'::jsonb,
  leading_hypothesis text,
  evidence_ambiguity text CHECK (evidence_ambiguity IN ('clear','contested','ambiguous')),
  discriminating_evidence text,
  analysed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_candidate_id)
);

GRANT SELECT ON public.event_analysis TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_analysis TO authenticated;
GRANT ALL ON public.event_analysis TO service_role;

ALTER TABLE public.event_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_analysis public read"
  ON public.event_analysis FOR SELECT
  USING (true);

CREATE TRIGGER event_analysis_set_updated_at
  BEFORE UPDATE ON public.event_analysis
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();