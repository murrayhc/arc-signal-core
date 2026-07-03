# Archlight Phase 3c — 3D Graph UI & Manual Interrogation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Render the evidence graph as an interactive force graph (3D + 2D fallback + paused mode) with filters and a node-detail panel, and add manual interrogation search as an entry point into the graph — plus a dashboard restructure that features both without removing existing sections.

**Architecture:** Extend `graph.ts` service with render-shaped data + filters; new `src/server/interrogate/` (pure query classifier + interrogation service); 2 APIs. Client `ForceGraph.tsx` via `next/dynamic({ssr:false})` wrapping bundled `react-force-graph`. `/graph` becomes interactive; `/interrogate` results page; `/` featured search + graph entry. Deterministic — no LLM/provider/network.

**Tech Stack:** unchanged + `react-force-graph` (bundled, Three.js). Baseline: 120 tests, HEAD 17c6822.

**Spec:** `docs/superpowers/specs/2026-07-03-phase-3c-graph-ui-interrogation-design.md`.

## Global Constraints
- Working dir: `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight`.
- Bundled lib only (no CDN); graph component client-only via `next/dynamic({ssr:false})`; 2D fallback + paused/reduced-motion required; not colour-alone (labels/shapes).
- Search returns connected graph data, NOT a registry form; never re-centre on manual company lookup; never fabricate matches.
- Market (ticker/commodity/instrument) → honest "provider not configured" notice + non-advisory disclaimer (real data is 3e).
- Additive: every existing route/section keeps working; no *Json leaks; en-GB; string enums; files < 500 lines.
- Full suite green + typecheck + build clean before each commit; messages as given.

---

### Task 1: Render data, query classifier, interrogation service + APIs

**Files:** Modify `src/server/services/graph.ts`, `src/shared/enums.ts`; Create `src/server/interrogate/classify.ts`, `src/server/interrogate/service.ts`, `src/app/api/graph/render/route.ts`, `src/app/api/interrogate/route.ts`; Test: `tests/interrogate/classify.test.ts`, `tests/api/interrogate-api.test.ts`.

**Interfaces:**
- `QUERY_TYPES` enum in enums.ts: `['COMPANY','COMMODITY','INSTRUMENT','TICKER','SHARE_PRICE','SECTOR','REGION','THEME','REGULATION','PROCUREMENT','UNKNOWN']` + type.
- `classifyQuery(q: string, opts?: { knownSectors?: string[]; knownRegions?: string[]; knownCompanies?: string[] }): QueryType` (pure). Rules (first match wins): empty → UNKNOWN; /^[A-Z]{1,5}$/ → TICKER; contains £/$ or /\b(share price|stock price)\b/i → SHARE_PRICE; /\bprice\b/i with an instrument word → INSTRUMENT; known commodity word (lithium, oil, gas, copper, wheat, gold, steel, cobalt, nickel, solar) → COMMODITY; matches a knownRegion (ci) → REGION; matches a knownSector (ci) → SECTOR; /\b(regulation|regulatory|compliance)\b/i → REGULATION; /\b(tender|procurement|framework agreement)\b/i → PROCUREMENT; matches a knownCompany (ci contains) → COMPANY; else THEME.
- `getGraphForRender(filters?): Promise<{ nodes: RenderNode[]; edges: RenderEdge[]; stats: {nodeCount;edgeCount;byType} }>` where `RenderNode = GraphNodeData & { group: string; val: number }` (val = 1 + impactScore*4), edges only between included nodes. `filters` optional: `nodeTypes?: string[]; sector?: string; region?: string; minConfidence?: number; riskOnly?: boolean; opportunityOnly?: boolean; sinceDays?: number` — applied over the 400-cap set. No raw *Json.
- `getNodeDetail(id): Promise<{ node: GraphNodeData; edges: {edge; otherNode}[] } | null>` — node + incident edges + the other endpoint per edge (1-degree).
- `interrogate(q, opts?): Promise<InterrogationResult>` in interrogate/service.ts:
  `type InterrogationResult = { query: string; queryType: QueryType; matchedNodeCount: number; events: {id;title;eventClass;confidence;sector;region}[]; opportunities: {id;title;opportunityType;commercialValueScore}[]; contradictions: {aTitle;bTitle}[]; sources: {id;name}[]; positioning: {id;title;userType}[]; subgraph: {nodes: RenderNode[]; edges: RenderEdge[]}; marketContextAvailable: boolean; disclaimer: string | null }`.
  Logic: classify (load known sectors/regions/company names from DB for the classifier); find graph nodes matching the query (title contains ci, or refId for sector/region lowercased); collect their neighbourhoods; from EVENT nodes in the match/neighbourhood collect connected events + their OpportunityCards + RiskOpportunity + positioning + contradictions (CONTRADICTS edges) + SOURCE nodes; build a subgraph from the matched nodes + 1-degree. For TICKER/SHARE_PRICE/INSTRUMENT/COMMODITY: `marketContextAvailable=false`, `disclaimer` = the non-advisory market disclaimer string; still return any graph matches. Empty matches → empty arrays, honest.
