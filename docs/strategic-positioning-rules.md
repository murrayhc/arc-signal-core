# Strategic Positioning Rules

Phase 3a. How `StrategicPositioningExample` rows are generated from an
`OpportunityCard`, what language is and is not permitted in them, and how
that is enforced.

Source: `src/server/pipeline/positioning.ts`, `src/server/safety/advice-language.ts`.

## 1. What a positioning example is

A `StrategicPositioningExample` is a short, deterministic, template-rendered
illustration of how a particular kind of user *might* think about an
opportunity — not a recommendation to act. Each example is keyed to a
`PositioningUserType` and carries: `title`, `positioningAngle`,
`howItCouldBeUsed`, `whyItMayMatter`, `evidenceSummary`, `confidence`,
`constraints`, and `isFixture`.

## 2. User-type keying

`opportunityTypeToUserTypes(opportunityType)` maps each `OpportunityType` to
up to three `PositioningUserType`s via `USER_TYPE_MAP`:

| opportunityType | userType(s) |
|---|---|
| TALENT_ACQUISITION | RECRUITER |
| HIRING | RECRUITER |
| PROCUREMENT | PROCUREMENT, SUPPLIER |
| SALES | SUPPLIER |
| PARTNERSHIP | SUPPLIER |
| COMPLIANCE | ADVISOR |
| ADVISORY | ADVISOR |
| PRODUCT_GAP | PRODUCT_TEAM |
| MARKET_ENTRY | SUPPLIER |
| COMPETITOR_DISPLACEMENT | SUPPLIER |
| M_AND_A | ADVISOR |
| CRISIS_SUPPORT | ADVISOR |
| INVESTMENT_WATCH | INVESTOR_WATCH |
| CONTENT | ANALYST, GENERAL |
| *(anything else)* | ANALYST, GENERAL (default) |

For each user type, `USER_TYPE_TEMPLATES` supplies three template functions —
`angle`, `howItCouldBeUsed`, `whyItMayMatter` — each filled in with the
event's sector/region (or the fallback phrases `"the affected sector"` /
`"the affected region"` when absent).

## 3. Permitted verbs and register

Templates are deliberately written in a hedged, exploratory register.
Permitted verb forms used throughout: **could**, **might**, **may**,
**watch**, **review**, **monitor**, **consider**, **investigate**, **prepare**
(a review/briefing/shortlist/outline). Every sentence describes a possible
interpretation or next step for the named user type — never an instruction to
transact.

`evidenceSummary` is generated from real event fields (`evidenceCount`,
`sourceDiversityScore`, event title) — it is not invented commentary.

`constraints` is always the fixed string:

> "Strategic positioning example, not investment advice; verify against primary sources."

## 4. Prohibited categories

`assertNoAdviceLanguage` (`src/server/safety/advice-language.ts`) is called on
every generated field (`title`, `positioningAngle`, `howItCouldBeUsed`,
`whyItMayMatter`, `evidenceSummary`, `constraints`) before the row is
persisted. It matches, case-insensitively, against a fixed set of regular
expressions covering (non-exhaustive, see the source file for the exact
patterns):

- Directive buy/sell/hold language ("should buy", "must sell", "buy this
  stock", "buy/sell recommendation or rating", "rate this a strong buy",
  "strong buy", "short this name").
- Price/return promises ("target price", "price target", "expected/projected/
  guaranteed return", "returns of 20%", "20% returns").
- Guarantee/urgency language ("guaranteed profit", "risk-free", "will
  definitely", "act now", "sure thing", "can't lose", "can't go wrong",
  "guaranteed win", "load up on", "going to the moon").
- Personalised-advice framing ("personal/personalised/personalized financial/
  investment/portfolio advice", "allocate/rebalance your portfolio",
  "financial advice").

Any match raises `AdviceLanguageError` and aborts persistence of that
specific card or example — it does not silently pass through, and it does not
abort the rest of the scan (the failure is recorded as a `PipelineError`).

## 5. The guard mechanism (fails closed)

`findAdviceLanguage(text)` returns every matched phrase; `assertNoAdviceLanguage`
throws if that list is non-empty. This is deterministic (a fixed regex list,
no model call), so it is exercised at three independent layers:

1. Unit tests directly against `assertNoAdviceLanguage` /
   `findAdviceLanguage` (`tests/safety/advice-language.test.ts`).
2. Generation-level tests asserting that real templates in `opportunity.ts`
   and `positioning.ts` produce guard-clean output.
3. End-to-end tests asserting the same over actual scan output.

A deliberately prohibited phrase introduced into any template would fail all
three layers, not just one — the guard is checked at generation time, not
just at test time.

## 6. Lifecycle

Positioning examples are keyed to the `OpportunityCard` that produced them
(`opportunityCardId`). On each scan, `generatePositioning(cards, lens)`
deletes any existing examples for a card and regenerates the current set —
examples are not independently versioned or made sticky; they always reflect
the card's latest scores and text. `isFixture` propagates from the underlying
event, and `evidenceArcId` is left `null` in this phase (the evidence graph
lands in Phase 3b).

## 7. The mandatory disclaimer

Every `/opportunities/[id]` detail page carries this exact, non-advisory
disclaimer in its footer, verbatim:

> "This view provides public market context and strategic interpretation
> examples. It does not provide personal investment advice, portfolio advice,
> or buy, sell or hold recommendations."

This is a page-level, user-facing safeguard in addition to (not instead of)
the generation-time guard in §5 — the guard prevents prohibited language from
ever being generated; the disclaimer makes the page's non-advisory nature
explicit to the reader regardless.
