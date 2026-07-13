
DELETE FROM public.alerts;
DELETE FROM public.watchlists;

ALTER TABLE public.watchlists
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.alerts
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS watchlists_user_idx ON public.watchlists(user_id);
CREATE INDEX IF NOT EXISTS alerts_user_seen_idx ON public.alerts(user_id, seen);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('watchlists','alerts')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts     ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts     TO authenticated;
GRANT ALL ON public.watchlists TO service_role;
GRANT ALL ON public.alerts     TO service_role;

CREATE POLICY "own_watchlists_select" ON public.watchlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_watchlists_insert" ON public.watchlists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_watchlists_update" ON public.watchlists FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_watchlists_delete" ON public.watchlists FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "own_alerts_select" ON public.alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_alerts_insert" ON public.alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_alerts_update" ON public.alerts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_alerts_delete" ON public.alerts FOR DELETE USING (auth.uid() = user_id);
