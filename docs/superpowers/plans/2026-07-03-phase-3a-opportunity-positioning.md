# Archlight Phase 3a — Opportunity & Positioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deterministically convert detected events into commercial OpportunityCards and non-advisory StrategicPositioningExamples, generated as a new pipeline stage, surfaced on the Opportunity Radar and event page — with an advice-language guard enforced by failing tests.

**Architecture:** New models (RevenueLens, OpportunityCard, StrategicPositioningExample) + a shared advice-language safety guard + two deterministic services (`opportunity.ts`, `positioning.ts` under `src/server/pipeline/`) wired into `runFullScan` after classify/gaps. UI: Opportunity Radar upgraded to commercial cards, new `/opportunities/[id]` page, event-page section. No LLM, no external providers.

**Tech Stack:** unchanged (Next 15, Prisma 6/SQLite, Vitest 3, Zod 3, Tailwind 4). Baseline: 74 tests green at HEAD `ba6eec9`.

**Spec:** `docs/superpowers/specs/2026-07-03-phase-3a-opportunity-positioning-design.md` — read first.

## Global Constraints

- Working dir: `/Users/murrayhewitt-coleman/Desktop/Websites/Archlight`.
- NON-ADVISORY IS A HARD RULE. No output string may contain buy/sell/hold recommendations, target price, expected/guaranteed return, risk-free, profit guarantee, "act now", "will definitely (happen)", or personal financial/portfolio advice. Every generated card/example field passes `assertNoAdviceLanguage` before persistence (fails closed).
- Deterministic only in this phase — no LLM, no external provider, no network.
- Not every event yields an opportunity (eligibility rules); weak evidence → low confidence, never suppressed silently.
- Every OpportunityCard links to its EventCandidate; every score is an explicit formula; `isFixture` propagates from the event.
- Rescans UPDATE cards (unique `eventCandidateId+revenueLensId`), never duplicate; sticky statuses ESCALATED/DISMISSED/ACTIONED are never overwritten.
- String enums via `src/shared/enums.ts`; JSON payloads as `*Json` String columns; files < 500 lines; nothing requires an entity; GBP for currency.
- Full suite green + typecheck clean before every commit; commit messages as given.

---

### Task 1: Migration — models, enums, default-lens seed

**Files:**
- Modify: `prisma/schema.prisma`, `src/shared/enums.ts`, `src/server/seed.ts`, `tests/helpers.ts`
- Test: `tests/schema.test.ts` (add one test), `tests/seed.test.ts` (add one assertion)

**Interfaces:**
- Produces: `RevenueLens`, `OpportunityCard`, `StrategicPositioningExample` models; enums `OPPORTUNITY_TYPES`, `OPPORTUNITY_STATUSES`, `POSITIONING_USER_TYPES`, `RISK_APPETITES` (+ types); a seeded default RevenueLens (`isDefault: true`). `runSeed` also upserts the default lens.

- [ ] **Step 1: Enums** — append to `src/shared/enums.ts`:
```ts
export const OPPORTUNITY_TYPES = [
  'SALES', 'PARTNERSHIP', 'PROCUREMENT', 'INVESTMENT_WATCH', 'HIRING',
  'TALENT_ACQUISITION', 'M_AND_A', 'CONTENT', 'ADVISORY', 'PRODUCT_GAP',
  'MARKET_ENTRY', 'COMPETITOR_DISPLACEMENT', 'COMPLIANCE', 'CRISIS_SUPPORT',
] as const
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number]

export const OPPORTUNITY_STATUSES = [
  'NEW', 'RISING', 'STABLE', 'DECLINING', 'DISMISSED', 'ESCALATED', 'ACTIONED',
] as const
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number]

export const POSITIONING_USER_TYPES = [
  'SUPPLIER', 'RECRUITER', 'PRODUCT_TEAM', 'PROCUREMENT', 'INVESTOR_WATCH',
  'ADVISOR', 'ANALYST', 'GENERAL',
] as const
export type PositioningUserType = (typeof POSITIONING_USER_TYPES)[number]

export const RISK_APPETITES = ['LOW', 'MEDIUM', 'HIGH'] as const
export type RiskAppetite = (typeof RISK_APPETITES)[number]
```

- [ ] **Step 2: Schema** — append three models to `prisma/schema.prisma`:
```prisma
model RevenueLens {
  id                 String              @id @default(cuid())
  name               String              @unique
  description        String?
  userType           String              @default("GENERAL")
  targetSectorsJson  String              @default("[]")
  targetRegionsJson  String              @default("[]")
  offerTypesJson     String              @default("[]")
  buyerPersonasJson  String              @default("[]")
  averageDealSize    String?
  salesCycle         String?
  excludedSectorsJson String             @default("[]")
  riskAppetite       String              @default("MEDIUM")
  active             Boolean             @default(true)
  isDefault          Boolean             @default(false)
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
  opportunityCards   OpportunityCard[]
  positioningExamples StrategicPositioningExample[]
}

model OpportunityCard {
  id                   String                        @id @default(cuid())
  eventCandidateId     String
  eventCandidate       EventCandidate                @relation(fields: [eventCandidateId], references: [id])
  revenueLensId        String?
  revenueLens          RevenueLens?                  @relation(fields: [revenueLensId], references: [id])
  title                String
  opportunityType      String
  summary              String
  buyerPain            String
  likelyBuyersJson     String                        @default("[]")
  affectedSectorsJson  String                        @default("[]")
  affectedRegionsJson  String                        @default("[]")
  suggestedOffer       String
  urgencyScore         Float
  commercialValueScore Float
  confidence           Float
  evidenceScore        Float
  actionabilityScore   Float
  opportunityLogic     String
  riskLogic            String
  nextBestAction       String
  status               String                        @default("NEW")
  isFixture            Boolean                       @default(false)
  createdAt            DateTime                      @default(now())
  updatedAt            DateTime                      @updatedAt
  positioningExamples  StrategicPositioningExample[]

  @@unique([eventCandidateId, revenueLensId])
}

model StrategicPositioningExample {
  id                String           @id @default(cuid())
  eventCandidateId  String
  eventCandidate    EventCandidate   @relation(fields: [eventCandidateId], references: [id])
  opportunityCardId String?
  opportunityCard   OpportunityCard? @relation(fields: [opportunityCardId], references: [id])
  evidenceArcId     String?
  revenueLensId     String?
  revenueLens       RevenueLens?     @relation(fields: [revenueLensId], references: [id])
  title             String
  userType          String
  positioningAngle  String
  howItCouldBeUsed  String
  whyItMayMatter    String
  evidenceSummary   String
  confidence        Float
  constraints       String
  isFixture         Boolean          @default(false)
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
}
```
Add the back-relations to `model EventCandidate` (after its existing relation fields):
```prisma
  opportunityCards     OpportunityCard[]
  positioningExamples  StrategicPositioningExample[]
```

