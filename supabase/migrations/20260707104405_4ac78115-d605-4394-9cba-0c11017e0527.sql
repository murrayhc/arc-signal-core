
-- 1) Restrict SELECT on internal operational tables (llm_task_logs, scan_runs)
DROP POLICY IF EXISTS "Public intelligence readable by all" ON public.llm_task_logs;
DROP POLICY IF EXISTS "Public intelligence readable by all" ON public.scan_runs;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.llm_task_logs FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.scan_runs FROM anon, authenticated;
GRANT ALL ON public.llm_task_logs TO service_role;
GRANT ALL ON public.scan_runs TO service_role;

-- 2) Remove overly permissive write policies (USING/WITH CHECK true) on write operations.
-- All writes are performed server-side via supabaseAdmin (service_role), which bypasses RLS.
DROP POLICY IF EXISTS "Public watchlists writable" ON public.watchlists;
DROP POLICY IF EXISTS "Public watchlists updatable" ON public.watchlists;
DROP POLICY IF EXISTS "Public watchlists deletable" ON public.watchlists;

DROP POLICY IF EXISTS "Public alerts writable" ON public.alerts;
DROP POLICY IF EXISTS "Public alerts updatable" ON public.alerts;

DROP POLICY IF EXISTS "scan_settings_insert_auth" ON public.scan_settings;
DROP POLICY IF EXISTS "scan_settings_update_auth" ON public.scan_settings;
