
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS belief_stress numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS belief_trajectory numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS belief_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS belief_components jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.entities DROP CONSTRAINT IF EXISTS entities_belief_stress_range;
ALTER TABLE public.entities ADD CONSTRAINT entities_belief_stress_range CHECK (belief_stress >= 0 AND belief_stress <= 1);
ALTER TABLE public.entities DROP CONSTRAINT IF EXISTS entities_belief_trajectory_range;
ALTER TABLE public.entities ADD CONSTRAINT entities_belief_trajectory_range CHECK (belief_trajectory >= -1 AND belief_trajectory <= 1);

CREATE TABLE IF NOT EXISTS public.entity_belief_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  stress numeric,
  trajectory numeric,
  trigger text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entity_belief_history_entity_at_idx ON public.entity_belief_history(entity_id, at DESC);

GRANT SELECT ON public.entity_belief_history TO anon, authenticated;
GRANT ALL ON public.entity_belief_history TO service_role;

ALTER TABLE public.entity_belief_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_belief_history public read" ON public.entity_belief_history;
CREATE POLICY "entity_belief_history public read" ON public.entity_belief_history FOR SELECT USING (true);
