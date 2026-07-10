// Shared baseline for scan tunables. Single source of truth used by both the
// settings UI ("Return to Default") and the pipeline (fallback when no row
// exists yet).

export type BucketingStrategy = "type_sector" | "type" | "sector";

export interface ScanSettings {
  sources_per_scan: number;
  items_per_feed: number;
  copy_loop_jaccard: number;
  bucketing_strategy: BucketingStrategy;
  cluster_merge_cosine: number;
  max_claims_per_cluster: number;
  min_evidence_count: number;
  min_source_diversity: number;
  min_confidence: number;
  interrogation_cache_ms: number;
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  sources_per_scan: 14,
  items_per_feed: 1,
  copy_loop_jaccard: 0.55,
  bucketing_strategy: "type_sector",
  cluster_merge_cosine: 0.72,
  max_claims_per_cluster: 0,
  min_evidence_count: 1,
  min_source_diversity: 0.0,
  min_confidence: 0.0,
  interrogation_cache_ms: 7 * 24 * 60 * 60 * 1000,
};

export function countKnobsOffDefault(s: ScanSettings): number {
  let n = 0;
  (Object.keys(DEFAULT_SCAN_SETTINGS) as Array<keyof ScanSettings>).forEach((k) => {
    if (s[k] !== DEFAULT_SCAN_SETTINGS[k]) n++;
  });
  return n;
}
