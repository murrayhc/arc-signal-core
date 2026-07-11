
CREATE TABLE public.briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.exposure_profiles(id) ON DELETE CASCADE,
  briefing_date date NOT NULL,
  summary text NOT NULL,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, briefing_date)
);
CREATE INDEX briefings_profile_date_idx ON public.briefings(profile_id, briefing_date DESC);
GRANT SELECT ON public.briefings TO anon, authenticated;
GRANT ALL ON public.briefings TO service_role;
ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Briefings readable by all"
  ON public.briefings FOR SELECT USING (true);
