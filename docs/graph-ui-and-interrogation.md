# Graph UI and Interrogation

Phase 3c. The interactive graph render (`/graph`) and the manual
interrogation flow (`/interrogate`) built on top of the living intelligence
graph (`docs/living-intelligence-graph.md`) and evidence arc engine
(`docs/evidence-arc-engine.md`).

Source: `src/server/interrogate/classify.ts`, `src/server/interrogate/service.ts`,
`src/server/services/graph.ts` (`getGraphForRender`), `src/components/ForceGraph.tsx`,
`src/components/GraphExplorer.tsx`, `src/components/SearchBar.tsx`,
`src/components/InterrogationResults.tsx`, `src/app/graph/page.tsx`,
`src/app/interrogate/page.tsx`, `src/app/page.tsx`.

## 1. Render API: `GET /api/graph/render`

Backed by `getGraphForRender(filters)` in `src/server/services/graph.ts`. Takes
the capped (400) `getLiveGraph()` node/edge set and applies optional query
filters over it:

| Filter | Query param | Behaviour |
|---|---|---|
| Node types | `nodeTypes` (comma-separated) | Keep only nodes whose `nodeType` is in the list. |
| Sector | `sector` | Keep all non-SECTOR nodes; a SECTOR node survives only if its `refId` or `title` matches (case-insensitive). |
| Region | `region` | Same pattern as sector, for REGION nodes. |
| Min confidence | `minConfidence` | Keep nodes with `confidence >= minConfidence`. |
| Risk only | `riskOnly=true` | Keep nodes where `riskScore > 0` and `riskScore >= opportunityScore`. |
| Opportunity only | `opportunityOnly=true` | Keep nodes where `opportunityScore > 0` and `opportunityScore >= riskScore`. |
| Since days | `sinceDays` | For EVENT nodes only, keep those whose backing `EventCandidate.lastUpdatedAt` is within the window; non-EVENT nodes are unaffected. |

Edges are kept only when both endpoints survive the node filter. The response
is `{ nodes: RenderNode[], edges: GraphEdgeData[], stats }`, where
`RenderNode = GraphNodeData & { group: string; val: number }` — `group` is the
node's `nodeType` (used for colour) and `val` is `1 + impactScore * 4` (used
for render size). `stats` describes the filtered set actually returned, not
the underlying table.

## 2. Interrogate API: `GET /api/interrogate?q=`

Backed by `interrogate(q)` in `src/server/interrogate/service.ts`. Given a raw
query string:

1. Loads known sectors/regions/company names from the DB (for the
   classifier — see §3).
2. Classifies the query into a `QueryType` (`classifyQuery`).
3. Finds `GraphNode`s whose `title` contains the query (case-insensitive), or
   — for SECTOR/REGION nodes — whose `refId` equals the lowercased query.
4. For every matched node, walks its 1-degree neighbourhood
   (`getNodeNeighbourhood`) and accumulates the union into a `subgraph`.
5. Resolves the EVENT nodes reached (directly matched or in a neighbourhood)
   back to `EventCandidate` rows, then gathers each event's opportunity
   cards, positioning examples, and any `CONTRADICTS` edges touching those
   events' graph nodes.
6. Collects any SOURCE nodes present in the accumulated subgraph.

Returns `InterrogationResult`:

```
{ query, queryType, matchedNodeCount,
  events[], opportunities[], contradictions[], sources[], positioning[],
  subgraph: { nodes, edges },
  marketContextAvailable, disclaimer }
```

Nothing is fabricated: an unmatched query returns `matchedNodeCount: 0` and
empty arrays throughout, not invented content.

## 3. Classifier rules (`classifyQuery`)

Pure, first-match-wins, in this order:

1. Empty (after trim) → `UNKNOWN`.
2. Case-insensitive exact match against a caller-supplied known region list →
   `REGION`.
3. Case-insensitive exact match against a caller-supplied known sector list →
   `SECTOR`.
   - Regions/sectors are checked *before* the ticker shape check below so a
     known name that happens to look like a ticker (e.g. `"UK"`) resolves to
     `REGION`/`SECTOR` rather than `TICKER`.
4. Matches `/^[A-Z]{1,5}$/` → `TICKER`.
5. Contains a currency symbol (`£`/`$`) or the phrase "share price"/"stock
   price" → `SHARE_PRICE`.
6. Contains the word "price" *and* an instrument word (bond, futures, option,
   options, etf, index, forward(s), swap) → `INSTRUMENT`.
7. Contains a known commodity word (lithium, oil, gas, copper, wheat, gold,
   steel, cobalt, nickel, solar) → `COMMODITY`.
8. Contains "regulation"/"regulatory"/"compliance" → `REGULATION`.
9. Contains "tender"/"procurement"/"framework agreement" → `PROCUREMENT`.
10. Case-insensitive substring match against a caller-supplied known company
    list → `COMPANY`.
11. Otherwise → `THEME`.

`interrogate()` supplies the known sectors/regions/companies from the DB
(`EventCandidate.affectedSector`/`affectedRegion` distincts, `Entity.name`),
so classification reflects what has actually been observed, not a static
hardcoded list.

`MARKET_QUERY_TYPES = [TICKER, SHARE_PRICE, INSTRUMENT, COMMODITY]` — any
query classified into one of these sets `marketContextAvailable: false` and a
non-null `disclaimer` string on the result (see §5).

## 4. 3D / 2D / paused render behaviours

