
-- Drop overly permissive SELECT policies
DROP POLICY IF EXISTS "Public alerts readable" ON public.alerts;
DROP POLICY IF EXISTS "Briefings readable by all" ON public.briefings;
DROP POLICY IF EXISTS "Exposure hits readable by all" ON public.exposure_hits;
DROP POLICY IF EXISTS "Exposure items readable by all" ON public.exposure_items;
DROP POLICY IF EXISTS "Exposure profiles readable by all" ON public.exposure_profiles;
DROP POLICY IF EXISTS "Public watchlists readable" ON public.watchlists;
DROP POLICY IF EXISTS "Authenticated can read scan settings" ON public.scan_settings;

-- Revoke table grants from anon/authenticated; server code uses service_role which bypasses RLS.
REVOKE ALL ON public.alerts FROM anon, authenticated;
REVOKE ALL ON public.briefings FROM anon, authenticated;
REVOKE ALL ON public.exposure_hits FROM anon, authenticated;
REVOKE ALL ON public.exposure_items FROM anon, authenticated;
REVOKE ALL ON public.exposure_profiles FROM anon, authenticated;
REVOKE ALL ON public.watchlists FROM anon, authenticated;
REVOKE ALL ON public.scan_settings FROM anon, authenticated;
REVOKE ALL ON public.delivery_channels FROM anon, authenticated;

-- Ensure service_role retains access
GRANT ALL ON public.alerts TO service_role;
GRANT ALL ON public.briefings TO service_role;
GRANT ALL ON public.exposure_hits TO service_role;
GRANT ALL ON public.exposure_items TO service_role;
GRANT ALL ON public.exposure_profiles TO service_role;
GRANT ALL ON public.watchlists TO service_role;
GRANT ALL ON public.scan_settings TO service_role;
GRANT ALL ON public.delivery_channels TO service_role;
