// Synthetic intelligence data for Arklight prototype.
// LABELLED as demo throughout the UI.

export type NodeKind =
  | "event" | "source" | "claim" | "signal" | "company"
  | "sector" | "commodity" | "instrument" | "region"
  | "regulation" | "procurement" | "risk" | "opportunity"
  | "contradiction" | "gap" | "positioning";

export interface GNode {
  id: string;
  kind: NodeKind;
  label: string;
  x: number; y: number;
  confidence: number; // 0..1
  weak?: boolean;
  pulse?: boolean;
}

export interface GEdge {
  from: string; to: string;
  kind: "supports" | "contradicts" | "derived" | "affects" | "exposes" | "amplifies" | "reported";
  weight: number;
}

// Positioned around a 1000x600 viewbox
export const NODES: GNode[] = [
  { id: "e1", kind: "event", label: "EU Battery Material Squeeze", x: 500, y: 300, confidence: 0.78, pulse: true },
  { id: "s1", kind: "source", label: "Reuters Filing Wire", x: 220, y: 140, confidence: 0.9 },
  { id: "s2", kind: "source", label: "EU Commission Notice", x: 780, y: 140, confidence: 0.95 },
  { id: "s3", kind: "source", label: "Trade Press Aggregator", x: 140, y: 320, confidence: 0.55, weak: true },
  { id: "c1", kind: "claim", label: "Lithium imports down 14%", x: 340, y: 200, confidence: 0.82 },
  { id: "c2", kind: "claim", label: "Nickel delivery delays", x: 660, y: 200, confidence: 0.7 },
  { id: "c3", kind: "claim", label: "Battery plant deferred (unconfirmed)", x: 300, y: 440, confidence: 0.35, weak: true },
  { id: "co1", kind: "company", label: "NordVolt Materials", x: 720, y: 420, confidence: 0.66 },
  { id: "co2", kind: "company", label: "Hellenic Recycle Co", x: 620, y: 500, confidence: 0.58 },
  { id: "co3", kind: "company", label: "AutoMakerX (exposed)", x: 380, y: 500, confidence: 0.7 },
  { id: "sec1", kind: "sector", label: "EV Manufacturing", x: 460, y: 480, confidence: 0.8 },
  { id: "cm1", kind: "commodity", label: "Lithium Carbonate", x: 240, y: 260, confidence: 0.85 },
  { id: "cm2", kind: "commodity", label: "Nickel Sulphate", x: 760, y: 260, confidence: 0.8 },
  { id: "rg1", kind: "region", label: "EU-27", x: 500, y: 100, confidence: 0.9 },
  { id: "reg1", kind: "regulation", label: "EU Critical Raw Materials Act", x: 860, y: 340, confidence: 0.92 },
  { id: "p1", kind: "procurement", label: "Public tender: recycling capacity", x: 860, y: 460, confidence: 0.7 },
  { id: "r1", kind: "risk", label: "Supply chain disruption", x: 160, y: 460, confidence: 0.74 },
  { id: "o1", kind: "opportunity", label: "Recycling capacity demand", x: 900, y: 240, confidence: 0.72 },
  { id: "cx1", kind: "contradiction", label: "OEM denies delay reports", x: 460, y: 360, confidence: 0.5 },
  { id: "g1", kind: "gap", label: "No data: Q4 stockpile levels", x: 540, y: 200, confidence: 0.25, weak: true },
  { id: "pos1", kind: "positioning", label: "Supplier positioning angle", x: 780, y: 520, confidence: 0.6 },
];

export const EDGES: GEdge[] = [
  { from: "s1", to: "c1", kind: "reported", weight: 0.9 },
  { from: "s2", to: "c2", kind: "reported", weight: 0.95 },
  { from: "s3", to: "c3", kind: "reported", weight: 0.4 },
  { from: "c1", to: "e1", kind: "supports", weight: 0.8 },
  { from: "c2", to: "e1", kind: "supports", weight: 0.75 },
  { from: "c3", to: "e1", kind: "supports", weight: 0.3 },
  { from: "cx1", to: "c3", kind: "contradicts", weight: 0.6 },
  { from: "cm1", to: "e1", kind: "affects", weight: 0.7 },
  { from: "cm2", to: "e1", kind: "affects", weight: 0.7 },
  { from: "e1", to: "sec1", kind: "exposes", weight: 0.8 },
  { from: "e1", to: "co3", kind: "exposes", weight: 0.7 },
  { from: "e1", to: "co1", kind: "amplifies", weight: 0.6 },
  { from: "e1", to: "co2", kind: "amplifies", weight: 0.55 },
  { from: "reg1", to: "o1", kind: "amplifies", weight: 0.7 },
  { from: "p1", to: "o1", kind: "supports", weight: 0.65 },
  { from: "o1", to: "pos1", kind: "derived", weight: 0.6 },
  { from: "rg1", to: "e1", kind: "affects", weight: 0.5 },
  { from: "e1", to: "r1", kind: "derived", weight: 0.7 },
];

