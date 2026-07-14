// GNews API adapter (https://gnews.io). Requires the GNEWS_API_KEY env var.
// Bounded, best-effort: returns [] on any failure or missing key so callers
// degrade gracefully. Free tier: ~100 requests/day, max 10 articles/request.

export interface GNewsArticle {
  url: string;
  title: string;
  description: string;
  publishedAt: string | null;
  source: string;
}

interface GNewsRaw {
  articles?: Array<{
    title?: string;
    description?: string;
    content?: string;
    url?: string;
    publishedAt?: string;
    source?: { name?: string; url?: string };
  }>;
}

/** True when a GNews API key is configured in the environment. */
export function hasGNewsKey(): boolean {
  return Boolean(process.env.GNEWS_API_KEY);
}

export async function gnewsSearch(
  query: string,
  opts: { max?: number; lang?: string; timeoutMs?: number } = {},
): Promise<GNewsArticle[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const q = query.trim().slice(0, 200);
  if (!q) return [];
  const max = Math.max(1, Math.min(10, opts.max ?? 10));
  const lang = opts.lang ?? "en";
  const url =
    `https://gnews.io/api/v4/search` +
    `?q=${encodeURIComponent(q)}` +
    `&lang=${lang}&max=${max}&sortby=publishedAt&token=${encodeURIComponent(key)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.trim() || text.trim().startsWith("<")) return [];
    let data: GNewsRaw;
    try {
      data = JSON.parse(text) as GNewsRaw;
    } catch {
      return [];
    }
    const out: GNewsArticle[] = [];
    for (const a of data.articles ?? []) {
      if (!a.url || !a.title) continue;
      out.push({
        url: a.url,
        title: a.title,
        description: (a.description ?? a.content ?? "").slice(0, 500),
        publishedAt: a.publishedAt ? safeIso(a.publishedAt) : null,
        source: a.source?.name ?? "unknown",
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

function safeIso(s: string): string | null {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
