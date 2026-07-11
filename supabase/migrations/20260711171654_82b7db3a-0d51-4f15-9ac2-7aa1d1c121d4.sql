
CREATE TABLE public.distress_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type text NOT NULL UNIQUE,
  prevalence_in_failures numeric NOT NULL DEFAULT 0,
  median_lead_days numeric,
  sample_size int NOT NULL DEFAULT 0,
  mined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.distress_signatures TO anon, authenticated;
GRANT ALL ON public.distress_signatures TO service_role;
ALTER TABLE public.distress_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "distress_signatures public read" ON public.distress_signatures FOR SELECT USING (true);

CREATE TRIGGER trg_distress_signatures_updated
BEFORE UPDATE ON public.distress_signatures
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.company_distress_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  company_number text,
  profile_score numeric NOT NULL DEFAULT 0,
  matched_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  window_months int NOT NULL DEFAULT 18,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id)
);
GRANT SELECT ON public.company_distress_profiles TO anon, authenticated;
GRANT ALL ON public.company_distress_profiles TO service_role;
ALTER TABLE public.company_distress_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_distress_profiles public read" ON public.company_distress_profiles FOR SELECT USING (true);

CREATE TRIGGER trg_company_distress_profiles_updated
BEFORE UPDATE ON public.company_distress_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_company_distress_profiles_score
ON public.company_distress_profiles (profile_score DESC);
