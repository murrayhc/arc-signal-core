# Archlight — Autonomous Public Intelligence Radar

Archlight scans configured public data sources, converts evidence into signals,
clusters signals into emerging events, scores them for risk and opportunity,
and surfaces them on a live dashboard for deeper interrogation. No company
upload or selection is ever required — event discovery is the product.

Outputs are strategic intelligence, not financial advice.

## Stack

Next.js 15 (App Router) · TypeScript · Prisma + SQLite · Zod · Vitest · Tailwind CSS.
The intelligence pipeline is deterministic and rule-based (v1) — every score is
explainable and reproducible offline.

## Setup

```bash
npm install
cp .env.example .env        # local SQLite path, no secrets
npm run db:migrate          # apply migrations (creates prisma/dev.db)
npm run db:seed             # seed sources: 2 fixture wires, 1 unsupported, BBC RSS
```

## Run

```bash
npm run dev                 # http://localhost:3000
```

Open the dashboard and click **Run scan**. The scan collects from all active
supported sources (the bundled fixture wires always work offline; BBC RSS is
used when the network allows), then detection results appear as risk and
opportunity cards. Click any card for the interrogation view: evidence trail,
confidence, source diversity, data gaps, trigger conditions and actions.

Fixture-derived records are badged **FIXTURE** everywhere. They are never
presented as live evidence.

Repeat scans update existing events rather than duplicating them — corroborated
events are marked RISING. Source health and the full scan audit trail live at
/admin/sources and /scans.

Archlight is a local-only MVP: the scan endpoint is unauthenticated until the
deferred security-hardening pass. Do not deploy it exposed to a network.

## Test

```bash
npm test                    # includes tests/e2e-proof.test.ts — the full
                            # scan→dashboard acceptance proof on fixture sources
npm run typecheck
```

## Scan pipeline

```
Sources → collect (dedupe, raw evidence preserved) → parse → claims →
signals → clusters → event candidates → risk/opportunity classification →
dashboard feed + data gaps + trigger conditions
```

One failed source never fails a scan; every error is recorded on the ScanRun
and shown on the dashboard. See `docs/autonomous-radar-proof.md` for the
recorded end-to-end proof and `docs/superpowers/specs/` for the design spec.

## Deferred (post-spine)

Human review queue · watchlist & alerts · backtesting loop ·
security-hardening pass · deployment runbook · LLM enrichment · entity
resolution.
