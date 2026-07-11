
CREATE TABLE public.delivery_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('slack','webhook')),
  url text NOT NULL,
  label text,
  profile_id uuid REFERENCES public.exposure_profiles(id) ON DELETE CASCADE,
  min_relevance numeric NOT NULL DEFAULT 0.6,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.delivery_channels TO service_role;
ALTER TABLE public.delivery_channels ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies — table holds credential-like URLs; access is exclusively via service-role server functions.
CREATE TRIGGER trg_delivery_channels_updated
  BEFORE UPDATE ON public.delivery_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.exposure_hits ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
CREATE INDEX IF NOT EXISTS exposure_hits_delivered_idx ON public.exposure_hits(delivered_at) WHERE delivered_at IS NULL;
