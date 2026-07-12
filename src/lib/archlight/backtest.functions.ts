// Backtest harness — prove Archlight's lead-time against known outcomes.
// Ground truth: The Gazette corporate-insolvency notices already ingested as
// documents. Distress signals: Companies House filing history / charges /
// officers before the outcome date.
//
// Guardrails: only real fetched data (no synthesised signals or dates), GBP
// only, bounded Companies House usage.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  chChargesAll,
  chFilingHistoryAll,
  chOfficersAll,
  chSearch,
  type CHChargeItem,
  type CHFilingItem,
  type CHOfficerItem,
} from "./collectors/companies-house.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- helpers ----------

// Extract a plausible company name from a Gazette insolvency notice title.
// Titles are like:
//   "ACME LIMITED — Notice of appointment of liquidator"
//   "IN THE MATTER OF ACME LTD — Notice of intended dividend"
//   "ACME (UK) LIMITED (In Administration)"
// Keep the leading company clause, strip any "(In Administration)" trailer,
// and drop the "IN THE MATTER OF" boilerplate.
function extractCompanyName(title: string): string | null {
  if (!title) return null;
  let t = title.trim();
  // Split on em-dash / colon / hyphen boundaries — company is the head.
  const splitters = [" — ", " – ", " - ", ": ", " | "];
  for (const s of splitters) {
    const i = t.indexOf(s);
    if (i > 0) { t = t.slice(0, i).trim(); break; }
  }
  // Strip common trailing parenthetical status (e.g. "(In Administration)").
  t = t.replace(/\s*\((in|under)\s+[^)]+\)\s*$/i, "").trim();
  // Strip a leading "IN THE MATTER OF ".
  t = t.replace(/^in the matter of\s+/i, "").trim();
  // Keep it sane.
  t = t.replace(/\s+/g, " ").slice(0, 240);
  if (t.length < 3) return null;
  return t;
}

function toISODate(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO);
  const b = Date.parse(toISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Number(((s[mid - 1] + s[mid]) / 2).toFixed(2));
}

// ---------- 1. Import Gazette cases ----------

const GAZETTE_FEED_BASE = "https://www.thegazette.co.uk/all-notices/notice/data.feed";

function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findNextLink(xml: string): string | null {
  const re = /<link\b[^>]*\brel=["']next["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i;
  const m = xml.match(re);
  if (m) return m[1];
  const re2 = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["']next["'][^>]*\/?>/i;
  const m2 = xml.match(re2);
  return m2 ? m2[1] : null;
}

function extractEntries(xml: string): string[] {
  const out: string[] = [];
  const re = /<entry\b[\s\S]*?<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[0]);
  return out;
}

function extractEntryLink(entryXml: string): string | null {
  const re = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i;
  const m = entryXml.match(re);
  return m ? m[1] : null;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "ArchlightBacktest/1.0 (+https://arc-signal-core.lovable.app)",
        Accept: "application/atom+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });
  } finally {
    clearTimeout(t);
  }
}

export const importGazetteCases = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        maxPages: z.number().int().min(1).max(50).optional(),
        pageSize: z.number().int().min(10).max(100).optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const maxPages = data?.maxPages ?? 10;
    const pageSize = data?.pageSize ?? 100;
    const notes: string[] = [];

    let url: string | null = `${GAZETTE_FEED_BASE}?categorycode=24&results-page-size=${pageSize}`;
    let pages_fetched = 0;
    let considered = 0;
    let imported = 0;

    while (url && pages_fetched < maxPages) {
      let xml: string;
      try {
        const res = await fetchWithTimeout(url, 15000);
        if (!res.ok) {
          notes.push(`fetch ${res.status} at page ${pages_fetched + 1}`);
          break;
        }
        xml = await res.text();
      } catch (e) {
        notes.push(`fetch error at page ${pages_fetched + 1}: ${(e as Error).message}`);
        break;
      }
      pages_fetched++;

      const entries = extractEntries(xml);
      for (const entry of entries) {
        considered++;
        const rawTitle = extractTag(entry, "title");
        const title = rawTitle ? decodeXml(rawTitle) : "";
        const name = extractCompanyName(title);
        const dateStr = extractTag(entry, "updated") ?? extractTag(entry, "published");
        const outcomeDate = toISODate(dateStr);
        if (!name || !outcomeDate) continue;

        const rawContent = extractTag(entry, "content") ?? extractTag(entry, "summary") ?? "";
        const contentText = decodeXml(rawContent);
        const numMatch = contentText.match(/Company Number\s*[:#]?\s*([0-9A-Z]{6,10})/i);
        const company_number = numMatch ? numMatch[1].toUpperCase() : null;

        const link = extractEntryLink(entry);

        const { error } = await db
          .from("backtest_cases")
          .upsert(
            {
              company_name: name,
              company_number,
              outcome_type: "insolvency",
              outcome_date: outcomeDate,
              source: "the_gazette",
              notes: (link ?? "").slice(0, 500),
            },
            { onConflict: "company_name,outcome_type,outcome_date", ignoreDuplicates: true },
          );
        if (error) {
          notes.push(`upsert failed for "${name}": ${error.message}`);
          continue;
        }
        imported++;
      }

      const next = findNextLink(xml);
      url = next && next !== url ? next : null;
    }

    return { imported, considered, pages_fetched, notes };
  });

