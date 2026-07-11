ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS full_text text,
  ADD COLUMN IF NOT EXISTS body_fetched_at timestamptz;
