# Evidence Depth Engine

The Evidence Depth Engine is the layer that stops Archlight treating a feed item
as a single shallow signal. For every document it ingests, Archlight now extracts
discrete **atomic claims**, groups repeats into **canonical claims**, traces each
claim's **lineage** (which source is the origin, which are copies, which are
independent, which contradict), scores **reliability** with an explanation, and
generates follow-up **investigation queries**.

It is **additive**: the legacy `claim → signal → cluster → event` spine is
unchanged. The depth layer runs alongside it over the same parsed documents and
is joined back to events by `documentId`. Everything is deterministic and works
with no API key; an LLM (and, later, a web-search connector) enhances it but is
dormant by default and never fabricates data.

Built: 2026-07 (Pass 2 of the roadmap in `docs/depth-gap-audit.md`).

---

## Where it runs

Inside `runFullScan()` (`src/server/pipeline/orchestrator.ts`), immediately after
documents are parsed, a non-fatal block runs
`runEvidenceDepth()` (`src/server/evidence/depth-pipeline.ts`):

```
collect → parse → [ atomic extraction → canonical clustering → lineage →
                    reliability → in-scan follow-up queries ] → (legacy spine)
```

If the depth block fails, the scan still completes. Its outcomes are recorded on
`ScanRun` via six new counters: `atomicClaimsExtracted`, `canonicalClaimsCreated`,
`canonicalClaimsUpdated`, `claimClustersUpserted`, `lineageRecordsCreated`,
`investigationQueriesGenerated`.

## Data model

New Prisma models (`prisma/schema.prisma`). Cross-references to existing tables
(`documentId`, `sourceId`) are plain indexed strings — the existing models are
untouched.

| Model | Purpose |
|---|---|
| `AtomicClaim` | One short, testable claim extracted from one document. |
| `CanonicalClaim` | A de-duplicated claim that one or more atomic claims map to. Holds the aggregate counts and `reliabilityScore`. |
| `ClaimCluster` | One per canonical claim: source/independent/copied/contradiction counts + reliability + momentum. |
| `ClaimLineage` | One row per (canonical claim, document): the relation to the origin (origin/copy/independent/commentary/contradiction). |
| `InvestigationQuery` | A generated follow-up query, its class, and its status. |

## Atomic claims

An **atomic claim** is a single, short, specific, testable statement — not a
whole-article summary. `AtomicClaimExtractionService`
(`src/server/evidence/extraction.ts`) splits a parsed document into sentences and
emits **one atomic claim per (sentence, matched type)**. One article therefore
produces many atomic claims. Each claim keeps its `documentId`, `sourceId`,
`claimType`, extracted entities/sectors/regions/commodities/instruments,
`eventDate`, an `extractionConfidence`, a `specificityScore` (higher when the
sentence contains numbers, dates or named entities), and a `factualityLabel`.

Extraction is deterministic (a rule table of ~15 claim types in
`src/server/evidence/matchers.ts`). Opinion/forecast wording is flagged as
commentary so it is never scored as asserted fact. A dormant LLM assist
(`CLAIM_EXTRACTION_ASSIST`) only runs when a provider is injected **and** the
rules find nothing; its output is schema-validated and must cite the
`documentId`, or it is rejected.

## Canonical claims

`CanonicalClaimService` (`src/server/evidence/canonical.ts`) groups atomic claims
that describe the same thing into one canonical claim, and links each atomic claim
back to it. Two atomic claims match when they share a **claim type** and are
similar enough in text (`blendedSimilarity`, a blend of token and character-trigram
overlap), gated by:

- **Entity** — different named entities never merge. When entities *overlap*, a
  lower text-similarity bar applies, so an independently worded report of the same
  event still groups with the origin.
- **Date** — claims more than ~45 days apart are treated as different events.
- **Region** — differing regions only merge on near-identical wording.

Each canonical claim owns exactly one `ClaimCluster`. `repeatCount` tracks how many
atomic claims map to it.

## Claim lineage

`ClaimLineageService` (`src/server/evidence/lineage.ts`) orders a canonical claim's
atomic claims by time and classifies each relative to the earliest (the origin):

- **ORIGIN_CANDIDATE** — the earliest known report.
- **LIKELY_COPY** — near-verbatim wording (`blendedSimilarity ≥ COPY_THRESHOLD`)
  published later. Flagged `isLikelyCopy = true`.
- **INDEPENDENT_SUPPORT** — a differently worded report from another source.
- **CONTRADICTION** — a report that denies/disputes the claim (checked first, so a
  denial is never mistaken for a copy even if the wording is close).
- **COMMENTARY** — opinion built on the claim.

It writes one `ClaimLineage` row per document and recomputes the counts:
`independentSourceCount`, `contradictionCount`, and the cluster's
`copiedSourceCount`.

## How copied reporting is handled

This is the core of "wide repetition is not corroboration":

- The **independent-source count excludes copies.** Five outlets reprinting one
  wire story count as **one** independent source, not five.
- In reliability scoring, a high copy ratio applies a **multiplicative penalty**
  (`copyLoopRisk`), so copying can only ever *lower* confidence, never raise it.
- A claim that is widely copied with no independent corroboration is labelled
  **RECYCLED**.

## Reliability scoring

