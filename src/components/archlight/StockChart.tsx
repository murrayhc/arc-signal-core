import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Loader2 } from "lucide-react";
import { getMarketSeries } from "@/lib/archlight/precognition.functions";

// Map common suffix → TradingView exchange prefix
const EXCHANGE_MAP: Record<string, string> = {
  L: "LSE", PA: "EURONEXT", DE: "XETR", T: "TSE", HK: "HKEX", AX: "ASX",
  TO: "TSX", NS: "NSE", BR: "BMFBOVESPA", SW: "SIX", MI: "MIL", MC: "BME",
  ST: "OMXSTO", HE: "OMXHEX", OL: "OSL", CO: "OMXCOP", SA: "BMFBOVESPA", AS: "EURONEXT",
};

const US_EXCHANGE_MAP: Record<string, string> = {
  AAPL: "NASDAQ:AAPL",
  MAN: "NYSE:MAN",
  BA: "NYSE:BA",
  GD: "NYSE:GD",
  LHX: "NYSE:LHX",
  LMT: "NYSE:LMT",
  NOC: "NYSE:NOC",
  RTX: "NYSE:RTX",
};

export function toTvSymbol(ticker: string): string {
  const raw = ticker.trim().toUpperCase();
  if (raw.includes(":")) return raw;
  if (US_EXCHANGE_MAP[raw]) return US_EXCHANGE_MAP[raw];
  const [base, suffix] = raw.split(".");
  if (suffix && EXCHANGE_MAP[suffix]) return `${EXCHANGE_MAP[suffix]}:${base}`;
  // Heuristic for US listings without prefix — TradingView usually resolves NASDAQ/NYSE.
  if (!suffix) return raw;
  return raw;
}

export function StockChart({
  primary,
  competitors,
}: {
  primary: { name: string; ticker: string };
  competitors: Array<{ name: string; ticker: string }>;
}) {
  const [showCompetitors, setShowCompetitors] = useState(false);
  const seriesQ = useQuery({
    queryKey: ["market-series", primary.ticker, showCompetitors, competitors.map((c) => c.ticker).join("|")],
    queryFn: () => getMarketSeries({ data: { primary, competitors, includeCompetitors: showCompetitors } }),
    staleTime: 60 * 60_000,
  });

  return (
    <section className="glass-panel rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <LineChart className="h-4 w-4" style={{ color: "var(--color-signal)" }}/>
        <h3 className="font-display text-sm">Market position · {primary.name}</h3>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{toTvSymbol(primary.ticker)}</span>
        {competitors.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-[11px] font-mono text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showCompetitors}
              onChange={(e) => setShowCompetitors(e.target.checked)}
              className="accent-[color:var(--color-signal)]"
            />
            Overlay competitors ({competitors.length})
          </label>
        )}
      </div>
      {showCompetitors && competitors.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {competitors.map((c) => (
            <span key={c.ticker} className="text-[10px] font-mono px-2 py-0.5 rounded border border-border/50 bg-background/30">
              {c.name} · {toTvSymbol(c.ticker)}
            </span>
          ))}
        </div>
      )}
      <div className="relative w-full h-[420px] rounded-md overflow-hidden border border-border/40 bg-background/30">
        {seriesQ.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin"/>Loading market data…
          </div>
        )}
        {!seriesQ.isLoading && (!seriesQ.data?.series.length || seriesQ.isError) && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground text-center px-4">
            Chart unavailable. No delayed market series could be resolved for this listing.
          </div>
        )}
        {seriesQ.data?.series.length ? <SvgMarketChart series={seriesQ.data.series}/> : null}
      </div>
      <div className="mt-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        chart · delayed market data · relative 1y performance · informational only · not financial advice
      </div>
    </section>
  );
}

function SvgMarketChart({ series }: { series: Array<{ name: string; ticker: string; points: Array<{ t: string; close: number; pct: number }> }> }) {
  const width = 980;
  const height = 360;
  const pad = { top: 24, right: 56, bottom: 36, left: 54 };
  const all = series.flatMap((s) => s.points.map((p) => p.pct));
  const min = Math.min(-5, ...all);
  const max = Math.max(5, ...all);
  const span = max - min || 1;
  const colors = ["var(--color-signal)", "var(--color-opportunity)", "var(--color-reason)", "var(--color-risk)"];
  const xFor = (i: number, len: number) => pad.left + (i / Math.max(1, len - 1)) * (width - pad.left - pad.right);
  const yFor = (pct: number) => pad.top + ((max - pct) / span) * (height - pad.top - pad.bottom);
  const grid = [max, (max + min) / 2, min];

  return (
    <div className="h-full w-full p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" role="img" aria-label="Relative one-year market performance chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent"/>
        {grid.map((g, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={yFor(g)} y2={yFor(g)} stroke="var(--border)" strokeOpacity="0.45"/>
            <text x={width - pad.right + 8} y={yFor(g) + 4} fill="var(--muted-foreground)" fontSize="11" fontFamily="monospace">{g.toFixed(0)}%</text>
          </g>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={yFor(0)} y2={yFor(0)} stroke="var(--color-signal)" strokeOpacity="0.35" strokeDasharray="4 5"/>
        {series.map((s, idx) => {
          const path = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i, s.points.length).toFixed(1)},${yFor(p.pct).toFixed(1)}`).join(" ");
          const last = s.points[s.points.length - 1];
          const color = colors[idx % colors.length];
          return (
            <g key={s.ticker}>
              <path d={path} fill="none" stroke={color} strokeWidth={idx === 0 ? 2.8 : 1.8} strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx={xFor(s.points.length - 1, s.points.length)} cy={yFor(last.pct)} r={3.5} fill={color}/>
              <text x={xFor(s.points.length - 1, s.points.length) + 8} y={yFor(last.pct) + 4} fill={color} fontSize="11" fontFamily="monospace">{last.pct.toFixed(1)}%</text>
            </g>
          );
        })}
      </svg>
      <div className="-mt-7 flex flex-wrap gap-x-4 gap-y-1 px-3 text-[10px] font-mono text-muted-foreground">
        {series.map((s, i) => (
          <span key={s.ticker} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colors[i % colors.length] }}/>
            {s.name} · {s.ticker}
          </span>
        ))}
      </div>
    </div>
  );
}