- [ ] **Step 3: Migrate** — `npx prisma migrate dev --name phase3a_opportunity_positioning` (success + client regen; seed may run — fine).

- [ ] **Step 4: Seed default lens** — in `src/server/seed.ts`, after the source upserts inside `runSeed`, add:
```ts
  await prisma.revenueLens.upsert({
    where: { name: 'General Commercial Lens' },
    create: {
      name: 'General Commercial Lens',
      description: 'Broad default commercial context so opportunity conversion works out of the box.',
      userType: 'GENERAL',
      targetSectorsJson: '[]',
      targetRegionsJson: '[]',
      offerTypesJson: JSON.stringify(['ADVISORY', 'SALES', 'PARTNERSHIP']),
      buyerPersonasJson: '[]',
      excludedSectorsJson: '[]',
      riskAppetite: 'MEDIUM',
      active: true,
      isDefault: true,
    },
    update: { active: true, isDefault: true },
  })
```
(Return value unchanged — `sourcesSeeded` still counts sources only.)

- [ ] **Step 5: resetDb** — in `tests/helpers.ts`, add BEFORE `prisma.eventCandidate.deleteMany()` (they FK to it) and BEFORE `prisma.entity.deleteMany()`:
```ts
    prisma.strategicPositioningExample.deleteMany(),
    prisma.opportunityCard.deleteMany(),
```
and add anywhere after those two (RevenueLens has no inbound FK once cards/examples are gone), before `prisma.source.deleteMany()`:
```ts
    prisma.revenueLens.deleteMany(),
```

- [ ] **Step 6: Tests** — append to `tests/schema.test.ts`:
```ts
  it('creates an OpportunityCard and positioning example linked to an event, deduped per lens', async () => {
    const scanRun = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK',
        summary: 't', severity: 0.8, probability: 0.7, confidence: 0.8, evidenceCount: 2,
        sourceDiversityScore: 1, signalStrength: 0.8, noveltyScore: 0.9, opportunityScore: 0.2,
        riskScore: 0.7, createdFromScanRunId: scanRun.id, isFixture: true,
      },
    })
    const lens = await prisma.revenueLens.create({ data: { name: 'L1', isDefault: true } })
    const card = await prisma.opportunityCard.create({
      data: {
        eventCandidateId: event.id, revenueLensId: lens.id, title: 'Talent window', opportunityType: 'TALENT_ACQUISITION',
        summary: 's', buyerPain: 'p', suggestedOffer: 'o', urgencyScore: 0.6, commercialValueScore: 0.5,
        confidence: 0.8, evidenceScore: 0.7, actionabilityScore: 0.6, opportunityLogic: 'ol', riskLogic: 'rl',
        nextBestAction: 'review buyer groups', isFixture: true,
      },
    })
    await prisma.strategicPositioningExample.create({
      data: {
        eventCandidateId: event.id, opportunityCardId: card.id, revenueLensId: lens.id, title: 'For recruiters',
        userType: 'RECRUITER', positioningAngle: 'a', howItCouldBeUsed: 'may watch demand', whyItMayMatter: 'w',
        evidenceSummary: 'e', confidence: 0.8, constraints: 'Strategic example, not investment advice.', isFixture: true,
      },
    })
    expect(await prisma.opportunityCard.count()).toBe(1)
    await expect(
      prisma.opportunityCard.create({
        data: {
          eventCandidateId: event.id, revenueLensId: lens.id, title: 'dup', opportunityType: 'ADVISORY', summary: 's',
          buyerPain: 'p', suggestedOffer: 'o', urgencyScore: 0.5, commercialValueScore: 0.5, confidence: 0.5,
          evidenceScore: 0.5, actionabilityScore: 0.5, opportunityLogic: 'ol', riskLogic: 'rl', nextBestAction: 'review',
        },
      }),
    ).rejects.toThrow()
  })
```
Append to `tests/seed.test.ts` (in the `includeLive: false` test, after the source assertions):
```ts
    const lens = await prisma.revenueLens.findFirstOrThrow({ where: { isDefault: true } })
    expect(lens.name).toBe('General Commercial Lens')
```

- [ ] **Step 7: Verify + commit** — `npm test` (76), `npm run typecheck` clean.
```bash
git add -A && git commit -m "feat(3a): migration — RevenueLens, OpportunityCard, StrategicPositioningExample + default lens"
```

---

### Task 2: Advice-language safety guard

**Files:**
- Create: `src/server/safety/advice-language.ts`
- Test: `tests/safety/advice-language.test.ts`

**Interfaces:**
- Produces: `findAdviceLanguage(text: string): string[]`; `assertNoAdviceLanguage(text: string, context: string): void` (throws `AdviceLanguageError`); class `AdviceLanguageError extends Error`. Used by Tasks 3–4 services after rendering each field.

