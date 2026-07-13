
-- Wipe test data (respect FKs)
DELETE FROM public.exposure_hits;
DELETE FROM public.exposure_items;
DELETE FROM public.exposure_profiles;

-- Add user_id columns
ALTER TABLE public.exposure_profiles
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.exposure_items
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.exposure_hits
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS exposure_profiles_user_idx ON public.exposure_profiles(user_id);
CREATE INDEX IF NOT EXISTS exposure_items_user_idx ON public.exposure_items(user_id);
CREATE INDEX IF NOT EXISTS exposure_hits_user_idx ON public.exposure_hits(user_id);

-- Drop any existing permissive policies (safe no-op if none)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('exposure_profiles','exposure_items','exposure_hits')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Ensure RLS enabled
ALTER TABLE public.exposure_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exposure_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exposure_hits     ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exposure_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exposure_items    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exposure_hits     TO authenticated;
GRANT ALL ON public.exposure_profiles TO service_role;
GRANT ALL ON public.exposure_items    TO service_role;
GRANT ALL ON public.exposure_hits     TO service_role;

-- Per-user policies
CREATE POLICY "own_profiles_select" ON public.exposure_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_profiles_insert" ON public.exposure_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_profiles_update" ON public.exposure_profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_profiles_delete" ON public.exposure_profiles FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "own_items_select" ON public.exposure_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_items_insert" ON public.exposure_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_items_update" ON public.exposure_items FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_items_delete" ON public.exposure_items FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "own_hits_select" ON public.exposure_hits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_hits_insert" ON public.exposure_hits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_hits_update" ON public.exposure_hits FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_hits_delete" ON public.exposure_hits FOR DELETE USING (auth.uid() = user_id);
