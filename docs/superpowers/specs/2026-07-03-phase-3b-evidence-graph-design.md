# Archlight Phase 3b — Evidence Graph & Six-Degree Arcs: Design

Date: 2026-07-03
Status: Approved direction (owner "Go"). Implements upgrade-document Stages 4
(Living Intelligence Graph data layer) and 5 (six-degree Evidence Arc tracing).
Predecessors: spine + 2a + 3a (94 tests green, HEAD 36b9add). Deterministic; no
LLM, no external provider, no network.

## 1. Goal

Project the existing intelligence records into a navigable GRAPH (nodes + edges)
without replacing them, and trace connected evidence outward up to six degrees
from any root, scoring each path's "true potential." The graph is the data layer
the Phase 3c 3D visualization and interrogation search will render; in 3b it is
exposed via APIs and a readable evidence-arc view on the event page.

## 2. Principles (carried + new)

- The graph is a PROJECTION over `EventCandidate, Source, Document, Claim,
  Signal, SignalCluster, Entity, RiskOpportunity, OpportunityCard,
  StrategicPositioningExample, DataGap` — it does not replace or duplicate them.
- Never duplicate a node for the same underlying record: `GraphNode` is unique on
  `(refType, refId)`; the builder UPSERTS.
- Deterministic + explainable: every node/edge/arc score is an explicit formula;
  every edge carries a human `label`; arcs distinguish strong vs weak vs
  contradicted vs widely-repeated-weakly-sourced chains.
- isFixture carried onto nodes (from the underlying record) for honest labelling.
- No advice framing (arcs/opportunities already guarded upstream).

## 3. New models

### GraphNode
`id, nodeType, refType, refId, title, summary, confidence, riskScore,
opportunityScore, impactScore, freshnessScore, isFixture, metadataJson,
createdAt, updatedAt.` `@@unique([refType, refId])`.

### GraphEdge
`id, sourceNodeId (FK GraphNode), targetNodeId (FK GraphNode), edgeType, label,
weight, confidence, evidenceCount, metadataJson, createdAt, updatedAt.`
`@@unique([sourceNodeId, targetNodeId, edgeType])` (no duplicate edge of the same
type between the same pair). Relations named `outEdges`/`inEdges` on GraphNode.

### EvidenceArc
`id, rootNodeId, rootEventCandidateId?, rootClaimId?, title, summary, maxDegrees,
truePotentialScore, confidence, originStrength, sourceDiversity,
contradictionScore, momentumScore, chainClass, isFixture, createdAt, updatedAt.`
`chainClass` ∈ ARC_CLASSES.

### EvidenceArcStep
`id, evidenceArcId (FK), degree, nodeId, relationshipType, explanation,
confidence, sourceCount, pathWeight, createdAt.`

### Enums (append to `src/shared/enums.ts`)
- `NODE_TYPES` (18): EVENT, SOURCE, DOCUMENT, CLAIM, SIGNAL, COMPANY, SECTOR,
  COMMODITY, INSTRUMENT, PERSON, REGION, REGULATION, PROCUREMENT, RISK,
  OPPORTUNITY, POSITIONING, CONTRADICTION, DATA_GAP.
- `EDGE_TYPES` (16): REPORTED_BY, DERIVED_FROM, SUPPORTS, CONTRADICTS, AFFECTS,
  EXPOSES, AMPLIFIES, WEAKENS, CAUSES_PRESSURE_ON, CREATES_OPPORTUNITY_FOR,
  LINKED_TO, PRICED_BY, REGULATED_BY, SUPPLIED_BY, DEPENDS_ON, COMPETES_WITH.
- `ARC_CLASSES` (5): STRONG_CHAIN, WEAK_SIGNAL, WIDELY_REPEATED_WEAK_SOURCE,
  CONTRADICTED, HIGH_POTENTIAL_LOW_CONFIDENCE.

## 4. GraphBuilderService (`src/server/graph/builder.ts`)

`syncGraphForEvents(events, opts?): Promise<{ nodesUpserted; edgesUpserted;
errors }>` — incremental: given the scan's new+updated events, upsert the node +
its evidence-chain neighbourhood. `rebuildGraph(): Promise<{...}>` — full rebuild
over all records. Both use `upsertNode(refType, refId, data)` (unique on
refType+refId) and `upsertEdge(src, tgt, edgeType, data)` (unique on the triple).

