
-- ==== ENUMS ============================================================
CREATE TYPE public.source_type AS ENUM ('rss','news','trade_press','regulatory','procurement','filings','company_site','press_release','court','patent','commodity','market_data','macro','social','forum','synthetic');
CREATE TYPE public.source_status AS ENUM ('active','paused','degraded','failed','disabled');
CREATE TYPE public.claim_type AS ENUM ('layoff','hiring','regulatory','procurement','supply_chain','market','commodity','company_statement','executive','legal','complaint','demand','funding','macro','unknown');
CREATE TYPE public.factuality AS ENUM ('strongly_supported','supported','weak_single_source','contradicted','stale','recycled','unverified','needs_review');
CREATE TYPE public.lineage_relation AS ENUM ('origin_candidate','independent_support','likely_copy','commentary','contradiction','unknown');
CREATE TYPE public.event_class AS ENUM ('risk','opportunity','mixed','watch','unknown');
CREATE TYPE public.event_status AS ENUM ('new','rising','stable','declining','confirmed','dismissed','escalated','needs_review');
CREATE TYPE public.impact_type AS ENUM ('beneficiary','harmed','mixed','exposed','watch_only','unknown');
CREATE TYPE public.node_kind AS ENUM ('event','source','claim','signal','company','sector','commodity','instrument','region','regulation','procurement','risk','opportunity','contradiction','gap','positioning');
CREATE TYPE public.edge_kind AS ENUM ('reported_by','derived_from','supports','contradicts','affects','exposes','amplifies','weakens','causes_pressure','creates_opportunity','linked','priced_by','regulated_by','supplied_by','depends_on','competes_with');
CREATE TYPE public.review_status AS ENUM ('pending','approved','rejected','needs_more_evidence');
CREATE TYPE public.scan_status AS ENUM ('queued','running','completed','completed_with_errors','failed');

-- ==== SOURCES ==========================================================
CREATE TABLE public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source_type public.source_type NOT NULL,
  access_method TEXT NOT NULL DEFAULT 'rss',
  base_url TEXT,
  status public.source_status NOT NULL DEFAULT 'active',
  reliability_score NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  refresh_cadence_minutes INT NOT NULL DEFAULT 60,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  health_score NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  collector_supported BOOLEAN NOT NULL DEFAULT true,
  is_synthetic BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== ENTITIES =========================================================
CREATE TABLE public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,          -- company, sector, commodity, region, regulation, instrument
  canonical_name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  ticker TEXT,
  sector TEXT,
  region TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, canonical_name)
);

-- ==== DOCUMENTS ========================================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  url TEXT,
  title TEXT NOT NULL,
  body TEXT,
  document_type TEXT NOT NULL DEFAULT 'article',
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  author TEXT,
  language TEXT DEFAULT 'en',
  raw_hash TEXT,
  normalised_hash TEXT,
  is_synthetic BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_source ON public.documents(source_id);
CREATE INDEX idx_documents_published ON public.documents(published_at DESC);

-- ==== CANONICAL CLAIMS =================================================
CREATE TABLE public.canonical_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_text TEXT NOT NULL,
  normalised_claim_text TEXT NOT NULL UNIQUE,
  claim_type public.claim_type NOT NULL DEFAULT 'unknown',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_seen_source_id UUID REFERENCES public.sources(id),
  origin_candidate_url TEXT,
  independent_source_count INT NOT NULL DEFAULT 0,
  repeat_count INT NOT NULL DEFAULT 0,
  contradiction_count INT NOT NULL DEFAULT 0,
  support_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  reliability_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  factuality public.factuality NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== ATOMIC CLAIMS ====================================================
CREATE TABLE public.atomic_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id),
  canonical_claim_id UUID REFERENCES public.canonical_claims(id),
  claim_text TEXT NOT NULL,
  claim_type public.claim_type NOT NULL DEFAULT 'unknown',
  entities TEXT[] NOT NULL DEFAULT '{}',
  sectors TEXT[] NOT NULL DEFAULT '{}',
  regions TEXT[] NOT NULL DEFAULT '{}',
  commodities TEXT[] NOT NULL DEFAULT '{}',
  instruments TEXT[] NOT NULL DEFAULT '{}',
  event_date DATE,
  extraction_method TEXT NOT NULL DEFAULT 'llm',
  extraction_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  specificity_score NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  factuality_label public.factuality NOT NULL DEFAULT 'unverified',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_atomic_claims_document ON public.atomic_claims(document_id);
CREATE INDEX idx_atomic_claims_canonical ON public.atomic_claims(canonical_claim_id);

