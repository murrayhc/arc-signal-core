
DELETE FROM public.delivery_channels;

ALTER TABLE public.delivery_channels
  ADD COLUMN user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS delivery_channels_user_idx ON public.delivery_channels(user_id);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='delivery_channels'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

REVOKE ALL ON public.delivery_channels FROM anon, authenticated;
GRANT ALL ON public.delivery_channels TO service_role;

ALTER TABLE public.delivery_channels ENABLE ROW LEVEL SECURITY;