- Routes: `GET /api/graph/render` reads query params into filters, returns getGraphForRender. `GET /api/interrogate?q=` Zod-validates q (non-empty string), returns interrogate(q). Both `Response.json`, no next/server, serialized.

- [ ] **Step 1: Failing tests.**
  `tests/interrogate/classify.test.ts` (pure): TICKER for 'BP'/'AAPL'; SHARE_PRICE for 'BP share price'; COMMODITY for 'lithium supply'; SECTOR for 'technology' (knownSectors ['technology']); REGION for 'UK' (knownRegions ['UK']); REGULATION for 'AI regulation'; PROCUREMENT for 'defence procurement'; COMPANY for 'Meridian Grid' (knownCompanies ['Meridian Grid Systems']); THEME for 'fintech layoffs'; UNKNOWN for ''.
  `tests/api/interrogate-api.test.ts` (post-scan + graph rebuild): `GET /api/interrogate?q=technology` returns queryType SECTOR (or THEME) with events.length>0 and a subgraph with nodes; `q=BP` returns queryType TICKER with marketContextAvailable=false and a non-null disclaimer; `GET /api/graph/render?nodeTypes=EVENT` returns only EVENT-group nodes. Missing q → 400.
  Run → RED.
- [ ] **Step 2: Implement** enums, classify.ts (pure, exact rules), the graph service additions, interrogate service, and the 2 routes. `getGraphForRender` reuses the existing capped node/edge load then filters. For interrogate, load `distinct` sector/region strings and Entity names for the classifier.
- [ ] **Step 3: Verify + commit** — `npm test` (~130), typecheck clean.
```bash
git add -A && git commit -m "feat(3c): graph render filters + query classifier + interrogation service + APIs"
```

---

### Task 2: Force-graph component + interactive /graph page

**Files:** Modify `package.json` (add `react-force-graph`), Create `src/components/ForceGraph.tsx`, `src/components/GraphExplorer.tsx`; Replace `src/app/graph/page.tsx`; Test: none new (build + structural verification — WebGL not unit-testable).

**Interfaces:**
- `ForceGraph.tsx` (`'use client'`): props `{ nodes: RenderNode[]; edges: RenderEdge[]; mode: '3d'|'2d'; paused: boolean; onSelect: (nodeId: string)=>void }`. Internally `next/dynamic(() => import('react-force-graph-3d'), { ssr:false })` and `...-2d`; maps edges to `{source,target}` links; node label = title; node styling by `group` (nodeType) — sphere/dot sized by `val`, distinct shape/marker for CONTRADICTION/DATA_GAP; stops the engine when `paused` (e.g. `cooldownTicks={0}` or `d3VelocityDecay=1`). Guard for empty/SSR.
- `GraphExplorer.tsx` (`'use client'`): the interactive shell — holds selected node + filters + mode/paused state; renders left filter panel (nodeType checkboxes, sector/region text, minConfidence slider, risk/opp toggles), centre `<ForceGraph>`, right detail panel (fetch `/api/graph/node/[id]` on select → title, type, scores, incident edges, and for EVENT a link to `/events/[id]`), bottom strip (latest events/opportunities/contradictions passed as props), and an accessible node-list `<details>` fallback. Re-fetches `/api/graph/render` when filters change.
- `/graph/page.tsx` (server, `dynamic='force-dynamic'`): fetch initial `getGraphForRender()` + the bottom-strip data via existing services; render the search box (links to `/interrogate?q=`) + `<GraphExplorer initial…/>`; keep the "Interactive — drag to explore; toggle 2D or pause for reduced motion" helper text.

