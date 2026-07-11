ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS company_number text,
  ADD COLUMN IF NOT EXISTS company_number_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_entities_company_number ON public.entities(company_number) WHERE company_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entities_ch_checked_at ON public.entities(company_number_checked_at NULLS FIRST);