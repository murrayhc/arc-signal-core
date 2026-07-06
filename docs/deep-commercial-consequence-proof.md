# Deep Commercial Consequence — Proof

The end-to-end test `tests/deep-commercial-consequence.e2e.test.ts` runs a real full scan over the four evidence fixtures (origin / copy / independent / contradiction, `fixtures/evidence-depth/`) and proves that, for a detected event, Archlight produces deep investigative output — not a shallow alert — with no financial advice.

## What the scan produces

A layoff event about "Voltcore" forms from the fixtures. The consequence engine then runs during the scan (impacts → context + scenarios → positioning), and `getEventDeepReport(eventId)` returns the full picture.

## The ten proofs

| # | Claim | Assertion |
|---|---|---|
| 1 | A detected event produces company impacts | `deep.companies.length > 0` |
| 2 | Beneficiary companies are named with evidence | `deep.beneficiaries.length > 0`; each has an `evidenceIds` array |
| 3 | Harmed companies are named with evidence | `deep.harmed.length > 0`; the named subject ("Voltcore") appears with non-empty `evidenceIds` |
| 4 | Low-confidence company impact is labelled | some impact has `lowConfidence === true` (category impacts) |
| 5 | Historic context is generated | `deep.context.historicContext` is non-empty |
| 6 | Present context is generated | `deep.context.presentContext` is non-empty |
| 7 | Future scenarios are generated | `deep.scenarios.length === 5`; `futureContext` non-empty |
| 8 | Strategic positioning examples are generated | `deep.positioning.length > 0` |
| 9 | The event API returns deep output | scan counters `companyImpactsCreated > 0`, `futureScenariosCreated > 0`; the deep report is populated |
| 10 | Forbidden financial-advice language is never produced | `findAdviceLanguage()` is empty across every impact pathway, context string, scenario summary, positioning field, and the assembled executive report |

## Forbidden-language coverage

`tests/financial-advice-guardrails.test.ts` additionally asserts each forbidden phrase category is caught (should buy/sell, buy/sell/hold rating, target price, guaranteed profit, certain return, portfolio allocation) and that a full generated report + positioning + context for a scanned event contains none of them.

## What this demonstrates

The output shows the full chain — **source → claim → evidence → affected company (with why + evidence ids) → consequence → historic/present/future context → strategic positioning → watch signals** — grounded in evidence, never inventing companies, and never giving financial advice. That is the difference between an investigative intelligence report and a shallow "risk detected" alert.

## Related

- Engine: `docs/commercial-consequence-engine.md`
- Routing & guardrails: `docs/llm-routing-and-guardrails.md`
- Evidence foundation: `docs/evidence-depth-engine.md`
- Origin audit: `docs/depth-gap-audit.md`
