ALTER TABLE public.canonical_claims
  ADD COLUMN IF NOT EXISTS manipulation_risk_score numeric NOT NULL DEFAULT 0;