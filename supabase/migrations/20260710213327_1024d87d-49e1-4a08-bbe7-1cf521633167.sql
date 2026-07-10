
-- 1. Fix trigger: only derive when not explicitly provided
CREATE OR REPLACE FUNCTION public.sources_set_independence_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.independence_group := COALESCE(
    NULLIF(trim(NEW.independence_group), ''),
    public.derive_independence_group(NEW.base_url, NEW.feed_url, NEW.name, NEW.is_synthetic, NEW.id)
  );
  RETURN NEW;
END $function$;

-- 2. Seed UK primary sources (idempotent via WHERE NOT EXISTS on feed_url)
INSERT INTO public.sources (name, source_type, access_method, base_url, feed_url, feed_kind, is_synthetic, status, reliability_score, health_score, collector_supported, independence_group, refresh_cadence_minutes, metadata)
SELECT * FROM (VALUES
  ('FCA — News',                              'regulatory'::source_type, 'rss',  'fca.org.uk',            'https://www.fca.org.uk/news/rss.xml',                                                       'rss',  false, 'active'::source_status, 0.900::numeric, 0.800::numeric, true, 'fca.org.uk',              60, '{"origin":"uk_primary_seed"}'::jsonb),
  ('Bank of England — News',                  'regulatory'::source_type, 'rss',  'bankofengland.co.uk',   'https://www.bankofengland.co.uk/rss/news',                                                  'rss',  false, 'active'::source_status, 0.900::numeric, 0.800::numeric, true, 'bankofengland.co.uk',     60, '{"origin":"uk_primary_seed"}'::jsonb),
  ('Competition and Markets Authority',       'regulatory'::source_type, 'rss',  'www.gov.uk',            'https://www.gov.uk/government/organisations/competition-and-markets-authority.atom',        'atom', false, 'active'::source_status, 0.900::numeric, 0.800::numeric, true, 'cma.gov.uk',              60, '{"origin":"uk_primary_seed"}'::jsonb),
  ('Insolvency Service',                      'regulatory'::source_type, 'rss',  'www.gov.uk',            'https://www.gov.uk/government/organisations/insolvency-service.atom',                       'atom', false, 'active'::source_status, 0.900::numeric, 0.800::numeric, true, 'insolvency.gov.uk',       60, '{"origin":"uk_primary_seed"}'::jsonb),
  ('Companies House',                         'regulatory'::source_type, 'rss',  'www.gov.uk',            'https://www.gov.uk/government/organisations/companies-house.atom',                          'atom', false, 'active'::source_status, 0.900::numeric, 0.800::numeric, true, 'companieshouse.gov.uk',   60, '{"origin":"uk_primary_seed"}'::jsonb),
  ('HM Revenue & Customs',                    'regulatory'::source_type, 'rss',  'www.gov.uk',            'https://www.gov.uk/government/organisations/hm-revenue-customs.atom',                       'atom', false, 'active'::source_status, 0.850::numeric, 0.800::numeric, true, 'hmrc.gov.uk',             60, '{"origin":"uk_primary_seed"}'::jsonb),
  ('Department for Business and Trade',       'regulatory'::source_type, 'rss',  'www.gov.uk',            'https://www.gov.uk/government/organisations/department-for-business-and-trade.atom',        'atom', false, 'active'::source_status, 0.850::numeric, 0.800::numeric, true, 'dbt.gov.uk',              60, '{"origin":"uk_primary_seed"}'::jsonb),
  ('Serious Fraud Office',                    'regulatory'::source_type, 'rss',  'www.gov.uk',            'https://www.gov.uk/government/organisations/serious-fraud-office.atom',                     'atom', false, 'active'::source_status, 0.900::numeric, 0.800::numeric, true, 'sfo.gov.uk',              60, '{"origin":"uk_primary_seed"}'::jsonb)
) AS v(name, source_type, access_method, base_url, feed_url, feed_kind, is_synthetic, status, reliability_score, health_score, collector_supported, independence_group, refresh_cadence_minutes, metadata)
WHERE NOT EXISTS (SELECT 1 FROM public.sources s WHERE s.feed_url = v.feed_url);
