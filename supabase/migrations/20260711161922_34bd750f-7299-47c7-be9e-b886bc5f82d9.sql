
CREATE TABLE public.exposure_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exposure_profiles TO anon, authenticated;
GRANT ALL ON public.exposure_profiles TO service_role;
ALTER TABLE public.exposure_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Exposure profiles readable by all"
  ON public.exposure_profiles FOR SELECT USING (true);
CREATE TRIGGER trg_exposure_profiles_updated
  BEFORE UPDATE ON public.exposure_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.exposure_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.exposure_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('company','supplier','customer','competitor','sector','region','commodity','keyword')),
  name text NOT NULL,
  entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  weight numeric NOT NULL DEFAULT 1,
  value_gbp numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exposure_items_profile_idx ON public.exposure_items(profile_id);
GRANT SELECT ON public.exposure_items TO anon, authenticated;
GRANT ALL ON public.exposure_items TO service_role;
ALTER TABLE public.exposure_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Exposure items readable by all"
  ON public.exposure_items FOR SELECT USING (true);
CREATE TRIGGER trg_exposure_items_updated
  BEFORE UPDATE ON public.exposure_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.exposure_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.exposure_profiles(id) ON DELETE CASCADE,
  exposure_item_id uuid NOT NULL REFERENCES public.exposure_items(id) ON DELETE CASCADE,
  event_candidate_id uuid NOT NULL REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  relevance numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('risk','opportunity','mixed')),
  match_kind text,
  rationale text,
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exposure_item_id, event_candidate_id)
);
CREATE INDEX exposure_hits_profile_seen_rel_idx
  ON public.exposure_hits(profile_id, seen, relevance DESC);
GRANT SELECT ON public.exposure_hits TO anon, authenticated;
GRANT ALL ON public.exposure_hits TO service_role;
ALTER TABLE public.exposure_hits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Exposure hits readable by all"
  ON public.exposure_hits FOR SELECT USING (true);
