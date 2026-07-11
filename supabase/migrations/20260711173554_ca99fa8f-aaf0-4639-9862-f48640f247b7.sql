ALTER TABLE public.entity_relationships
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'inferred',
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS natures jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entity_relationships_source_check') THEN
    ALTER TABLE public.entity_relationships
      ADD CONSTRAINT entity_relationships_source_check CHECK (source IN ('inferred','companies_house'));
  END IF;
END $$;

-- Dedupe any existing duplicates before adding unique constraint (keep oldest).
DELETE FROM public.entity_relationships a
USING public.entity_relationships b
WHERE a.ctid < b.ctid
  AND a.from_entity_id = b.from_entity_id
  AND a.to_entity_id = b.to_entity_id
  AND a.relationship_type = b.relationship_type;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'entity_relationships_from_to_type_unique'
  ) THEN
    ALTER TABLE public.entity_relationships
      ADD CONSTRAINT entity_relationships_from_to_type_unique
      UNIQUE (from_entity_id, to_entity_id, relationship_type);
  END IF;
END $$;
