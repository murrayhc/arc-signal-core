// Server-only entity resolver: map free-text company mentions → canonical entities.
// Uses aliases, tickers, and canonical names. Case-insensitive, punctuation-tolerant.

export interface ResolvedEntity {
  id: string;
  canonical_name: string;
  ticker: string | null;
  sector: string | null;
  region: string | null;
  aliases: string[];
  match_score: number;   // 0-1 (1 = exact ticker/canonical match)
  matched_on: "ticker" | "canonical" | "alias" | "fuzzy" | "none";
}

export interface EntityRow {
  id: string;
  canonical_name: string;
  ticker: string | null;
  sector: string | null;
  region: string | null;
  aliases: string[] | null;
  entity_type: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Resolve a single mention against a pre-loaded entity list. */
export function resolveOne(mention: string, entities: EntityRow[]): ResolvedEntity | null {
  const raw = mention.trim();
  if (!raw) return null;
  const n = normalize(raw);

  // 1. Exact ticker match (case-insensitive, ignore .SUFFIX)
  const rawTicker = raw.toUpperCase();
  const tickerBase = rawTicker.split(".")[0];
  for (const e of entities) {
    if (!e.ticker) continue;
    if (e.ticker.toUpperCase() === rawTicker || e.ticker.toUpperCase().split(".")[0] === tickerBase) {
      return { id: e.id, canonical_name: e.canonical_name, ticker: e.ticker, sector: e.sector, region: e.region, aliases: e.aliases ?? [], match_score: 1.0, matched_on: "ticker" };
    }
  }

  // 2. Exact canonical name (normalized)
  for (const e of entities) {
    if (normalize(e.canonical_name) === n) {
      return { id: e.id, canonical_name: e.canonical_name, ticker: e.ticker, sector: e.sector, region: e.region, aliases: e.aliases ?? [], match_score: 0.98, matched_on: "canonical" };
    }
  }

  // 3. Alias match
  for (const e of entities) {
    for (const a of e.aliases ?? []) {
      if (normalize(a) === n) {
        return { id: e.id, canonical_name: e.canonical_name, ticker: e.ticker, sector: e.sector, region: e.region, aliases: e.aliases ?? [], match_score: 0.9, matched_on: "alias" };
      }
    }
  }

  // 4. Substring fuzzy: mention contains canonical or vice versa (min 4 chars)
  if (n.length >= 4) {
    for (const e of entities) {
      const cn = normalize(e.canonical_name);
      if (cn.length >= 4 && (cn.includes(n) || n.includes(cn))) {
        const score = Math.min(cn.length, n.length) / Math.max(cn.length, n.length);
        if (score >= 0.5) {
          return { id: e.id, canonical_name: e.canonical_name, ticker: e.ticker, sector: e.sector, region: e.region, aliases: e.aliases ?? [], match_score: 0.55 + 0.3 * score, matched_on: "fuzzy" };
        }
      }
      for (const a of e.aliases ?? []) {
        const an = normalize(a);
        if (an.length >= 4 && (an.includes(n) || n.includes(an))) {
          return { id: e.id, canonical_name: e.canonical_name, ticker: e.ticker, sector: e.sector, region: e.region, aliases: e.aliases ?? [], match_score: 0.5, matched_on: "fuzzy" };
        }
      }
    }
  }

  return null;
}

export function resolveMany(mentions: string[], entities: EntityRow[]): Map<string, ResolvedEntity> {
  const out = new Map<string, ResolvedEntity>();
  for (const m of mentions) {
    const r = resolveOne(m, entities);
    if (r) out.set(m, r);
  }
  return out;
}
