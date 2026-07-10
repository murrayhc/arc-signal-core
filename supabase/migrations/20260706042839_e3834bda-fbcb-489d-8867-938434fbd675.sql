
DROP POLICY IF EXISTS "Public watchlists writable" ON public.watchlists;
DROP POLICY IF EXISTS "Public watchlists updatable" ON public.watchlists;
DROP POLICY IF EXISTS "Public watchlists deletable" ON public.watchlists;
DROP POLICY IF EXISTS "Public alerts writable" ON public.alerts;
DROP POLICY IF EXISTS "Public alerts updatable" ON public.alerts;

REVOKE INSERT, UPDATE, DELETE ON public.watchlists FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.alerts FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.investigation_queries FROM anon, authenticated;
