# Evidence Arc Engine

Phase 3b. How Archlight traces an event (or claim) back through the living
intelligence graph (`docs/living-intelligence-graph.md`) to build an
"evidence arc" — a scored, degree-by-degree trail of everything that feeds
into it — and how that arc is classified and surfaced.

Source: `src/server/graph/arc.ts`, `src/server/services/graph.ts`
(`getEventArc`), `src/components/EvidenceArc.tsx`,
`src/app/events/[id]/page.tsx`.

## 1. Traversal: `buildArc(rootNodeId, maxDegrees = 6, now = new Date())`

A breadth-first search over `GraphEdge` rows, in **both** directions
(outgoing and incoming), starting from the root node:

- `visited` tracks each reached node's first (shortest) degree; a node is
  never revisited at a deeper degree once seen at a shallower one.
- Each degree is capped at 12 newly-discovered nodes
  (`BREADTH_CAP_PER_DEGREE`). Candidates beyond the cap for that round are
  un-marked from `visited` so they remain reachable at a later degree via a
  different path, rather than being silently lost.
- Default depth is 6 degrees (`DEFAULT_MAX_DEGREES`); traversal stops early
  if the frontier empties before reaching the cap.
- For each reached node, `pathWeight` is the product of edge weights along
  the path it was reached by, decayed by degree: `pathWeight *
  DEGREE_DECAY^degree` with `DEGREE_DECAY = 0.85`, clamped to `[0, 1]` and
  rounded to 2 decimal places.
- `sourceCount` per step is the count of `SOURCE`-type nodes encountered
  along that node's shortest path (carried forward from its parent through
  the frontier), not just a boolean "is this a source" flag.
- A human `explanation` is generated per step (`describeStep`): `Reached via
  <EDGE_TYPE> — <nodetype lowercased> "<title>".` Every generated
  string (`explanation`, arc `title`, arc `summary`) is passed through
  `assertNoAdviceLanguage` as a guard against advice-toned copy.
- Re-running `buildArc` for the same root **deletes and recreates** rather
  than accumulating: existing `EvidenceArcStep` rows for that root are
  deleted, then the `EvidenceArc`, before the new one is created. Arc/step
  counts stay stable across repeated calls on unchanged data.
- Returns `null` if the root node does not exist.

## 2. The `truePotentialScore` formula (verbatim)

All intermediate scores are computed by `scoreArc(steps, rootNode, now)` in
`src/server/graph/arc.ts`, clamped to `[0, 1]` and rounded to 2 decimal
places (`round2`/`clamp01`). Given the traversed `steps`:

```
distinctSourcesWithin2Degrees = count of distinct SOURCE-node refIds at degree <= 2
distinctSources               = count of distinct SOURCE-node refIds (any degree)
claimSignalCount               = count of steps where nodeType is CLAIM or SIGNAL
contradictOrWeakenSteps        = count of steps where relationshipType is CONTRADICTS or WEAKENS
distinctSignalTypes             = count of distinct signalType values across SIGNAL-node steps

originStrength        = clamp01(min(1, distinctSourcesWithin2Degrees / 2))
sourceDiversity       = clamp01(distinctSources / claimSignalCount)   -- 0 if claimSignalCount is 0
contradictionScore    = clamp01(contradictOrWeakenSteps / steps.length)  -- 0 if no steps
momentumScore         = clamp01(0.5 * rootNode.freshnessScore + 0.5 * rootNode.impactScore)
crossSignalConfirmation = clamp01(min(1, distinctSignalTypes / 3))
avgPathWeight         = clamp01(sum(step.pathWeight) / steps.length)  -- 0 if no steps

confidence = clamp01(
  sum(step.confidence * step.pathWeight) / sum(step.pathWeight)
)  -- falls back to clamp01(rootNode.confidence) if steps is empty or all pathWeights are 0

truePotentialScore = clamp01(
    0.28 * originStrength
  + 0.24 * sourceDiversity
  + 0.18 * momentumScore
  + 0.15 * crossSignalConfirmation
  + 0.15 * avgPathWeight
  - 0.35 * contradictionScore
)
```