// ---------- 2. Run backtest ----------

const DEFAULT_WINDOW_DAYS = 730; // 24 months

interface BuiltSignal {
  signal_type: "charge_registered" | "insolvency_filing" | "officer_resignation";
  signal_date: string; // ISO date
  detail: string;
  lead_days: number;
}

function buildChargesSignals(charges: CHChargeItem[], outcomeDate: string): BuiltSignal[] {
  const out: BuiltSignal[] = [];
  for (const c of charges) {
    const d = toISODate(c.created_on);
    if (!d || d >= outcomeDate) continue;
    const classification = c.classification?.description || c.classification?.type || "charge";
    const particulars = (c.particulars?.description ?? "").slice(0, 240);
    out.push({
      signal_type: "charge_registered",
      signal_date: d,
      detail: `Charge registered (${classification})${particulars ? ` — ${particulars}` : ""}`.slice(0, 500),
      lead_days: daysBetween(d, outcomeDate),
    });
  }
  return out;
}

function buildFilingSignals(filings: CHFilingItem[], outcomeDate: string): BuiltSignal[] {
  const out: BuiltSignal[] = [];
  for (const f of filings) {
    const d = toISODate(f.date);
    if (!d || d >= outcomeDate) continue;
    const cat = (f.category ?? "").toLowerCase();
    if (cat !== "insolvency") continue;
    const desc = (f.description ?? f.type ?? "insolvency filing").toString().slice(0, 240);
    out.push({
      signal_type: "insolvency_filing",
      signal_date: d,
      detail: `Insolvency filing: ${desc}`.slice(0, 500),
      lead_days: daysBetween(d, outcomeDate),
    });
  }
  return out;
}

function buildOfficerSignals(officers: CHOfficerItem[], outcomeDate: string): BuiltSignal[] {
  const out: BuiltSignal[] = [];
  for (const o of officers) {
    const d = toISODate(o.resigned_on);
    if (!d || d >= outcomeDate) continue;
    const name = (o.name ?? "An officer").trim();
    const role = o.officer_role ?? "director";
    out.push({
      signal_type: "officer_resignation",
      signal_date: d,
      detail: `${name} resigned as ${role}`.slice(0, 500),
      lead_days: daysBetween(d, outcomeDate),
    });
  }
  return out;
}

