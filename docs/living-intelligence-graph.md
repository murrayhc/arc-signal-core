# Living Intelligence Graph

Phase 3b. How Archlight's pipeline output (events, evidence, entities) is
projected into a persistent node/edge graph, how that graph stays in sync
across repeated scans, and the read APIs built on top of it.

Source: `src/server/graph/builder.ts`, `src/server/graph/types.ts`,
`src/server/services/graph.ts`, `prisma/schema.prisma` (`GraphNode`,
`GraphEdge`, `EvidenceArc`, `EvidenceArcStep`).

## 1. Why a graph

The pipeline already produces a rich web of relationships — an event is
backed by signal clusters, which are backed by signals, which are derived
from claims, which are extracted from documents, which come from sources.
Events affect sectors and regions, contradict or reinforce each other,
surface data gaps, and spawn opportunity cards. The graph makes those
relationships queryable as a first-class structure instead of leaving them
implicit in relational joins — it is the substrate the evidence-arc engine
(`docs/evidence-arc-engine.md`) traverses, and (from Phase 3c) the substrate
an interactive 3D view will render.

## 2. Node and edge models

`GraphNode` (`prisma/schema.prisma`):

| Field | Meaning |
|---|---|
| `nodeType` | One of the 18 `NODE_TYPES` in `src/shared/enums.ts` — `EVENT`, `SOURCE`, `DOCUMENT`, `CLAIM`, `SIGNAL`, `COMPANY`, `SECTOR`, `COMMODITY`, `INSTRUMENT`, `PERSON`, `REGION`, `REGULATION`, `PROCUREMENT`, `RISK`, `OPPORTUNITY`, `POSITIONING`, `CONTRADICTION`, `DATA_GAP`. |
| `refType` / `refId` | Points back at the source-of-truth row (e.g. `refType: 'event'`, `refId: <EventCandidate.id>`). Unique together — this is the upsert key. |
| `title` / `summary` | Human-readable label and description. |
| `confidence`, `riskScore`, `opportunityScore`, `impactScore`, `freshnessScore` | Per-node scores (see §3), all in `[0, 1]`. |
| `isFixture` | Carried from the underlying row so fixture data stays visually flagged in the UI. |
| `metadataJson` | JSON blob of the underlying ids/fields not otherwise modelled (stringified; not queried directly). |

`GraphEdge`: `sourceNodeId` → `targetNodeId`, an `edgeType` (one of the 16
`EDGE_TYPES` in `src/shared/enums.ts` — `REPORTED_BY`, `DERIVED_FROM`,
`SUPPORTS`, `CONTRADICTS`, `AFFECTS`, `EXPOSES`, `AMPLIFIES`, `WEAKENS`,
`CAUSES_PRESSURE_ON`, `CREATES_OPPORTUNITY_FOR`, `LINKED_TO`, `PRICED_BY`,
`REGULATED_BY`, `SUPPLIED_BY`, `DEPENDS_ON`, `COMPETES_WITH`), a human
`label`, plus `weight`/`confidence`/`evidenceCount`. Unique on
`(sourceNodeId, targetNodeId, edgeType)`.

Both models are upserted, never duplicated: `upsertNode` keys on
`(refType, refId)`, `upsertEdge` keys on `(sourceNodeId, targetNodeId,
edgeType)`. Re-running a sync updates scores in place rather than creating a
parallel row.

## 3. Node scoring

`freshness(date, now)` in `builder.ts` — pure, deterministic, no clock reads
inside the pipeline itself (`now` is always passed in):

- A `null` date scores `0.3` (unknown recency, treated as moderately fresh).
- Within 3 days of `now`: `1`.
- 30+ days old: floored at `0.1`.
- In between: linear decay from `1` to `0.1` over that 27-day span.

Per node type, the pipeline maps existing pipeline scores onto the node's
`confidence`/`riskScore`/`opportunityScore`/`impactScore`/`freshnessScore`
columns rather than inventing new ones — e.g. the `EVENT` node uses the
event's own `confidence`, `riskScore`, `opportunityScore`, and `severity`
(as `impactScore`), with `freshnessScore = freshness(event.lastUpdatedAt,
now)`; a `SIGNAL` node's `impactScore` is the signal's `strength`; a
`CLAIM`/`DOCUMENT` node's `freshnessScore` comes from its own date via the
same `freshness` function.

## 4. Edges projected per event

`projectEventEdges` (via `syncGraphForEvents` → `projectEdgesForEvents`)
walks one event's full evidence chain and creates:

- `EVENT --AFFECTS--> SECTOR` / `EVENT --AFFECTS--> REGION` (string nodes,
  `refId` = the lowercased sector/region name).
- `SIGNAL --DERIVED_FROM--> CLAIM --DERIVED_FROM--> DOCUMENT --REPORTED_BY--> SOURCE`
  for every signal in every cluster attached to the event (the evidence
  chain an arc traversal walks back through).
