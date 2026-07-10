import { useMemo, useState } from "react";

type NodeKind = "event"|"source"|"claim"|"signal"|"company"|"sector"|"commodity"|"instrument"|"region"|"regulation"|"procurement"|"risk"|"opportunity"|"contradiction"|"gap"|"positioning";

export interface GNode {
  id: string;
  node_type: NodeKind;
  title: string;
  summary: string | null;
  confidence: number;
  risk_score: number;
  opportunity_score: number;
}
export interface GEdge {
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  label: string | null;
  weight: number;
  confidence: number;
}

const KIND_RADIUS: Record<string, number> = {
  event: 9, company: 7, claim: 6, source: 5, sector: 8,
  commodity: 7, region: 6, regulation: 7, procurement: 6,
  risk: 7, opportunity: 7, contradiction: 7, gap: 6,
  positioning: 7, signal: 6, instrument: 6,
};

const KIND_COLOR: Record<NodeKind, string> = {
  event: "var(--color-signal)",
  source: "var(--color-muted-foreground)",
  claim: "var(--color-signal-glow)",
  signal: "var(--color-signal)",
  company: "var(--color-foreground)",
  sector: "var(--color-growth)",
  commodity: "var(--color-opportunity)",
  instrument: "var(--color-opportunity)",
  region: "var(--color-muted-foreground)",
  regulation: "var(--color-reason)",
  procurement: "var(--color-opportunity-alt)",
  risk: "var(--color-risk)",
  opportunity: "var(--color-opportunity)",
  contradiction: "var(--color-risk-strong)",
  gap: "var(--color-weak)",
  positioning: "var(--color-reason)",
};

const CENTER_KINDS: NodeKind[] = ["event"];
const RING1_KINDS: NodeKind[] = ["claim","signal","opportunity","risk","contradiction","positioning","gap"];
// ring2 catches everything else (company, sector, commodity, instrument, regulation, procurement, source, region)

type RingKey = "center" | "r1" | "r2";
const RING_CAPS: Record<RingKey, number> = { center: 8, r1: 10, r2: 12 };
const RING_LABEL: Record<RingKey, string> = { center: "events", r1: "signals", r2: "entities" };

function ringOf(t: NodeKind): RingKey {
  if (CENTER_KINDS.includes(t)) return "center";
  if (RING1_KINDS.includes(t)) return "r1";
  return "r2";
}
function importanceOf(n: GNode): number {
  return Math.max(Number(n.risk_score) || 0, Number(n.opportunity_score) || 0, (Number(n.confidence) || 0) * 0.5);
}

// Deterministic layout: cluster by ring into concentric rings.
function layoutNodes(nodes: GNode[]): Map<string, { x: number; y: number }> {
  const cx = 500, cy = 300;
  const buckets: Record<RingKey, GNode[]> = { center: [], r1: [], r2: [] };
  for (const n of nodes) buckets[ringOf(n.node_type)].push(n);
  const pos = new Map<string, { x: number; y: number }>();
  buckets.center.forEach((n, i, arr) => {
    const a = (i / Math.max(1, arr.length)) * Math.PI * 2 - Math.PI / 2;
    const r = arr.length === 1 ? 0 : 60;
    pos.set(n.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  });
  buckets.r1.forEach((n, i, arr) => {
    const a = (i / arr.length) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: cx + Math.cos(a) * 170, y: cy + Math.sin(a) * 150 });
  });
  buckets.r2.forEach((n, i, arr) => {
    const a = (i / arr.length) * Math.PI * 2;
    pos.set(n.id, { x: cx + Math.cos(a) * 340, y: cy + Math.sin(a) * 230 });
  });
  return pos;
}

type GraphFilter = "all" | "opportunities" | "risks" | "hybrid";

