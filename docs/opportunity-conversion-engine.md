# Opportunity Conversion Engine

Phase 3a. How an `EventCandidate` becomes one or more `OpportunityCard` rows,
how those cards are scored, and how they behave across repeated scans.

Source: `src/server/pipeline/opportunity.ts`, `src/server/services/opportunities.ts`.

## 1. Eligibility

`isEligible(event, lens)` in `src/server/pipeline/opportunity.ts` decides
whether an event is converted at all:

- `event.status === 'DISMISSED'` → not eligible.
- If a `RevenueLens` is supplied and the event's `affectedSector` appears in
  that lens's `excludedSectorsJson`, the event is not eligible for that lens.
- If the event's `eventType` has no entry in the type map (below) AND its
  `confidence` is below `0.45`, the event is not eligible. Unmapped,
  low-confidence events are filtered out; unmapped but higher-confidence
  events still convert (via the `CONTENT` fallback).

**Not every event converts.** Eligibility is a deliberate filter — the engine
only generates commercial cards for events that map to a recognised
commercial pattern or that clear a confidence floor. Dismissed events and
lens-excluded sectors never produce cards.

## 2. Event type → opportunity type map

`TYPE_MAP` in `opportunity.ts` maps each `SignalType`-derived `eventType` to a
primary `OpportunityType` plus alternate angles worth noting in the card
summary:

| eventType | primary | alternates |
|---|---|---|
| LAYOFF_SIGNAL | TALENT_ACQUISITION | CRISIS_SUPPORT, ADVISORY |
| HIRING_SLOWDOWN | TALENT_ACQUISITION | ADVISORY |
| EXECUTIVE_EXIT | HIRING | ADVISORY |
| EXECUTIVE_HIRE | SALES | PARTNERSHIP |
| HIRING_ACCELERATION | SALES | CONTENT |
| FUNDING_SIGNAL | SALES | PARTNERSHIP |
| CASH_PRESSURE | ADVISORY | M_AND_A, CRISIS_SUPPORT |
| LEGAL_PRESSURE | ADVISORY | CRISIS_SUPPORT |
| REGULATORY_PRESSURE | COMPLIANCE | ADVISORY |
| PROCUREMENT_INCREASE | PROCUREMENT | SALES, MARKET_ENTRY |
| DEMAND_SPIKE | SALES | PRODUCT_GAP, MARKET_ENTRY |
| SUPPLY_CHAIN_PRESSURE | COMPETITOR_DISPLACEMENT | PARTNERSHIP |
| PRODUCT_MOMENTUM | PARTNERSHIP | CONTENT |
| *(anything else)* | CONTENT | — |

`mapEventToOpportunity(eventType)` returns this mapping; unmapped types fall
back to `CONTENT`.

## 3. The five scores (verbatim formulas)

All scores are computed in `scoreOpportunity(event, lens)` and rounded to two
decimal places (`round2`), clamped to `[0, 1]` (`clamp01`). `lensFitFactor`
returns `1` when there is no lens, the lens is the default lens, or the lens
declares no target sectors/regions; otherwise it returns `1` on a sector
match, `0.7` on a region-only match, or `0.85` otherwise.

```
evidenceScore       = clamp01(sourceDiversityScore * (0.6 + 0.1 * min(evidenceCount, 4)))

confidence          = clamp01(event.confidence * lensFitFactor(event, lens))

urgencyScore        = clamp01(0.4 * probability + 0.4 * severity + 0.2 * noveltyScore)

commercialValueScore = clamp01(0.5 * max(riskScore, opportunityScore)
                               + 0.3 * lensValueSignal
                               + 0.2 * urgencyScore)
                       # lensValueSignal is currently a fixed 0.5 placeholder
                       # (averageDealSize bucketing is not implemented in 3a)

actionabilityScore = clamp01(0.5 * confidence
                             + 0.3 * evidenceScore
                             + 0.2 * (primaryEntityId ? 1 : 0.5))
```

Note the ordering dependency: `confidence` and `evidenceScore` here are the
*opportunity-level* scores computed above (not the raw event fields), and
`actionabilityScore` is computed from those already-derived values.

## 4. Card text and the advice-language guard

Card copy (title, summary, buyerPain, likelyBuyers, suggestedOffer,
opportunityLogic, riskLogic, nextBestAction) is rendered from
`TEXT_TEMPLATES`, one deterministic template per `OpportunityType`, filled in
with the event's sector/region (or fallback phrases `"the affected sector"` /
`"the affected region"` when absent).

Before any of these fields is persisted, each one is passed through
`assertNoAdviceLanguage` (`src/server/safety/advice-language.ts`). This throws
an `AdviceLanguageError` — and aborts that card — if the rendered text matches
any prohibited pattern (buy/sell/hold directives, price targets, guaranteed
returns, etc.). The guard is deterministic and fails closed: a template that
slipped in prohibited language would fail this check immediately, not silently
publish. See `docs/strategic-positioning-rules.md` for the full pattern list
and the equivalent guard on positioning examples.

## 5. Lifecycle and de-duplication

`OpportunityCard` is unique on `(eventCandidateId, revenueLensId)`. On each
scan, `generateOpportunities(events, lens)`:

- Looks up an existing card for that `(event, lens)` pair via `findFirst`
  (composite-unique lookups with a nullable `revenueLensId` need `findFirst`,
  not `findUnique`, because Prisma's compound-unique index does not support a
  `null` value in a `findUnique` where-clause).
- If none exists, creates a new card with `status: 'NEW'`.
- If one exists, recomputes scores and re-renders text, then updates the
  existing row rather than creating a duplicate. The card is considered
  "rising" if the new `commercialValueScore` or `confidence` exceeds the
  previous value.
- **Sticky statuses**: once a card reaches `ESCALATED`, `DISMISSED`, or
  `ACTIONED`, further rescans never overwrite that status — only `RISING` (or
  leaving the status unchanged when not rising) applies to cards that are
  still in a non-sticky state (`NEW`, `RISING`, `STABLE`, `DECLINING`).
- `isFixture` is propagated from the source event, so fixture-derived cards
  are always honestly labelled.
- Per-card failures (e.g. a guard rejection) are recorded as `PipelineError`s
  and do not abort the rest of the scan.

## 6. Status actions (API)

`updateOpportunityStatus(id, action)` in `src/server/services/opportunities.ts`
maps a user action to a status:

| action | status |
|---|---|
| ESCALATE | ESCALATED |
| DISMISS | DISMISSED |
| ACTION | ACTIONED |

These are the same three sticky statuses referenced in §5 — once set by a
user action, they persist across future rescans of that event.

## 7. Serving the radar

`getOpportunityRadar()` returns the top 24 cards, ordered by
`commercialValueScore` descending then `updatedAt` descending, excluding any
card with `status: 'DISMISSED'`. This is what the dashboard's Opportunity
Radar section and the `GET /api/opportunities` route serve. `DashboardData`
also keeps the event-level, pre-conversion feed under `opportunitySignals`
(the renamed `OPPORTUNITY_RADAR` `DashboardFeedItem` feed) — that is
qualitative signal-level detection, distinct from the commercial cards
described in this document.
