ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS http_etag text,
  ADD COLUMN IF NOT EXISTS http_last_modified text,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;