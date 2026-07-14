-- Repoint the scan cron to the production URL.
-- The previous target (…-dev.lovable.app preview URL, set in migration
-- 20260706042808) is dead — it returns HTTP 404, so pg_cron's every-6-hours
-- POST never reached the hook and automated global scans were not running.
-- arc-signal-core.lovable.app serves the hook (verified HTTP 200). Same job
-- name, same every-6-hours cadence, same publishable key gate.
DO $$
DECLARE
  hook_url text := 'https://arc-signal-core.lovable.app/api/public/hooks/scan';
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
