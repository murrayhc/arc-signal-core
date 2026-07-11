ALTER TABLE public.review_queue
  ADD COLUMN IF NOT EXISTS reviewed_by text NOT NULL DEFAULT 'owner';

CREATE TABLE public.reviewer_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer text NOT NULL DEFAULT 'owner',
  review_item_id uuid,
  item_type text,
  subject_kind text,
  subject_id text,
  verdict text,
  predicted_at timestamptz NOT NULL DEFAULT now(),
  outcome text CHECK (outcome IN ('correct','incorrect','unresolvable')),
  brier numeric,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reviewer_verdicts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviewer_verdicts TO authenticated;
GRANT ALL ON public.reviewer_verdicts TO service_role;

ALTER TABLE public.reviewer_verdicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviewer_verdicts public read"
  ON public.reviewer_verdicts FOR SELECT
  USING (true);

CREATE TRIGGER reviewer_verdicts_set_updated_at
  BEFORE UPDATE ON public.reviewer_verdicts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS reviewer_verdicts_open_idx
  ON public.reviewer_verdicts(reviewer, graded_at)
  WHERE graded_at IS NULL;

CREATE INDEX IF NOT EXISTS reviewer_verdicts_subject_idx
  ON public.reviewer_verdicts(item_type, subject_kind, subject_id);