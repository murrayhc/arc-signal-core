
DROP POLICY IF EXISTS "Authenticated can insert scan settings" ON public.scan_settings;
DROP POLICY IF EXISTS "Authenticated can update scan settings" ON public.scan_settings;
REVOKE INSERT, UPDATE, DELETE ON public.scan_settings FROM anon, authenticated;