### Node projection rules
| Record | nodeType | title / scores |
|---|---|---|
| EventCandidate | EVENT | title; confidence/risk/opp from event; impactScore = severity; freshness from lastUpdatedAt |
| Source | SOURCE | name; confidence from SourceHealth score if present else 0.5 |
| Document | DOCUMENT | title; confidence = parsedConfidence-ish (0.6 default); freshness from publishedAt/fetchedAt |
| Claim | CLAIM | claimText (truncated); confidence = extractionConfidence |
| Signal | SIGNAL | explanation head; confidence/strength |
| OpportunityCard | OPPORTUNITY | title; opp = commercialValueScore; confidence |
| RiskOpportunity | RISK | title; risk from linked event |
| StrategicPositioningExample | POSITIONING | title; confidence |
| DataGap | DATA_GAP | title; confidence = 1 − impactOnConfidence magnitude |
| Entity | COMPANY/PERSON/REGION/SECTOR (by entityType, default COMPANY) | name |
| affectedSector (string) | SECTOR | sector name (refType 'sector', refId = the string) |
| affectedRegion (string) | REGION | region name (refType 'region', refId = the string) |

### Edge projection rules (each with a label)
- Document → Source: `REPORTED_BY` ("reported by").
- Claim → Document: `DERIVED_FROM` ("extracted from").
- Signal → Claim: `DERIVED_FROM` ("derived from").
- Event → Signal (via clusters): `SUPPORTS` ("evidence for"); weight = signal.strength.
- Event → Sector: `AFFECTS`; Event → Region: `AFFECTS`.
- OpportunityCard → Event: `CREATES_OPPORTUNITY_FOR` ("opportunity from").
- Positioning → OpportunityCard (or Event): `LINKED_TO`.
- DataGap → Event: `WEAKENS` ("reduces confidence in").
- Signal (NEGATIVE) → Sector: `CAUSES_PRESSURE_ON`; Signal (POSITIVE) →
  Sector: `CREATES_OPPORTUNITY_FOR` (optional enrichment).
- Two events same sector+region opposite direction: `CONTRADICTS` (creates the
  basis for contradiction detection; a CONTRADICTION node is created when a
  genuine claim-level contradiction exists — deferred heuristic, see §7).

`evidenceCount` on an edge = number of underlying supporting records; `confidence`
= min/avg of endpoint confidences; `weight` = normalised strength.

## 5. Graph sync in the pipeline

New orchestrator stage after opportunities/positioning: `syncGraphForEvents(
allEvents)`. ScanRun counters: `graphNodesUpserted`, `graphEdgesUpserted`.
Errors recorded, never abort the scan. Full `rebuildGraph` is available via
`POST /api/graph/rebuild` for a from-scratch projection.

## 6. Graph APIs + service (`src/server/services/graph.ts`, serialized)

- `GET /api/graph/live` → `{ nodes, edges, lastScanAt, graphStats: { nodeCount,
  edgeCount, byType }, activeEventCount, riskCount, opportunityCount,
  highUncertaintyCount }`. Server-side size cap (default 400 nodes, highest
  impact/freshness first) — the doc's performance rule.
- `GET /api/graph/node/[id]` → node + its immediate neighbours (1-degree) +
  incident edges.
- `POST /api/graph/rebuild` → runs `rebuildGraph`, returns counts.
- `GET /api/graph/event/[id]` → the event's node + neighbourhood, and (Stage 5)
  its EvidenceArc (built on demand, see §8).
- `highUncertaintyCount` = events with confidence < 0.45 OR with a data gap.

## 7. Contradiction & entity handling (honest scoping)

- CONTRADICTION nodes are created only where a real opposing-direction cluster
  exists on the same sector+region key (the 2a data supports this). Where none
  exists, no contradiction node is fabricated (never invent).
