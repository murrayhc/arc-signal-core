// Server-only text utilities: shingles, Jaccard, cosine, RSS parsing.

// Multi-part TLDs where the registrable domain uses the last THREE labels.
// Keep in sync with public.derive_independence_group() in the DB.
const MULTI_PART_TLDS = new Set<string>([
  "co.uk","org.uk","gov.uk","ac.uk","me.uk","ltd.uk","plc.uk","net.uk","sch.uk","nhs.uk",
  "com.au","net.au","org.au","edu.au","gov.au","asn.au","id.au",
  "co.nz","net.nz","org.nz","govt.nz","ac.nz",
  "co.jp","ne.jp","or.jp","ac.jp","go.jp","ad.jp","gr.jp",
  "com.br","net.br","org.br","gov.br","edu.br",
  "co.in","net.in","org.in","gov.in","ac.in","edu.in",
  "com.cn","net.cn","org.cn","gov.cn","edu.cn",
  "com.hk","org.hk","gov.hk","edu.hk","net.hk",
  "com.sg","edu.sg","gov.sg","org.sg","net.sg",
  "co.za","org.za","gov.za","ac.za","net.za",
  "com.mx","gob.mx","org.mx","edu.mx",
  "com.tr","gov.tr","org.tr","edu.tr",
  "com.tw","org.tw","gov.tw","edu.tw",
  "co.kr","or.kr","go.kr","ac.kr",
  "co.il","org.il","gov.il","ac.il",
  "com.ar","gov.ar","org.ar","edu.ar",
  "com.co","gov.co","org.co","edu.co",
  "co.id","or.id","go.id","ac.id",
  "com.my","gov.my","org.my","edu.my",
]);

/**
 * Publisher-level grouping key so two feeds from the same publisher only
 * count as one independent voice. Mirrors public.derive_independence_group().
 */
export function deriveIndependenceGroup(
  url: string | null | undefined,
  name: string | null | undefined,
  isSynthetic: boolean,
  id?: string | null,
): string {
  if (isSynthetic) return `synthetic:${id ?? ""}`;
  const raw = (url ?? "").trim();
  if (!raw) return (name ?? "").toLowerCase();
  let host = raw.toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  host = host.split("/")[0].split("?")[0].split("#")[0].split(":")[0];
  if (host.startsWith("www.")) host = host.slice(4);
  const parts = host.split(".").filter(Boolean);
  const n = parts.length;
  if (n < 2) return host || (name ?? "").toLowerCase();
  if (n >= 3) {
    const last2 = `${parts[n - 2]}.${parts[n - 1]}`;
    if (MULTI_PART_TLDS.has(last2)) return `${parts[n - 3]}.${last2}`;
  }
  return `${parts[n - 2]}.${parts[n - 1]}`;
}


export function shingles(text: string, size = 5): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function shingleSignature(text: string): string {
  // Compact fingerprint: sort shingles, hash first 40 chars — good enough for lookup.
  const s = Array.from(shingles(text, 5)).sort().join("|");
  return simpleHash(s);
}

function simpleHash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

export function cosine(a: number[] | null, b: number[] | null): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function centroid(vectors: number[][]): number[] | null {
  if (!vectors.length) return null;
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) for (let i = 0; i < dim; i++) out[i] += v[i];
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

// ============ Lightweight RSS parser (title/link/description) ============
export interface FeedItem { title: string; link: string; description: string; publishedAt: string | null; }

export async function fetchFeed(url: string, timeoutMs = 8000): Promise<FeedItem[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; ArchlightBot/1.0; +https://arc-signal-core.lovable.app)", "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseRss(xml);
  } finally {
    clearTimeout(t);
  }
}

function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  // Support RSS <item> and Atom <entry>
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks.slice(0, 6)) {
    const title = pick(block, "title");
    const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i) || block.match(/<link>([\s\S]*?)<\/link>/i);
    const link = linkMatch ? (linkMatch[1] ?? "").trim() : "";
    const description = pick(block, "description") || pick(block, "summary") || pick(block, "content");
    const pub = pick(block, "pubDate") || pick(block, "updated") || pick(block, "published");
    items.push({
      title: stripTags(title).slice(0, 300),
      link,
      description: stripTags(description).slice(0, 1200),
      publishedAt: pub ? safeDate(pub) : null,
    });
  }
  return items;
}

function pick(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? m[1] : "";
}
function stripTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
function safeDate(s: string): string | null {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
