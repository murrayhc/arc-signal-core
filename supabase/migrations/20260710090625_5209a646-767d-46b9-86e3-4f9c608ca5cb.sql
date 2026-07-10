
CREATE TABLE public.outcome_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('event','scenario')),
  event_candidate_id uuid NOT NULL REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  scenario_projection_id uuid REFERENCES public.scenario_projections(id) ON DELETE SET NULL,
  dedupe_key text NOT NULL UNIQUE,
  prediction_text text NOT NULL,
  predicted_probability numeric NOT NULL,
  final_probability numeric NOT NULL,
  predicted_at timestamptz NOT NULL DEFAULT now(),
  deadline timestamptz NOT NULL,
  horizon text CHECK (horizon IS NULL OR horizon IN ('immediate','near','medium','strategic')),
  evidence_canonical_ids uuid[] NOT NULL DEFAULT '{}',
  baseline jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending_review','resolved')),
  outcome text CHECK (outcome IS NULL OR outcome IN ('happened','did_not_happen','unresolvable')),
  resolved_by text CHECK (resolved_by IS NULL OR resolved_by IN ('auto_evidence','auto_deadline','review')),
  resolved_at timestamptz,
  resolution_rationale text,
  resolution_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  observed_path text CHECK (observed_path IS NULL OR observed_path IN ('borne_out','refuted','partial','none')),
  brier_first numeric,
  brier_final numeric,
  lead_time_days numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outcome_predictions_event_idx ON public.outcome_predictions(event_candidate_id);
CREATE INDEX outcome_predictions_status_deadline_idx ON public.outcome_predictions(status, deadline);

GRANT SELECT ON public.outcome_predictions TO anon, authenticated;
GRANT ALL ON public.outcome_predictions TO service_role;

ALTER TABLE public.outcome_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public prediction ledger readable by all"
  ON public.outcome_predictions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER trg_outcome_predictions_updated
  BEFORE UPDATE ON public.outcome_predictions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Freeze immutable fields: never allow updates to the frozen columns.
CREATE OR REPLACE FUNCTION public.outcome_predictions_freeze_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.subject_kind := OLD.subject_kind;
  NEW.event_candidate_id := OLD.event_candidate_id;
  NEW.scenario_projection_id := OLD.scenario_projection_id;
  NEW.dedupe_key := OLD.dedupe_key;
  NEW.prediction_text := OLD.prediction_text;
  NEW.predicted_probability := OLD.predicted_probability;
  NEW.predicted_at := OLD.predicted_at;
  NEW.deadline := OLD.deadline;
  NEW.horizon := OLD.horizon;
  NEW.evidence_canonical_ids := OLD.evidence_canonical_ids;
  NEW.baseline := OLD.baseline;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_outcome_predictions_freeze
  BEFORE UPDATE ON public.outcome_predictions
  FOR EACH ROW EXECUTE FUNCTION public.outcome_predictions_freeze_immutable();