`ForceGraph` (`src/components/ForceGraph.tsx`) wraps the STANDALONE
`react-force-graph-2d` / `react-force-graph-3d` packages (Three.js/WebGL /
Canvas), loaded client-only via `next/dynamic({ ssr: false })` and picked per the
`mode` prop. We deliberately do NOT use the umbrella `react-force-graph` package:
it also bundles the VR/AR variants, which reference a global `AFRAME` at module
load and crash the app. `ForceGraph` gates its own render behind a mount flag
(`useState`/`useEffect`) so the server and first client render emit the identical
placeholder — branching on `typeof window` instead would cause a hydration
mismatch (as it did for the `/interrogate` mini subgraph until this was fixed).

- **3D** (`mode="3d"`): `ForceGraph3D` — full orbit-controls 3D force layout.
- **2D** (`mode="2d"`): `ForceGraph2D` — flat canvas force layout. 2D also
  draws a distinct square-ring marker (`nodeCanvasObject`) around
  `CONTRADICTION`/`DATA_GAP` nodes, on top of their colour, so those nodes
  are identifiable by shape as well as colour (see §6).
- **Paused** (`paused` prop): lays the graph out up front, then holds it still —
  `warmupTicks: 80` (positions nodes before the first paint), `cooldownTicks: 0`
  and `d3VelocityDecay: 1` (no ongoing animation). `warmupTicks: 0` here would
  leave nodes un-positioned and crash the renderer, so the up-front warmup is
  required. Used for reduced motion on `/graph` (toggle button) and always
  applied for the `/interrogate` mini subgraph preview, which is 2D + paused
  by default (a small, static view rather than a full running simulation).
- On the server (SSR) or before the client bundle loads, `ForceGraph` renders
  a plain "Loading graph…" placeholder instead of attempting to touch
  browser-only WebGL/canvas globals.
- An empty node list renders "No nodes match the current filters." instead of
  an empty canvas.

`GraphExplorer` (`/graph`) additionally exposes the mode/pause toggle buttons,
a left filter panel (node types, sector, region, confidence, risk/opportunity
only) that re-fetches `/api/graph/render` on change, and a right-hand node
detail panel populated from `/api/graph/node/[id]` on click/select.

## 5. Node-styling legend

Colour is keyed by `group` (the node's `nodeType`) via `GROUP_COLORS` in
`ForceGraph.tsx`:

| Node type | Colour |
|---|---|
| EVENT | sky blue `#38bdf8` |
| SECTOR | violet `#a78bfa` |
| REGION | emerald `#34d399` |
| SIGNAL | yellow `#facc15` |
| CLAIM | orange `#fb923c` |
| DOCUMENT | slate `#94a3b8` |
| SOURCE | slate (darker) `#64748b` |
| OPPORTUNITY | green `#4ade80` |
| POSITIONING | cyan `#22d3ee` |
| DATA_GAP | red `#f87171` |
| CONTRADICTION | rose `#f43f5e` |
| (unknown/fallback) | slate `#94a3b8` |

Node size (`val`) is `1 + impactScore * 4`, so higher-impact nodes render
larger regardless of type/colour. `DATA_GAP` and `CONTRADICTION` nodes also
get the square-ring marker in 2D mode (see §4) — this is deliberate: colour
alone is not the only signal distinguishing them (see §7, accessibility).

## 6. Market-not-configured behaviour

When `classifyQuery` resolves a query to `TICKER`, `SHARE_PRICE`,
`INSTRUMENT`, or `COMMODITY`, `interrogate()` sets `marketContextAvailable:
false` and a fixed disclaimer string explaining that Archlight does not
provide live market data or pricing, that this is not investment advice, and
that live market context is planned for a later phase (3e). Crucially, the
query is **not** short-circuited: `events`/`opportunities`/`contradictions`/
`sources`/`positioning`/`subgraph` are still populated from whatever
event-graph evidence actually exists for that query string (e.g. a ticker
that also happens to match a company name in the graph). `InterrogationResults`
renders an amber notice card ("Live market data is not configured. This view
shows public-signal context only.") plus the disclaimer text above the normal
panels, rather than replacing them.

## 7. Accessibility

- **Node-list fallback**: `GraphExplorer` renders a `<details>`-wrapped
  accessible node list below the canvas (`Node list (accessible fallback, N
  nodes)`), listing every rendered node with its type chip, title, fixture
  badge, impact and confidence — fully keyboard/screen-reader operable and
  independent of WebGL/canvas support. Clicking a list entry selects that
  node exactly like clicking it on the canvas.
- **Not colour alone**: `CONTRADICTION`/`DATA_GAP` nodes carry a distinct
  square-ring shape marker in 2D mode in addition to their colour (§5), and
  every node also has a text `NodeTypeChip` in the detail panel and node
  list — type is never conveyed by colour alone.
- **Reduced motion**: the pause toggle (`GraphExplorer`) stops the force
  simulation entirely; the `/interrogate` mini subgraph is paused by default
  for the same reason (a lighter-weight, non-animating preview rather than a
  live simulation).
- Form inputs (`SearchBar`, filter fields) use associated `<label>`s
  (visually hidden where appropriate via `sr-only`) and standard focus
  styles; the search `<form>` carries `role="search"`.

## 8. What's deferred (not gaps)

- **LLM-generated summaries** over interrogation results or graph structure
  — Phase 3d. All text here (event/opportunity/positioning titles, the
  disclaimer) is deterministic, not model-generated.
- **Live market data** — Phase 3e. `marketContextAvailable` and the
  disclaimer exist specifically because there is no real pricing/ticker feed
  yet; market-shaped queries ship an honest empty/limited state today, not a
  simulated one.
- **Graph replay/snapshots** — Phase 3f. `/graph` and `/interrogate` always
  reflect the current database contents; there is no history of past graph
  states to scrub through.
