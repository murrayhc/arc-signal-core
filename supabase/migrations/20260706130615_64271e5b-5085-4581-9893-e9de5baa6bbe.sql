
CREATE TABLE public.forensic_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('opportunity','event')),
  subject_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  model TEXT,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  confidence NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX forensic_reports_subject_idx ON public.forensic_reports(subject_type, subject_id);
CREATE INDEX forensic_reports_updated_idx ON public.forensic_reports(updated_at DESC);

GRANT SELECT ON public.forensic_reports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forensic_reports TO authenticated;
GRANT ALL ON public.forensic_reports TO service_role;

ALTER TABLE public.forensic_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forensic_reports_public_read" ON public.forensic_reports FOR SELECT USING (true);

CREATE TRIGGER trg_forensic_reports_updated_at BEFORE UPDATE ON public.forensic_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
