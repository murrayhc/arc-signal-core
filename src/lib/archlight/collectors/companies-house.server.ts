// Companies House watchlist collector — polls the REST API for change/distress
// signals (newly registered charges, insolvency filings, officer changes) on
// organisation-type entities that already have OPEN outcome predictions.
//
// Auth: HTTP Basic with `${apiKey}:` (blank password). Reads the key from the
// COMPANIES_HOUSE_API_KEY env secret at call-time — never hardcoded. Missing
// key → no-op. On 429/403/any error → back off, return what we have, never throw.
// Rate limit budget: ~600 requests / 5 min. Keep bounded.

import type { SupabaseClient } from "@supabase/supabase-js";

const BASE = "https://api.company-information.service.gov.uk";
const USER_AGENT =
  "Mozilla/5.0 (compatible; ArchlightBot/1.0; +https://arc-signal-core.lovable.app)";

export interface CompaniesHouseDoc {
  title: string;
  body: string;
  url: string;
  publishedAt: string | null;
  dedupeKey: string;
}

interface CHSearchResp {
  items?: Array<{ company_number?: string; title?: string }>;
}
export interface CHChargeItem {
  id?: string;
  charge_number?: number;
  created_on?: string;
  status?: string;
  classification?: { description?: string; type?: string };
  particulars?: { description?: string };
  transaction_id?: string;
  links?: { self?: string };
}
interface CHChargesResp { items?: CHChargeItem[] }
export interface CHFilingItem {
  transaction_id?: string;
  date?: string;
  description?: string;
  type?: string;
  category?: string;
  links?: { self?: string };
}
interface CHFilingResp { items?: CHFilingItem[] }
export interface CHOfficerItem {
  name?: string;
  officer_role?: string;
  resigned_on?: string;
  appointed_on?: string;
  links?: { self?: { appointments?: string } };
}
interface CHOfficersResp { items?: CHOfficerItem[] }

class RateLimited extends Error {}

function authHeader(apiKey: string): string {
  // Node/Workers both support Buffer via nodejs_compat, but be portable.
  const raw = `${apiKey}:`;
  const b64 =
    typeof btoa === "function"
      ? btoa(raw)
      : Buffer.from(raw, "utf8").toString("base64");
  return `Basic ${b64}`;
}