- [ ] **Step 1: Failing test** — `tests/safety/advice-language.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { AdviceLanguageError, assertNoAdviceLanguage, findAdviceLanguage } from '@/server/safety/advice-language'

describe('findAdviceLanguage', () => {
  it('passes permitted strategic language', () => {
    for (const ok of [
      'This public signal may be useful to someone watching this sector.',
      'A recruiter could watch for demand in interim support.',
      'This may indicate rising pressure; consider reviewing exposure.',
      'Strategic positioning example, not investment advice.',
    ]) {
      expect(findAdviceLanguage(ok)).toEqual([])
    }
  })

  it('flags each prohibited category', () => {
    expect(findAdviceLanguage('You should buy this stock now.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('Sell this instrument immediately.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('We recommend you hold this position.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('Target price of £45 with guaranteed returns.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('This is a risk-free profit opportunity.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('This will definitely happen, act now.').length).toBeGreaterThan(0)
    expect(findAdviceLanguage('Personalised financial advice for your portfolio.').length).toBeGreaterThan(0)
  })
})

describe('assertNoAdviceLanguage', () => {
  it('throws AdviceLanguageError listing matches, with context', () => {
    try {
      assertNoAdviceLanguage('You should buy now.', 'OpportunityCard.summary')
      throw new Error('did not throw')
    } catch (e) {
      expect(e).toBeInstanceOf(AdviceLanguageError)
      expect((e as Error).message).toContain('OpportunityCard.summary')
    }
  })
  it('does not throw on clean text', () => {
    expect(() => assertNoAdviceLanguage('This may help a team prepare.', 'ctx')).not.toThrow()
  })
})
```
Run `npm test` → FAIL (module missing).

- [ ] **Step 2: Implement** — `src/server/safety/advice-language.ts`:
```ts
/** Financial-advice language guard. Deterministic, case-insensitive. Fails closed:
 *  services call assertNoAdviceLanguage before persisting any generated text. */

export class AdviceLanguageError extends Error {
  constructor(context: string, matches: string[]) {
    super(`Prohibited financial-advice language in ${context}: ${matches.join('; ')}`)
    this.name = 'AdviceLanguageError'
  }
}

const PROHIBITED_ADVICE_PATTERNS: RegExp[] = [
  /\b(should|must|need to)\s+(buy|sell|hold|short|long)\b/i,
  /\b(buy|sell|hold)\s+(this|the|these|that)\s+(stock|share|shares|instrument|position|asset)\b/i,
  /\b(buy|sell)\s+(recommendation|rating|signal)\b/i,
  /\btarget\s+price\b/i,
  /\b(expected|projected|guaranteed)\s+(return|returns|profit|gains?)\b/i,
  /\bguarantee[ds]?\s+(profit|returns?|gains?)\b/i,
  /\brisk[-\s]?free\b/i,
  /\bwill\s+definitely\b/i,
  /\b(act|buy|sell)\s+now\b/i,
  /\b(personal|personalised|personalized)\s+(financial|investment|portfolio)\s+(advice|recommendation)\b/i,
  /\b(allocate|rebalance)\s+your\s+(portfolio|holdings)\b/i,
  /\bfinancial\s+advice\b/i,
]

export function findAdviceLanguage(text: string): string[] {
  const matches: string[] = []
  for (const pattern of PROHIBITED_ADVICE_PATTERNS) {
    const m = text.match(pattern)
    if (m) matches.push(m[0])
  }
  return matches
}

export function assertNoAdviceLanguage(text: string, context: string): void {
  const matches = findAdviceLanguage(text)
  if (matches.length > 0) throw new AdviceLanguageError(context, matches)
}
```
NOTE: "not investment advice" / "not financial advice" disclaimers must PASS. The patterns above require verb/recommendation forms, so the bare disclaimer phrase "not investment advice" does not match `financial\s+advice` unless the literal words "financial advice" appear — keep disclaimers worded as "not investment advice" (Task 4 uses exactly that). If a disclaimer must contain "financial advice", the guard would wrongly flag it — so disclaimers use "investment advice".

- [ ] **Step 3: Verify + commit** — `npm test` (80), typecheck clean.
```bash
git add -A && git commit -m "feat(3a): financial-advice language guard (fails closed)"
```

---

### Task 3: Opportunity conversion + scoring service

**Files:**
- Create: `src/server/pipeline/opportunity.ts`
- Test: `tests/pipeline/opportunity.test.ts`

**Interfaces:**
- Consumes: `EventCandidate`, `RevenueLens` (or null → treated as default/broad), `assertNoAdviceLanguage`.
- Produces:
  - `mapEventToOpportunity(eventType: string): { primary: OpportunityType; alternates: OpportunityType[] } | null` (pure).
  - `scoreOpportunity(event: EventCandidate, lens: RevenueLens | null): { evidenceScore; confidence; urgencyScore; commercialValueScore; actionabilityScore }` (pure, all 2dp).
  - `isEligible(event: EventCandidate, lens: RevenueLens | null): boolean` (pure).
  - `generateOpportunities(events: EventCandidate[], lens: RevenueLens | null): Promise<{ created: OpportunityCard[]; updated: OpportunityCard[]; errors: PipelineError[] }>` — creates/updates cards deduped on `(eventCandidateId, revenueLensId)`; lifecycle-safe (RISING on higher value/confidence; sticky ESCALATED/DISMISSED/ACTIONED); every rendered field passes `assertNoAdviceLanguage`.
- Binding rules per the spec §5. Formulas exactly as written there.