- `EVENT --SUPPORTS--> SIGNAL` for each signal backing the event.
- `SIGNAL --CAUSES_PRESSURE_ON--> SECTOR` (negative-direction signals) or
  `SIGNAL --CREATES_OPPORTUNITY_FOR--> SECTOR` (positive-direction signals).
- `OPPORTUNITY --CREATES_OPPORTUNITY_FOR--> EVENT` for each opportunity card.
- `POSITIONING --LINKED_TO--> (OPPORTUNITY | EVENT)` for each positioning
  example.
- `DATA_GAP --WEAKENS--> EVENT` for each recorded data gap.

A separate cross-event pass, `projectContradictionEdges`, adds
`RISK --CONTRADICTS--> OPPORTUNITY` edges where a risk-classed and an
opportunity-classed event share enough context to be in tension.

Every edge gets a non-empty, human-readable `label` alongside its
machine-readable `edgeType`.

## 5. Sync and rebuild

- `projectNodesForEvents(events, now)` — node pass for a set of events; loads
  each event's full evidence chain (clusters → signals → claim → document →
  source, plus opportunity cards, positioning examples, data gaps, and
  linked entities) and upserts one node per referenced row. Per-event
  failures are captured as `PipelineError`s rather than aborting the batch.
- `syncGraphForEvents(events, now?)` — node pass then edge pass
  (`projectEdgesForEvents`) for the same event set, returning
  `GraphSyncResult = { nodesUpserted, edgesUpserted, errors }`.
- `rebuildGraph(now?)` / `rebuildNodes(now)` — the same two passes over
  **every** `EventCandidate` in the database (full rebuild).
- The pipeline orchestrator calls `syncGraphForEvents(allEvents)` at the end
  of every scan run (`src/server/pipeline/orchestrator.ts`), so the graph is
  kept current automatically — no separate sync step is needed after a scan.
- Idempotency is structural, not best-effort: because both upserts key on a
  stable unique constraint, re-running a sync or a full rebuild against
  unchanged data leaves node and edge counts unchanged (asserted directly in
  `tests/graph/builder-nodes.test.ts` and `tests/graph/builder-edges.test.ts`).

## 6. Read APIs

| Route | Returns |
|---|---|
| `GET /api/graph/live` | `{ nodes, edges, lastScanAt, graphStats, activeEventCount, riskCount, opportunityCount, highUncertaintyCount }` — see §7. |
| `GET /api/graph/node/[id]` | `{ node, neighbours, edges }` — one `GraphNode` plus its 1-degree neighbourhood (nodes and edges touching it in either direction). 404 if the node id is unknown. |
| `GET /api/graph/event/[id]` | `{ node, neighbours, edges, arc, steps }` — the given `EventCandidate`'s `EVENT` node, its 1-degree neighbourhood, and its evidence arc (`docs/evidence-arc-engine.md`). `arc`/`steps` are `null`/`[]` if the event has no graph node or arc yet; the route itself 404s only when the event has no graph node at all. |
| `POST /api/graph/rebuild` | Runs `rebuildGraph()` over every event and returns `GraphSyncResult`. |

Backing service functions live in `src/server/services/graph.ts`:
`getLiveGraph`, `getNodeNeighbourhood`, `getEventGraphNodeId`, `getEventArc`.

## 7. The 400-node cap

`getLiveGraph(cap = 400)` does not return the whole graph unbounded — it
ranks all `GraphNode` rows by `impactScore + freshnessScore` (descending),
keeps the top `cap` (default 400), and then keeps only the edges whose
**both** endpoints survived that cut. `graphStats` (`nodeCount`, `edgeCount`,
`byType`) describes this capped, rendered set — not the full underlying
table — so it always matches what a client actually receives. This keeps the
`/graph` page and any future interactive render bounded regardless of how
large the underlying event/evidence history grows.

## 8. What this is not

The graph as it stands is a read/traverse substrate: it has no visual
renderer yet (`/graph` is a stats-and-list page; the interactive 3D view is
Phase 3c — see `docs/evidence-arc-engine.md` §5 for the full deferred list),
no LLM-generated summaries over graph structure (Phase 3d), and no
market/instrument node population (Phase 3e).

Node/edge types defined in the enums but NOT yet created by the Phase 3b
builder (they await later phases or richer source data): node types
`COMMODITY`, `INSTRUMENT`, `REGULATION`, `PROCUREMENT`, `RISK`, and standalone
`CONTRADICTION` nodes; edge types `EXPOSES`, `AMPLIFIES`, `PRICED_BY`,
`REGULATED_BY`, `SUPPLIED_BY`, `DEPENDS_ON`, `COMPETES_WITH`. Contradictions in
3b are represented as a `CONTRADICTS` **edge between two EVENT nodes** (a real
opposing sector+region pair), not as a separate `CONTRADICTION` node.
