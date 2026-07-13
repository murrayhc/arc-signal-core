
-- Wipe test data
DELETE FROM public.briefings;
DELETE FROM public.investigation_queries;

-- Add user_id columns
ALTER TABLE public.briefings
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.investigation_queries
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS briefings_user_id_idx ON public.briefings(user_id);
CREATE INDEX IF NOT EXISTS investigation_queries_user_id_idx ON public.investigation_queries(user_id);

-- Drop existing public/permissive policies
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='briefings' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.briefings', p.policyname);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='investigation_queries' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.investigation_queries', p.policyname);
  END LOOP;
END $$;

REVOKE ALL ON public.briefings FROM anon, authenticated;
REVOKE ALL ON public.investigation_queries FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefings TO authenticated;
GRANT ALL ON public.briefings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investigation_queries TO authenticated;
GRANT ALL ON public.investigation_queries TO service_role;

ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investigation_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "briefings_select_own" ON public.briefings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "briefings_insert_own" ON public.briefings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "briefings_update_own" ON public.briefings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "briefings_delete_own" ON public.briefings FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "investigation_queries_select_own" ON public.investigation_queries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "investigation_queries_insert_own" ON public.investigation_queries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "investigation_queries_update_own" ON public.investigation_queries FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "investigation_queries_delete_own" ON public.investigation_queries FOR DELETE TO authenticated USING (auth.uid() = user_id);