- [ ] **Step 1: Failing tests** — `tests/pipeline/opportunity.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import {
  generateOpportunities, isEligible, mapEventToOpportunity, scoreOpportunity,
} from '@/server/pipeline/opportunity'
import { resetDb } from '../helpers'
import type { EventCandidate, RevenueLens } from '@prisma/client'

function fakeEvent(over: Partial<EventCandidate> = {}): EventCandidate {
  return {
    id: 'e1', title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK',
    summary: 's', status: 'NEW', severity: 0.8, probability: 0.7, confidence: 0.8, timeWindowStart: null,
    timeWindowEnd: null, firstDetectedAt: new Date(), lastUpdatedAt: new Date(), primaryEntityId: null,
    affectedSector: 'technology', affectedRegion: 'UK', evidenceCount: 2, sourceDiversityScore: 1,
    signalStrength: 0.8, noveltyScore: 0.9, opportunityScore: 0.2, riskScore: 0.7,
    createdFromScanRunId: 'sr1', isFixture: true, createdAt: new Date(),
    ...over,
  } as EventCandidate
}

describe('mapEventToOpportunity (pure)', () => {
  it('maps event types to opportunity types', () => {
    expect(mapEventToOpportunity('LAYOFF_SIGNAL')?.primary).toBe('TALENT_ACQUISITION')
    expect(mapEventToOpportunity('PROCUREMENT_INCREASE')?.primary).toBe('PROCUREMENT')
    expect(mapEventToOpportunity('REGULATORY_PRESSURE')?.primary).toBe('COMPLIANCE')
    expect(mapEventToOpportunity('DEMAND_SPIKE')?.primary).toBe('SALES')
    expect(mapEventToOpportunity('SUPPLY_CHAIN_PRESSURE')?.primary).toBe('COMPETITOR_DISPLACEMENT')
    expect(mapEventToOpportunity('SOMETHING_UNKNOWN')?.primary).toBe('CONTENT')
  })
})

describe('scoreOpportunity (pure)', () => {
  it('never exceeds event confidence and clamps to [0,1]', () => {
    const s = scoreOpportunity(fakeEvent(), null)
    expect(s.confidence).toBeLessThanOrEqual(0.8)
    for (const v of Object.values(s)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) }
  })
})

describe('isEligible (pure)', () => {
  it('skips dismissed events and excluded sectors', () => {
    expect(isEligible(fakeEvent(), null)).toBe(true)
    expect(isEligible(fakeEvent({ status: 'DISMISSED' }), null)).toBe(false)
    const lens = { excludedSectorsJson: JSON.stringify(['technology']) } as RevenueLens
    expect(isEligible(fakeEvent(), lens)).toBe(false)
  })
})

describe('generateOpportunities (persistence)', () => {
  beforeEach(resetDb)

  async function seedEvent(over: Partial<EventCandidate> = {}) {
    const sr = await prisma.scanRun.create({ data: {} })
    return prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 's',
        severity: 0.8, probability: 0.7, confidence: 0.8, affectedSector: 'technology', affectedRegion: 'UK',
        evidenceCount: 2, sourceDiversityScore: 1, signalStrength: 0.8, noveltyScore: 0.9, opportunityScore: 0.2,
        riskScore: 0.7, createdFromScanRunId: sr.id, isFixture: true, ...over,
      },
    })
  }

  it('creates a card linked to its event with clean non-advisory text', async () => {
    const event = await seedEvent()
    const { created, errors } = await generateOpportunities([event], null)
    expect(errors).toHaveLength(0)
    expect(created).toHaveLength(1)
    const card = created[0]
    expect(card.eventCandidateId).toBe(event.id)
    expect(card.opportunityType).toBe('TALENT_ACQUISITION')
    expect(card.isFixture).toBe(true)
    for (const field of [card.title, card.summary, card.buyerPain, card.suggestedOffer, card.opportunityLogic, card.riskLogic, card.nextBestAction]) {
      expect(findAdviceLanguage(field)).toEqual([])
    }
  })

  it('updates rather than duplicates on a second run, marking RISING when value rises', async () => {
    const event = await seedEvent()
    const lens = await prisma.revenueLens.create({ data: { name: 'L', isDefault: true } })
    await generateOpportunities([event], lens)
    const stronger = await prisma.eventCandidate.update({ where: { id: event.id }, data: { confidence: 0.95, riskScore: 0.9 } })
    const second = await generateOpportunities([stronger], lens)
    expect(second.created).toHaveLength(0)
    expect(second.updated).toHaveLength(1)
    expect(second.updated[0].status).toBe('RISING')
    expect(await prisma.opportunityCard.count()).toBe(1)
  })

  it('never overwrites a dismissed card', async () => {
    const event = await seedEvent()
    const lens = await prisma.revenueLens.create({ data: { name: 'L', isDefault: true } })
    const first = await generateOpportunities([event], lens)
    await prisma.opportunityCard.update({ where: { id: first.created[0].id }, data: { status: 'DISMISSED' } })
    const second = await generateOpportunities([event], lens)
    expect(second.updated[0].status).toBe('DISMISSED')
  })

  it('skips excluded-sector events', async () => {
    const event = await seedEvent()
    const lens = await prisma.revenueLens.create({ data: { name: 'L', excludedSectorsJson: JSON.stringify(['technology']) } })
    const { created } = await generateOpportunities([event], lens)
    expect(created).toHaveLength(0)
  })
})
```
Run `npm test` → FAIL (module missing).

