
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'other';

ALTER TABLE public.sources
  DROP CONSTRAINT IF EXISTS sources_tier_check;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_tier_check CHECK (tier IN ('primary','mainstream','other'));

-- Backfill primary
UPDATE public.sources
   SET tier = 'primary'
 WHERE tier <> 'primary'
   AND (
        (metadata->>'origin') = 'uk_primary_seed'
        OR source_type IN ('regulatory','filings','court','procurement','press_release')
        OR name IN ('Companies House','Contracts Finder')
        OR base_url IN ('company-information.service.gov.uk','contractsfinder.service.gov.uk')
   );

-- Backfill mainstream
UPDATE public.sources
   SET tier = 'mainstream'
 WHERE tier = 'other'
   AND COALESCE(is_synthetic, false) = false
   AND source_type IN ('news','trade_press','rss');

CREATE INDEX IF NOT EXISTS sources_tier_idx ON public.sources(tier);

ALTER TABLE public.outcome_predictions
  ADD COLUMN IF NOT EXISTS before_mainstream boolean NOT NULL DEFAULT false;
