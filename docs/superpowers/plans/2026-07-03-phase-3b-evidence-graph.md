# Archlight Phase 3b — Evidence Graph & Six-Degree Arcs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Project existing intelligence records into a GraphNode/GraphEdge graph (no duplication), sync it during scans, expose graph APIs, and trace six-degree EvidenceArcs with deterministic true-potential scoring — surfaced as a readable arc section on the event page.

**Architecture:** New models (GraphNode, GraphEdge, EvidenceArc, EvidenceArcStep). `src/server/graph/builder.ts` upserts nodes+edges from records (unique on refType+refId / the edge triple). `src/server/graph/arc.ts` does BFS traversal + scoring. A graph-sync stage runs after opportunities in `runFullScan`. Graph + arc APIs under `/api/graph/*`. Deterministic — no LLM, no provider, no network.

**Tech Stack:** unchanged. Baseline: 94 tests green at HEAD `36b9add`.

**Spec:** `docs/superpowers/specs/2026-07-03-phase-3b-evidence-graph-design.md` — read first.

## Global Constraints

- Working dir: `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight`.
- The graph is a PROJECTION — never replace/duplicate source records; `GraphNode` unique on `(refType, refId)` (upsert); `GraphEdge` unique on `(sourceNodeId, targetNodeId, edgeType)` (upsert). Never fabricate contradiction/entity nodes without a real underlying record.
- Deterministic + explainable: every node/edge/arc score is an explicit formula; every edge has a human `label`; `isFixture` carried from the underlying record onto nodes/arcs.
- String enums via `src/shared/enums.ts`; `*Json` String columns; files < 500 lines; nothing requires an entity; GBP.
- Full suite green + typecheck clean before each commit; commit messages as given.
- No advice framing anywhere (arcs summarise evidence; opportunity text already guarded upstream — reuse, don't regenerate).

---

### Task 1: Migration — graph & arc models + enums

**Files:** Modify `prisma/schema.prisma`, `src/shared/enums.ts`, `tests/helpers.ts`; Test: `tests/schema.test.ts` (+1).

**Interfaces:** Produces `GraphNode`, `GraphEdge`, `EvidenceArc`, `EvidenceArcStep` models; enums `NODE_TYPES` (18), `EDGE_TYPES` (16), `ARC_CLASSES` (5) + types.

- [ ] **Step 1: Enums** — append to `src/shared/enums.ts`:
```ts
export const NODE_TYPES = [
  'EVENT','SOURCE','DOCUMENT','CLAIM','SIGNAL','COMPANY','SECTOR','COMMODITY',
  'INSTRUMENT','PERSON','REGION','REGULATION','PROCUREMENT','RISK','OPPORTUNITY',
  'POSITIONING','CONTRADICTION','DATA_GAP',
] as const
export type NodeType = (typeof NODE_TYPES)[number]

export const EDGE_TYPES = [
  'REPORTED_BY','DERIVED_FROM','SUPPORTS','CONTRADICTS','AFFECTS','EXPOSES',
  'AMPLIFIES','WEAKENS','CAUSES_PRESSURE_ON','CREATES_OPPORTUNITY_FOR',
  'LINKED_TO','PRICED_BY','REGULATED_BY','SUPPLIED_BY','DEPENDS_ON','COMPETES_WITH',
] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

export const ARC_CLASSES = [
  'STRONG_CHAIN','WEAK_SIGNAL','WIDELY_REPEATED_WEAK_SOURCE','CONTRADICTED',
  'HIGH_POTENTIAL_LOW_CONFIDENCE',
] as const
export type ArcClass = (typeof ARC_CLASSES)[number]
```

- [ ] **Step 2: Schema** — append to `prisma/schema.prisma`:
```prisma
model GraphNode {
  id               String      @id @default(cuid())
  nodeType         String
  refType          String
  refId            String
  title            String
  summary          String      @default("")
  confidence       Float       @default(0)
  riskScore        Float       @default(0)
  opportunityScore Float       @default(0)
  impactScore      Float       @default(0)
  freshnessScore   Float       @default(0)
  isFixture        Boolean     @default(false)
  metadataJson     String      @default("{}")
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt
  outEdges         GraphEdge[] @relation("SourceNode")
  inEdges          GraphEdge[] @relation("TargetNode")
  arcSteps         EvidenceArcStep[]

  @@unique([refType, refId])
}

model GraphEdge {
  id            String    @id @default(cuid())
  sourceNodeId  String
  sourceNode    GraphNode @relation("SourceNode", fields: [sourceNodeId], references: [id])
  targetNodeId  String
  targetNode    GraphNode @relation("TargetNode", fields: [targetNodeId], references: [id])
  edgeType      String
  label         String
  weight        Float     @default(0.5)
  confidence    Float     @default(0.5)
  evidenceCount Int       @default(1)
  metadataJson  String    @default("{}")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@unique([sourceNodeId, targetNodeId, edgeType])
}

model EvidenceArc {
  id                   String            @id @default(cuid())
  rootNodeId           String
  rootEventCandidateId String?
  rootClaimId          String?
  title                String
  summary              String
  maxDegrees           Int               @default(6)
  truePotentialScore   Float
  confidence           Float
  originStrength       Float
  sourceDiversity      Float
  contradictionScore   Float
  momentumScore        Float
  chainClass           String
  isFixture            Boolean           @default(false)
  createdAt            DateTime          @default(now())
  updatedAt            DateTime          @updatedAt
  steps                EvidenceArcStep[]
}

model EvidenceArcStep {
  id               String      @id @default(cuid())
  evidenceArcId    String
  evidenceArc      EvidenceArc @relation(fields: [evidenceArcId], references: [id])
  degree           Int
  nodeId           String
  node             GraphNode   @relation(fields: [nodeId], references: [id])
  relationshipType String
  explanation      String
  confidence       Float
  sourceCount      Int
  pathWeight       Float
  createdAt        DateTime    @default(now())
}
```

- [ ] **Step 3: Migrate** — `npx prisma migrate dev --name phase3b_evidence_graph` (BLOCKED + report if Prisma AI-guards it).

- [ ] **Step 4: resetDb** — in `tests/helpers.ts`, add at the TOP of the transaction array (they are leaf/dependent tables): `prisma.evidenceArcStep.deleteMany()`, `prisma.evidenceArc.deleteMany()`, `prisma.graphEdge.deleteMany()`, `prisma.graphNode.deleteMany()` (in that order — steps → arc, edges → node).

- [ ] **Step 5: Test** — append to `tests/schema.test.ts`:
```ts
  it('creates graph nodes/edges deduped on refType+refId and the edge triple', async () => {
    const a = await prisma.graphNode.create({ data: { nodeType: 'EVENT', refType: 'event', refId: 'e1', title: 'E1' } })
    const b = await prisma.graphNode.create({ data: { nodeType: 'SOURCE', refType: 'source', refId: 's1', title: 'S1' } })
    await expect(
      prisma.graphNode.create({ data: { nodeType: 'EVENT', refType: 'event', refId: 'e1', title: 'dup' } }),
    ).rejects.toThrow()
    await prisma.graphEdge.create({ data: { sourceNodeId: a.id, targetNodeId: b.id, edgeType: 'REPORTED_BY', label: 'reported by' } })
    await expect(
      prisma.graphEdge.create({ data: { sourceNodeId: a.id, targetNodeId: b.id, edgeType: 'REPORTED_BY', label: 'x' } }),
    ).rejects.toThrow()
    const arc = await prisma.evidenceArc.create({
      data: { rootNodeId: a.id, title: 'Arc', summary: 's', truePotentialScore: 0.5, confidence: 0.5, originStrength: 0.5, sourceDiversity: 0.5, contradictionScore: 0, momentumScore: 0.5, chainClass: 'WEAK_SIGNAL' },
    })
    await prisma.evidenceArcStep.create({ data: { evidenceArcId: arc.id, degree: 1, nodeId: b.id, relationshipType: 'REPORTED_BY', explanation: 'x', confidence: 0.5, sourceCount: 1, pathWeight: 0.5 } })
    expect(await prisma.evidenceArcStep.count()).toBe(1)
  })
```

- [ ] **Step 6: Verify + commit** — `npm test` (95), typecheck clean.
```bash
git add -A && git commit -m "feat(3b): migration — GraphNode, GraphEdge, EvidenceArc, EvidenceArcStep + enums"
```

---

### Task 2: Graph node projection + upsert helpers + node rebuild

**Files:** Create `src/server/graph/types.ts`, `src/server/graph/builder.ts` (nodes only in this task); Test: `tests/graph/builder-nodes.test.ts`.

**Interfaces:**
- `src/server/graph/types.ts`: `type GraphSyncResult = { nodesUpserted: number; edgesUpserted: number; errors: PipelineError[] }`.
- `builder.ts` (partial — edges land in Task 3):
  - `upsertNode(refType: string, refId: string, data: { nodeType; title; summary?; confidence?; riskScore?; opportunityScore?; impactScore?; freshnessScore?; isFixture?; metadata?: object }): Promise<GraphNode>` — upsert on the `refType_refId` composite unique; updates scores/title on conflict.
  - `freshness(date: Date | null, now: Date): number` (pure) — `1` if within 3 days, decaying to `0.1` by 30 days, `0.1` floor; null → 0.3.
  - `projectNodesForEvents(events: EventCandidate[], now: Date): Promise<{ nodeCount: number; errors: PipelineError[] }>` — for each event: upsert the EVENT node + its Source/Document/Claim/Signal/OpportunityCard/StrategicPositioningExample/DataGap nodes + SECTOR/REGION string nodes (refType 'sector'|'region', refId = the lowercased string) + COMPANY/PERSON/etc for any linked Entity. Node scores per spec §4 table. Idempotent.
  - `rebuildNodes(now: Date): Promise<{ nodeCount; errors }>` — project nodes for ALL events.

- [ ] **Step 1: Failing tests** — `tests/graph/builder-nodes.test.ts`. Seed a real scan (runSeed includeLive:false + runFullScan) then:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runSeed } from '@/server/seed'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { projectNodesForEvents, rebuildNodes, freshness } from '@/server/graph/builder'
import { resetDb } from '../helpers'