- [ ] **Step 2: Implement** — `src/server/pipeline/opportunity.ts`. Follow the spec §5 formulas EXACTLY. Structure:
```ts
import type { EventCandidate, OpportunityCard, RevenueLens } from '@prisma/client'
import { prisma } from '@/server/db'
import type { OpportunityType } from '@/shared/enums'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import type { PipelineError } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp01 = (n: number) => Math.max(0, Math.min(1, n))
const STICKY = ['ESCALATED', 'DISMISSED', 'ACTIONED']

const TYPE_MAP: Record<string, { primary: OpportunityType; alternates: OpportunityType[] }> = {
  LAYOFF_SIGNAL: { primary: 'TALENT_ACQUISITION', alternates: ['CRISIS_SUPPORT', 'ADVISORY'] },
  HIRING_SLOWDOWN: { primary: 'TALENT_ACQUISITION', alternates: ['ADVISORY'] },
  EXECUTIVE_EXIT: { primary: 'HIRING', alternates: ['ADVISORY'] },
  EXECUTIVE_HIRE: { primary: 'SALES', alternates: ['PARTNERSHIP'] },
  HIRING_ACCELERATION: { primary: 'SALES', alternates: ['CONTENT'] },
  FUNDING_SIGNAL: { primary: 'SALES', alternates: ['PARTNERSHIP'] },
  CASH_PRESSURE: { primary: 'ADVISORY', alternates: ['M_AND_A', 'CRISIS_SUPPORT'] },
  LEGAL_PRESSURE: { primary: 'ADVISORY', alternates: ['CRISIS_SUPPORT'] },
  REGULATORY_PRESSURE: { primary: 'COMPLIANCE', alternates: ['ADVISORY'] },
  PROCUREMENT_INCREASE: { primary: 'PROCUREMENT', alternates: ['SALES', 'MARKET_ENTRY'] },
  DEMAND_SPIKE: { primary: 'SALES', alternates: ['PRODUCT_GAP', 'MARKET_ENTRY'] },
  SUPPLY_CHAIN_PRESSURE: { primary: 'COMPETITOR_DISPLACEMENT', alternates: ['PARTNERSHIP'] },
  PRODUCT_MOMENTUM: { primary: 'PARTNERSHIP', alternates: ['CONTENT'] },
}

export function mapEventToOpportunity(eventType: string) {
  return TYPE_MAP[eventType] ?? { primary: 'CONTENT' as OpportunityType, alternates: [] }
}

function parseJson(s: string): string[] { try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] } }

export function isEligible(event: EventCandidate, lens: RevenueLens | null): boolean {
  if (event.status === 'DISMISSED') return false
  if (lens && event.affectedSector && parseJson(lens.excludedSectorsJson).includes(event.affectedSector)) return false
  const mappable = TYPE_MAP[event.eventType] !== undefined
  if (!mappable && event.confidence < 0.45) return false
  return true
}

function lensFitFactor(event: EventCandidate, lens: RevenueLens | null): number {
  if (!lens || lens.isDefault) return 1
  const sectors = parseJson(lens.targetSectorsJson)
  const regions = parseJson(lens.targetRegionsJson)
  if (sectors.length === 0 && regions.length === 0) return 1
  const sectorMatch = event.affectedSector ? sectors.includes(event.affectedSector) : false
  const regionMatch = event.affectedRegion ? regions.includes(event.affectedRegion) : false
  if (sectorMatch) return 1
  if (regionMatch) return 0.7
  return 0.85
}

export function scoreOpportunity(event: EventCandidate, lens: RevenueLens | null) {
  const evidenceScore = round2(clamp01(event.sourceDiversityScore * (0.6 + 0.1 * Math.min(event.evidenceCount, 4))))
  const confidence = round2(clamp01(event.confidence * lensFitFactor(event, lens)))
  const urgencyScore = round2(clamp01(0.4 * event.probability + 0.4 * event.severity + 0.2 * event.noveltyScore))
  const lensValueSignal = 0.5 // averageDealSize bucket placeholder (default lens)
  const commercialValueScore = round2(clamp01(0.5 * Math.max(event.riskScore, event.opportunityScore) + 0.3 * lensValueSignal + 0.2 * urgencyScore))
  const actionabilityScore = round2(clamp01(0.5 * confidence + 0.3 * evidenceScore + 0.2 * (event.primaryEntityId ? 1 : 0.5)))
  return { evidenceScore, confidence, urgencyScore, commercialValueScore, actionabilityScore }
}
```
Then a `renderCardText(event, primary, alternates, scores)` helper that builds `title, summary, buyerPain, likelyBuyers[], suggestedOffer, opportunityLogic, riskLogic, nextBestAction` from per-opportunityType templates using ONLY permitted verbs (may/could/watch/prepare/investigate/review/monitor/consider); e.g. for TALENT_ACQUISITION: buyerPain "Organisations in {sector} may face pressure that releases experienced staff and disrupts teams."; suggestedOffer "A recruiter or workforce partner could prepare interim, outplacement or redeployment support for affected {sector} teams."; nextBestAction "Review which {sector} employers may face similar pressure next." Each rendered field passes `assertNoAdviceLanguage(field, 'OpportunityCard.<field>')` before return. Provide templates for every primary type in TYPE_MAP plus CONTENT/default.

`generateOpportunities`: for each event, `if (!isEligible) continue`; compute scores; render text; look up existing card by `findUnique({ where: { eventCandidateId_revenueLensId: { eventCandidateId: event.id, revenueLensId: lens?.id ?? null } } })`. If none → create (status NEW). If exists → compute `rising = commercialValueScore > existing.commercialValueScore || confidence > existing.confidence`; `status = STICKY.includes(existing.status) ? existing.status : rising ? 'RISING' : existing.status`; update scores + text + status. Wrap each event in try/catch → PipelineError stage `'opportunity'`. Return `{ created, updated, errors }`.

NOTE on the composite unique with a nullable column: Prisma treats `revenueLensId: null` in the composite `@@unique` — use `findFirst({ where: { eventCandidateId, revenueLensId } })` if the generated `findUnique` composite input rejects null; both are acceptable, prefer `findFirst` for null-safety.

- [ ] **Step 3: Verify + commit** — `npm test` (84), typecheck clean.
```bash
git add -A && git commit -m "feat(3a): deterministic opportunity conversion + scoring (lens-aware, lifecycle-safe, guard-clean)"
```

---

### Task 4: Strategic positioning service

**Files:**
- Create: `src/server/pipeline/positioning.ts`
- Test: `tests/pipeline/positioning.test.ts`