The weights (`0.28`, `0.24`, `0.18`, `0.15`, `0.15`, `-0.35`) sum their
positive terms to `1.00`; `contradictionScore` is a penalty term, not part of
that sum, which is why the formula can and does still land in `[0, 1]` after
clamping but is not itself a weighted average.

## 3. Chain classification

`chainClass` (one of the 5 `ARC_CLASSES` in `src/shared/enums.ts`) is decided
by the first matching rule, in this order:

1. `contradictionScore >= 0.3` → **`CONTRADICTED`**
2. `truePotentialScore >= 0.6` and `sourceDiversity >= 0.5` → **`STRONG_CHAIN`**
3. `steps.length >= 5` and `sourceDiversity < 0.34` → **`WIDELY_REPEATED_WEAK_SOURCE`**
4. `truePotentialScore >= 0.55` and `confidence < 0.45` → **`HIGH_POTENTIAL_LOW_CONFIDENCE`**
5. otherwise → **`WEAK_SIGNAL`**

## 4. Persistence and the read path

`buildArc` persists one `EvidenceArc` row (title, summary, the six scores
above, `chainClass`, `maxDegrees`, `isFixture`) plus one `EvidenceArcStep`
row per reached node (`degree`, `nodeId`, `relationshipType`, `explanation`,
`confidence`, `sourceCount`, `pathWeight`).

`getEventArc(eventId)` in `src/server/services/graph.ts` is the read-side
wrapper used by the UI and the API:

1. Resolves the event's `EVENT` `GraphNode` id via `getEventGraphNodeId`
   (keyed on `refType: 'event', refId: eventId`). Returns `null` if the
   event has no graph node yet (not scanned/synced).
2. Calls `buildArc(nodeId)` (rebuilding the arc fresh on every read — arcs
   are cheap to regenerate and this guarantees the response always reflects
   the current graph rather than a possibly-stale cached arc).
3. Joins each `EvidenceArcStep` to its `GraphNode`'s `title`/`nodeType` (the
   step row itself only stores `nodeId`), producing
   `{ degree, nodeType, nodeTitle, relationshipType, explanation,
   confidence, sourceCount }` per step, sorted by degree ascending.

`GET /api/graph/event/[id]` (`src/app/api/graph/event/[id]/route.ts`)
includes this in its response as `{ node, neighbours, edges, arc, steps }`;
`arc`/`steps` are `null`/`[]` when the event has a graph node but no
resolvable arc, distinct from the 404 that fires when the event has no
graph node at all.

## 5. UI

`src/components/EvidenceArc.tsx` (server component — no client-side
interactivity) renders, given an arc and its steps:

- A `chainClass` badge and the arc's `summary` text.
- Four score tiles as percentages: `truePotentialScore`, `confidence`,
  `sourceDiversity`, `contradictionScore`.
- Steps grouped by degree (`"N degrees out"`), each step showing a
  `nodeType` chip, the node's title, its `relationshipType` (lower-cased,
  underscores replaced with spaces), and its `confidence` as a percentage.
- An empty state ("No evidence arc yet — this event has not been through a
  graph sync.") when `arc` is `null`.

It is mounted as an "Evidence arc" `Section` on the event detail page
(`src/app/events/[id]/page.tsx`), populated server-side via `getEventArc`.

## 6. What's deferred (historical note — since shipped)

This section originally listed Phase 3c–3f capabilities as deferred. All of
them have since shipped and the list is retained only as history:

- **Interactive 2D/3D graph render** — shipped in Phase 3c
  (`src/components/GraphExplorer.tsx`, `ForceGraph.tsx`, `/graph`).
- **Interrogation** — shipped in Phase 3c (`src/server/interrogate/`,
  `/interrogate`).
- **LLM-generated summaries** — the dormant LLM layer shipped in Phase 3d;
  arc `title`/`summary` text remains deterministic by default, with
  enrichment available on the consequence layer when a provider is active.
- **Market/instrument nodes** — shipped in Phase 3e
  (`src/server/market/graph.ts` projects `COMMODITY`/`INSTRUMENT` nodes).
- **Graph replay/snapshots** — shipped in Phase 3f
  (`src/server/graph/timeline.ts`, `GraphEvent`/`GraphSnapshot`, replay
  panels on `/` and event pages).
