import type { DashboardFeedItem, EventCandidate } from '@prisma/client'
import { prisma } from '@/server/db'
import type { ClusterWithSignals } from './cluster'
import type { PipelineError } from './types'

const round2 = (n: number) => Math.round(n * 100) / 100

export async function createEventCandidates(
  clusters: ClusterWithSignals[],
  scanRunId: string,
): Promise<{ events: EventCandidate[]; feedItems: DashboardFeedItem[]; errors: PipelineError[] }> {
  const events: EventCandidate[] = []
  const feedItems: DashboardFeedItem[] = []
  const errors: PipelineError[] = []

  for (const cluster of clusters) {
    try {
      const members = cluster.memberSignals
      const n = members.length
      const confidence = cluster.confidence
      const severity = cluster.strength
      const probability = Math.min(0.9, round2(0.25 + 0.5 * confidence + 0.15 * severity))
      const negFrac = members.filter((m) => m.direction === 'NEGATIVE').length / n
      const posFrac = members.filter((m) => m.direction === 'POSITIVE').length / n
      const riskScore = round2(Math.min(1, severity * probability * (negFrac + 0.2)))
      const opportunityScore = round2(Math.min(1, severity * probability * (posFrac + 0.2)))

      let eventClass: string
      let status = 'NEW'
      if (confidence < 0.45) {
        eventClass = 'WATCH'
        if (severity >= 0.6) status = 'NEEDS_REVIEW'
      } else if (negFrac >= 0.35 && posFrac >= 0.35) {
        eventClass = 'MIXED'
      } else if (negFrac > posFrac) {
        eventClass = 'RISK'
      } else if (posFrac > negFrac) {
        eventClass = 'OPPORTUNITY'
      } else {
        eventClass = 'UNKNOWN'
      }

      const distinctDocs = new Set(members.map((m) => m.documentId)).size
      const distinctSources = new Set(members.map((m) => m.sourceId)).size
      const sourceDiversityScore = round2(distinctSources / n)
      const entityIds = new Set(members.map((m) => m.entityId ?? 'none'))
      const primaryEntityId =
        entityIds.size === 1 && !entityIds.has('none') ? members[0].entityId : null
      const dates = members.map((m) => m.signalDate.getTime())

      const summary =
        `${cluster.title}: ${n} corroborating signal(s) across ${distinctSources} independent source(s). ` +
        `Class ${eventClass} — confidence ${confidence.toFixed(2)}, severity ${severity.toFixed(2)}, ` +
        `probability ${probability.toFixed(2)} (0.25 + 0.5×confidence + 0.15×severity). ` +
        `Risk ${riskScore.toFixed(2)} / opportunity ${opportunityScore.toFixed(2)} ` +
        `(severity × probability weighted by direction mix: ${Math.round(negFrac * 100)}% negative, ` +
        `${Math.round(posFrac * 100)}% positive). ${cluster.explanation}`

      const event = await prisma.eventCandidate.create({
        data: {
          title: cluster.title,
          eventType: cluster.clusterType,
          eventClass,
          summary,
          status,
          severity,
          probability,
          confidence,
          timeWindowStart: new Date(Math.min(...dates)),
          timeWindowEnd: new Date(Math.max(...dates)),
          primaryEntityId,
          affectedSector: cluster.sector,
          affectedRegion: cluster.region,
          evidenceCount: distinctDocs,
          sourceDiversityScore,
          signalStrength: severity,
          noveltyScore: cluster.novelty,
          opportunityScore,
          riskScore,
          createdFromScanRunId: scanRunId,
          isFixture: cluster.isFixture,
        },
      })
      await prisma.signalCluster.update({
        where: { id: cluster.id },
        data: { eventCandidateId: event.id },
      })
      events.push(event)

      const priority = Math.round(100 * Math.max(riskScore, opportunityScore))
      const feedTypes = ['INBOX']
      if (eventClass === 'RISK' || eventClass === 'MIXED') feedTypes.push('RISK_RADAR')
      if (eventClass === 'OPPORTUNITY' || eventClass === 'MIXED') feedTypes.push('OPPORTUNITY_RADAR')
      if (eventClass === 'WATCH') feedTypes.push('WATCHLIST')
      for (const feedType of feedTypes) {
        feedItems.push(
          await prisma.dashboardFeedItem.create({
            data: {
              eventCandidateId: event.id,
              feedType,
              priority,
              title: event.title,
              summary: `${eventClass}: ${cluster.explanation.slice(0, 200)}`,
              status,
            },
          }),
        )
      }
    } catch (err) {
      errors.push({ stage: 'events', message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { events, feedItems, errors }
}