**Interfaces:**
- Consumes: `EventCandidate`, `OpportunityCard`, `RevenueLens | null`, guard.
- Produces: `generatePositioning(cards: OpportunityCardWithEvent[], lens: RevenueLens | null): Promise<{ created: StrategicPositioningExample[]; errors: PipelineError[] }>` where `type OpportunityCardWithEvent = OpportunityCard & { eventCandidate: EventCandidate }`. Deletes+recreates a card's examples on regenerate (mirrors gap regeneration) so they reflect current evidence. Also `opportunityTypeToUserTypes(t: OpportunityType): PositioningUserType[]` (pure). 1–3 examples per card; every field guard-clean; `constraints` always ends with "Strategic positioning example, not investment advice; verify against primary sources."

- [ ] **Step 1: Failing tests** — `tests/pipeline/positioning.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { generatePositioning, opportunityTypeToUserTypes } from '@/server/pipeline/positioning'
import { resetDb } from '../helpers'

describe('opportunityTypeToUserTypes (pure)', () => {
  it('keys user types off opportunity type', () => {
    expect(opportunityTypeToUserTypes('TALENT_ACQUISITION')).toContain('RECRUITER')
    expect(opportunityTypeToUserTypes('PROCUREMENT')).toContain('PROCUREMENT')
    expect(opportunityTypeToUserTypes('COMPLIANCE')).toContain('ADVISOR')
  })
})

describe('generatePositioning', () => {
  beforeEach(resetDb)

  async function seedCard() {
    const sr = await prisma.scanRun.create({ data: {} })
    const event = await prisma.eventCandidate.create({
      data: {
        title: 'Layoff pressure — technology (UK)', eventType: 'LAYOFF_SIGNAL', eventClass: 'RISK', summary: 's',
        severity: 0.8, probability: 0.7, confidence: 0.8, affectedSector: 'technology', affectedRegion: 'UK',
        evidenceCount: 2, sourceDiversityScore: 1, signalStrength: 0.8, noveltyScore: 0.9, opportunityScore: 0.2,
        riskScore: 0.7, createdFromScanRunId: sr.id, isFixture: true,
      },
    })
    const card = await prisma.opportunityCard.create({
      data: {
        eventCandidateId: event.id, title: 'Talent window', opportunityType: 'TALENT_ACQUISITION', summary: 's',
        buyerPain: 'p', suggestedOffer: 'o', urgencyScore: 0.6, commercialValueScore: 0.5, confidence: 0.8,
        evidenceScore: 0.7, actionabilityScore: 0.6, opportunityLogic: 'ol', riskLogic: 'rl',
        nextBestAction: 'review buyer groups', isFixture: true,
      },
    })
    return { ...card, eventCandidate: event }
  }

  it('creates guard-clean examples keyed to user types, with the non-advisory constraint', async () => {
    const card = await seedCard()
    const { created, errors } = await generatePositioning([card], null)
    expect(errors).toHaveLength(0)
    expect(created.length).toBeGreaterThanOrEqual(1)
    for (const ex of created) {
      for (const f of [ex.title, ex.positioningAngle, ex.howItCouldBeUsed, ex.whyItMayMatter, ex.evidenceSummary, ex.constraints]) {
        expect(findAdviceLanguage(f)).toEqual([])
      }
      expect(ex.constraints).toContain('not investment advice')
      expect(ex.eventCandidateId).toBe(card.eventCandidateId)
      expect(ex.opportunityCardId).toBe(card.id)
    }
  })

  it('regenerates (delete + recreate) on a second call, no accumulation', async () => {
    const card = await seedCard()
    await generatePositioning([card], null)
    const n1 = await prisma.strategicPositioningExample.count()
    await generatePositioning([card], null)
    const n2 = await prisma.strategicPositioningExample.count()
    expect(n2).toBe(n1)
  })
})
```
Run `npm test` → FAIL.

- [ ] **Step 2: Implement** — `src/server/pipeline/positioning.ts`. `opportunityTypeToUserTypes` map: TALENT_ACQUISITION/HIRING → [RECRUITER]; PROCUREMENT → [PROCUREMENT, SUPPLIER]; SALES/PARTNERSHIP → [SUPPLIER]; COMPLIANCE/ADVISORY → [ADVISOR]; PRODUCT_GAP → [PRODUCT_TEAM]; MARKET_ENTRY/COMPETITOR_DISPLACEMENT → [SUPPLIER]; M_AND_A/CRISIS_SUPPORT → [ADVISOR]; INVESTMENT_WATCH → [INVESTOR_WATCH]; CONTENT/default → [ANALYST, GENERAL]. For each card, take up to 3 user types, render an example per type with permitted verbs; `evidenceSummary` = `\`Based on ${event.evidenceCount} piece(s) of evidence across a source-diversity score of ${event.sourceDiversityScore.toFixed(2)} for "${event.title}".\``; `constraints` = `\`Strategic positioning example, not investment advice; verify against primary sources.\``; `confidence` = card.confidence; guard every field. Persist with delete-then-create per card (`deleteMany({ where: { opportunityCardId: card.id } })` then creates), inside per-card try/catch → PipelineError stage `'positioning'`.

- [ ] **Step 3: Verify + commit** — `npm test` (86), typecheck clean.
```bash
git add -A && git commit -m "feat(3a): strategic positioning examples (non-advisory, guard-enforced, user-type keyed)"
```

---

### Task 5: Pipeline integration

**Files:**
- Modify: `prisma/schema.prisma` (3 ScanRun counters — needs a migration), `src/server/pipeline/orchestrator.ts`
- Test: modify `tests/pipeline/orchestrator.test.ts`, `tests/e2e-proof.test.ts`

**Interfaces:**
- ScanRun gains `opportunityCardsCreated Int @default(0)`, `opportunityCardsUpdated Int @default(0)`, `positioningExamplesCreated Int @default(0)`. `ScanSummary.counts` gains the same three keys. Orchestrator runs the opportunity + positioning stages after gaps, over `allEvents` (new + updated), against the active RevenueLens (`findFirst({ where: { active: true, isDefault: true } })` ?? first active ?? null).

