INSERT INTO public.sources (
  name,
  source_type,
  access_method,
  feed_kind,
  base_url,
  feed_url,
  is_synthetic,
  status,
  collector_supported,
  reliability_score,
  health_score,
  independence_group,
  refresh_cadence_minutes,
  metadata
)
SELECT
  'The Gazette — Corporate Insolvency',
  'regulatory',
  'rss',
  'atom',
  'thegazette.co.uk',
  'https://www.thegazette.co.uk/all-notices/notice/data.feed?categorycode=24',
  false,
  'active',
  true,
  0.92,
  0.8,
  'thegazette.co.uk',
  60,
  '{"origin":"uk_primary_seed"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.sources WHERE feed_url = 'https://www.thegazette.co.uk/all-notices/notice/data.feed?categorycode=24'
);