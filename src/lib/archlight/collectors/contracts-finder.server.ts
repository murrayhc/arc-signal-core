// UK Contracts Finder collector — public OCDS JSON API, no key required.
// Returns a bounded list of normalised documents ready to feed through the
// shared ingestDocument helper. Best-effort: on any HTTP/parse error returns
// what it already has (or []) and never throws.

const USER_AGENT =
  "Mozilla/5.0 (compatible; ArklightBot/1.0; +https://arc-signal-core.lovable.app)";

const BASE = "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search";

export interface ContractsFinderDoc {
  title: string;
  body: string;
  url: string;
  publishedAt: string | null;
}

interface OcdsAmount {
  amount?: number;
  currency?: string;
}
interface OcdsParty {
  id?: string;
  name?: string;
  roles?: string[];
}
interface OcdsAward {
  id?: string;
  title?: string;
  description?: string;
  value?: OcdsAmount;
  suppliers?: Array<{ id?: string; name?: string }>;
}
interface OcdsTender {
  id?: string;
  title?: string;
  description?: string;
  value?: OcdsAmount;
  procuringEntity?: { id?: string; name?: string };
}
interface OcdsRelease {
  ocid?: string;
  id?: string;
  date?: string;
  uri?: string;
  tag?: string[];
  buyer?: { id?: string; name?: string };
  parties?: OcdsParty[];
  tender?: OcdsTender;
  awards?: OcdsAward[];
  planning?: { rationale?: string };
}
interface OcdsPackage {
  releases?: OcdsRelease[];
  links?: { next?: string };
}

function fmtGBP(v?: OcdsAmount): string | null {
  if (!v || typeof v.amount !== "number" || !Number.isFinite(v.amount)) return null;
  if ((v.currency ?? "GBP").toUpperCase() !== "GBP") return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency", currency: "GBP", maximumFractionDigits: 0,
    }).format(v.amount);
  } catch {
    return `GBP ${Math.round(v.amount).toLocaleString("en-GB")}`;
  }
}

function noticeUrl(rel: OcdsRelease): string {
  const ocid = rel.ocid ?? rel.id;
  if (rel.uri && /^https?:\/\//.test(rel.uri)) return rel.uri;
  if (ocid) return `https://www.contractsfinder.service.gov.uk/Notice/${encodeURIComponent(ocid)}`;
  return "https://www.contractsfinder.service.gov.uk/";
}

function buildDoc(rel: OcdsRelease): ContractsFinderDoc | null {
  const award = (rel.awards ?? [])[0];
  const tender = rel.tender;
  const title = (award?.title || tender?.title || "").trim();
  if (!title) return null;

  const buyer = rel.buyer?.name || tender?.procuringEntity?.name || null;
  const suppliers = (award?.suppliers ?? []).map((s) => s?.name).filter((s): s is string => !!s);
  const value = fmtGBP(award?.value) ?? fmtGBP(tender?.value);
  const description = (award?.description || tender?.description || "").trim().replace(/\s+/g, " ");

  const stage = award ? "award" : "tender";
  const parts: string[] = [];
  parts.push(`UK public-sector ${stage} notice.`);
  if (buyer) parts.push(`Buyer: ${buyer}.`);
  if (suppliers.length) parts.push(`Supplier${suppliers.length > 1 ? "s" : ""}: ${suppliers.join(", ")}.`);
  if (value) parts.push(`Value: ${value}.`);
  if (description) parts.push(description.slice(0, 800));

  const body = parts.join(" ").slice(0, 2000);
  const publishedAt = rel.date && Number.isFinite(Date.parse(rel.date))
    ? new Date(rel.date).toISOString()
    : null;

  return {
    title: title.slice(0, 300),
    body,
    url: noticeUrl(rel),
    publishedAt,
  };
}

export async function fetchContractsFinder(opts: {
  sinceHours?: number;
  limit?: number;
  maxPages?: number;
  timeoutMs?: number;
} = {}): Promise<ContractsFinderDoc[]> {
  const sinceHours = Math.max(1, Math.min(24 * 14, opts.sinceHours ?? 24));
  const limit = Math.max(1, Math.min(100, opts.limit ?? 100));
  const maxPages = Math.max(1, Math.min(5, opts.maxPages ?? 3));
  const timeoutMs = opts.timeoutMs ?? 12000;

  const now = new Date();
  const from = new Date(now.getTime() - sinceHours * 60 * 60 * 1000);

  const params = new URLSearchParams({
    publishedFrom: from.toISOString(),
    publishedTo: now.toISOString(),
    stages: "tender,award",
    limit: String(limit),
  });
  let nextUrl: string | null = `${BASE}?${params.toString()}`;

  const out: ContractsFinderDoc[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < maxPages && nextUrl; page++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res: Response = await fetch(nextUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
      });
      if (!res.ok) break; // 403 rate-limit or any error → stop, return what we have
      const text = await res.text();
      if (!text.trim() || text.trim().startsWith("<")) break;
      let pkg: OcdsPackage;
      try { pkg = JSON.parse(text) as OcdsPackage; } catch { break; }

      for (const rel of pkg.releases ?? []) {
        const doc = buildDoc(rel);
        if (!doc) continue;
        if (seen.has(doc.url)) continue;
        seen.add(doc.url);
        out.push(doc);
      }
      nextUrl = pkg.links?.next && /^https?:\/\//.test(pkg.links.next) ? pkg.links.next : null;
    } catch {
      break;
    } finally {
      clearTimeout(t);
    }
  }

  return out;
}

export const CONTRACTS_FINDER_SOURCE = {
  name: "Contracts Finder",
  source_type: "regulatory" as const,
  base_url: "contractsfinder.service.gov.uk",
  feed_url: null as string | null,
  is_synthetic: false,
  independence_group: "contractsfinder.service.gov.uk",
  reliability_score: 0.9,
  health_score: 0.85,
  status: "active" as const,
  collector_supported: true,
  refresh_cadence_minutes: 60,
  access_method: "api" as const,
  tier: "primary" as const,
  metadata: { origin: "uk_primary_seed", collector: "contracts_finder" },
};