- [ ] **Step 1: Install** — `npm install react-force-graph` (bundled; no CDN). Confirm it resolves.
- [ ] **Step 2: Implement** ForceGraph + GraphExplorer + the page, per interfaces, following existing dark-Tailwind patterns. Use `next/dynamic({ssr:false})` for the force-graph imports (WebGL is client-only) — the component must not break SSR/build.
- [ ] **Step 3: Verify** — `npm test` (unchanged, all pass), `npm run typecheck` clean, `npm run build` CLEAN (this is the key gate — the dynamic import must not break the build). Manual: dev server → `/graph` returns 200, renders the filter panel + canvas container + node-list fallback (curl-grep for the fallback list + a filter control); check dev console has no errors via the server log. Record what was verified (structure + no build/console errors; 3D pixels not asserted — honest).
- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "feat(3c): interactive force-graph component (3D/2D/paused) + /graph explorer page"
```

---

### Task 3: Interrogation UI + dashboard restructure + docs

**Files:** Create `src/app/interrogate/page.tsx`, `src/components/InterrogationResults.tsx`, `src/components/SearchBar.tsx`; Modify `src/app/page.tsx`; Create `docs/graph-ui-and-interrogation.md`; Test: none new (build + structural).

**Interfaces:**
- `SearchBar.tsx` (`'use client'`): a form → navigates to `/interrogate?q=<encoded>` on submit. Placeholder "Interrogate a company, sector, commodity, ticker or theme…".
- `/interrogate/page.tsx` (server, `dynamic='force-dynamic'`): reads `searchParams.q`; if empty → prompt state; else `interrogate(q)` and render `<InterrogationResults>`; a `<SearchBar>` at top.
- `InterrogationResults.tsx` (server component ok): shows resolved queryType chip + matchedNodeCount; a mini `<GraphExplorer>`/`<ForceGraph>` of the subgraph (small, paused by default); readable panels — Events (link `/events/[id]`), Opportunities (link `/opportunities/[id]`), Contradictions, Sources, Positioning; and when `marketContextAvailable===false` a notice card: "Live market data is not configured. This view shows public-signal context only." + the `disclaimer`. Honest empty states.
- `/page.tsx`: ADD near the top (above Live Risk Radar), a section with `<SearchBar>` + an "Open the living graph →" link to `/graph` showing live node/edge counts (from `getLiveGraph().graphStats`). Keep ALL existing sections below unchanged.

- [ ] **Step 1: Implement** the search bar, interrogate page, results component, and the dashboard additions. Reuse `ForceGraph`/`GraphExplorer` for the mini subgraph (paused). Follow existing UI patterns; no external assets.
- [ ] **Step 2: Docs** — `docs/graph-ui-and-interrogation.md`: the render/interrogate APIs, the classifier rules, the 3D/2D/paused behaviours, the node-styling legend, the market-not-configured behaviour, accessibility (node-list fallback, not-colour-alone), and what's deferred (LLM summaries 3d, live market data 3e, replay 3f).
- [ ] **Step 3: Verify** — `npm test` all pass, typecheck clean, `npm run build` clean (routes `/interrogate` listed). Manual: dev server → `/` shows the search bar + graph entry with counts + all prior sections; `/interrogate?q=technology` renders events/opportunities panels; `/interrogate?q=BP` shows the market-not-configured notice + disclaimer. Record verification.
- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "feat(3c): manual interrogation UI + dashboard search/graph restructure + docs"
```

---

## Plan Self-Review Notes
- Spec §3 data ↔ T1; §4 3D/`/graph` ↔ T2; §4 interrogation + dashboard + §7 docs ↔ T3.
- Type consistency: `RenderNode`/`RenderEdge` (T1 service → T2/T3 components); `InterrogationResult` (T1 → T3 UI); `QueryType` (T1 enum → classifier/service).
- Verification honesty (spec §5): 3D canvas verified to mount + build clean + data APIs unit-tested; 3D pixels not asserted. Stated in T2/T3 reports + docs.
- Additive guarantee: every prior route/section preserved (T3 dashboard only ADDS). Deferred (not gaps): LLM summaries (3d), live market data (3e — empty state ships), replay (3f).