- [ ] **Step 1: Migration** — add the three Int columns to `model ScanRun`, then `npx prisma migrate dev --name phase3a_scanrun_opportunity_counters`.

- [ ] **Step 2: Tests first** — in `tests/pipeline/orchestrator.test.ts` first test append:
```ts
    expect(summary.counts.opportunityCardsCreated).toBeGreaterThan(0)
    expect(summary.counts.positioningExamplesCreated).toBeGreaterThan(0)
    const cards = await prisma.opportunityCard.findMany()
    expect(cards.every((c) => c.isFixture)).toBe(true)
    // every card links to an event that exists
    for (const c of cards) {
      expect(await prisma.eventCandidate.count({ where: { id: c.eventCandidateId } })).toBe(1)
    }
```
In `tests/e2e-proof.test.ts`, add a new `it`:
```ts
  it('generates commercial opportunities and positioning from scan events, guard-clean', async () => {
    const cards = await prisma.opportunityCard.findMany()
    expect(cards.length).toBeGreaterThan(0)
    const examples = await prisma.strategicPositioningExample.findMany()
    expect(examples.length).toBeGreaterThan(0)
    const { findAdviceLanguage } = await import('@/server/safety/advice-language')
    for (const c of cards) expect(findAdviceLanguage(`${c.summary} ${c.buyerPain} ${c.suggestedOffer} ${c.nextBestAction}`)).toEqual([])
    for (const e of examples) expect(findAdviceLanguage(`${e.howItCouldBeUsed} ${e.whyItMayMatter} ${e.constraints}`)).toEqual([])
  })
```
Add `import` for these symbols as needed. Run `npm test` → the new assertions FAIL.

- [ ] **Step 3: Implement** — in `orchestrator.ts`: add the three counters to the `counts` object and `ScanSummary.counts` type. Import `generateOpportunities` from `./opportunity` and `generatePositioning` from `./positioning`. After the gaps stage:
```ts
    // 13. Commercial opportunity conversion + strategic positioning (deterministic).
    const lens =
      (await prisma.revenueLens.findFirst({ where: { active: true, isDefault: true } })) ??
      (await prisma.revenueLens.findFirst({ where: { active: true } }))
    const opps = await generateOpportunities(allEvents, lens)
    errors.push(...opps.errors)
    counts.opportunityCardsCreated = opps.created.length
    counts.opportunityCardsUpdated = opps.updated.length
    const cardsWithEvents = [...opps.created, ...opps.updated].map((c) => ({
      ...c,
      eventCandidate: allEvents.find((e) => e.id === c.eventCandidateId)!,
    }))
    const positioning = await generatePositioning(cardsWithEvents, lens)
    errors.push(...positioning.errors)
    counts.positioningExamplesCreated = positioning.created.length
```
(`allEvents` already exists from Phase 2a. `...counts` spread into `scanRun.update` picks up the new columns.)

- [ ] **Step 4: Verify + commit** — `npm test` (87+), typecheck clean.
```bash
git add -A && git commit -m "feat(3a): wire opportunity + positioning stages into the scan orchestrator"
```

---

### Task 6: API, services, UI, docs

**Files:**
- Create: `src/server/services/opportunities.ts`, `src/app/api/opportunities/route.ts`, `src/app/api/opportunities/[id]/route.ts`, `src/app/api/revenue-lenses/route.ts`, `src/app/opportunities/[id]/page.tsx`, `src/components/OpportunityCard.tsx`, `src/components/OpportunityActions.tsx`
- Modify: `src/server/services/dashboard.ts`, `src/app/page.tsx`, `src/app/events/[id]/page.tsx`
- Create: `docs/opportunity-conversion-engine.md`, `docs/strategic-positioning-rules.md`
- Test: modify `tests/api/api.test.ts`

**Interfaces:**
- `src/server/services/opportunities.ts` (serialized, ISO dates):
  - `type OpportunityCardData = { id; eventId; title; opportunityType; summary; buyerPain; likelyBuyers: string[]; suggestedOffer; affectedSectors: string[]; affectedRegions: string[]; urgencyScore; commercialValueScore; confidence; evidenceScore; actionabilityScore; nextBestAction; status; isFixture; updatedAt }`.
  - `type PositioningExampleData = { id; userType; title; positioningAngle; howItCouldBeUsed; whyItMayMatter; evidenceSummary; confidence; constraints; isFixture }`.
  - `type OpportunityDetail = { card: OpportunityCardData & { opportunityLogic; riskLogic }; event: { id; title; eventType; affectedSector; affectedRegion; confidence }; positioning: PositioningExampleData[] }`.
  - `getOpportunityRadar(): Promise<OpportunityCardData[]>` (DISMISSED excluded, order by commercialValueScore desc then updatedAt desc, take 24).
  - `getOpportunityDetail(id): Promise<OpportunityDetail | null>`.
  - `updateOpportunityStatus(id, action: 'ESCALATE'|'DISMISS'|'ACTION'): Promise<{ id; status } | null>` (ESCALATE→ESCALATED, DISMISS→DISMISSED, ACTION→ACTIONED).
  - `getOpportunitiesForEvent(eventId): Promise<OpportunityCardData[]>`.
  - `getRevenueLenses(): Promise<{ id; name; userType; isDefault; active }[]>`.
- `DashboardData` gains `opportunityRadar: OpportunityCardData[]` (replaces the event-derived opportunity radar as the "commercial" radar — keep the event-level Opportunity Radar section too, renamed "Opportunity Signals"; the new commercial one is "Opportunity Radar"). API contracts mirror the existing events API (201/200/400/404, Zod on PATCH, `Response.json`, params as `Promise<{id}>`, no `next/server` import, no raw `*Json` leak).

