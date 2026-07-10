INSERT INTO public.entities (canonical_name, ticker, sector, region, aliases, entity_type)
VALUES ('Babcock International', 'BAB.L', 'defense', 'uk', ARRAY['Babcock','Babcock International Group'], 'company')
ON CONFLICT DO NOTHING;