async function chGet<T>(path: string, apiKey: string, timeoutMs = 10000): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: {
        Authorization: authHeader(apiKey),
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
    if (res.status === 429 || res.status === 403) throw new RateLimited();
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    try { return JSON.parse(text) as T; } catch { return null; }
  } catch (err) {
    if (err instanceof RateLimited) throw err;
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function chSearch(name: string, apiKey: string): Promise<string | null> {
  const q = encodeURIComponent(name.trim());
  if (!q) return null;
  const resp = await chGet<CHSearchResp>(`/search/companies?q=${q}&items_per_page=1`, apiKey);
  const num = resp?.items?.[0]?.company_number;
  return num ? String(num) : null;
}

export async function chCharges(number: string, apiKey: string): Promise<CHChargeItem[]> {
  const resp = await chGet<CHChargesResp>(`/company/${encodeURIComponent(number)}/charges`, apiKey);
  return resp?.items ?? [];
}
export async function chInsolvencyFilings(number: string, apiKey: string): Promise<CHFilingItem[]> {
  const resp = await chGet<CHFilingResp>(
    `/company/${encodeURIComponent(number)}/filing-history?category=insolvency`,
    apiKey,
  );
  return resp?.items ?? [];
}
export async function chOfficers(number: string, apiKey: string): Promise<CHOfficerItem[]> {
  const resp = await chGet<CHOfficersResp>(`/company/${encodeURIComponent(number)}/officers`, apiKey);
  return resp?.items ?? [];
}

// Paginated variants — walk the full history within a bounded page budget so
// backtesting can see distress signals that landed years before an outcome.
type PaginatedResp<T> = { items?: T[]; total_results?: number; total_count?: number };

async function chGetAll<T>(
  path: string,
  apiKey: string,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 100;
  const maxPages = Math.max(1, Math.min(20, opts.maxPages ?? 10));
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}items_per_page=${pageSize}&start_index=${page * pageSize}`;
    const resp = await chGet<PaginatedResp<T>>(url, apiKey);
    const items = resp?.items ?? [];
    if (!items.length) break;
    out.push(...items);
    if (items.length < pageSize) break;
  }
  return out;
}

export async function chChargesAll(number: string, apiKey: string, maxPages = 5): Promise<CHChargeItem[]> {
  return chGetAll<CHChargeItem>(`/company/${encodeURIComponent(number)}/charges`, apiKey, { maxPages });
}
export async function chFilingHistoryAll(number: string, apiKey: string, maxPages = 10): Promise<CHFilingItem[]> {
  return chGetAll<CHFilingItem>(`/company/${encodeURIComponent(number)}/filing-history`, apiKey, { maxPages });
}
export async function chOfficersAll(number: string, apiKey: string, maxPages = 5): Promise<CHOfficerItem[]> {
  return chGetAll<CHOfficerItem>(`/company/${encodeURIComponent(number)}/officers`, apiKey, { maxPages });
}

function companyUrl(number: string): string {
  return `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(number)}`;
}

function toISO(d?: string | null): string | null {
  if (!d) return null;
  const ts = Date.parse(d);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

export const COMPANIES_HOUSE_SOURCE = {
  name: "Companies House",
  source_type: "regulatory" as const,
  base_url: "company-information.service.gov.uk",
  feed_url: null as string | null,
  is_synthetic: false,
  // Same publisher group as the existing Companies House GOV.UK feed so
  // they count as one publisher for source-diversity scoring.
  independence_group: "companieshouse.gov.uk",
  reliability_score: 0.92,
  health_score: 0.85,
  status: "active" as const,
  collector_supported: true,
  refresh_cadence_minutes: 60,
  access_method: "api" as const,
  tier: "primary" as const,
  metadata: { origin: "uk_primary_seed", collector: "companies_house_watchlist" },
};

export interface WatchEntityRow {
  id: string;
  canonical_name: string;
  company_number: string | null;
  company_number_checked_at: string | null;
}

/**
 * Resolve a Companies House number for an entity, caching the result
 * (even a null miss) on the entity row so we don't re-search each scan.
 */
export async function resolveCompanyNumber(
  db: SupabaseClient,
  entity: WatchEntityRow,
  apiKey: string,
): Promise<string | null> {
  if (entity.company_number) return entity.company_number;
  let found: string | null = null;
  try {
    found = await chSearch(entity.canonical_name, apiKey);
  } catch {
    // rate limited — don't cache; try again next scan
    return null;
  }
  await db
    .from("entities")
    .update({
      company_number: found,
      company_number_checked_at: new Date().toISOString(),
    })
    .eq("id", entity.id);
  return found;
}

export interface RunCompaniesHouseResult {
  ingested: number;
  companiesChecked: number;
  notes: string[];
}

/**
 * Poll Companies House for change/distress signals on organisation entities
 * linked to events with OPEN outcome predictions. Produces normalised docs
 * and ingests each via the shared ingestDocument helper.
 */
export async function runCompaniesHouseWatch(
  db: SupabaseClient,
  opts: {
    maxCompanies?: number;
    recentShingleSets: Array<{ id: string; s: Set<string>; sig: string | null }>;
    copyLoopJaccard: number;
    hasBudget: () => boolean;
  },
): Promise<RunCompaniesHouseResult> {
  const notes: string[] = [];
  const result: RunCompaniesHouseResult = { ingested: 0, companiesChecked: 0, notes };

  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  if (!apiKey) {
    notes.push("Companies House: COMPANIES_HOUSE_API_KEY not set — skipping.");
    return result;
  }

  const maxCompanies = Math.max(1, Math.min(50, opts.maxCompanies ?? 15));

  // 1. Find candidate entities: organisations linked (primary_entity_id) to
  //    events that have OPEN outcome_predictions. Prioritise entities whose
  //    company_number_checked_at is null or oldest.
  const { data: openEvents } = await db
    .from("outcome_predictions")
    .select("event_candidate_id")
    .eq("status", "open");
  const eventIds = Array.from(
    new Set((openEvents ?? []).map((r) => r.event_candidate_id).filter(Boolean)),
  );
  if (eventIds.length === 0) {
    notes.push("Companies House: no open outcome predictions — nothing to watch.");
    return result;
  }

  const { data: events } = await db
    .from("event_candidates")
    .select("primary_entity_id")
    .in("id", eventIds);
  const entityIds = Array.from(
    new Set((events ?? []).map((r) => r.primary_entity_id).filter((v): v is string => !!v)),
  );
  if (entityIds.length === 0) {
    notes.push("Companies House: no organisation entities linked to open events.");
    return result;
  }

  const { data: entities } = await db
    .from("entities")
    .select("id, canonical_name, entity_type, company_number, company_number_checked_at")
    .in("id", entityIds)
    .eq("entity_type", "organization")
    .order("company_number_checked_at", { ascending: true, nullsFirst: true })
    .limit(maxCompanies);
  const candidates = (entities ?? []) as WatchEntityRow[];
  if (candidates.length === 0) {
    notes.push("Companies House: no organization-type entities to check.");
    return result;
  }

  // Find/create the Companies House source
  let { data: chSrc } = await db.from("sources").select("*").eq("name", COMPANIES_HOUSE_SOURCE.name).maybeSingle();
  if (!chSrc) {
    const ins = await db.from("sources").insert(COMPANIES_HOUSE_SOURCE).select().single();
    chSrc = ins.data ?? null;
    if (ins.error) {
      notes.push(`Companies House: source create failed — ${ins.error.message}`);
      return result;
    }
  }
  if (!chSrc) return result;

  const { ingestDocument } = await import("../ingest.server");

  let rateLimited = false;

  for (const ent of candidates) {
    if (!opts.hasBudget()) { notes.push("Companies House: stopped — runtime budget reached."); break; }
    if (rateLimited) { notes.push("Companies House: stopped — rate limited."); break; }

    result.companiesChecked++;

    // Previous check baseline (before we overwrite it below).
    const lastCheckedMs = ent.company_number_checked_at
      ? Date.parse(ent.company_number_checked_at)
      : 0;

    let number: string | null;
    try {
      number = await resolveCompanyNumber(db, ent, apiKey);
    } catch {
      rateLimited = true;
      break;
    }
    if (!number) continue;

    let charges: CHChargeItem[] = [];
    let filings: CHFilingItem[] = [];
    let officers: CHOfficerItem[] = [];
    try {
      charges = await chCharges(number, apiKey);
      if (!opts.hasBudget()) break;
      filings = await chInsolvencyFilings(number, apiKey);
      if (!opts.hasBudget()) break;
      officers = await chOfficers(number, apiKey);
    } catch {
      rateLimited = true;
      // still ingest anything we already have
    }

    const companyLabel = ent.canonical_name;
    const built: CompaniesHouseDoc[] = [];

    for (const c of charges) {
      const iso = toISO(c.created_on);
      const t = iso ? Date.parse(iso) : 0;
      if (lastCheckedMs && t && t <= lastCheckedMs) continue;
      const classification = c.classification?.description || c.classification?.type || "charge";
      const particulars = c.particulars?.description ?? "";
      const dedupeKey = c.transaction_id
        ? `ch:charge:${number}:${c.transaction_id}`
        : `ch:charge:${number}:${c.id ?? c.charge_number ?? c.created_on ?? Math.random().toString(36).slice(2)}`;
      built.push({
        title: `Charge registered against ${companyLabel}`,
        body: `Companies House charge (${classification}) registered on ${c.created_on ?? "unknown date"}${c.status ? `, status: ${c.status}` : ""}. ${particulars}`.slice(0, 2000),
        url: companyUrl(number) + "/charges",
        publishedAt: iso,
        dedupeKey,
      });
    }

    for (const f of filings) {
      const iso = toISO(f.date);
      const t = iso ? Date.parse(iso) : 0;
      if (lastCheckedMs && t && t <= lastCheckedMs) continue;
      const desc = f.description ?? f.type ?? "insolvency filing";
      const dedupeKey = f.transaction_id
        ? `ch:filing:${number}:${f.transaction_id}`
        : `ch:filing:${number}:${f.date ?? ""}:${f.type ?? ""}`;
      built.push({
        title: `${companyLabel} insolvency filing: ${desc}`.slice(0, 300),
        body: `Companies House filing (${f.type ?? "insolvency"}) dated ${f.date ?? "unknown"}. ${desc}`.slice(0, 2000),
        url: companyUrl(number) + "/filing-history",
        publishedAt: iso,
        dedupeKey,
      });
    }

    for (const o of officers) {
      if (!o.resigned_on) continue;
      const iso = toISO(o.resigned_on);
      const t = iso ? Date.parse(iso) : 0;
      if (lastCheckedMs && t && t <= lastCheckedMs) continue;
      const officerName = (o.name ?? "An officer").trim();
      const role = o.officer_role ?? "director";
      const dedupeKey = `ch:officer:${number}:${officerName}:${o.resigned_on}`;
      built.push({
        title: `${companyLabel}: ${officerName} resigned as ${role}`.slice(0, 300),
        body: `Companies House officer change — ${officerName} (${role}) resigned on ${o.resigned_on}.`,
        url: companyUrl(number) + "/officers",
        publishedAt: iso,
        dedupeKey,
      });
    }

    // Ingest — dedupe within this run by dedupeKey.
    const seen = new Set<string>();
    for (const d of built) {
      if (!opts.hasBudget()) break;
      if (seen.has(d.dedupeKey)) continue;
      seen.add(d.dedupeKey);
      const ing = await ingestDocument(db, {
        src: chSrc,
        title: d.title,
        body: d.body,
        url: d.url,
        publishedAt: d.publishedAt,
        isSynthetic: false,
        collectedVia: "api",
        recentShingleSets: opts.recentShingleSets,
        copyLoopJaccard: opts.copyLoopJaccard,
        logStage: "companies_house",
      });
      for (const n of ing.notes) notes.push(n);
      if (ing.skipped) continue;
      result.ingested++;
    }
  }

  if (result.ingested > 0) {
    await db.from("sources").update({ last_success_at: new Date().toISOString() }).eq("id", chSrc.id);
  }
  notes.push(`Companies House: checked ${result.companiesChecked} company(ies), ingested ${result.ingested} filing(s).`);
  return result;
}
