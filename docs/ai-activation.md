# Activating Archlight's AI enrichment

Everything below is **off by default and free** until you complete all of
steps 1–4. Scans never call the AI — enrichment is on-demand only.

## Turn it on

1. **Install the SDK** (once): `npm install`
2. **Add your key** to `.env` (this file is git-ignored — never commit it):

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Write the real model IDs** into the database: `npm run db:seed`
4. **Turn the models on**: `npx tsx scripts/llm-activate.ts on`

Then open any event's deep report and click **Enhance with AI** (top of the
Companies tab). It enriches that one event:

- an AI "why" for each **named** company (never invented — only companies
  already in the evidence), and
- a historic / present / future narrative plus a one-line executive brief.

Enriched text is **saved** (click once, keep it), shown with an "AI-enhanced"
marker, and only kept if it passes the no-advice + grounding checks. If any
check fails, the built-in deterministic version stands.

## Models (Balanced tier)

| Job | Model |
|---|---|
| Company impact reasoning ("who benefits / is harmed & why") | **Claude Opus 4.8** |
| Context + report writing | Claude Sonnet 5 |
| Mechanical tasks (extraction, classification, safety) | Claude Haiku 4.5 |

You can change the tier later by editing the model IDs in
`src/server/seed.ts` and re-running `npm run db:seed`.

## Turn it off

```
npx tsx scripts/llm-activate.ts off
```

…or remove `ANTHROPIC_API_KEY` from `.env`. Either alone makes the whole layer
dormant again — the app keeps working with its deterministic output.

## What it costs

Nothing until you activate, then only per click. A single **Enhance** makes a
few short calls for that one event (roughly: one Opus call per named company +
one Sonnet call for the narrative). It never runs during scans, so cost tracks
your clicks, not how much Archlight ingests. Every call is logged to `LLMRun`
with a token count and cost estimate you can inspect.

## Before exposing Archlight with AI on

If you ever run Archlight anywhere other than your own machine, **set
`ARCHLIGHT_AUTH_TOKEN`** first (see `docs/security-hardening.md`) — otherwise the
unauthenticated "Enhance" endpoint could be looped to run up charges. The daily
call cap (`LLM_DAILY_CALL_CAP`, default 100) and per-event cooldown bound spend,
but authentication is the real control. In production the app fails closed
(denies everything) until the token is set.