- Entity nodes are created only for entities that actually exist in the DB (the
  spine keeps entities minimal/optional — most fixture events are entity-free, so
  the graph is legitimately sector/region-centric, matching the product
  principle). COMMODITY/INSTRUMENT/REGULATION/PROCUREMENT/PERSON node types are
  in the enum for Phase 3c interrogation + 3e market data; 3b populates the ones
  the current data supports (EVENT, SOURCE, DOCUMENT, CLAIM, SIGNAL, OPPORTUNITY,
  POSITIONING, DATA_GAP, SECTOR, REGION, and COMPANY where entities exist).

## 8. EvidenceArcService (`src/server/graph/arc.ts`)

`buildArc(rootNodeId, maxDegrees = 6, now?): Promise<EvidenceArc & { steps }>`
— breadth-first traversal from the root over GraphEdges (both directions),
recording each reached node as an `EvidenceArcStep` with its degree,
relationshipType (the edge that reached it), a plain explanation, confidence,
sourceCount, and pathWeight (product of edge weights along the path, decayed by
degree). Deduplicate nodes (shortest degree wins). Cap breadth per degree
(default 12) for performance.

Derived arc metrics (deterministic, all 2dp):
- `originStrength` = distinct SOURCE nodes reachable within 2 degrees ÷ a small
  constant (capped 1) — how well-sourced the origin is.
- `sourceDiversity` = distinct sources across the whole arc ÷ total CLAIM/SIGNAL
  nodes (capped 1); repeated same-source support does not raise it.
- `contradictionScore` = share of steps reached via CONTRADICTS/WEAKENS edges.
- `momentumScore` = from the root event's status (RISING → high) + signal
  recency vs `now`.
- `confidence` = avg of step confidences weighted by pathWeight.
- `truePotentialScore` = explicit weighted composite (spec formula in the plan):
  rewards originStrength, sourceDiversity, momentum, cross-signal confirmation;
  penalises contradictionScore, distance decay, and single-source repetition
  (the "manipulation/echo" proxy). Clamped [0,1].
- `chainClass`: STRONG_CHAIN (high truePotential + high sourceDiversity);
  WIDELY_REPEATED_WEAK_SOURCE (many steps, low sourceDiversity);
  CONTRADICTED (contradictionScore high); HIGH_POTENTIAL_LOW_CONFIDENCE (high
  truePotential, low confidence); else WEAK_SIGNAL.

Arcs are persisted (EvidenceArc + steps), rebuilt on demand (delete+recreate the
arc for a root when re-requested so it reflects current graph state).

## 9. UI (3b — readable, not yet 3D)

- Event page (`/events/[id]`) gains an "Evidence arc" section: the chainClass
  badge, the arc summary + truePotential/confidence/sourceDiversity/
  contradiction scores, and the ordered steps grouped by degree (each: node
  title, relationship label, degree, confidence). A "Rebuild arc" is implicit on
  load. The 3D graph visual is Phase 3c.
- A minimal `/graph` page: graph stats + top nodes as a readable list (the
  interactive 3D version lands in 3c). Optional but cheap; include a stub that
  reads `/api/graph/live`.

## 10. Docs
`docs/living-intelligence-graph.md` (node/edge model, projection rules, sync,
APIs, size caps), `docs/evidence-arc-engine.md` (traversal, the truePotential
formula verbatim, chain classes, what is approximated/deferred).

## 11. Out of scope (later phases)
3D force-graph rendering + interactions (3c); manual interrogation search (3c);
market/commodity/instrument nodes populated from live data (3e); LLM-generated
node/edge/arc summaries (3d — deterministic summaries now); graph replay /
snapshots / momentum history (3f, doc Stage 12).

## 12. Success criteria
1. A scan builds graph nodes + edges; `POST /api/graph/rebuild` reprojects; no
   duplicate node for the same refType+refId (proven by tests).
2. Event→EVENT node; Claim/Source/Signal→connected nodes with the right edges;
   OpportunityCard→OPPORTUNITY node linked to its event.
3. `buildArc` traces ≥3 degrees on fixture data and supports 6-degree traversal
   where the graph is deep enough; identifies origin sources, source diversity,
   contradictions; returns a ranked, classified arc.
4. `GET /api/graph/live` returns nodes/edges/stats within the size cap;
   `GET /api/graph/event/[id]` returns the event neighbourhood + its arc.
5. Event page renders the evidence-arc section. Full suite green; typecheck +
   build clean; two docs written.
