-- Dedicated source that member-triggered "Scan my items" fetches attribute to.
-- documents.source_id is a NOT NULL FK to sources, so member-scan documents
-- need a real source row. Fixed id is referenced by scanMyItems in code.
insert into public.sources
  (id, name, source_type, access_method, reliability_score, health_score, status, is_synthetic)
values
  (
    '512a216f-ddc2-443b-95e9-a5443d92fba6',
    'Member on-demand scan',
    'news'::public.source_type,
    'api',
    0.5,
    0.5,
    'active'::public.source_status,
    false
  )
on conflict (id) do nothing;
