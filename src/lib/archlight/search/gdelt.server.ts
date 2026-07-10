// GDELT DOC 2.0 search adapter. No API key. Bounded, best-effort.
// Returns an empty array on any failure so callers can degrade gracefully.

export interface GdeltArticle {
  url: string;
  title: string;
  domain: string;
  seendate: string | null; // ISO
  snippet?: string;
}

interface GdeltRaw {
  articles?: Array<{
    url?: string;
    title?: string;
    domain?: string;
    seendate?: string; // "YYYYMMDDTHHMMSSZ"
    socialimage?: string;
    language?: string;
    sourcecountry?: string;
  }>;
}

function parseSeenDate(s: string | undefined | null): string | null {
  if (!s) return null;
  // GDELT format: 20240110T153000Z
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

export async function gdeltSearch(
  query: string,
  opts: { maxRecords?: number; timespan?: string; timeoutMs?: number } = {},
): Promise<GdeltArticle[]> {
  const maxRecords = Math.max(1, Math.min(50, opts.maxRecords ?? 15));
  const timespan = opts.timespan ?? "2weeks";
  const timeoutMs = opts.timeoutMs ?? 8000;
  const q = query.trim().slice(0, 300);
  if (!q) return [];
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc` +
    `?query=${encodeURIComponent(q)}` +
    `&mode=ArtList&format=json` +
    `&maxrecords=${maxRecords}` +
    `&timespan=${encodeURIComponent(timespan)}` +
    `&sort=DateDesc`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ArchlightBot/0.1 (+public-signals)" },
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.trim() || text.trim().startsWith("<")) return [];
    let parsed: GdeltRaw;
    try {
      parsed = JSON.parse(text) as GdeltRaw;
    } catch {
      return [];
    }
    const items = parsed.articles ?? [];
    const out: GdeltArticle[] = [];
    for (const a of items) {
      if (!a.url || !a.title) continue;
      const domain = (a.domain ?? "").toLowerCase() ||
        (() => { try { return new URL(a.url!).hostname.toLowerCase(); } catch { return ""; } })();
      if (!domain) continue;
      out.push({
        url: a.url,
        title: a.title,
        domain: domain.startsWith("www.") ? domain.slice(4) : domain,
        seendate: parseSeenDate(a.seendate),
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}
