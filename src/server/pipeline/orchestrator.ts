import { prisma } from '@/server/db'
import { collectFromSources } from './collect'
import { parseDocuments } from './parse'
import { extractClaims } from './claims'
import { createSignals } from './signals'
import { clusterSignals } from './cluster'
import { createEventCandidates } from './events'
import { classifyEvents } from './classify'
import { generateGapsAndTriggers } from './gaps'
import { generateOpportunities } from './opportunity'
import { generatePositioning } from './positioning'
import { updateSourceHealth } from './health'
import { syncGraphForEvents } from '@/server/graph/builder'
import { persistEventMomentum, recordGraphEvents } from '@/server/graph/timeline'
import { runEvidenceDepth } from '@/server/evidence/depth-pipeline'
import { runConsequenceSynthesis } from '@/server/consequence/consequence-pipeline'
import type { PipelineError } from './types'

export type ScanSummary = {
  scanRunId: string
  status: string
  startedAt: string
  completedAt: string | null
  message: string
  counts: {
    sourcesScanned: number
    sourcesSkipped: number
    documentsFetched: number
    claimsExtracted: number
    signalsCreated: number
    clustersCreated: number
    eventCandidatesCreated: number
    eventCandidatesUpdated: number
    dashboardFeedItemsCreated: number
    opportunityCardsCreated: number
    opportunityCardsUpdated: number
    positioningExamplesCreated: number
    graphNodesUpserted: number
    graphEdgesUpserted: number
    atomicClaimsExtracted: number
    canonicalClaimsCreated: number
    canonicalClaimsUpdated: number
    claimClustersUpserted: number
    lineageRecordsCreated: number
    investigationQueriesGenerated: number
    companyImpactsCreated: number
    contextSynthesesCreated: number
    futureScenariosCreated: number
    signalsQuarantined: number
  }
  errors: PipelineError[]
  warnings: PipelineError[]
}

