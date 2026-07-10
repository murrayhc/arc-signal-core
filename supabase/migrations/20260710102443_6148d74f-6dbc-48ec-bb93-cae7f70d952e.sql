
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS independence_group text;

CREATE OR REPLACE FUNCTION public.derive_independence_group(
  p_base_url text,
  p_feed_url text,
  p_name text,
  p_is_synthetic boolean,
  p_id uuid
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  url text;
  host text;
  parts text[];
  n int;
  last2 text;
BEGIN
  IF COALESCE(p_is_synthetic, false) THEN
    RETURN 'synthetic:' || COALESCE(p_id::text, '');
  END IF;

  url := COALESCE(NULLIF(trim(p_base_url), ''), NULLIF(trim(p_feed_url), ''));
  IF url IS NULL THEN
    RETURN lower(COALESCE(p_name, ''));
  END IF;

  host := lower(url);
  host := regexp_replace(host, '^[a-z][a-z0-9+.-]*://', '');
  host := split_part(host, '/', 1);
  host := split_part(host, '?', 1);
  host := split_part(host, '#', 1);
  host := split_part(host, ':', 1);
  IF host LIKE 'www.%' THEN host := substring(host from 5); END IF;

  parts := string_to_array(host, '.');
  n := COALESCE(array_length(parts, 1), 0);
  IF n < 2 THEN
    RETURN COALESCE(NULLIF(host, ''), lower(COALESCE(p_name, '')));
  END IF;

  IF n >= 3 THEN
    last2 := parts[n-1] || '.' || parts[n];
    IF last2 IN (
      'co.uk','org.uk','gov.uk','ac.uk','me.uk','ltd.uk','plc.uk','net.uk','sch.uk','nhs.uk',
      'com.au','net.au','org.au','edu.au','gov.au','asn.au','id.au',
      'co.nz','net.nz','org.nz','govt.nz','ac.nz',
      'co.jp','ne.jp','or.jp','ac.jp','go.jp','ad.jp','gr.jp',
      'com.br','net.br','org.br','gov.br','edu.br',
      'co.in','net.in','org.in','gov.in','ac.in','edu.in',
      'com.cn','net.cn','org.cn','gov.cn','edu.cn',
      'com.hk','org.hk','gov.hk','edu.hk','net.hk',
      'com.sg','edu.sg','gov.sg','org.sg','net.sg',
      'co.za','org.za','gov.za','ac.za','net.za',
      'com.mx','gob.mx','org.mx','edu.mx',
      'com.tr','gov.tr','org.tr','edu.tr',
      'com.tw','org.tw','gov.tw','edu.tw',
      'co.kr','or.kr','go.kr','ac.kr',
      'co.il','org.il','gov.il','ac.il',
      'com.ar','gov.ar','org.ar','edu.ar',
      'com.co','gov.co','org.co','edu.co',
      'co.id','or.id','go.id','ac.id',
      'com.my','gov.my','org.my','edu.my'
    ) THEN
      RETURN parts[n-2] || '.' || last2;
    END IF;
  END IF;

  RETURN parts[n-1] || '.' || parts[n];
END $$;

CREATE OR REPLACE FUNCTION public.sources_set_independence_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.independence_group := public.derive_independence_group(
    NEW.base_url, NEW.feed_url, NEW.name, NEW.is_synthetic, NEW.id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sources_set_independence_group_ins ON public.sources;
CREATE TRIGGER trg_sources_set_independence_group_ins
BEFORE INSERT ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.sources_set_independence_group();

DROP TRIGGER IF EXISTS trg_sources_set_independence_group_upd ON public.sources;
CREATE TRIGGER trg_sources_set_independence_group_upd
BEFORE UPDATE OF base_url, feed_url, name, is_synthetic ON public.sources
FOR EACH ROW EXECUTE FUNCTION public.sources_set_independence_group();

-- Backfill existing rows.
UPDATE public.sources
SET independence_group = public.derive_independence_group(base_url, feed_url, name, is_synthetic, id)
WHERE independence_group IS NULL OR independence_group = '';

CREATE INDEX IF NOT EXISTS sources_independence_group_idx ON public.sources(independence_group);
