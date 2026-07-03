# Archlight Phase 3c — 3D Graph UI & Manual Interrogation: Design

Date: 2026-07-03
Status: Approved direction (owner: proceed to completion). Implements upgrade
Stages 6 (interactive 3D graph), 7 (manual interrogation search), 13 (dashboard
restructure). Deterministic; no LLM/provider/network (LLM node summaries → 3d,
market data → 3e). Predecessors: spine+2a+3a+3b (120 tests, HEAD 17c6822).

## 1. Goal

Make the living evidence graph an interactive visual experience and let a user
interrogate any company/sector/region/theme as an entry point INTO that graph.
The graph API (`/api/graph/*`) and arcs from 3b are the data layer; 3c renders
them and adds search.

## 2. Constraints

- BUNDLED graph library only (npm, bundled by Next) — NOT a CDN. Use
  `react-force-graph` (3D via Three.js) with a **2D fallback** and a
  **paused / reduced-motion** mode (doc requirement). The graph component is a
  client component loaded via `next/dynamic({ ssr: false })` (WebGL is
  client-only).
- Do NOT rely on colour alone: node type shown via label + shape/icon + the
  detail panel (accessibility).
- Performance: reuse the 400-node server cap in `getLiveGraph`; server-side
  filtering; load node neighbourhoods on demand; never render thousands at once.
- Search is an ENTRY POINT INTO THE GRAPH, not a separate registry lookup — it
  returns connected events/opportunities/sources/contradictions, not a company
  form. Do not re-centre the product on manual company lookup.
- Instrument/ticker/commodity queries → a clean "market data provider not
  configured" empty state now (real data is Phase 3e).
- No advice framing; keep all existing dashboard/opportunity/event routes working
  (additive restructure — no second dashboard, no removed sections).

## 3. Data layer additions

### Graph render service (`src/server/services/graph.ts` — extend)
- `getGraphForRender(filters?): Promise<{ nodes: RenderNode[]; edges: RenderEdge[]; stats }>` where `RenderNode` extends `GraphNodeData` with a `group` (nodeType) and a numeric `val` (size = impactScore-driven) and a `color`-less design (client picks styling from nodeType + scores). `filters` (all optional): `nodeTypes[]`, `sector`, `region`, `minConfidence`, `riskOnly`, `opportunityOnly`, `sinceDays`. Applied server-side over the capped set.
- `getNodeDetail(id)`: node + its incident edges + 1-degree neighbours + (if EVENT) a link to its arc — for the right-hand detail panel.

### Interrogation (`src/server/interrogate/`)
- `classifyQuery(q: string): QueryType` (pure) — heuristic: all-caps 1–5 letters → TICKER; contains "£"/"$" or "price"/"share" → SHARE_PRICE/INSTRUMENT; known commodity words → COMMODITY; matches a known sector/region string → SECTOR/REGION; "regulation"/"compliance" → REGULATION; "tender"/"procurement" → PROCUREMENT; matches an Entity/Company name in DB → COMPANY; else THEME (fallback UNKNOWN if empty). QUERY_TYPES enum.
- `interrogate(q): Promise<InterrogationResult>` — resolve type; find matching graph nodes (by title/refId case-insensitive contains, sector/region exact); for each match gather its neighbourhood + connected EVENT nodes + their OpportunityCards + RiskOpportunity + contradictions + positioning + source evidence; for COMMODITY/INSTRUMENT/TICKER/SHARE_PRICE return `marketContext: { configured: false }` (Phase 3e) plus any graph matches; build a small interrogation subgraph (nodes+edges) for rendering. Return `{ queryType, matchedNodes, events, opportunities, sources, contradictions, positioning, subgraph, marketContextAvailable, disclaimer? }`. Never fabricate; empty matches → honest empty result.
- Persist nothing heavy; optionally create a root graph node for a resolved COMPANY/SECTOR/REGION only if a real Entity/sector/region exists (never invent).

### API
- `GET /api/graph/render?…filters` → `getGraphForRender`.
- `GET /api/interrogate?q=…` → `interrogate` (Zod-validate q). Serialized, no *Json leak.

## 4. UI

### `/graph` — interactive graph (upgrade the 3b stats page)
Layout (doc Stage 6): centre interactive force graph; left panel filters + a
"view: 3D / 2D / paused" toggle; right panel selected-node detail; bottom strip
latest events/opportunities/contradictions; top interrogation search box.
- Client component `ForceGraph.tsx` (`'use client'`), `next/dynamic(ssr:false)`
  wrapping `react-force-graph-3d` (and a 2D mode via `react-force-graph-2d`).
  Node `nodeThreeObject`/`nodeCanvasObject` shows a labelled sphere/dot sized by
  `val`, styled by nodeType + risk/opportunity/confidence, contradiction nodes
  marked distinctly. Click → sets selected node (right panel via
  `/api/graph/render` data already loaded, or `/api/graph/node/[id]`).
  Double-click an EVENT → open its arc (`/events/[id]`). Reduced-motion/paused
  stops the simulation. A 2D toggle renders the Canvas 2D fallback.
- The page fetches `/api/graph/render` (initial capped set), applies filter
  controls (re-fetch with query params), and keeps the stats + a readable node
  list as an accessible fallback beneath the canvas.

### Manual interrogation
- A search bar (on `/graph` and featured on `/`) → `/interrogate?q=…` page (or a
  results panel). Renders: resolved query type, a mini interrogation subgraph
  (same ForceGraph component, smaller), and readable panels — connected events,
  opportunities (link to `/opportunities/[id]`), risks, contradictions, sources,
  positioning examples, and — for instrument/ticker/commodity — the
  market-not-configured notice + the standard non-advisory disclaimer.

### `/` dashboard restructure (Stage 13, additive)
- Add the interrogation search box + a prominent "Open the living graph" entry
  (link to `/graph` with the live node/edge counts) near the top, ABOVE the
  radar sections. Keep Run scan, Risk Radar, Opportunity Radar, Opportunity
  Signals, Inbox, Source Coverage as supporting panels. Registry (source admin)
  stays a secondary link. No section removed.

## 5. Verification note (honest)

WebGL 3D pixels can't be reliably asserted in headless screenshots. Verification
for the graph component = build succeeds, page renders the container + controls +
the readable node-list fallback + node-detail panel wired to real data, no
console/build errors, and the render/interrogate APIs are unit-tested. The 2D
fallback and data wiring are the tested/verified path; the 3D canvas is verified
to mount without error. This will be stated plainly in the proof.

## 6. Out of scope (later)
LLM node/edge/arc summaries (3d); live market/instrument/commodity data (3e —
the empty state ships now); watch-markets/portfolio/replay (3f). Graph replay &
momentum history is 3f.

## 7. Success criteria
1. `/graph` renders an interactive force graph of real scan data with filters, a
   node-detail panel, a 2D toggle and a paused mode, plus an accessible node
   list; build clean, no console errors.
2. `classifyQuery` maps query types correctly (unit-tested); `interrogate`
   returns connected graph data for a sector/company/theme and an honest
   market-not-configured notice for a ticker (unit + API tested).
3. Dashboard features the search + graph entry without removing existing
   sections; all prior routes still work.
4. Full suite green; typecheck + build clean; docs written
   (`docs/graph-ui-and-interrogation.md`).
