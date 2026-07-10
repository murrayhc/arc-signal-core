export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          event_candidate_id: string
          id: string
          reason: string
          seen: boolean
          severity: string
          watchlist_id: string
        }
        Insert: {
          created_at?: string
          event_candidate_id: string
          id?: string
          reason: string
          seen?: boolean
          severity?: string
          watchlist_id: string
        }
        Update: {
          created_at?: string
          event_candidate_id?: string
          id?: string
          reason?: string
          seen?: boolean
          severity?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_event_candidate_id_fkey"
            columns: ["event_candidate_id"]
            isOneToOne: false
            referencedRelation: "event_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      atomic_claims: {
        Row: {
          canonical_claim_id: string | null
          claim_text: string
          claim_type: Database["public"]["Enums"]["claim_type"]
          commodities: string[]
          created_at: string
          document_id: string
          entities: string[]
          event_date: string | null
          extraction_confidence: number
          extraction_method: string
          factuality_label: Database["public"]["Enums"]["factuality"]
          id: string
          instruments: string[]
          metadata: Json
          regions: string[]
          sectors: string[]
          source_id: string
          specificity_score: number
          updated_at: string
        }
        Insert: {
          canonical_claim_id?: string | null
          claim_text: string
          claim_type?: Database["public"]["Enums"]["claim_type"]
          commodities?: string[]
          created_at?: string
          document_id: string
          entities?: string[]
          event_date?: string | null
          extraction_confidence?: number
          extraction_method?: string
          factuality_label?: Database["public"]["Enums"]["factuality"]
          id?: string
          instruments?: string[]
          metadata?: Json
          regions?: string[]
          sectors?: string[]
          source_id: string
          specificity_score?: number
          updated_at?: string
        }
        Update: {
          canonical_claim_id?: string | null
          claim_text?: string
          claim_type?: Database["public"]["Enums"]["claim_type"]
          commodities?: string[]
          created_at?: string
          document_id?: string
          entities?: string[]
          event_date?: string | null
          extraction_confidence?: number
          extraction_method?: string
          factuality_label?: Database["public"]["Enums"]["factuality"]
          id?: string
          instruments?: string[]
          metadata?: Json
          regions?: string[]
          sectors?: string[]
          source_id?: string
          specificity_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atomic_claims_canonical_claim_id_fkey"
            columns: ["canonical_claim_id"]
            isOneToOne: false
            referencedRelation: "canonical_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atomic_claims_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atomic_claims_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_claims: {
        Row: {
          claim_text: string
          claim_type: Database["public"]["Enums"]["claim_type"]
          contradiction_count: number
          created_at: string
          embedding: Json | null
          factuality: Database["public"]["Enums"]["factuality"]
          first_seen_at: string
          first_seen_source_id: string | null
          id: string
          independent_source_count: number
          normalised_claim_text: string
          origin_candidate_url: string | null
          reliability_score: number
          repeat_count: number
          status: string
          support_score: number
          updated_at: string
        }
        Insert: {
          claim_text: string
          claim_type?: Database["public"]["Enums"]["claim_type"]
          contradiction_count?: number
          created_at?: string
          embedding?: Json | null
          factuality?: Database["public"]["Enums"]["factuality"]
          first_seen_at?: string
          first_seen_source_id?: string | null
          id?: string
          independent_source_count?: number
          normalised_claim_text: string
          origin_candidate_url?: string | null
          reliability_score?: number
          repeat_count?: number
          status?: string
          support_score?: number
          updated_at?: string
        }
        Update: {
          claim_text?: string
          claim_type?: Database["public"]["Enums"]["claim_type"]
          contradiction_count?: number
          created_at?: string
          embedding?: Json | null
          factuality?: Database["public"]["Enums"]["factuality"]
          first_seen_at?: string
          first_seen_source_id?: string | null
          id?: string
          independent_source_count?: number
          normalised_claim_text?: string
          origin_candidate_url?: string | null
          reliability_score?: number
          repeat_count?: number
          status?: string
          support_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_claims_first_seen_source_id_fkey"
            columns: ["first_seen_source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_clusters: {
        Row: {
          canonical_claim_id: string
          contradiction_count: number
          copied_source_count: number
          created_at: string
          id: string
          independent_source_count: number
          momentum_score: number
          reliability_score: number
          source_count: number
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          canonical_claim_id: string
          contradiction_count?: number
          copied_source_count?: number
          created_at?: string
          id?: string
          independent_source_count?: number
          momentum_score?: number
          reliability_score?: number
          source_count?: number
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          canonical_claim_id?: string
          contradiction_count?: number
          copied_source_count?: number
          created_at?: string
          id?: string
          independent_source_count?: number
          momentum_score?: number
          reliability_score?: number
          source_count?: number
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_clusters_canonical_claim_id_fkey"
            columns: ["canonical_claim_id"]
            isOneToOne: false
            referencedRelation: "canonical_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_lineage: {
        Row: {
          canonical_claim_id: string
          created_at: string
          document_id: string | null
          first_seen_at: string
          id: string
          is_likely_copy: boolean
          origin_confidence: number
          published_at: string | null
          relation_to_origin: Database["public"]["Enums"]["lineage_relation"]
          source_id: string
          url: string | null
        }
        Insert: {
          canonical_claim_id: string
          created_at?: string
          document_id?: string | null
          first_seen_at?: string
          id?: string
          is_likely_copy?: boolean
          origin_confidence?: number
          published_at?: string | null
          relation_to_origin?: Database["public"]["Enums"]["lineage_relation"]
          source_id: string
          url?: string | null
        }
        Update: {
          canonical_claim_id?: string
          created_at?: string
          document_id?: string | null
          first_seen_at?: string
          id?: string
          is_likely_copy?: boolean
          origin_confidence?: number
          published_at?: string | null
          relation_to_origin?: Database["public"]["Enums"]["lineage_relation"]
          source_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_lineage_canonical_claim_id_fkey"
            columns: ["canonical_claim_id"]
            isOneToOne: false
            referencedRelation: "canonical_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_lineage_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_lineage_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      company_exposures: {
        Row: {
          company_name: string
          entity_id: string | null
          event_count: number
          id: string
          last_event_at: string | null
          net_opportunity: number
          net_risk: number
          region: string | null
          sector: string | null
          ticker: string | null
          top_pathways: string[]
          top_scenarios: string[]
          updated_at: string
          weighted_confidence: number
        }
        Insert: {
          company_name: string
          entity_id?: string | null
          event_count?: number
          id?: string
          last_event_at?: string | null
          net_opportunity?: number
          net_risk?: number
          region?: string | null
          sector?: string | null
          ticker?: string | null
          top_pathways?: string[]
          top_scenarios?: string[]
          updated_at?: string
          weighted_confidence?: number
        }
        Update: {
          company_name?: string
          entity_id?: string | null
          event_count?: number
          id?: string
          last_event_at?: string | null
          net_opportunity?: number
          net_risk?: number
          region?: string | null
          sector?: string | null
          ticker?: string | null
          top_pathways?: string[]
          top_scenarios?: string[]
          updated_at?: string
          weighted_confidence?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_exposures_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      company_impacts: {
        Row: {
          claim_cluster_id: string | null
          company_name: string
          confidence: number
          created_at: string
          entity_id: string | null
          event_candidate_id: string | null
          evidence_ids: string[]
          id: string
          impact_pathway: string
          impact_type: Database["public"]["Enums"]["impact_type"]
          metadata: Json
          opportunity_score: number
          risk_score: number
          updated_at: string
          watch_signals: string[]
        }
        Insert: {
          claim_cluster_id?: string | null
          company_name: string
          confidence?: number
          created_at?: string
          entity_id?: string | null
          event_candidate_id?: string | null
          evidence_ids?: string[]
          id?: string
          impact_pathway: string
          impact_type?: Database["public"]["Enums"]["impact_type"]
          metadata?: Json
          opportunity_score?: number
          risk_score?: number
          updated_at?: string
          watch_signals?: string[]
        }
        Update: {
          claim_cluster_id?: string | null
          company_name?: string
          confidence?: number
          created_at?: string
          entity_id?: string | null
          event_candidate_id?: string | null
          evidence_ids?: string[]
          id?: string
          impact_pathway?: string
          impact_type?: Database["public"]["Enums"]["impact_type"]
          metadata?: Json
          opportunity_score?: number
          risk_score?: number
          updated_at?: string
          watch_signals?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "company_impacts_claim_cluster_id_fkey"
            columns: ["claim_cluster_id"]
            isOneToOne: false
            referencedRelation: "claim_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_impacts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_impacts_event_candidate_id_fkey"
            columns: ["event_candidate_id"]
            isOneToOne: false
            referencedRelation: "event_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      digest_snapshots: {
        Row: {
          created_at: string
          headline: string
          id: string
          model: string | null
          ranked_events: Json
          summary: string
          top_opportunities: Json
          top_risks: Json
          top_scenarios: Json
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string
          headline: string
          id?: string
          model?: string | null
          ranked_events?: Json
          summary: string
          top_opportunities?: Json
          top_risks?: Json
          top_scenarios?: Json
          window_end: string
          window_start: string
        }
        Update: {
          created_at?: string
          headline?: string
          id?: string
          model?: string | null
          ranked_events?: Json
          summary?: string
          top_opportunities?: Json
          top_risks?: Json
          top_scenarios?: Json
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          author: string | null
          body: string | null
          copy_loop_score: number
          created_at: string
          document_type: string
          embedding: Json | null
          fetched_at: string
          id: string
          is_likely_copy: boolean
          is_synthetic: boolean
          language: string | null
          metadata: Json
          normalised_hash: string | null
          published_at: string | null
          raw_hash: string | null
          shingle_signature: string | null
          source_id: string
          title: string
          url: string | null
        }
        Insert: {
          author?: string | null
          body?: string | null
          copy_loop_score?: number
          created_at?: string
          document_type?: string
          embedding?: Json | null
          fetched_at?: string
          id?: string
          is_likely_copy?: boolean
          is_synthetic?: boolean
          language?: string | null
          metadata?: Json
          normalised_hash?: string | null
          published_at?: string | null
          raw_hash?: string | null
          shingle_signature?: string | null
          source_id: string
          title: string
          url?: string | null
        }
        Update: {
          author?: string | null
          body?: string | null
          copy_loop_score?: number
          created_at?: string
          document_type?: string
          embedding?: Json | null
          fetched_at?: string
          id?: string
          is_likely_copy?: boolean
          is_synthetic?: boolean
          language?: string | null
          metadata?: Json
          normalised_hash?: string | null
          published_at?: string | null
          raw_hash?: string | null
          shingle_signature?: string | null
          source_id?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      entities: {
        Row: {
          aliases: string[]
          canonical_name: string
          created_at: string
          entity_type: string
          id: string
          metadata: Json
          region: string | null
          sector: string | null
          ticker: string | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          canonical_name: string
          created_at?: string
          entity_type: string
          id?: string
          metadata?: Json
          region?: string | null
          sector?: string | null
          ticker?: string | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          canonical_name?: string
          created_at?: string
          entity_type?: string
          id?: string
          metadata?: Json
          region?: string | null
          sector?: string | null
          ticker?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      entity_relationships: {
        Row: {
          created_at: string
          from_entity_id: string
          id: string
          rationale: string | null
          relationship_type: string
          source_notes: string | null
          to_entity_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          from_entity_id: string
          id?: string
          rationale?: string | null
          relationship_type: string
          source_notes?: string | null
          to_entity_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          from_entity_id?: string
          id?: string
          rationale?: string | null
          relationship_type?: string
          source_notes?: string | null
          to_entity_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "entity_relationships_from_entity_id_fkey"
            columns: ["from_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_to_entity_id_fkey"
            columns: ["to_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      event_candidates: {
        Row: {
          affected_region: string | null
          affected_sector: string | null
          confidence: number
          created_at: string
          created_from_scan_run_id: string | null
          event_class: Database["public"]["Enums"]["event_class"]
          event_type: string
          evidence_count: number
          first_detected_at: string
          id: string
          last_updated_at: string
          metadata: Json
          novelty_score: number
          opportunity_score: number
          primary_entity_id: string | null
          probability: number
          risk_score: number
          severity: string
          signal_strength: number
          source_diversity_score: number
          status: Database["public"]["Enums"]["event_status"]
          summary: string | null
          time_window_end: string | null
          time_window_start: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_region?: string | null
          affected_sector?: string | null
          confidence?: number
          created_at?: string
          created_from_scan_run_id?: string | null
          event_class?: Database["public"]["Enums"]["event_class"]
          event_type: string
          evidence_count?: number
          first_detected_at?: string
          id?: string
          last_updated_at?: string
          metadata?: Json
          novelty_score?: number
          opportunity_score?: number
          primary_entity_id?: string | null
          probability?: number
          risk_score?: number
          severity?: string
          signal_strength?: number
          source_diversity_score?: number
          status?: Database["public"]["Enums"]["event_status"]
          summary?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          affected_region?: string | null
          affected_sector?: string | null
          confidence?: number
          created_at?: string
          created_from_scan_run_id?: string | null
          event_class?: Database["public"]["Enums"]["event_class"]
          event_type?: string
          evidence_count?: number
          first_detected_at?: string
          id?: string
          last_updated_at?: string
          metadata?: Json
          novelty_score?: number
          opportunity_score?: number
          primary_entity_id?: string | null
          probability?: number
          risk_score?: number
          severity?: string
          signal_strength?: number
          source_diversity_score?: number
          status?: Database["public"]["Enums"]["event_status"]
          summary?: string | null
          time_window_end?: string | null
          time_window_start?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_candidates_primary_entity_id_fkey"
            columns: ["primary_entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_arc_steps: {
        Row: {
          confidence: number
          created_at: string
          degree: number
          evidence_arc_id: string
          explanation: string | null
          id: string
          node_id: string | null
          node_type: Database["public"]["Enums"]["node_kind"]
          relationship_type: Database["public"]["Enums"]["edge_kind"] | null
          source_count: number
        }
        Insert: {
          confidence?: number
          created_at?: string
          degree: number
          evidence_arc_id: string
          explanation?: string | null
          id?: string
          node_id?: string | null
          node_type: Database["public"]["Enums"]["node_kind"]
          relationship_type?: Database["public"]["Enums"]["edge_kind"] | null
          source_count?: number
        }
        Update: {
          confidence?: number
          created_at?: string
          degree?: number
          evidence_arc_id?: string
          explanation?: string | null
          id?: string
          node_id?: string | null
          node_type?: Database["public"]["Enums"]["node_kind"]
          relationship_type?: Database["public"]["Enums"]["edge_kind"] | null
          source_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "evidence_arc_steps_evidence_arc_id_fkey"
            columns: ["evidence_arc_id"]
            isOneToOne: false
            referencedRelation: "evidence_arcs"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_arcs: {
        Row: {
          confidence: number
          contradiction_score: number
          created_at: string
          id: string
          max_degrees: number
          momentum_score: number
          origin_strength: number
          root_claim_id: string | null
          root_event_candidate_id: string | null
          root_node_id: string | null
          source_diversity: number
          summary: string | null
          title: string
          true_potential_score: number
          updated_at: string
        }
        Insert: {
          confidence?: number
          contradiction_score?: number
          created_at?: string
          id?: string
          max_degrees?: number
          momentum_score?: number
          origin_strength?: number
          root_claim_id?: string | null
          root_event_candidate_id?: string | null
          root_node_id?: string | null
          source_diversity?: number
          summary?: string | null
          title: string
          true_potential_score?: number
          updated_at?: string
        }
        Update: {
          confidence?: number
          contradiction_score?: number
          created_at?: string
          id?: string
          max_degrees?: number
          momentum_score?: number
          origin_strength?: number
          root_claim_id?: string | null
          root_event_candidate_id?: string | null
          root_node_id?: string | null
          source_diversity?: number
          summary?: string | null
          title?: string
          true_potential_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_arcs_root_claim_id_fkey"
            columns: ["root_claim_id"]
            isOneToOne: false
            referencedRelation: "canonical_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_arcs_root_event_candidate_id_fkey"
            columns: ["root_event_candidate_id"]
            isOneToOne: false
            referencedRelation: "event_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_arcs_root_node_id_fkey"
            columns: ["root_node_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      forensic_reports: {
        Row: {
          confidence: number | null
          created_at: string
          evidence_ids: string[]
          id: string
          model: string | null
          notes: string | null
          report: Json
          status: string
          subject_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          evidence_ids?: string[]
          id?: string
          model?: string | null
          notes?: string | null
          report?: Json
          status?: string
          subject_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          evidence_ids?: string[]
          id?: string
          model?: string | null
          notes?: string | null
          report?: Json
          status?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      graph_edges: {
        Row: {
          confidence: number
          created_at: string
          edge_type: Database["public"]["Enums"]["edge_kind"]
          evidence_count: number
          id: string
          label: string | null
          metadata: Json
          source_node_id: string
          target_node_id: string
          updated_at: string
          weight: number
        }
        Insert: {
          confidence?: number
          created_at?: string
          edge_type: Database["public"]["Enums"]["edge_kind"]
          evidence_count?: number
          id?: string
          label?: string | null
          metadata?: Json
          source_node_id: string
          target_node_id: string
          updated_at?: string
          weight?: number
        }
        Update: {
          confidence?: number
          created_at?: string
          edge_type?: Database["public"]["Enums"]["edge_kind"]
          evidence_count?: number
          id?: string
          label?: string | null
          metadata?: Json
          source_node_id?: string
          target_node_id?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "graph_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "graph_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      graph_nodes: {
        Row: {
          confidence: number
          created_at: string
          freshness_score: number
          id: string
          impact_score: number
          metadata: Json
          node_type: Database["public"]["Enums"]["node_kind"]
          opportunity_score: number
          ref_id: string | null
          ref_type: string | null
          risk_score: number
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          freshness_score?: number
          id?: string
          impact_score?: number
          metadata?: Json
          node_type: Database["public"]["Enums"]["node_kind"]
          opportunity_score?: number
          ref_id?: string | null
          ref_type?: string | null
          risk_score?: number
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          freshness_score?: number
          id?: string
          impact_score?: number
          metadata?: Json
          node_type?: Database["public"]["Enums"]["node_kind"]
          opportunity_score?: number
          ref_id?: string | null
          ref_type?: string | null
          risk_score?: number
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      graph_snapshots: {
        Row: {
          created_at: string
          edge_count: number
          id: string
          metadata: Json
          node_count: number
          summary: string | null
          title: string
        }
        Insert: {
          created_at?: string
          edge_count?: number
          id?: string
          metadata?: Json
          node_count?: number
          summary?: string | null
          title: string
        }
        Update: {
          created_at?: string
          edge_count?: number
          id?: string
          metadata?: Json
          node_count?: number
          summary?: string | null
          title?: string
        }
        Relationships: []
      }
      investigation_queries: {
        Row: {
          brief_synth: Json | null
          canonical_claim_id: string | null
          created_at: string
          event_candidate_id: string | null
          evidence_ids: string[]
          id: string
          metadata: Json
          query_class: string
          query_text: string
          result_count: number
          status: string
          updated_at: string
        }
        Insert: {
          brief_synth?: Json | null
          canonical_claim_id?: string | null
          created_at?: string
          event_candidate_id?: string | null
          evidence_ids?: string[]
          id?: string
          metadata?: Json
          query_class: string
          query_text: string
          result_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          brief_synth?: Json | null
          canonical_claim_id?: string | null
          created_at?: string
          event_candidate_id?: string | null
          evidence_ids?: string[]
          id?: string
          metadata?: Json
          query_class?: string
          query_text?: string
          result_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_queries_canonical_claim_id_fkey"
            columns: ["canonical_claim_id"]
            isOneToOne: false
            referencedRelation: "canonical_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_queries_event_candidate_id_fkey"
            columns: ["event_candidate_id"]
            isOneToOne: false
            referencedRelation: "event_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_task_logs: {
        Row: {
          created_at: string
          error: string | null
          estimated_cost: number | null
          id: string
          input_hash: string | null
          latency_ms: number | null
          metadata: Json
          model: string
          output_hash: string | null
          prompt_excerpt: string | null
          provider: string
          response_excerpt: string | null
          retry_of: string | null
          status: string
          task_type: string
          validation_status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          input_hash?: string | null
          latency_ms?: number | null
          metadata?: Json
          model: string
          output_hash?: string | null
          prompt_excerpt?: string | null
          provider: string
          response_excerpt?: string | null
          retry_of?: string | null
          status?: string
          task_type: string
          validation_status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          estimated_cost?: number | null
          id?: string
          input_hash?: string | null
          latency_ms?: number | null
          metadata?: Json
          model?: string
          output_hash?: string | null
          prompt_excerpt?: string | null
          provider?: string
          response_excerpt?: string | null
          retry_of?: string | null
          status?: string
          task_type?: string
          validation_status?: string
        }
        Relationships: []
      }
      opportunity_cards: {
        Row: {
          actionability_score: number
          affected_regions: string[]
          affected_sectors: string[]
          buyer_pain: string | null
          commercial_value_score: number
          confidence: number
          created_at: string
          event_candidate_id: string | null
          evidence_score: number
          id: string
          likely_buyers: string[]
          next_best_action: string | null
          opportunity_logic: string | null
          opportunity_type: string
          revenue_lens_id: string | null
          risk_logic: string | null
          status: string
          suggested_offer: string | null
          summary: string | null
          title: string
          updated_at: string
          urgency_score: number
        }
        Insert: {
          actionability_score?: number
          affected_regions?: string[]
          affected_sectors?: string[]
          buyer_pain?: string | null
          commercial_value_score?: number
          confidence?: number
          created_at?: string
          event_candidate_id?: string | null
          evidence_score?: number
          id?: string
          likely_buyers?: string[]
          next_best_action?: string | null
          opportunity_logic?: string | null
          opportunity_type: string
          revenue_lens_id?: string | null
          risk_logic?: string | null
          status?: string
          suggested_offer?: string | null
          summary?: string | null
          title: string
          updated_at?: string
          urgency_score?: number
        }
        Update: {
          actionability_score?: number
          affected_regions?: string[]
          affected_sectors?: string[]
          buyer_pain?: string | null
          commercial_value_score?: number
          confidence?: number
          created_at?: string
          event_candidate_id?: string | null
          evidence_score?: number
          id?: string
          likely_buyers?: string[]
          next_best_action?: string | null
          opportunity_logic?: string | null
          opportunity_type?: string
          revenue_lens_id?: string | null
          risk_logic?: string | null
          status?: string
          suggested_offer?: string | null
          summary?: string | null
          title?: string
          updated_at?: string
          urgency_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_cards_event_candidate_id_fkey"
            columns: ["event_candidate_id"]
            isOneToOne: false
            referencedRelation: "event_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_cards_revenue_lens_id_fkey"
            columns: ["revenue_lens_id"]
            isOneToOne: false
            referencedRelation: "revenue_lenses"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_predictions: {
        Row: {
          baseline: Json
          brier_final: number | null
          brier_first: number | null
          created_at: string
          deadline: string
          dedupe_key: string
          event_candidate_id: string
          evidence_canonical_ids: string[]
          final_probability: number
          horizon: string | null
          id: string
          lead_time_days: number | null
          observed_path: string | null
          outcome: string | null
          predicted_at: string
          predicted_probability: number
          prediction_text: string
          resolution_evidence: Json
          resolution_rationale: string | null
          resolved_at: string | null
          resolved_by: string | null
          scenario_projection_id: string | null
          status: string
          subject_kind: string
          updated_at: string
        }
        Insert: {
          baseline?: Json
          brier_final?: number | null
          brier_first?: number | null
          created_at?: string
          deadline: string
          dedupe_key: string
          event_candidate_id: string
          evidence_canonical_ids?: string[]
          final_probability: number
          horizon?: string | null
          id?: string
          lead_time_days?: number | null
          observed_path?: string | null
          outcome?: string | null
          predicted_at?: string
          predicted_probability: number
          prediction_text: string
          resolution_evidence?: Json
          resolution_rationale?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scenario_projection_id?: string | null
          status?: string
          subject_kind: string
          updated_at?: string
        }
        Update: {
          baseline?: Json
          brier_final?: number | null
          brier_first?: number | null
          created_at?: string
          deadline?: string
          dedupe_key?: string
          event_candidate_id?: string
          evidence_canonical_ids?: string[]
          final_probability?: number
          horizon?: string | null
          id?: string
          lead_time_days?: number | null
          observed_path?: string | null
          outcome?: string | null
          predicted_at?: string
          predicted_probability?: number
          prediction_text?: string
          resolution_evidence?: Json
          resolution_rationale?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          scenario_projection_id?: string | null
          status?: string
          subject_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcome_predictions_event_candidate_id_fkey"
            columns: ["event_candidate_id"]
            isOneToOne: false
            referencedRelation: "event_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcome_predictions_scenario_projection_id_fkey"
            columns: ["scenario_projection_id"]
            isOneToOne: false
            referencedRelation: "scenario_projections"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_lenses: {
        Row: {
          average_deal_size: string | null
          buyer_personas: string[]
          created_at: string
          description: string | null
          excluded_sectors: string[]
          id: string
          name: string
          offer_types: string[]
          risk_appetite: string | null
          sales_cycle: string | null
          target_regions: string[]
          target_sectors: string[]
          updated_at: string
          user_type: string | null
        }
        Insert: {
          average_deal_size?: string | null
          buyer_personas?: string[]
          created_at?: string
          description?: string | null
          excluded_sectors?: string[]
          id?: string
          name: string
          offer_types?: string[]
          risk_appetite?: string | null
          sales_cycle?: string | null
          target_regions?: string[]
          target_sectors?: string[]
          updated_at?: string
          user_type?: string | null
        }
        Update: {
          average_deal_size?: string | null
          buyer_personas?: string[]
          created_at?: string
          description?: string | null
          excluded_sectors?: string[]
          id?: string
          name?: string
          offer_types?: string[]
          risk_appetite?: string | null
          sales_cycle?: string | null
          target_regions?: string[]
          target_sectors?: string[]
          updated_at?: string
          user_type?: string | null
        }
        Relationships: []
      }
      review_queue: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: string
          reason: string | null
          reviewer_notes: string | null
          status: Database["public"]["Enums"]["review_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type: string
          reason?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          reason?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          updated_at?: string
        }
        Relationships: []
      }
      scan_runs: {
        Row: {
          atomic_claims_created: number
          documents_collected: number
          events_created: number
          finished_at: string | null
          id: string
          metadata: Json
          notes: string | null
          sources_attempted: number
          sources_failed: number
          sources_succeeded: number
          started_at: string
          status: Database["public"]["Enums"]["scan_status"]
        }
        Insert: {
          atomic_claims_created?: number
          documents_collected?: number
          events_created?: number
          finished_at?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          sources_attempted?: number
          sources_failed?: number
          sources_succeeded?: number
          started_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
        }
        Update: {
          atomic_claims_created?: number
          documents_collected?: number
          events_created?: number
          finished_at?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          sources_attempted?: number
          sources_failed?: number
          sources_succeeded?: number
          started_at?: string
          status?: Database["public"]["Enums"]["scan_status"]
        }
        Relationships: []
      }
      scan_settings: {
        Row: {
          bucketing_strategy: string
          cluster_merge_cosine: number
          copy_loop_jaccard: number
          created_at: string
          id: string
          interrogation_cache_ms: number
          items_per_feed: number
          max_claims_per_cluster: number
          min_confidence: number
          min_evidence_count: number
          min_source_diversity: number
          singleton: boolean
          sources_per_scan: number
          updated_at: string
        }
        Insert: {
          bucketing_strategy?: string
          cluster_merge_cosine?: number
          copy_loop_jaccard?: number
          created_at?: string
          id?: string
          interrogation_cache_ms?: number
          items_per_feed?: number
          max_claims_per_cluster?: number
          min_confidence?: number
          min_evidence_count?: number
          min_source_diversity?: number
          singleton?: boolean
          sources_per_scan?: number
          updated_at?: string
        }
        Update: {
          bucketing_strategy?: string
          cluster_merge_cosine?: number
          copy_loop_jaccard?: number
          created_at?: string
          id?: string
          interrogation_cache_ms?: number
          items_per_feed?: number
          max_claims_per_cluster?: number
          min_confidence?: number
          min_evidence_count?: number
          min_source_diversity?: number
          singleton?: boolean
          sources_per_scan?: number
          updated_at?: string
        }
        Relationships: []
      }
      scenario_projections: {
        Row: {
          affected_cohorts: string[]
          affected_companies: string[]
          affected_regions: string[]
          affected_sectors: string[]
          confidence: number
          contradicting_signals: string[]
          created_at: string
          event_candidate_id: string
          horizon: string
          id: string
          leading_indicators: string[]
          magnitude: string | null
          mechanism: string | null
          model: string | null
          narrative: string
          probability: number
          scenario_label: string
          updated_at: string
        }
        Insert: {
          affected_cohorts?: string[]
          affected_companies?: string[]
          affected_regions?: string[]
          affected_sectors?: string[]
          confidence?: number
          contradicting_signals?: string[]
          created_at?: string
          event_candidate_id: string
          horizon: string
          id?: string
          leading_indicators?: string[]
          magnitude?: string | null
          mechanism?: string | null
          model?: string | null
          narrative: string
          probability?: number
          scenario_label: string
          updated_at?: string
        }
        Update: {
          affected_cohorts?: string[]
          affected_companies?: string[]
          affected_regions?: string[]
          affected_sectors?: string[]
          confidence?: number
          contradicting_signals?: string[]
          created_at?: string
          event_candidate_id?: string
          horizon?: string
          id?: string
          leading_indicators?: string[]
          magnitude?: string | null
          mechanism?: string | null
          model?: string | null
          narrative?: string
          probability?: number
          scenario_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_projections_event_candidate_id_fkey"
            columns: ["event_candidate_id"]
            isOneToOne: false
            referencedRelation: "event_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_clusters: {
        Row: {
          cluster_type: string
          confidence: number
          created_at: string
          explanation: string | null
          id: string
          novelty: number
          region: string | null
          sector: string | null
          strength: number
          title: string
          updated_at: string
        }
        Insert: {
          cluster_type: string
          confidence?: number
          created_at?: string
          explanation?: string | null
          id?: string
          novelty?: number
          region?: string | null
          sector?: string | null
          strength?: number
          title: string
          updated_at?: string
        }
        Update: {
          cluster_type?: string
          confidence?: number
          created_at?: string
          explanation?: string | null
          id?: string
          novelty?: number
          region?: string | null
          sector?: string | null
          strength?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_reliability_history: {
        Row: {
          accuracy_score: number
          claims_confirmed: number
          claims_contested: number
          claims_retracted: number
          claims_seen: number
          copy_loop_rate: number
          created_at: string
          id: string
          originality_rate: number
          source_id: string
          window_end: string
          window_start: string
        }
        Insert: {
          accuracy_score?: number
          claims_confirmed?: number
          claims_contested?: number
          claims_retracted?: number
          claims_seen?: number
          copy_loop_rate?: number
          created_at?: string
          id?: string
          originality_rate?: number
          source_id: string
          window_end: string
          window_start: string
        }
        Update: {
          accuracy_score?: number
          claims_confirmed?: number
          claims_contested?: number
          claims_retracted?: number
          claims_seen?: number
          copy_loop_rate?: number
          created_at?: string
          id?: string
          originality_rate?: number
          source_id?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_reliability_history_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      source_reliability_suggestions: {
        Row: {
          accuracy_score: number
          applied_at: string | null
          claims_confirmed: number
          claims_contested: number
          claims_seen: number
          created_at: string
          current_score: number
          id: string
          rationale: string
          source_id: string
          status: string
          suggested_score: number
          updated_at: string
        }
        Insert: {
          accuracy_score: number
          applied_at?: string | null
          claims_confirmed?: number
          claims_contested?: number
          claims_seen?: number
          created_at?: string
          current_score: number
          id?: string
          rationale: string
          source_id: string
          status?: string
          suggested_score: number
          updated_at?: string
        }
        Update: {
          accuracy_score?: number
          applied_at?: string | null
          claims_confirmed?: number
          claims_contested?: number
          claims_seen?: number
          created_at?: string
          current_score?: number
          id?: string
          rationale?: string
          source_id?: string
          status?: string
          suggested_score?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_reliability_suggestions_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          access_method: string
          base_url: string | null
          collector_supported: boolean
          created_at: string
          feed_kind: string
          feed_url: string | null
          health_score: number
          id: string
          independence_group: string | null
          is_synthetic: boolean
          last_failure_at: string | null
          last_success_at: string | null
          metadata: Json
          name: string
          refresh_cadence_minutes: number
          reliability_score: number
          source_type: Database["public"]["Enums"]["source_type"]
          status: Database["public"]["Enums"]["source_status"]
          updated_at: string
        }
        Insert: {
          access_method?: string
          base_url?: string | null
          collector_supported?: boolean
          created_at?: string
          feed_kind?: string
          feed_url?: string | null
          health_score?: number
          id?: string
          independence_group?: string | null
          is_synthetic?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          metadata?: Json
          name: string
          refresh_cadence_minutes?: number
          reliability_score?: number
          source_type: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
        }
        Update: {
          access_method?: string
          base_url?: string | null
          collector_supported?: boolean
          created_at?: string
          feed_kind?: string
          feed_url?: string | null
          health_score?: number
          id?: string
          independence_group?: string | null
          is_synthetic?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          metadata?: Json
          name?: string
          refresh_cadence_minutes?: number
          reliability_score?: number
          source_type?: Database["public"]["Enums"]["source_type"]
          status?: Database["public"]["Enums"]["source_status"]
          updated_at?: string
        }
        Relationships: []
      }
      strategic_positioning: {
        Row: {
          company_impact_id: string | null
          confidence: number
          constraints: string | null
          created_at: string
          event_candidate_id: string | null
          evidence_summary: string | null
          how_it_could_be_used: string
          id: string
          opportunity_card_id: string | null
          positioning_angle: string
          title: string
          updated_at: string
          user_type: string
          why_it_may_matter: string
        }
        Insert: {
          company_impact_id?: string | null
          confidence?: number
          constraints?: string | null
          created_at?: string
          event_candidate_id?: string | null
          evidence_summary?: string | null
          how_it_could_be_used: string
          id?: string
          opportunity_card_id?: string | null
          positioning_angle: string
          title: string
          updated_at?: string
          user_type: string
          why_it_may_matter: string
        }
        Update: {
          company_impact_id?: string | null
          confidence?: number
          constraints?: string | null
          created_at?: string
          event_candidate_id?: string | null
          evidence_summary?: string | null
          how_it_could_be_used?: string
          id?: string
          opportunity_card_id?: string | null
          positioning_angle?: string
          title?: string
          updated_at?: string
          user_type?: string
          why_it_may_matter?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategic_positioning_company_impact_id_fkey"
            columns: ["company_impact_id"]
            isOneToOne: false
            referencedRelation: "company_impacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategic_positioning_event_candidate_id_fkey"
            columns: ["event_candidate_id"]
            isOneToOne: false
            referencedRelation: "event_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strategic_positioning_opportunity_card_id_fkey"
            columns: ["opportunity_card_id"]
            isOneToOne: false
            referencedRelation: "opportunity_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      track_record_snapshots: {
        Row: {
          base_rate: number | null
          by_horizon: Json
          calibration: Json
          created_at: string
          graded_count: number
          happened_count: number
          id: string
          mean_brier_final: number | null
          mean_brier_first: number | null
          mean_lead_time_days: number | null
          open_count: number
          pending_review_count: number
          resolved_count: number
          scan_run_id: string | null
          scenario_count: number
          scenario_mean_brier: number | null
        }
        Insert: {
          base_rate?: number | null
          by_horizon?: Json
          calibration?: Json
          created_at?: string
          graded_count?: number
          happened_count?: number
          id?: string
          mean_brier_final?: number | null
          mean_brier_first?: number | null
          mean_lead_time_days?: number | null
          open_count?: number
          pending_review_count?: number
          resolved_count?: number
          scan_run_id?: string | null
          scenario_count?: number
          scenario_mean_brier?: number | null
        }
        Update: {
          base_rate?: number | null
          by_horizon?: Json
          calibration?: Json
          created_at?: string
          graded_count?: number
          happened_count?: number
          id?: string
          mean_brier_final?: number | null
          mean_brier_first?: number | null
          mean_lead_time_days?: number | null
          open_count?: number
          pending_review_count?: number
          resolved_count?: number
          scan_run_id?: string | null
          scenario_count?: number
          scenario_mean_brier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "track_record_snapshots_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          keywords: string[]
          min_confidence: number
          min_opportunity: number
          min_risk: number
          name: string
          regions: string[]
          sectors: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          keywords?: string[]
          min_confidence?: number
          min_opportunity?: number
          min_risk?: number
          name: string
          regions?: string[]
          sectors?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          keywords?: string[]
          min_confidence?: number
          min_opportunity?: number
          min_risk?: number
          name?: string
          regions?: string[]
          sectors?: string[]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      derive_independence_group: {
        Args: {
          p_base_url: string
          p_feed_url: string
          p_id: string
          p_is_synthetic: boolean
          p_name: string
        }
        Returns: string
      }
    }
    Enums: {
      claim_type:
        | "layoff"
        | "hiring"
        | "regulatory"
        | "procurement"
        | "supply_chain"
        | "market"
        | "commodity"
        | "company_statement"
        | "executive"
        | "legal"
        | "complaint"
        | "demand"
        | "funding"
        | "macro"
        | "unknown"
      edge_kind:
        | "reported_by"
        | "derived_from"
        | "supports"
        | "contradicts"
        | "affects"
        | "exposes"
        | "amplifies"
        | "weakens"
        | "causes_pressure"
        | "creates_opportunity"
        | "linked"
        | "priced_by"
        | "regulated_by"
        | "supplied_by"
        | "depends_on"
        | "competes_with"
      event_class: "risk" | "opportunity" | "mixed" | "watch" | "unknown"
      event_status:
        | "new"
        | "rising"
        | "stable"
        | "declining"
        | "confirmed"
        | "dismissed"
        | "escalated"
        | "needs_review"
      factuality:
        | "strongly_supported"
        | "supported"
        | "weak_single_source"
        | "contradicted"
        | "stale"
        | "recycled"
        | "unverified"
        | "needs_review"
      impact_type:
        | "beneficiary"
        | "harmed"
        | "mixed"
        | "exposed"
        | "watch_only"
        | "unknown"
      lineage_relation:
        | "origin_candidate"
        | "independent_support"
        | "likely_copy"
        | "commentary"
        | "contradiction"
        | "unknown"
      node_kind:
        | "event"
        | "source"
        | "claim"
        | "signal"
        | "company"
        | "sector"
        | "commodity"
        | "instrument"
        | "region"
        | "regulation"
        | "procurement"
        | "risk"
        | "opportunity"
        | "contradiction"
        | "gap"
        | "positioning"
      review_status: "pending" | "approved" | "rejected" | "needs_more_evidence"
      scan_status:
        | "queued"
        | "running"
        | "completed"
        | "completed_with_errors"
        | "failed"
      source_status: "active" | "paused" | "degraded" | "failed" | "disabled"
      source_type:
        | "rss"
        | "news"
        | "trade_press"
        | "regulatory"
        | "procurement"
        | "filings"
        | "company_site"
        | "press_release"
        | "court"
        | "patent"
        | "commodity"
        | "market_data"
        | "macro"
        | "social"
        | "forum"
        | "synthetic"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      claim_type: [
        "layoff",
        "hiring",
        "regulatory",
        "procurement",
        "supply_chain",
        "market",
        "commodity",
        "company_statement",
        "executive",
        "legal",
        "complaint",
        "demand",
        "funding",
        "macro",
        "unknown",
      ],
      edge_kind: [
        "reported_by",
        "derived_from",
        "supports",
        "contradicts",
        "affects",
        "exposes",
        "amplifies",
        "weakens",
        "causes_pressure",
        "creates_opportunity",
        "linked",
        "priced_by",
        "regulated_by",
        "supplied_by",
        "depends_on",
        "competes_with",
      ],
      event_class: ["risk", "opportunity", "mixed", "watch", "unknown"],
      event_status: [
        "new",
        "rising",
        "stable",
        "declining",
        "confirmed",
        "dismissed",
        "escalated",
        "needs_review",
      ],
      factuality: [
        "strongly_supported",
        "supported",
        "weak_single_source",
        "contradicted",
        "stale",
        "recycled",
        "unverified",
        "needs_review",
      ],
      impact_type: [
        "beneficiary",
        "harmed",
        "mixed",
        "exposed",
        "watch_only",
        "unknown",
      ],
      lineage_relation: [
        "origin_candidate",
        "independent_support",
        "likely_copy",
        "commentary",
        "contradiction",
        "unknown",
      ],
      node_kind: [
        "event",
        "source",
        "claim",
        "signal",
        "company",
        "sector",
        "commodity",
        "instrument",
        "region",
        "regulation",
        "procurement",
        "risk",
        "opportunity",
        "contradiction",
        "gap",
        "positioning",
      ],
      review_status: ["pending", "approved", "rejected", "needs_more_evidence"],
      scan_status: [
        "queued",
        "running",
        "completed",
        "completed_with_errors",
        "failed",
      ],
      source_status: ["active", "paused", "degraded", "failed", "disabled"],
      source_type: [
        "rss",
        "news",
        "trade_press",
        "regulatory",
        "procurement",
        "filings",
        "company_site",
        "press_release",
        "court",
        "patent",
        "commodity",
        "market_data",
        "macro",
        "social",
        "forum",
        "synthetic",
      ],
    },
  },
} as const
