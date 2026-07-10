
-- Extensions for scheduling & HTTP callbacks
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Embeddings & copy-loop hygiene columns
ALTER TABLE public.canonical_claims ADD COLUMN IF NOT EXISTS embedding jsonb;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS embedding jsonb;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS copy_loop_score numeric(4,3) NOT NULL DEFAULT 0;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS is_likely_copy boolean NOT NULL DEFAULT false;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS shingle_signature text;

-- Real ingestion columns for sources
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS feed_url text;
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS feed_kind text NOT NULL DEFAULT 'synthetic';

-- Prompt/response archival on task logs
ALTER TABLE public.llm_task_logs ADD COLUMN IF NOT EXISTS prompt_excerpt text;
ALTER TABLE public.llm_task_logs ADD COLUMN IF NOT EXISTS response_excerpt text;
ALTER TABLE public.llm_task_logs ADD COLUMN IF NOT EXISTS retry_of uuid;

-- Watchlists (public prototype: no auth yet)
CREATE TABLE IF NOT EXISTS public.watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sectors text[] NOT NULL DEFAULT '{}',
  regions text[] NOT NULL DEFAULT '{}',
  keywords text[] NOT NULL DEFAULT '{}',
  min_risk numeric(4,3) NOT NULL DEFAULT 0,
  min_opportunity numeric(4,3) NOT NULL DEFAULT 0,
  min_confidence numeric(4,3) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlists TO anon, authenticated;
GRANT ALL ON public.watchlists TO service_role;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public watchlists readable" ON public.watchlists FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public watchlists writable" ON public.watchlists FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public watchlists updatable" ON public.watchlists FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public watchlists deletable" ON public.watchlists FOR DELETE TO anon, authenticated USING (true);
CREATE TRIGGER trg_watchlists_updated BEFORE UPDATE ON public.watchlists FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Alerts triggered by watchlist matches
CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id uuid NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  event_candidate_id uuid NOT NULL REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, event_candidate_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO anon, authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public alerts readable" ON public.alerts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public alerts writable" ON public.alerts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public alerts updatable" ON public.alerts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Investigation queries: broaden columns for real persistence
ALTER TABLE public.investigation_queries ADD COLUMN IF NOT EXISTS brief_synth jsonb;
ALTER TABLE public.investigation_queries ADD COLUMN IF NOT EXISTS evidence_ids uuid[] NOT NULL DEFAULT '{}';
GRANT INSERT, UPDATE ON public.investigation_queries TO anon, authenticated;

-- Evidence arc write access for pipeline
GRANT INSERT, UPDATE, DELETE ON public.evidence_arcs TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.evidence_arc_steps TO service_role;

-- Cron: scan every 6 hours via the public hook route
-- Uses the project's stable preview URL so external cron always reaches the latest build.
DO $$
DECLARE
  hook_url text := 'https://project--frevemxrjbyngksweopd-dev.lovable.app/api/public/hooks/scan';
  anon_key text := 'sb_publishable_YUOCUf1ZFho-dQUcwQ8XFg_JRHJVaZj';
BEGIN
  -- Remove any previous version of the job before rescheduling
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'archlight-scan-6h';
  PERFORM cron.schedule(
    'archlight-scan-6h',
    '0 */6 * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','apikey', %L),
        body := jsonb_build_object('source','pg_cron')
      );
    $cron$, hook_url, anon_key)
  );
END $$;