export async function runFullScan(
  options: { scanType?: string; dueOnly?: boolean } = {},
): Promise<ScanSummary> {
  const scanRun = await prisma.scanRun.create({
    data: { scanType: options.scanType ?? 'FULL', status: 'RUNNING' },
  })
  const errors: PipelineError[] = []
  const warnings: PipelineError[] = []
  // documentsFetched counts newly STORED documents; re-scans of unchanged feeds report 0 (dedupe).
  const counts = {
    sourcesScanned: 0,
    sourcesSkipped: 0,
    documentsFetched: 0,
    claimsExtracted: 0,
    signalsCreated: 0,
    clustersCreated: 0,
    eventCandidatesCreated: 0,
    eventCandidatesUpdated: 0,
    dashboardFeedItemsCreated: 0,
    opportunityCardsCreated: 0,
    opportunityCardsUpdated: 0,
    positioningExamplesCreated: 0,
    graphNodesUpserted: 0,
    graphEdgesUpserted: 0,
    atomicClaimsExtracted: 0,
    canonicalClaimsCreated: 0,
    canonicalClaimsUpdated: 0,
    claimClustersUpserted: 0,
    lineageRecordsCreated: 0,
    investigationQueriesGenerated: 0,
    companyImpactsCreated: 0,
    contextSynthesesCreated: 0,
    futureScenariosCreated: 0,
    signalsQuarantined: 0,
  }

  try {
    // 1–4. Load active sources, collect, store raw evidence, dedupe.
    // dueOnly (scheduled scans): only sources whose cadence says they are due;
    // manual scans always scan everything.
    const sources = await prisma.source.findMany({
      where: options.dueOnly
        ? { isActive: true, OR: [{ nextScanAt: null }, { nextScanAt: { lte: new Date() } }] }
        : { isActive: true },
    })
    const collected = await collectFromSources(sources)
    errors.push(...collected.errors)
    for (const skip of collected.skipped) {
      warnings.push({ stage: 'collect:skip', sourceId: skip.sourceId, message: skip.reason })
    }
    counts.sourcesSkipped = collected.skipped.length
    counts.sourcesScanned = sources.length - collected.skipped.length
    counts.documentsFetched = collected.documents.length
    const docsById = new Map(collected.documents.map((d) => [d.id, d]))

    // 4b. Update per-source health from this scan's outcomes.
    const health = await updateSourceHealth(collected.perSource)
    errors.push(...health.errors)

    // 5. Parse.
    const parsed = await parseDocuments(collected.documents)
    errors.push(...parsed.errors)

    // 5b. Evidence Depth Engine (additive, non-fatal): atomic claims →
    // canonical clustering → lineage → reliability → capped in-scan follow-up
    // queries. Runs alongside the legacy claim→signal spine (which is unchanged)
    // over the same parsed documents. A failure here never fails the scan.
    try {
      const sourcesById = new Map(sources.map((s) => [s.id, s]))
      const depth = await runEvidenceDepth(parsed.parsed, docsById, sourcesById)
      errors.push(...depth.errors)
      counts.atomicClaimsExtracted = depth.counts.atomicClaimsExtracted
      counts.canonicalClaimsCreated = depth.counts.canonicalClaimsCreated
      counts.canonicalClaimsUpdated = depth.counts.canonicalClaimsUpdated
      counts.claimClustersUpserted = depth.counts.claimClustersUpserted
      counts.lineageRecordsCreated = depth.counts.lineageRecordsCreated
      counts.investigationQueriesGenerated = depth.counts.investigationQueriesGenerated
    } catch (err) {
      errors.push({ stage: 'evidence-depth', message: err instanceof Error ? err.message : String(err) })
    }

    // 6. Extract claims.
    const claims = await extractClaims(parsed.parsed, docsById)
    errors.push(...claims.errors)
    counts.claimsExtracted = claims.claims.length

    // 7. Create signals — confidence derived from the evidence layer's
    // reliability engine; recycled/contradicted claims are quarantined here
    // and never reach clustering or events.
    const signals = await createSignals(claims.claims, docsById)
    errors.push(...signals.errors)
    counts.signalsCreated = signals.signals.length
    counts.signalsQuarantined = signals.quarantined.length
    for (const q of signals.quarantined) {
      warnings.push({ stage: 'signals:quarantine', message: q.reason })
    }

    // 8. Cluster signals.
    const clusters = await clusterSignals(signals.signals)
    errors.push(...clusters.errors)
    counts.clustersCreated = clusters.clusters.length

    // 9–10. Event candidates + dashboard feed items.
    const events = await createEventCandidates(clusters.clusters, scanRun.id)
    errors.push(...events.errors)
    counts.eventCandidatesCreated = events.events.length
    counts.eventCandidatesUpdated = events.updatedEvents.length
    counts.dashboardFeedItemsCreated = events.feedItems.length
    const allEvents = [...events.events, ...events.updatedEvents]

    // 11. Risk/opportunity classification.
    const classified = await classifyEvents(allEvents)
    errors.push(...classified.errors)

    // 12. Data gaps + trigger conditions.
    const gaps = await generateGapsAndTriggers(allEvents)
    errors.push(...gaps.errors)

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

    // 13b. Commercial Consequence Engine (additive, non-fatal): company impacts →
    // historic/present/future context + scenarios → impact positioning, for this
    // scan's events. Runs BEFORE graph sync so the projected graph includes the
    // impact positioning (a fresh rebuild then stays idempotent). A failure here
    // never fails the scan.
    try {
      const consequence = await runConsequenceSynthesis(allEvents)
      errors.push(...consequence.errors)
      counts.companyImpactsCreated = consequence.counts.companyImpactsCreated
      counts.contextSynthesesCreated = consequence.counts.contextSynthesesCreated
      counts.futureScenariosCreated = consequence.counts.futureScenariosCreated
    } catch (err) {
      errors.push({ stage: 'consequence', message: err instanceof Error ? err.message : String(err) })
    }

    // 14. Graph sync: project events + evidence chains into GraphNodes/GraphEdges (upsert, idempotent).
    const g = await syncGraphForEvents(allEvents)
    errors.push(...g.errors)
    counts.graphNodesUpserted = g.nodesUpserted
    counts.graphEdgesUpserted = g.edgesUpserted

    // 15. Graph-event timeline: record real diffs (first-detected, confidence/source/status
    // changes, contradictions, new opportunities) + formation/escalation snapshots. Non-fatal:
    // recordGraphEvents never throws, so a timeline failure never fails the scan.
    const timeline = await recordGraphEvents(allEvents, new Date())
    errors.push(...timeline.errors)

    // 15b. Momentum as a first-class event field: persist each event's
    // recency-weighted momentum from its graph-event timeline. Non-fatal.
    const momentum = await persistEventMomentum(allEvents, new Date())
    errors.push(...momentum.errors)

    const status = errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED'
    const completed = await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: { status, completedAt: new Date(), errorsJson: JSON.stringify(errors), warningsJson: JSON.stringify(warnings), ...counts },
    })
    return {
      scanRunId: completed.id,
      status,
      startedAt: completed.startedAt.toISOString(),
      completedAt: completed.completedAt?.toISOString() ?? null,
      message: `Scan ${status.toLowerCase().replace(/_/g, ' ')}: ${counts.eventCandidatesCreated} event candidate(s) detected (${errors.length} error(s), ${warnings.length} warning(s)).`,
      counts,
      errors,
      warnings,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    errors.push({ stage: 'orchestrator', message })
    const failed = await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: { status: 'FAILED', completedAt: new Date(), errorsJson: JSON.stringify(errors), warningsJson: JSON.stringify(warnings), ...counts },
    })
    return {
      scanRunId: failed.id,
      status: 'FAILED',
      startedAt: failed.startedAt.toISOString(),
      completedAt: failed.completedAt?.toISOString() ?? null,
      message: `Scan failed: ${message}`,
      counts,
      errors,
      warnings,
    }
  }
}