export const runBacktest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        maxCases: z.number().int().min(1).max(2000).optional(),
        windowDays: z.number().int().min(30).max(3650).optional(),
        batchSize: z.number().int().min(1).max(100).optional(),
      })
      .optional()
      .parse(d),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const maxCases = Math.max(1, Math.min(2000, data?.maxCases ?? 500));
    const windowDays = data?.windowDays ?? DEFAULT_WINDOW_DAYS;
    const batchSize = Math.max(1, Math.min(100, data?.batchSize ?? 25));

    const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
      return { cases_processed: 0, cases_resolved: 0, signals_inserted: 0, window_days: windowDays, notes: ["COMPANIES_HOUSE_API_KEY not set — skipping."] };
    }

    const notes: string[] = [];
    let processed = 0;
    let resolved = 0;
    let signalsInserted = 0;
    let rateLimited = false;

    outer: while (processed < maxCases && !rateLimited) {
      const remaining = maxCases - processed;
      const take = Math.min(batchSize, remaining);
      const { data: cases } = await db
        .from("backtest_cases")
        .select("id, company_name, company_number, outcome_date")
        .is("signals_computed_at", null)
        .order("outcome_date", { ascending: false })
        .limit(take);
      const candidates = cases ?? [];
      if (candidates.length === 0) break;

      for (const c of candidates) {
        if (rateLimited) break outer;
        processed++;

        // Resolve company_number if missing.
        let number = c.company_number as string | null;
        if (!number) {
          try {
            number = await chSearch(c.company_name, apiKey);
          } catch {
            rateLimited = true;
            break outer;
          }
          if (!number) {
            notes.push(`No Companies House match for "${c.company_name}".`);
            await db.from("backtest_cases").update({ signals_computed_at: new Date().toISOString() }).eq("id", c.id);
            continue;
          }
          await db.from("backtest_cases").update({ company_number: number }).eq("id", c.id);
        }
        resolved++;

        let charges: CHChargeItem[] = [];
        let filings: CHFilingItem[] = [];
        let officers: CHOfficerItem[] = [];
        try {
          charges = await chChargesAll(number, apiKey, 3);
          filings = await chFilingHistoryAll(number, apiKey, 6);
          officers = await chOfficersAll(number, apiKey, 3);
        } catch {
          rateLimited = true;
        }

        const built: BuiltSignal[] = [
          ...buildChargesSignals(charges, c.outcome_date),
          ...buildFilingSignals(filings, c.outcome_date),
          ...buildOfficerSignals(officers, c.outcome_date),
        ];

        if (built.length) {
          const seen = new Set<string>();
          const dedup = built.filter((b) => {
            const k = `${b.signal_type}|${b.signal_date}|${b.detail}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
          await db.from("backtest_signals").delete().eq("case_id", c.id);
          const insertRows = dedup.map((b) => ({
            case_id: c.id,
            ...b,
            in_window: b.lead_days <= windowDays,
          }));
          const { error } = await db.from("backtest_signals").insert(insertRows);
          if (error) {
            notes.push(`insert failed for ${c.company_name}: ${error.message}`);
          } else {
            signalsInserted += insertRows.length;
          }
        }

        await db.from("backtest_cases").update({ signals_computed_at: new Date().toISOString() }).eq("id", c.id);
      }
    }

    if (rateLimited) notes.push("Stopped — Companies House rate limited; will resume next run.");

    return { cases_processed: processed, cases_resolved: resolved, signals_inserted: signalsInserted, window_days: windowDays, notes };
  });

// ---------- 3. Aggregate summary + snapshot ----------

export interface BacktestSummary {
  cases_imported: number;
  cases_processed: number;
  cases_total: number; // alias of cases_processed (headline denominator)
  cases_with_signal: number;
  cases_with_signal_pct: number | null;
  median_lead_days: number | null;
  earliest_lead_days_max: number | null;
  window_days: number;
  signal_type_stats: Record<string, { count: number; cases: number; median_lead_days: number | null }>;
  most_predictive_type: { type: string; median_lead_days: number } | null;
}

async function computeSummaryCore(windowDays: number = DEFAULT_WINDOW_DAYS): Promise<BacktestSummary> {
  const db = await admin();
  const { data: cases } = await db
    .from("backtest_cases")
    .select("id, signals_computed_at");
  const all = cases ?? [];
  const cases_imported = all.length;
  const processedCases = all.filter((c) => c.signals_computed_at != null);
  const cases_processed = processedCases.length;
  const processedIds = new Set(processedCases.map((c) => c.id));

  if (cases_processed === 0) {
    return {
      cases_imported,
      cases_processed: 0,
      cases_total: 0,
      cases_with_signal: 0,
      cases_with_signal_pct: null,
      median_lead_days: null,
      earliest_lead_days_max: null,
      window_days: windowDays,
      signal_type_stats: {},
      most_predictive_type: null,
    };
  }

  const { data: signals } = await db
    .from("backtest_signals")
    .select("case_id, signal_type, lead_days, in_window");
  const rows = (signals ?? []) as Array<{ case_id: string; signal_type: string; lead_days: number; in_window: boolean }>;
  // Headline restricted to in-window signals on processed cases only.
  const inWindow = rows.filter((r) => r.in_window && processedIds.has(r.case_id));

  const earliestByCase = new Map<string, number>();
  const perType = new Map<string, { leads: number[]; caseSet: Set<string> }>();

  for (const r of inWindow) {
    const prev = earliestByCase.get(r.case_id);
    if (prev == null || r.lead_days > prev) earliestByCase.set(r.case_id, r.lead_days);
    if (!perType.has(r.signal_type)) perType.set(r.signal_type, { leads: [], caseSet: new Set() });
    const bucket = perType.get(r.signal_type)!;
    bucket.leads.push(r.lead_days);
    bucket.caseSet.add(r.case_id);
  }

  const earliestLeads = Array.from(earliestByCase.values());
  const cases_with_signal = earliestByCase.size;
  const cases_with_signal_pct = Number(((cases_with_signal / cases_processed) * 100).toFixed(1));
  const median_lead_days = median(earliestLeads);
  const earliest_lead_days_max = earliestLeads.length ? Math.max(...earliestLeads) : null;

  const signal_type_stats: BacktestSummary["signal_type_stats"] = {};
  for (const [t, v] of perType) {
    signal_type_stats[t] = { count: v.leads.length, cases: v.caseSet.size, median_lead_days: median(v.leads) };
  }

  let most_predictive_type: BacktestSummary["most_predictive_type"] = null;
  for (const [t, v] of Object.entries(signal_type_stats)) {
    if (v.median_lead_days == null) continue;
    if (!most_predictive_type || v.median_lead_days > most_predictive_type.median_lead_days) {
      most_predictive_type = { type: t, median_lead_days: v.median_lead_days };
    }
  }

  return {
    cases_imported,
    cases_processed,
    cases_total: cases_processed,
    cases_with_signal,
    cases_with_signal_pct,
    median_lead_days,
    earliest_lead_days_max,
    window_days: windowDays,
    signal_type_stats,
    most_predictive_type,
  };
}

export const computeBacktestSummary = createServerFn({ method: "POST" }).handler(async () => {
  const db = await admin();
  const summary = await computeSummaryCore();
  const { error } = await db.from("backtest_runs").insert({
    cases_total: summary.cases_processed,
    cases_imported: summary.cases_imported,
    cases_processed: summary.cases_processed,
    cases_with_signal: summary.cases_with_signal,
    median_lead_days: summary.median_lead_days,
    window_days: summary.window_days,
    signal_type_stats: JSON.parse(JSON.stringify(summary.signal_type_stats)),
  });
  if (error) return { ...summary, snapshot_error: error.message };
  return summary;
});


// ---------- 4. Read fns for the UI ----------

export const getBacktestSummary = createServerFn({ method: "GET" }).handler(async () => {
  return computeSummaryCore();
});

export const listBacktestCases = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(500).optional() }).optional().parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const limit = data?.limit ?? 100;
    const { data: cases } = await db
      .from("backtest_cases")
      .select("id, company_name, company_number, outcome_type, outcome_date, signals_computed_at")
      .order("outcome_date", { ascending: false })
      .limit(limit);
    const rows = cases ?? [];
    const emptyEnriched: Array<{
      id: string;
      company_name: string;
      company_number: string | null;
      outcome_type: string;
      outcome_date: string;
      signals_computed_at: string | null;
      signal_count: number;
      earliest_signal_date: string | null;
      earliest_lead_days: number | null;
      signal_types: string[];
    }> = [];
    if (rows.length === 0) return { cases: emptyEnriched };

    const caseIds = rows.map((c) => c.id);
    const { data: signals } = await db
      .from("backtest_signals")
      .select("case_id, signal_type, signal_date, lead_days, in_window")
      .in("case_id", caseIds);
    const byCase = new Map<string, Array<{ signal_type: string; signal_date: string; lead_days: number; in_window: boolean }>>();
    for (const s of signals ?? []) {
      const arr = byCase.get(s.case_id as string) ?? [];
      arr.push({
        signal_type: s.signal_type as string,
        signal_date: s.signal_date as string,
        lead_days: Number(s.lead_days),
        in_window: (s as { in_window?: boolean }).in_window ?? true,
      });
      byCase.set(s.case_id as string, arr);
    }

    const enriched = rows.map((c) => {
      const sigs = byCase.get(c.id) ?? [];
      const inWin = sigs.filter((s) => s.in_window);
      const earliest = inWin.length ? inWin.reduce((a, b) => (a.lead_days >= b.lead_days ? a : b)) : null;
      const types = Array.from(new Set(inWin.map((s) => s.signal_type)));
      return {
        id: c.id,
        company_name: c.company_name,
        company_number: c.company_number,
        outcome_type: c.outcome_type,
        outcome_date: c.outcome_date,
        signals_computed_at: c.signals_computed_at,
        signal_count: inWin.length,
        signal_count_total: sigs.length,
        earliest_signal_date: earliest?.signal_date ?? null,
        earliest_lead_days: earliest?.lead_days ?? null,
        signal_types: types,
      };
    });
    return { cases: enriched };
  });

export const listRecentBacktestRuns = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(50).optional() }).optional().parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const { data: runs } = await db
      .from("backtest_runs")
      .select("id, ran_at, cases_total, cases_with_signal, median_lead_days, signal_type_stats")
      .order("ran_at", { ascending: false })
      .limit(data?.limit ?? 10);
    return { runs: runs ?? [] };
  });