`EvidenceReliabilityService` (`src/server/evidence/reliability.ts`) scores each
canonical claim from 0–1 across these dimensions:

| Dimension | Meaning |
|---|---|
| `authority` | Prior from the source category (`src/server/evidence/authority.ts`): official/regulator/primary > news > blog/social. |
| `independence` | Rises with the number of **independent** sources (diminishing returns). |
| `support` | Corroboration from independent sources. |
| `specificity` | Numbers / dates / named entities present. |
| `freshness` | Recency of the newest supporting report. |
| `contradiction` | Penalty for disputing reports. |
| `copyLoopRisk` | Penalty for a high proportion of copies. |

The positive dimensions are a weighted sum; contradiction and copy-loop are applied
as **multiplicative penalties**. Every score produces a human-readable
`reasoningSummary`, plus `evidenceFor` / `evidenceAgainst` / `warnings`.

## How weak claims are labelled (`factualityLabel`)

| Label | When |
|---|---|
| `STRONGLY_SUPPORTED` | ≥3 independent sources, or ≥2 with high authority. |
| `SUPPORTED` | ≥2 independent sources, or a single primary/official source. |
| `WEAK_SINGLE_SOURCE` | One non-primary source only. |
| `CONTRADICTED` | A material contradiction is present. |
| `STALE` | Newest supporting report is old. |
| `RECYCLED` | Widely copied, no independent corroboration. |
| `NEEDS_REVIEW` | Low extraction confidence. |
| `UNVERIFIED` | Default until corroborated. |

Weak/flagged claims are labelled and surfaced as such; they are not silently
promoted into primary output.

## Recursive investigation

`InvestigationQueryService` (`src/server/evidence/investigation-query.ts`)
generates follow-up queries across eight classes — `ORIGIN_TRACE`,
`SUPPORTING_EVIDENCE`, `CONTRADICTION`, `AFFECTED_ENTITIES`, `BENEFICIARY_SEARCH`,
`HARMED_PARTY_SEARCH`, `HISTORIC_ANALOGUE`, `FUTURE_SCENARIO_SIGNAL` — preserving
the claim's entity, sector, region and commodity. Queries are stored for audit.

`InvestigationLoopService` (`src/server/evidence/investigation-loop.ts`) runs a
bounded, recursive investigation: generate queries → run them through registered
search adapters → ingest new documents → re-extract, re-cluster, re-score → stop on
saturation, depth, or limits (`maxDepth 3`, `maxQueriesPerClaim 12`,
`maxDocumentsPerQuery 10`, plus runtime/cost budgets).

**This pass ships with the search registry empty (dormant).** With no adapter
configured, the loop generates and logs queries, marks them `SKIPPED_NO_ADAPTER`,
and stops with `NO_ADAPTER_CONFIGURED` — no external calls, no fabricated results.
Per-adapter failures are recorded, never crash the run, and the same document is
never processed twice.

## User-facing surfaces

- **Event page** (`src/app/events/[id]/page.tsx`) — a new **Evidence Depth** section
  (`src/components/EvidenceDepthPanel.tsx`) shows tracked claims with their factuality
  label and reliability %, the origin trace and full lineage (copy / independent /
  contradiction), atomic facts, evidence gaps, and the follow-up queries. A **Run
  deeper investigation** button triggers the loop and honestly reports the dormant
  search state. Empty state: *"Deep investigation has not run for this event yet."*
- **API** — `GET /api/events/[id]/evidence-depth`, `GET /api/claims/[id]/lineage`,
  `GET /api/claims/[id]/reliability`, `POST /api/claims/[id]/investigate`,
  `POST /api/events/[id]/investigate`.

## Activation (later passes)

- **LLM assist** — set `ANTHROPIC_API_KEY`, install `@anthropic-ai/sdk`, and enable
  an `LLMProviderConfig` with a real model id (see `docs/multi-model-llm-routing.md`).
  Extraction and query generation then use validated, grounded LLM output where the
  rules are insufficient; deterministic output remains the fallback.
- **Web search** — register a real `SearchAdapter` in `SEARCH_ADAPTER_REGISTRY`
  (`src/server/evidence/search/registry.ts`) that reports `CONFIGURED`. The
  investigation loop then reaches the open web with no other change. Until then it
  stays dormant.

## Not included (Pass 3)

Naming specific beneficiaries and harmed companies with per-company evidence links,
future-scenario synthesis, and historic-analogue retrieval build **on** this engine
and are out of scope for this pass. The Evidence Depth Engine is the prerequisite:
reliable, lineage-traced, entity-tagged claims to reason over.

## Tests

- Unit: `tests/evidence-text.test.ts`, `atomic-claim-extraction.test.ts`,
  `canonical-claim-clustering.test.ts`, `claim-lineage.test.ts`,
  `evidence-reliability.test.ts`, `investigation-query-generation.test.ts`,
  `investigation-loop.test.ts`, `evidence-depth-wiring.test.ts`,
  `evidence-depth-api.test.ts`.
- End-to-end: `tests/evidence-depth-pipeline.e2e.test.ts` runs a real scan over four
  fixtures (origin / copy / independent / contradiction) and proves copies don't
  inflate confidence, independence raises it, and contradictions lower it.
