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
  }
  errors: PipelineError[]
  warnings: PipelineError[]
}

export async function runFullScan(options: { scanType?: string } = {}): Promise<ScanSummary> {
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
  }

  try {
    // 1–4. Load active sources, collect, store raw evidence, dedupe.
    const sources = await prisma.source.findMany({ where: { isActive: true } })
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

    // 6. Extract claims.
    const claims = await extractClaims(parsed.parsed, docsById)
    errors.push(...claims.errors)
    counts.claimsExtracted = claims.claims.length

    // 7. Create signals.
    const signals = await createSignals(claims.claims, docsById)
    errors.push(...signals.errors)
    counts.signalsCreated = signals.signals.length

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