export function IntelligenceBrain({
  nodes, edges, confidence,
  selectedNodeId, onSelectNode,
}: {
  nodes: GNode[]; edges: GEdge[]; confidence: number;
  selectedNodeId?: string | null;
  onSelectNode?: (n: GNode | null) => void;
}) {
  const [filter, setFilter] = useState<GraphFilter>("all");
  const [expandedRings, setExpandedRings] = useState<Set<RingKey>>(new Set());

  // Classify nodes so filters match what the dashboard side panels count.
  // Events don't have a "risk"/"opportunity" node_type — they're tinted by score.
  // Include those tinted events (and the standalone opportunity/risk/contradiction nodes)
  // so "Risks" / "Opportunities" show the same items the KPI cards do.
  const classify = (n: GNode): { isOpp: boolean; isRisk: boolean } => {
    const rk = Number(n.risk_score) || 0;
    const op = Number(n.opportunity_score) || 0;
    if (n.node_type === "opportunity") return { isOpp: true, isRisk: false };
    if (n.node_type === "risk" || n.node_type === "contradiction") return { isOpp: false, isRisk: true };
    if (n.node_type === "event") {
      return { isOpp: op >= 0.4 && op >= rk, isRisk: rk >= 0.4 && rk > op };
    }
    return { isOpp: false, isRisk: false };
  };

  // Base adjacency across the WHOLE graph — used to grow each filter with the
  // connected context that actually explains why an opportunity/risk exists.
  const baseAdj = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.source_node_id)) m.set(e.source_node_id, new Set());
      if (!m.has(e.target_node_id)) m.set(e.target_node_id, new Set());
      m.get(e.source_node_id)!.add(e.target_node_id);
      m.get(e.target_node_id)!.add(e.source_node_id);
    }
    return m;
  }, [edges]);

  // Stage 1: apply filter over the full graph.
  const { nodes: filteredNodes, edges: filteredEdges } = useMemo(() => {
    if (filter === "all") return { nodes, edges };
    const classes = new Map(nodes.map(n => [n.id, classify(n)] as const));
    const growFromSeeds = (seeds: Set<string>) => {
      const keep = new Set(seeds);
      // Pull in every direct neighbor (the connected context) so filtered views
      // still show the events/claims/companies driving each risk or opportunity.
      seeds.forEach(id => (baseAdj.get(id) ?? new Set()).forEach(n => keep.add(n)));
      return keep;
    };
    if (filter === "opportunities") {
      const seeds = new Set(nodes.filter(n => classes.get(n.id)!.isOpp).map(n => n.id));
      const keep = growFromSeeds(seeds);
      return {
        nodes: nodes.filter(n => keep.has(n.id)),
        edges: edges.filter(e => keep.has(e.source_node_id) && keep.has(e.target_node_id)),
      };
    }
    if (filter === "risks") {
      const seeds = new Set(nodes.filter(n => classes.get(n.id)!.isRisk).map(n => n.id));
      const keep = growFromSeeds(seeds);
      return {
        nodes: nodes.filter(n => keep.has(n.id)),
        edges: edges.filter(e => keep.has(e.source_node_id) && keep.has(e.target_node_id)),
      };
    }
    // Hybrid: edges bridging any risk-family node to any opportunity-family
    // node, plus the direct neighbors of both endpoints for context.
    const bridgeSeeds = new Set<string>();
    for (const e of edges) {
      const a = classes.get(e.source_node_id);
      const b = classes.get(e.target_node_id);
      if (!a || !b) continue;
      if ((a.isRisk && b.isOpp) || (a.isOpp && b.isRisk)) {
        bridgeSeeds.add(e.source_node_id); bridgeSeeds.add(e.target_node_id);
      }
    }
    const keep = growFromSeeds(bridgeSeeds);
    return {
      nodes: nodes.filter(n => keep.has(n.id)),
      edges: edges.filter(e => keep.has(e.source_node_id) && keep.has(e.target_node_id)),
    };
  }, [filter, nodes, edges, baseAdj]);



  // Full-graph adjacency (needed so expanding a neighborhood pulls in nodes even if they were culled).
  const fullAdjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of filteredEdges) {
      if (!m.has(e.source_node_id)) m.set(e.source_node_id, new Set());
      if (!m.has(e.target_node_id)) m.set(e.target_node_id, new Set());
      m.get(e.source_node_id)!.add(e.target_node_id);
      m.get(e.target_node_id)!.add(e.source_node_id);
    }
    return m;
  }, [filteredEdges]);

  // Stage 2: focus+context culling — top-N per ring, plus neighborhood of focused node.
  const focusIdRaw = selectedNodeId ?? null;

  const { viewNodes, viewEdges, ringHidden } = useMemo(() => {
    const buckets: Record<RingKey, GNode[]> = { center: [], r1: [], r2: [] };
    for (const n of filteredNodes) buckets[ringOf(n.node_type)].push(n);
    for (const k of Object.keys(buckets) as RingKey[]) {
      buckets[k].sort((a, b) => importanceOf(b) - importanceOf(a));
    }
    const keep = new Set<string>();
    for (const k of Object.keys(buckets) as RingKey[]) {
      const list = buckets[k];
      const cap = expandedRings.has(k) ? list.length : RING_CAPS[k];
      list.slice(0, cap).forEach(n => keep.add(n.id));
    }
    // Always pull in the focused node and its neighbors, so selecting anything reveals its web.
    if (focusIdRaw) {
      keep.add(focusIdRaw);
      (fullAdjacency.get(focusIdRaw) ?? new Set()).forEach(id => keep.add(id));
    }
    const vN = filteredNodes.filter(n => keep.has(n.id));
    const vE = filteredEdges.filter(e => keep.has(e.source_node_id) && keep.has(e.target_node_id));
    const hidden: Record<RingKey, number> = {
      center: Math.max(0, buckets.center.length - buckets.center.filter(n => keep.has(n.id)).length),
      r1: Math.max(0, buckets.r1.length - buckets.r1.filter(n => keep.has(n.id)).length),
      r2: Math.max(0, buckets.r2.length - buckets.r2.filter(n => keep.has(n.id)).length),
    };
    return { viewNodes: vN, viewEdges: vE, ringHidden: hidden };
  }, [filteredNodes, filteredEdges, expandedRings, focusIdRaw, fullAdjacency]);

  const positions = useMemo(() => layoutNodes(viewNodes), [viewNodes]);
  const nodeById = useMemo(() => new Map(viewNodes.map((n) => [n.id, n])), [viewNodes]);

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of viewEdges) {
      if (!m.has(e.source_node_id)) m.set(e.source_node_id, new Set());
      if (!m.has(e.target_node_id)) m.set(e.target_node_id, new Set());
      m.get(e.source_node_id)!.add(e.target_node_id);
      m.get(e.target_node_id)!.add(e.source_node_id);
    }
    return m;
  }, [viewEdges]);

  const focusId = focusIdRaw && nodeById.has(focusIdRaw) ? focusIdRaw : null;
  const neighborSet = useMemo<Set<string> | null>(() => {
    if (!focusId) return null;
    return adjacency.get(focusId) ?? new Set<string>();
  }, [focusId, adjacency]);
  const highlightSet = useMemo(() => {
    if (!focusId) return null;
    const s = new Set<string>([focusId]);
    (neighborSet ?? new Set()).forEach((id) => s.add(id));
    return s;
  }, [focusId, neighborSet]);

  const selected = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;
  const detail = selected;


  const FILTERS: { id: GraphFilter; label: string }[] = [
    { id: "all", label: "Show all" },
    { id: "opportunities", label: "Opportunities" },
    { id: "risks", label: "Risks" },
    { id: "hybrid", label: "Hybrid" },
  ];

  const toggleRing = (k: RingKey) => {
    setExpandedRings(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  // Chip placement per ring (anchored at a stable angle so it doesn't jump).
  const CHIP_POS: Record<RingKey, { x: number; y: number }> = {
    center: { x: 500, y: 388 },   // just below the event cluster
    r1: { x: 500 + Math.cos(Math.PI / 2) * 170, y: 300 + Math.sin(Math.PI / 2) * 150 + 24 },
    r2: { x: 500 + Math.cos(Math.PI / 2) * 340, y: 300 + Math.sin(Math.PI / 2) * 230 + 24 },
  };

  const anyExpanded = expandedRings.size > 0;

  return (
    <div className="glass-panel rounded-xl overflow-hidden relative h-[560px] flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-background/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: "var(--color-signal)" }}/>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-signal)" }}/>
          </span>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Central surface</div>
            <div className="font-display text-base text-glow-signal truncate">Archlight Intelligence Brain</div>
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-4 text-[11px] font-mono shrink-0">
          <Metric label="Nodes" value={`${viewNodes.length}/${filteredNodes.length}`}/>
          <Metric label="Edges" value={`${viewEdges.length}/${filteredEdges.length}`}/>
          <Metric label="Conf" value={confidence.toFixed(2)} accent/>
          <Metric label="Scan" value="ACTIVE" pulse/>
        </div>
      </div>

      {/* Filter bar — dedicated row so it never overlaps the title */}
      <div className="flex items-center justify-center gap-1 px-3 py-2 border-b border-border/60 bg-background/30 shrink-0">
        <div className="flex items-center gap-1 rounded-md p-1 text-[10px] font-mono uppercase tracking-widest bg-background/40 border border-border/60">
          {FILTERS.map(f => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1 rounded transition ${active ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                style={active ? { boxShadow: "inset 0 0 0 1px var(--color-signal)" } : undefined}
              >
                {f.label}
              </button>
            );
          })}
          {anyExpanded && (
            <button
              onClick={() => setExpandedRings(new Set())}
              className="ml-1 px-2 py-1 rounded text-muted-foreground hover:text-foreground border-l border-border/60"
              title="Collapse expanded rings back to top-N"
            >
              Collapse
            </button>
          )}
        </div>
      </div>

      {detail && (
        <div className="absolute top-24 right-3 z-10 glass-panel rounded-md px-4 py-3 text-xs max-w-[280px]">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{detail.node_type}</div>
            {selected && (
              <button onClick={() => onSelectNode?.(null)} className="text-[10px] text-muted-foreground hover:text-foreground">clear ×</button>
            )}
          </div>
          <div className="font-display text-sm mt-0.5">{detail.title}</div>
          {detail.summary && <div className="text-[11px] text-muted-foreground mt-1 line-clamp-3">{detail.summary}</div>}
          <div className="mt-2 flex items-center gap-3 font-mono text-[11px]">
            <span>conf <span className="text-foreground">{Number(detail.confidence).toFixed(2)}</span></span>
            {Number(detail.risk_score) > 0.5 && <span style={{ color: "var(--color-risk)" }}>risk {Number(detail.risk_score).toFixed(2)}</span>}
            {Number(detail.opportunity_score) > 0.5 && <span style={{ color: "var(--color-opportunity)" }}>opp {Number(detail.opportunity_score).toFixed(2)}</span>}
          </div>
          <div className="mt-2 text-[10px] text-muted-foreground">Click a node to pin & highlight in side panels.</div>
        </div>
      )}

      {/* Graph fills the remaining vertical space */}
      <div className="flex-1 min-h-0 relative">
        <svg viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" className="w-full h-full grid-bg">

        <defs>
          <radialGradient id="halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="oklch(0.72 0.2 245)" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="oklch(0.72 0.2 245)" stopOpacity="0"/>
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle cx="500" cy="300" r="220" fill="url(#halo)"/>

        {viewEdges.map((e, i) => {
          const a = positions.get(e.source_node_id), b = positions.get(e.target_node_id);
          if (!a || !b) return null;
          const isContra = e.edge_type === "contradicts";
          const stroke = isContra ? "var(--color-risk-strong)" : Number(e.weight) > 0.7 ? "var(--color-signal)" : "oklch(0.5 0.05 250 / 0.5)";
          const touchesFocus = focusId != null && (e.source_node_id === focusId || e.target_node_id === focusId);
          const involved = !highlightSet || highlightSet.has(e.source_node_id) || highlightSet.has(e.target_node_id);
          const opacityMul = highlightSet ? (touchesFocus ? 1 : involved ? 0.6 : 0.08) : 1;
          return (
            <line key={i}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={touchesFocus ? "var(--color-signal)" : stroke}
                  strokeOpacity={(0.35 + Number(e.weight) * 0.55) * opacityMul}
                  strokeWidth={(touchesFocus ? 1.8 : 0.8) + Number(e.weight) * 1.6}
                  strokeDasharray={isContra ? "4 4" : "3 6"}
                  style={{ animation: "dash-flow 6s linear infinite" }}/>
          );
        })}

        {viewNodes.map(n => {
          const p = positions.get(n.id);
          if (!p) return null;
          const r = KIND_RADIUS[n.node_type] ?? 7;
          let color = KIND_COLOR[n.node_type];
          if (n.node_type === "event") {
            const rk = Number(n.risk_score);
            const op = Number(n.opportunity_score);
            if (rk >= op + 0.1) color = "var(--color-risk)";
            else if (op >= rk + 0.1) color = "var(--color-opportunity)";
          }
          const inFocus = !highlightSet || highlightSet.has(n.id);
          const isFocused = focusId === n.id;
          const isNeighbor = !isFocused && !!neighborSet && neighborSet.has(n.id);
          const dimBase = Number(n.confidence) < 0.4 ? 0.45 : 1;
          const dim = inFocus ? dimBase : 0.06;
          const pulse = n.node_type === "event" || n.node_type === "opportunity" || n.node_type === "risk";
          const ringStroke = isFocused
            ? "var(--color-signal)"
            : isNeighbor
              ? "var(--color-signal-glow)"
              : "oklch(0.1 0.02 260)";
          const ringWidth = isFocused ? 2.5 : isNeighbor ? 2 : 1.5;
          return (
            <g key={n.id}
               onClick={() => onSelectNode?.(selectedNodeId === n.id ? null : n)}
               className="cursor-pointer">

              {(isFocused || isNeighbor || (pulse && inFocus)) && (
                <circle cx={p.x} cy={p.y} r={r + (isFocused ? 5 : isNeighbor ? 4 : 3)}
                        fill={isFocused ? "var(--color-signal)" : isNeighbor ? "var(--color-signal-glow)" : color}
                        opacity={(isFocused ? 0.35 : isNeighbor ? 0.28 : 0.18)}
                        style={{ animation: "pulse-node 2.2s ease-in-out infinite", transformOrigin: `${p.x}px ${p.y}px` }}/>
              )}
              <circle cx={p.x} cy={p.y} r={r} fill={color} opacity={dim}
                      stroke={ringStroke} strokeWidth={ringWidth}
                      filter={isFocused || isNeighbor || (pulse && inFocus) ? "url(#glow)" : undefined}/>
              <text x={p.x} y={p.y + r + 12}
                    textAnchor="middle" className="font-mono"
                    fontSize="9.5"
                    fill={isNeighbor || isFocused ? "oklch(0.98 0.02 250)" : "oklch(0.85 0.02 250)"}
                    opacity={dim}>
                {n.title.length > 26 ? n.title.slice(0, 24) + "…" : n.title}
              </text>
            </g>
          );
        })}

        {/* Focus + context chips: reveal culled nodes per ring on demand */}
        {(Object.keys(ringHidden) as RingKey[]).map(k => {
          const hidden = ringHidden[k];
          const expanded = expandedRings.has(k);
          if (hidden === 0 && !expanded) return null;
          const pos = CHIP_POS[k];
          const label = expanded ? `− collapse ${RING_LABEL[k]}` : `+${hidden} more ${RING_LABEL[k]}`;
          const w = Math.max(96, label.length * 6.2);
          return (
            <g key={`chip-${k}`} onClick={() => toggleRing(k)} className="cursor-pointer">
              <rect x={pos.x - w / 2} y={pos.y - 10} width={w} height={20} rx={10}
                    fill="oklch(0.15 0.02 260 / 0.85)"
                    stroke="var(--color-signal)" strokeOpacity={0.6} strokeWidth={1}/>
              <text x={pos.x} y={pos.y + 3.5} textAnchor="middle"
                    className="font-mono" fontSize="10"
                    fill="oklch(0.95 0.02 250)">
                {label}
              </text>
            </g>
          );
        })}

        </svg>

        <div className="absolute top-2 right-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground pointer-events-none">
          <span className="inline-block px-2 py-0.5 rounded border border-border/60 bg-background/40">
            {focusId ? "highlighting connections" : anyExpanded ? "expanded view" : "top signals · click +N to expand"}
          </span>
        </div>
      </div>

      {/* Legend — 4 columns × 2 rows, centered along the bottom of the container */}
      <div className="shrink-0 border-t border-border/60 bg-background/40 px-6 py-2">
        <div className="grid grid-cols-4 gap-x-8 gap-y-1 text-[10px] font-mono uppercase tracking-wider max-w-3xl mx-auto">
          <LegendDot color="var(--color-signal)" label="Event / Signal"/>
          <LegendDot color="var(--color-opportunity)" label="Opportunity"/>
          <LegendDot color="var(--color-risk)" label="Risk"/>
          <LegendDot color="var(--color-reason)" label="Reasoning"/>
          <LegendDot color="var(--color-opportunity-alt)" label="Procurement"/>
          <LegendDot color="var(--color-risk-strong)" label="Contradiction"/>
          <LegendDot color="var(--color-weak)" label="Weak / stale"/>
          <LegendDot color="var(--color-growth)" label="Sector"/>
        </div>
      </div>
    </div>
  );
}


function Metric({ label, value, accent, pulse }: { label: string; value: string; accent?: boolean; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground uppercase tracking-widest text-[10px]">{label}</span>
      <span className={`${accent ? "text-glow-signal" : ""} ${pulse ? "animate-pulse" : ""}`}
            style={accent ? { color: "var(--color-signal)" } : undefined}>{value}</span>
    </div>
  );
}
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }}/>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