- [ ] **Step 1: Tests first** — in `tests/api/api.test.ts` second describe (post-scan), add:
```ts
  it('GET /api/opportunities returns commercial cards from the scan', async () => {
    const { GET } = await import('@/app/api/opportunities/route')
    const res = await GET()
    const body = await res.json()
    expect(body.length).toBeGreaterThan(0)
    expect(body[0].opportunityType).toBeTruthy()
    expect(body[0].likelyBuyers).toBeInstanceOf(Array)
  })

  it('GET + PATCH /api/opportunities/[id] returns detail and updates status', async () => {
    const card = await prisma.opportunityCard.findFirstOrThrow()
    const { GET, PATCH } = await import('@/app/api/opportunities/[id]/route')
    const detail = await GET(new Request('http://t/'), { params: Promise.resolve({ id: card.id }) })
    const body = await detail.json()
    expect(body.card.id).toBe(card.id)
    expect(body.positioning).toBeInstanceOf(Array)
    const patched = await PATCH(
      new Request('http://t/', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'DISMISS' }) }),
      { params: Promise.resolve({ id: card.id }) },
    )
    expect(patched.status).toBe(200)
    expect((await patched.json()).status).toBe('DISMISSED')
    const bad = await PATCH(
      new Request('http://t/', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'NOPE' }) }),
      { params: Promise.resolve({ id: card.id }) },
    )
    expect(bad.status).toBe(400)
  })
```
Run `npm test` → FAIL (routes missing).

- [ ] **Step 2: Implement service + routes** — write `src/server/services/opportunities.ts` per the interface above (parse `*Json` fields into arrays; serialize dates; the PATCH map ESCALATE/DISMISS/ACTION → statuses). Routes are thin wrappers returning `Response.json`, Zod `z.object({ action: z.enum(['ESCALATE','DISMISS','ACTION']) })` on PATCH (400 invalid / 404 unknown), following `src/app/api/events/[id]/route.ts` exactly as the pattern. `revenue-lenses/route.ts` returns `getRevenueLenses()`. Add `opportunityRadar: await getOpportunityRadar()` to `getDashboardData()` and the `DashboardData` type.

- [ ] **Step 3: Implement UI** — follow the existing `src/components/EventCard.tsx`, `badges.tsx`, `EventActions.tsx`, and page patterns exactly (dark radar-room Tailwind, FixtureBadge, en-GB dates, `'use client'` only on the interactive action component):
  - `OpportunityCard.tsx` (server component, link to `/opportunities/[id]`): title, an opportunity-type chip, buyerPain (2 lines), suggestedOffer (2 lines), a 4-stat grid (commercialValue/urgency/confidence/evidence as %), nextBestAction line, FIXTURE badge, status badge.
  - `OpportunityActions.tsx` (`'use client'`): Escalate / Action / Dismiss buttons → `PATCH /api/opportunities/[id]` → `router.refresh()`; error line on failure (mirror `EventActions.tsx`).
  - `/opportunities/[id]/page.tsx` (server, `dynamic = 'force-dynamic'`): header (title, type chip, status, FIXTURE, link back to source event `/events/[eventId]`), the 5 score tiles, opportunityLogic + riskLogic panels (rose/emerald like the event page), buyerPain + suggestedOffer + likelyBuyers list, positioning examples list (each: userType chip, howItCouldBeUsed, whyItMayMatter, evidenceSummary, constraints in muted text), and a footer disclaimer: "This view provides public market context and strategic interpretation examples. It does not provide personal investment advice, portfolio advice, or buy, sell or hold recommendations." + `notFound()` when missing.
  - `page.tsx` (dashboard): UPGRADE the "Opportunity Radar" section to render `data.opportunityRadar` via `OpportunityCard`; rename the existing event-derived opportunity section to "Opportunity Signals". Add a top-nav "Opportunities" count near the stat tiles is optional. Keep everything else.
  - `events/[id]/page.tsx`: add a Section "Opportunities & positioning" listing `getOpportunitiesForEvent(event.id)` as compact links to `/opportunities/[id]`; empty-state text when none.

- [ ] **Step 4: Docs** — `docs/opportunity-conversion-engine.md` (eligibility, type map, the five score formulas verbatim, lifecycle/dedupe, "not every event converts", the guard) and `docs/strategic-positioning-rules.md` (permitted verbs, prohibited categories, the guard mechanism, user-type keying, the mandatory disclaimer). Plain, accurate, no invented numbers.

- [ ] **Step 5: Verify + commit** — `npm test` (89+), typecheck clean, `npm run build` clean (routes `/opportunities/[id]`, `/api/opportunities`, `/api/opportunities/[id]`, `/api/revenue-lenses` listed). Manual: dev server (PORT=3210) → dashboard shows commercial Opportunity Radar → open a card → positioning + disclaimer render.
```bash
git add -A && git commit -m "feat(3a): opportunity API + Opportunity Radar UI + positioning page + docs"
```

---

## Plan Self-Review Notes

- Spec §3 models ↔ Task 1; §4 guard ↔ Task 2; §5 conversion ↔ Task 3; §6 positioning ↔ Task 4; §7 pipeline ↔ Task 5; §8 API/UI + §9 docs ↔ Task 6.
- Advice-guard coverage: Task 2 unit tests the guard; Tasks 3–4 assert generated output is guard-clean; Task 5's e2e asserts the same over real scan output — a prohibited template would fail CI at three layers.
- Type-consistency: `OpportunityCardWithEvent` (Task 4 in, Task 5 constructs); `ScanSummary.counts` three new keys (Task 5); `OpportunityCardData`/`OpportunityDetail` (Task 6 service → UI). Composite-unique null-handling flagged in Task 3 (use `findFirst`).
- Test-count arithmetic is indicative ("full suite green" is the binding gate): 74 → T1 76 → T2 80 → T3 84 → T4 86 → T5 87+ → T6 89+.
- Deferred (later phases), not gaps: evidenceArcId stays null (3b); LLM-enhanced rendering (3d); market/instrument opportunity flavour (3e); full RevenueLens CRUD UI (3f).

