import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_SCAN_SETTINGS, type ScanSettings } from "./settings.defaults";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadOrSeed(): Promise<ScanSettings> {
  const db = await admin();
  const { data } = await db.from("scan_settings").select("*").eq("singleton", true).maybeSingle();
  if (data) {
    return {
      sources_per_scan: Number(data.sources_per_scan),
      items_per_feed: Number(data.items_per_feed),
      copy_loop_jaccard: Number(data.copy_loop_jaccard),
      bucketing_strategy: data.bucketing_strategy as ScanSettings["bucketing_strategy"],
      cluster_merge_cosine: Number(data.cluster_merge_cosine),
      max_claims_per_cluster: Number(data.max_claims_per_cluster),
      min_evidence_count: Number(data.min_evidence_count),
      min_source_diversity: Number(data.min_source_diversity),
      min_confidence: Number(data.min_confidence),
      interrogation_cache_ms: Number(data.interrogation_cache_ms),
    };
  }
  await db.from("scan_settings").insert({ singleton: true, ...DEFAULT_SCAN_SETTINGS });
  return { ...DEFAULT_SCAN_SETTINGS };
}

export const getScanSettings = createServerFn({ method: "GET" }).handler(async () => {
  return await loadOrSeed();
});

const patchSchema = z.object({
  sources_per_scan: z.number().int().min(1).max(120),
  items_per_feed: z.number().int().min(1).max(20),
  copy_loop_jaccard: z.number().min(0).max(1),
  bucketing_strategy: z.enum(["type_sector", "type", "sector"]),
  cluster_merge_cosine: z.number().min(0).max(1),
  max_claims_per_cluster: z.number().int().min(0).max(100),
  min_evidence_count: z.number().int().min(1).max(50),
  min_source_diversity: z.number().min(0).max(1),
  min_confidence: z.number().min(0).max(1),
  interrogation_cache_ms: z.number().int().min(60_000).max(90 * 24 * 60 * 60 * 1000),
});

export const updateScanSettings = createServerFn({ method: "POST" }).middleware([requireOwner])
  .inputValidator((data: ScanSettings) => patchSchema.parse(data))
  .handler(async ({ data }) => {
    const db = await admin();
    await loadOrSeed();
    const { error } = await db.from("scan_settings").update(data).eq("singleton", true);
    if (error) throw new Error(error.message);
    return { ok: true, settings: data };
  });

export const resetScanSettings = createServerFn({ method: "POST" }).middleware([requireOwner]).handler(async () => {
  const db = await admin();
  await loadOrSeed();
  const { error } = await db.from("scan_settings").update(DEFAULT_SCAN_SETTINGS).eq("singleton", true);
  if (error) throw new Error(error.message);
  return { ok: true, settings: { ...DEFAULT_SCAN_SETTINGS } };
});