describe('freshness (pure)', () => {
  it('is high for recent and low for old', () => {
    const now = new Date('2026-07-03T00:00:00Z')
    expect(freshness(new Date('2026-07-02T00:00:00Z'), now)).toBeGreaterThan(0.8)
    expect(freshness(new Date('2026-05-01T00:00:00Z'), now)).toBeLessThan(0.2)
    expect(freshness(null, now)).toBeCloseTo(0.3, 5)
  })
})

describe('graph node projection', () => {
  beforeEach(async () => { await resetDb(); await runSeed({ includeLive: false }); await runFullScan() })

  it('creates EVENT/SOURCE/CLAIM/SIGNAL/OPPORTUNITY/DATA_GAP/SECTOR nodes from scan data', async () => {
    const events = await prisma.eventCandidate.findMany()
    const { nodeCount } = await projectNodesForEvents(events, new Date('2026-07-03T00:00:00Z'))
    expect(nodeCount).toBeGreaterThan(0)
    const byType = async (t: string) => prisma.graphNode.count({ where: { nodeType: t } })
    expect(await byType('EVENT')).toBe(events.length)
    expect(await byType('SOURCE')).toBeGreaterThan(0)
    expect(await byType('CLAIM')).toBeGreaterThan(0)
    expect(await byType('SIGNAL')).toBeGreaterThan(0)
    expect(await byType('OPPORTUNITY')).toBeGreaterThan(0)
    expect(await byType('SECTOR')).toBeGreaterThan(0)
    // fixture flag carried
    const evNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'EVENT' } })
    expect(evNode.isFixture).toBe(true)
  })

  it('never duplicates a node for the same refType+refId across a rebuild', async () => {
    const now = new Date('2026-07-03T00:00:00Z')
    const events = await prisma.eventCandidate.findMany()
    await projectNodesForEvents(events, now)
    const after1 = await prisma.graphNode.count()
    await rebuildNodes(now)
    const after2 = await prisma.graphNode.count()
    expect(after2).toBe(after1)
  })
})
```
Run `npm test` → FAIL (module missing).

- [ ] **Step 2: Implement** `src/server/graph/types.ts` and the node half of `builder.ts` per the interfaces + spec §4 node table. `upsertNode` uses `prisma.graphNode.upsert({ where: { refType_refId: { refType, refId } }, create, update })`. SECTOR/REGION nodes use `refType: 'sector'|'region'`, `refId: value.toLowerCase()`. Load a node's evidence chain per event with includes (clusters→signals→claim→document→source; opportunityCards; positioningExamples; dataGaps; primaryEntity + entities). Node score mapping exactly per the spec table; `metadata` holds the underlying ids.

- [ ] **Step 3: Verify + commit** — `npm test` (97), typecheck clean.
```bash
git add -A && git commit -m "feat(3b): graph node projection with upsert dedupe and freshness scoring"
```

---

### Task 3: Graph edge projection + full sync/rebuild

**Files:** Modify `src/server/graph/builder.ts`; Test: `tests/graph/builder-edges.test.ts`.

**Interfaces:**
- `upsertEdge(sourceNodeId, targetNodeId, edgeType: EdgeType, data: { label; weight?; confidence?; evidenceCount?; metadata?: object }): Promise<GraphEdge>` — upsert on the `sourceNodeId_targetNodeId_edgeType` composite unique.
- `syncGraphForEvents(events: EventCandidate[], now?: Date): Promise<GraphSyncResult>` — projects nodes (Task 2) THEN edges per spec §4 edge rules, for the given events' neighbourhoods. Returns `{ nodesUpserted, edgesUpserted, errors }`.
- `rebuildGraph(now?: Date): Promise<GraphSyncResult>` — full node + edge projection over all events.
- Edge rules (spec §4), each with a human `label`:
  - Document→Source `REPORTED_BY`; Claim→Document `DERIVED_FROM`; Signal→Claim `DERIVED_FROM`; Event→Signal `SUPPORTS` (weight = signal.strength); Event→Sector `AFFECTS`; Event→Region `AFFECTS`; OpportunityCard→Event `CREATES_OPPORTUNITY_FOR`; Positioning→OpportunityCard (else →Event) `LINKED_TO`; DataGap→Event `WEAKENS`; NEGATIVE Signal→Sector `CAUSES_PRESSURE_ON`; POSITIVE Signal→Sector `CREATES_OPPORTUNITY_FOR`.
  - Contradiction: if two events share sector+region with opposing dominant direction (one RISK-ish/NEGATIVE, one OPPORTUNITY-ish/POSITIVE), add a `CONTRADICTS` edge between their EVENT nodes (both directions or one canonical direction). Do NOT create a CONTRADICTION node unless a real opposing pair exists.
  - `evidenceCount` = count of underlying supports; `confidence` = avg endpoint confidence; `weight` normalised.

- [ ] **Step 1: Failing tests** — `tests/graph/builder-edges.test.ts` (seed scan + syncGraphForEvents):
```ts
// after resetDb + runSeed(false) + runFullScan, then syncGraphForEvents(allEvents, now):
// - assert edges exist of types REPORTED_BY, DERIVED_FROM, SUPPORTS, AFFECTS, CREATES_OPPORTUNITY_FOR, WEAKENS
// - assert the evidence chain resolves: pick a SIGNAL node, follow DERIVED_FROM to a CLAIM, that CLAIM DERIVED_FROM a DOCUMENT, that DOCUMENT REPORTED_BY a SOURCE (a 3+ hop chain exists)
// - assert an OPPORTUNITY node CREATES_OPPORTUNITY_FOR an EVENT node
// - assert re-running syncGraphForEvents does not duplicate edges (count stable)
// - assert every edge has a non-empty label
```
Write concrete assertions using prisma.graphEdge queries by edgeType + endpoint nodeType joins. Run `npm test` → FAIL.

- [ ] **Step 2: Implement** the edge half of `builder.ts` per the rules. Resolve endpoint node ids via the `refType_refId` unique (nodes already upserted in the node pass). Guard against self-edges and missing endpoints. `syncGraphForEvents` = node pass + edge pass; `rebuildGraph` = over all events. Per-event try/catch → PipelineError stage `'graph'`.

- [ ] **Step 3: Verify + commit** — `npm test` (~99), typecheck clean.
```bash
git add -A && git commit -m "feat(3b): graph edge projection (evidence chains, opportunities, contradictions) + full sync/rebuild"
```

---

### Task 4: Orchestrator graph sync + graph service + graph APIs

**Files:** Modify `prisma/schema.prisma` (2 ScanRun counters — migration), `src/server/pipeline/orchestrator.ts`; Create `src/server/services/graph.ts`, `src/app/api/graph/live/route.ts`, `src/app/api/graph/node/[id]/route.ts`, `src/app/api/graph/rebuild/route.ts`, `src/app/api/graph/event/[id]/route.ts`; Test: `tests/api/graph-api.test.ts`, modify `tests/pipeline/orchestrator.test.ts`.

**Interfaces:**
- ScanRun gains `graphNodesUpserted Int @default(0)`, `graphEdgesUpserted Int @default(0)`; `ScanSummary.counts` gains the two. Orchestrator: after opportunities/positioning, `const g = await syncGraphForEvents(allEvents); errors.push(...g.errors); counts.graphNodesUpserted = g.nodesUpserted; counts.graphEdgesUpserted = g.edgesUpserted`.
- `src/server/services/graph.ts` (serialized, ISO dates):
  - `type GraphNodeData = { id; nodeType; refType; refId; title; summary; confidence; riskScore; opportunityScore; impactScore; freshnessScore; isFixture }`.
  - `type GraphEdgeData = { id; sourceNodeId; targetNodeId; edgeType; label; weight; confidence; evidenceCount }`.
  - `getLiveGraph(cap = 400): Promise<{ nodes: GraphNodeData[]; edges: GraphEdgeData[]; lastScanAt: string | null; graphStats: { nodeCount; edgeCount; byType: Record<string,number> }; activeEventCount; riskCount; opportunityCount; highUncertaintyCount }>` — nodes ordered by (impactScore+freshnessScore) desc, take `cap`; edges only between included nodes. Counts from EventCandidate/graph. highUncertaintyCount = events with confidence<0.45 OR ≥1 DataGap.
  - `getNodeNeighbourhood(id): Promise<{ node; neighbours: GraphNodeData[]; edges: GraphEdgeData[] } | null>` — node + 1-degree.
  - `getEventGraphNodeId(eventId): Promise<string | null>` — the EVENT node id for an event (used by the arc route).
- Routes follow the events route pattern (Response.json, params Promise<{id}>, no next/server, 404 on missing). `POST /api/graph/rebuild` runs `rebuildGraph`, returns counts.

- [ ] **Step 1: Migration** — add the 2 ScanRun columns; `npx prisma migrate dev --name phase3b_scanrun_graph_counters`.
- [ ] **Step 2: Tests first** — orchestrator test: assert `summary.counts.graphNodesUpserted > 0` and graph tables populated after a scan. `tests/api/graph-api.test.ts` (post-scan): `GET /api/graph/live` returns nodes+edges+graphStats.byType with EVENT count = events; `GET /api/graph/node/[id]` returns neighbourhood; `POST /api/graph/rebuild` returns counts and is idempotent (node count stable). Run → RED.
- [ ] **Step 3: Implement** the orchestrator stage, the service, and the 4 routes.
- [ ] **Step 4: Verify + commit** — `npm test` (~103), typecheck clean, build clean (routes listed).
```bash
git add -A && git commit -m "feat(3b): graph sync stage + graph service + /api/graph live/node/rebuild routes"
```

---

### Task 5: EvidenceArcService (six-degree traversal + scoring)

**Files:** Create `src/server/graph/arc.ts`; Test: `tests/graph/arc.test.ts`.

**Interfaces:**
- `buildArc(rootNodeId: string, maxDegrees = 6, now?: Date): Promise<{ arc: EvidenceArc; steps: EvidenceArcStep[] } | null>` — BFS over GraphEdges (both directions) from the root; dedupe nodes (shortest degree wins); breadth cap 12/degree; each reached node → EvidenceArcStep (degree, nodeId, relationshipType = reaching edgeType, explanation, confidence = node.confidence, sourceCount = distinct SOURCE nodes on its path, pathWeight = product of edge weights × 0.85^degree). Deletes any existing arc for the root first (rebuild reflects current graph). Returns null if root missing.
- Pure scoring helpers (exported, tested):
  - `scoreArc(steps, rootNode, now): { originStrength; sourceDiversity; contradictionScore; momentumScore; confidence; truePotentialScore; chainClass }`.
  - Formulas (2dp, clamp01):
    - `distinctSources` = distinct SOURCE-node steps; `claimSignalCount` = CLAIM+SIGNAL steps.
    - `originStrength` = `min(1, distinctSourcesWithin2Degrees / 2)`.
    - `sourceDiversity` = `claimSignalCount > 0 ? min(1, distinctSources / claimSignalCount) : 0`.
    - `contradictionScore` = `steps.length ? (contradictOrWeakenSteps / steps.length) : 0` (CONTRADICTS/WEAKENS relationshipType).
    - `momentumScore` = `rootNode.freshnessScore*0.5 + (rootStatusRising ? 0.5 : rootNode.impactScore*0.3)` clamped — pass rootStatus via metadata or a param; simplest: `0.4*rootNode.freshnessScore + 0.3*rootNode.impactScore + 0.3*avgStepFreshnessProxy`. Use `0.5*rootNode.freshnessScore + 0.5*rootNode.impactScore`.
    - `confidence` = `sum(step.confidence*step.pathWeight)/sum(step.pathWeight)` (or rootNode.confidence if no steps).
    - `truePotentialScore` = `clamp01(0.28*originStrength + 0.24*sourceDiversity + 0.18*momentumScore + 0.15*crossSignalConfirmation + 0.15*avgPathWeight − 0.35*contradictionScore)` where `crossSignalConfirmation = min(1, distinctSignalTypes / 3)`.
    - `chainClass`: `contradictionScore >= 0.3` → CONTRADICTED; else `truePotentialScore >= 0.6 && sourceDiversity >= 0.5` → STRONG_CHAIN; else `steps.length >= 5 && sourceDiversity < 0.34` → WIDELY_REPEATED_WEAK_SOURCE; else `truePotentialScore >= 0.55 && confidence < 0.45` → HIGH_POTENTIAL_LOW_CONFIDENCE; else WEAK_SIGNAL.
  - `title`/`summary` composed deterministically (no advice language) citing degrees reached, distinct sources, chainClass.

- [ ] **Step 1: Failing tests** — `tests/graph/arc.test.ts` (seed scan → syncGraphForEvents → get an EVENT node id → buildArc):
```ts
// - buildArc from an EVENT node reaches >= 3 degrees on fixture data (max step.degree >= 3)
// - steps are deduped (no nodeId appears twice)
// - arc persisted with steps; re-running buildArc for the same root does not accumulate (delete+recreate)
// - arc has a chainClass in ARC_CLASSES and truePotentialScore in [0,1]
// - a 2-source event yields sourceDiversity > 0 (identifies independent sources)
// - scoreArc pure: a high-contradiction step set yields chainClass CONTRADICTED
```
Run `npm test` → FAIL.
- [ ] **Step 2: Implement** `arc.ts` per the interfaces + formulas exactly.
- [ ] **Step 3: Verify + commit** — `npm test` (~109), typecheck clean.
```bash
git add -A && git commit -m "feat(3b): six-degree evidence-arc traversal with true-potential scoring and chain classification"
```

---

### Task 6: Arc API + event-page arc section + /graph page + docs

**Files:** Modify `src/server/services/graph.ts` (add arc read), `src/app/api/graph/event/[id]/route.ts` (return arc), `src/app/events/[id]/page.tsx`; Create `src/app/graph/page.tsx`, `src/components/EvidenceArc.tsx`; Create `docs/living-intelligence-graph.md`, `docs/evidence-arc-engine.md`; Test: modify `tests/api/graph-api.test.ts`.

**Interfaces:**
- `getEventArc(eventId): Promise<{ arc: {...serialized}; steps: {degree; nodeType; nodeTitle; relationshipType; explanation; confidence; sourceCount}[] } | null>` in graph service — finds the event's EVENT node, calls `buildArc`, returns serialized arc + steps joined to node titles/types.
- `GET /api/graph/event/[id]` → `{ node, neighbourhood, arc }` (arc may be null if the event/node missing). 200/404.
- Event page: an "Evidence arc" Section — chainClass badge, arc summary, 4 score tiles (truePotential/confidence/sourceDiversity/contradiction as %), and the steps grouped by degree (degree label → each step: nodeType chip, nodeTitle, relationship label, confidence). Empty-state if no arc.
- `/graph` page (`dynamic='force-dynamic'`): reads `getLiveGraph()`, shows graphStats (node/edge counts, byType), and top nodes as a readable list (nodeType chip, title, impact/freshness). A note: "Interactive 3D view arrives in the next phase." (The 3D render is Phase 3c.)
- Docs per spec §10 (real formulas verbatim, what's deferred).

- [ ] **Step 1: Test** — extend `tests/api/graph-api.test.ts`: `GET /api/graph/event/[id]` returns an arc with steps for a scanned event; 404 for unknown id. Run → RED.
- [ ] **Step 2: Implement** service method + route + `EvidenceArc.tsx` + event-page section + `/graph` page, following existing UI patterns (badges, dark radar-room, en-GB, `dynamic='force-dynamic'`, no external assets).
- [ ] **Step 3: Docs.**
- [ ] **Step 4: Verify + commit** — `npm test` (~111), typecheck clean, build clean (`/graph`, `/api/graph/event/[id]` listed). Manual: dev server → event page shows the evidence arc; `/graph` shows stats.
```bash
git add -A && git commit -m "feat(3b): evidence-arc API + event-page arc view + /graph stats page + docs"
```

---

## Plan Self-Review Notes
- Spec §3 models ↔ T1; §4 nodes ↔ T2, edges ↔ T3; §5 sync + §6 APIs ↔ T4; §8 arc ↔ T5; §9 UI + §10 docs ↔ T6.
- Type consistency: `GraphSyncResult` (T2 defines, T3/T4 use); `GraphNodeData`/`GraphEdgeData` (T4 service → T6 UI); arc `buildArc`/`scoreArc` (T5 → T6 read).
- Dedupe is the load-bearing invariant: unique `(refType,refId)` and `(src,tgt,edgeType)` + upsert; tests assert rebuild stability at T2/T3/T4.
- Determinism: `now` injected into freshness/arc scoring for testability; no LLM/provider/network anywhere.
- Test counts indicative; "full suite green" is the gate. Deferred (not gaps): 3D render + interrogation (3c), market/instrument nodes (3e), LLM summaries (3d), graph replay/snapshots (3f).