export const KIND_COLOR: Record<NodeKind, string> = {
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

export const OPPORTUNITIES = [
  { id: "op1", title: "Public sector cyber procurement expansion", sector: "Cybersecurity · UK/EU", score: 82, type: "Procurement growth", signal: "Tender volume +34% QoQ", confidence: "High", tag: "High Potential", spark: [3,4,5,6,7,7,9,10,12,14] },
  { id: "op2", title: "Grid-scale battery demand acceleration", sector: "Energy · Germany", score: 76, type: "Demand growth", signal: "Utility RFP surge", confidence: "High", tag: "High Potential", spark: [2,3,3,5,6,6,8,9,10,11] },
  { id: "op3", title: "Talent window: senior ML engineers", sector: "Technology · US", score: 61, type: "Talent shift", signal: "Layoff cohort re-entering", confidence: "Medium", tag: "Moderate", spark: [8,7,7,6,6,7,8,9,10,10] },
  { id: "op4", title: "Retail compliance advisory demand", sector: "Retail · EU", score: 58, type: "Regulatory pressure", signal: "New disclosure regime", confidence: "Medium", tag: "Moderate", spark: [4,5,5,6,6,7,7,7,8,8] },
  { id: "op5", title: "SaaS support competitor weakness", sector: "SaaS · Global", score: 71, type: "Competitor gap", signal: "Churn signals rising", confidence: "Medium", tag: "High Potential", spark: [6,6,7,7,8,9,10,10,11,12] },
  { id: "op6", title: "Copper demand spike, grid buildout", sector: "Commodities · LatAm", score: 79, type: "Commodity demand", signal: "Inventories 5y low", confidence: "High", tag: "High Potential", spark: [5,6,7,8,9,10,10,11,12,13] },
];

export const RISKS = [
  { id: "r1", title: "EU lithium supply chain disruption", desc: "Import volumes down 14%; recycling capacity insufficient near-term.", severity: "High", score: 82, impact: "Sector-wide", prob: "68%", region: "EU · EV mfg", updated: "3m ago" },
  { id: "r2", title: "Cyber regulation shift (NIS2 fines)", desc: "Enforcement window opening; mid-market underprepared.", severity: "Elevated", score: 71, impact: "Firm-level", prob: "74%", region: "EU · SMB", updated: "12m ago" },
  { id: "r3", title: "US regional bank deposit outflows", desc: "Concentrated CRE exposure meets refi wall.", severity: "Elevated", score: 68, impact: "Sector", prob: "51%", region: "US · Banking", updated: "22m ago" },
  { id: "r4", title: "Retailer margin compression", desc: "Energy costs + weak consumer demand converge.", severity: "Moderate", score: 55, impact: "Firm-level", prob: "62%", region: "UK · Retail", updated: "1h ago" },
  { id: "r5", title: "Source confidence collapse: crypto press", desc: "Copy loop detected across 42 outlets; 1 origin.", severity: "Advisory", score: 40, impact: "Signal quality", prob: "—", region: "Global", updated: "8m ago" },
];

export const SCAN_BARS = [
  { label: "Markets", value: 92 },
  { label: "Companies", value: 78 },
  { label: "News & media", value: 85 },
  { label: "Social signals", value: 61 },
  { label: "Supply chain", value: 54 },
  { label: "Regulatory", value: 88 },
  { label: "Procurement", value: 72 },
  { label: "Commodities", value: 80 },
];

export const TRENDS = [
  { label: "Clean energy investment", delta: +14, dir: "up" as const },
  { label: "AI automation", delta: +22, dir: "up" as const },
  { label: "Cybersecurity", delta: +9, dir: "up" as const },
  { label: "Public procurement", delta: +7, dir: "up" as const },
  { label: "Talent movement", delta: +4, dir: "up" as const },
  { label: "Inflation pressure", delta: -3, dir: "down" as const },
  { label: "Commodity prices", delta: -5, dir: "down" as const },
  { label: "Regulatory pressure", delta: +11, dir: "up" as const },
];

export const PULSE = [
  "UTC 14:22:07",
  "Global pulse · 0.71",
  "Market provider not configured",
  "Commodity provider not configured",
  "Signal ↑ EU lithium supply (+0.14)",
  "Signal ↑ US cyber procurement (+0.09)",
  "Signal ↓ Retail consumer demand (−0.06)",
  "Sources online 214 / 231",
  "System confidence 0.83",
  "Copy-loop detected: crypto press cluster",
];
