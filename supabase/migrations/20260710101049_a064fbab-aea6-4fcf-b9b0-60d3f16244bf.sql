
CREATE TABLE public.source_reliability_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  current_score numeric NOT NULL,
  suggested_score numeric NOT NULL,
  accuracy_score numeric NOT NULL,
  claims_seen int NOT NULL DEFAULT 0,
  claims_confirmed int NOT NULL DEFAULT 0,
  claims_contested int NOT NULL DEFAULT 0,
  rationale text NOT NULL,
  status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','applied','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE UNIQUE INDEX source_reliability_suggestions_open_uidx
  ON public.source_reliability_suggestions(source_id)
  WHERE status = 'suggested';

CREATE INDEX source_reliability_suggestions_status_idx
  ON public.source_reliability_suggestions(status, created_at DESC);

GRANT SELECT ON public.source_reliability_suggestions TO anon, authenticated;
GRANT ALL ON public.source_reliability_suggestions TO service_role;

ALTER TABLE public.source_reliability_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reliability suggestions readable by all"
  ON public.source_reliability_suggestions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER trg_source_reliability_suggestions_updated
  BEFORE UPDATE ON public.source_reliability_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