-- ==== CLAIM CLUSTERS ===================================================
CREATE TABLE public.claim_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_claim_id UUID NOT NULL REFERENCES public.canonical_claims(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT,
  source_count INT NOT NULL DEFAULT 0,
  independent_source_count INT NOT NULL DEFAULT 0,
  copied_source_count INT NOT NULL DEFAULT 0,
  contradiction_count INT NOT NULL DEFAULT 0,
  reliability_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  momentum_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== CLAIM LINEAGE ====================================================
CREATE TABLE public.claim_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_claim_id UUID NOT NULL REFERENCES public.canonical_claims(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.sources(id),
  document_id UUID REFERENCES public.documents(id),
  url TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  relation_to_origin public.lineage_relation NOT NULL DEFAULT 'unknown',
  is_likely_copy BOOLEAN NOT NULL DEFAULT false,
  origin_confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== SIGNAL CLUSTERS ==================================================
CREATE TABLE public.signal_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  cluster_type TEXT NOT NULL,
  sector TEXT,
  region TEXT,
  strength NUMERIC(4,3) NOT NULL DEFAULT 0,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  novelty NUMERIC(4,3) NOT NULL DEFAULT 0,
  explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== EVENT CANDIDATES =================================================
CREATE TABLE public.event_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_class public.event_class NOT NULL DEFAULT 'unknown',
  summary TEXT,
  status public.event_status NOT NULL DEFAULT 'new',
  severity TEXT NOT NULL DEFAULT 'moderate',
  probability NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  time_window_start TIMESTAMPTZ,
  time_window_end TIMESTAMPTZ,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  primary_entity_id UUID REFERENCES public.entities(id),
  affected_sector TEXT,
  affected_region TEXT,
  evidence_count INT NOT NULL DEFAULT 0,
  source_diversity_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  signal_strength NUMERIC(4,3) NOT NULL DEFAULT 0,
  novelty_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  opportunity_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  risk_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  created_from_scan_run_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_status ON public.event_candidates(status);
CREATE INDEX idx_event_class ON public.event_candidates(event_class);

-- ==== COMPANY IMPACTS ==================================================
CREATE TABLE public.company_impacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_candidate_id UUID REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  claim_cluster_id UUID REFERENCES public.claim_clusters(id),
  entity_id UUID REFERENCES public.entities(id),
  company_name TEXT NOT NULL,
  impact_type public.impact_type NOT NULL DEFAULT 'unknown',
  impact_pathway TEXT NOT NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  risk_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  opportunity_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  watch_signals TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_company_impacts_event ON public.company_impacts(event_candidate_id);

-- ==== REVENUE LENSES ===================================================
CREATE TABLE public.revenue_lenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  user_type TEXT,
  target_sectors TEXT[] NOT NULL DEFAULT '{}',
  target_regions TEXT[] NOT NULL DEFAULT '{}',
  offer_types TEXT[] NOT NULL DEFAULT '{}',
  buyer_personas TEXT[] NOT NULL DEFAULT '{}',
  average_deal_size TEXT,
  sales_cycle TEXT,
  excluded_sectors TEXT[] NOT NULL DEFAULT '{}',
  risk_appetite TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== OPPORTUNITY CARDS ================================================
CREATE TABLE public.opportunity_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_candidate_id UUID REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  revenue_lens_id UUID REFERENCES public.revenue_lenses(id),
  title TEXT NOT NULL,
  opportunity_type TEXT NOT NULL,
  summary TEXT,
  buyer_pain TEXT,
  likely_buyers TEXT[] NOT NULL DEFAULT '{}',
  affected_sectors TEXT[] NOT NULL DEFAULT '{}',
  affected_regions TEXT[] NOT NULL DEFAULT '{}',
  suggested_offer TEXT,
  urgency_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  commercial_value_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  evidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  actionability_score NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  opportunity_logic TEXT,
  risk_logic TEXT,
  next_best_action TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== STRATEGIC POSITIONING ============================================
CREATE TABLE public.strategic_positioning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_candidate_id UUID REFERENCES public.event_candidates(id) ON DELETE CASCADE,
  company_impact_id UUID REFERENCES public.company_impacts(id),
  opportunity_card_id UUID REFERENCES public.opportunity_cards(id),
  title TEXT NOT NULL,
  user_type TEXT NOT NULL,
  positioning_angle TEXT NOT NULL,
  how_it_could_be_used TEXT NOT NULL,
  why_it_may_matter TEXT NOT NULL,
  evidence_summary TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  constraints TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== INVESTIGATION QUERIES ============================================
CREATE TABLE public.investigation_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_claim_id UUID REFERENCES public.canonical_claims(id),
  event_candidate_id UUID REFERENCES public.event_candidates(id),
  query_text TEXT NOT NULL,
  query_class TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== LLM TASK LOGS ====================================================
CREATE TABLE public.llm_task_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_hash TEXT,
  output_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  latency_ms INT,
  estimated_cost NUMERIC(10,6),
  validation_status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== GRAPH NODES/EDGES/SNAPSHOTS =====================================
CREATE TABLE public.graph_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type public.node_kind NOT NULL,
  ref_type TEXT,
  ref_id UUID,
  title TEXT NOT NULL,
  summary TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  risk_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  opportunity_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  impact_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  freshness_score NUMERIC(4,3) NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.graph_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  edge_type public.edge_kind NOT NULL,
  label TEXT,
  weight NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  evidence_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_graph_edges_source ON public.graph_edges(source_node_id);
CREATE INDEX idx_graph_edges_target ON public.graph_edges(target_node_id);

CREATE TABLE public.graph_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  node_count INT NOT NULL DEFAULT 0,
  edge_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== EVIDENCE ARCS ===================================================
CREATE TABLE public.evidence_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_node_id UUID REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  root_event_candidate_id UUID REFERENCES public.event_candidates(id),
  root_claim_id UUID REFERENCES public.canonical_claims(id),
  title TEXT NOT NULL,
  summary TEXT,
  max_degrees INT NOT NULL DEFAULT 6,
  true_potential_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  origin_strength NUMERIC(4,3) NOT NULL DEFAULT 0,
  source_diversity NUMERIC(4,3) NOT NULL DEFAULT 0,
  contradiction_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  momentum_score NUMERIC(4,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.evidence_arc_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_arc_id UUID NOT NULL REFERENCES public.evidence_arcs(id) ON DELETE CASCADE,
  degree INT NOT NULL,
  node_type public.node_kind NOT NULL,
  node_id UUID,
  relationship_type public.edge_kind,
  explanation TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5,
  source_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== SCAN RUNS =======================================================
CREATE TABLE public.scan_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status public.scan_status NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  sources_attempted INT NOT NULL DEFAULT 0,
  sources_succeeded INT NOT NULL DEFAULT 0,
  sources_failed INT NOT NULL DEFAULT 0,
  documents_collected INT NOT NULL DEFAULT 0,
  atomic_claims_created INT NOT NULL DEFAULT 0,
  events_created INT NOT NULL DEFAULT 0,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ==== REVIEW QUEUE ====================================================
CREATE TABLE public.review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type TEXT NOT NULL,
  item_id UUID NOT NULL,
  status public.review_status NOT NULL DEFAULT 'pending',
  reason TEXT,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==== GRANTS ==========================================================
GRANT SELECT ON public.sources, public.entities, public.documents,
  public.canonical_claims, public.atomic_claims, public.claim_clusters,
  public.claim_lineage, public.signal_clusters, public.event_candidates,
  public.company_impacts, public.revenue_lenses, public.opportunity_cards,
  public.strategic_positioning, public.investigation_queries,
  public.llm_task_logs, public.graph_nodes, public.graph_edges,
  public.graph_snapshots, public.evidence_arcs, public.evidence_arc_steps,
  public.scan_runs, public.review_queue TO anon, authenticated;

GRANT ALL ON public.sources, public.entities, public.documents,
  public.canonical_claims, public.atomic_claims, public.claim_clusters,
  public.claim_lineage, public.signal_clusters, public.event_candidates,
  public.company_impacts, public.revenue_lenses, public.opportunity_cards,
  public.strategic_positioning, public.investigation_queries,
  public.llm_task_logs, public.graph_nodes, public.graph_edges,
  public.graph_snapshots, public.evidence_arcs, public.evidence_arc_steps,
  public.scan_runs, public.review_queue TO service_role;

-- ==== RLS =============================================================
-- Archlight surfaces PUBLIC intelligence: anyone can read; only server pipeline (service_role) writes.
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'sources','entities','documents','canonical_claims','atomic_claims',
    'claim_clusters','claim_lineage','signal_clusters','event_candidates',
    'company_impacts','revenue_lenses','opportunity_cards','strategic_positioning',
    'investigation_queries','llm_task_logs','graph_nodes','graph_edges',
    'graph_snapshots','evidence_arcs','evidence_arc_steps','scan_runs','review_queue'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY "Public intelligence readable by all" ON public.%I FOR SELECT TO anon, authenticated USING (true);', t);
  END LOOP;
END $$;

-- ==== UPDATED_AT TRIGGER ==============================================
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'sources','entities','canonical_claims','atomic_claims','claim_clusters',
    'signal_clusters','event_candidates','company_impacts','revenue_lenses',
    'opportunity_cards','strategic_positioning','investigation_queries',
    'graph_nodes','graph_edges','evidence_arcs'
  ]) LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', t, t);
  END LOOP;
END $$;
