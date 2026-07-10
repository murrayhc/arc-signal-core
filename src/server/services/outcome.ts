import { prisma } from '@/server/db'
import { computeTrackRecord, type TrackRecord } from '@/server/outcome/track-record'

/** Page/API-facing reads for the outcome-resolution engine. */

export type RecentResolution = {
  id: string
  subjectKind: string
  scenarioType: string | null
  predictionText: string
  predictedProbability: number
  finalProbability: number
  outcome: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  resolutionRationale: string | null
  observedPath: string | null
  brierFirst: number | null
  leadTimeDays: number | null
  eventCandidateId: string
}

export type SnapshotPoint = {
  createdAt: string
  resolvedCount: number
  meanBrierFirst: number | null
  meanLeadTimeDays: number | null
}

export async function getTrackRecord(): Promise<{
  record: TrackRecord
  recent: RecentResolution[]
  snapshots: SnapshotPoint[]
}> {
  const record = await computeTrackRecord()
  const recentRows = await prisma.outcomePrediction.findMany({
    where: { status: 'RESOLVED', isFixture: false },
    orderBy: { resolvedAt: 'desc' },
    take: 20,
  })
  const snapshotRows = await prisma.trackRecordSnapshot.findMany({ orderBy: { createdAt: 'desc' }, take: 30 })
  return {
    record,
    recent: recentRows.map((p) => ({
      id: p.id,
      subjectKind: p.subjectKind,
      scenarioType: p.scenarioType,
      predictionText: p.predictionText,
      predictedProbability: p.predictedProbability,
      finalProbability: p.finalProbability,
      outcome: p.outcome,
      resolvedBy: p.resolvedBy,
      resolvedAt: p.resolvedAt?.toISOString() ?? null,
      resolutionRationale: p.resolutionRationale,
      observedPath: p.observedPath,
      brierFirst: p.brierFirst,
      leadTimeDays: p.leadTimeDays,
      eventCandidateId: p.eventCandidateId,
    })),
    snapshots: snapshotRows.map((s) => ({
      createdAt: s.createdAt.toISOString(),
      resolvedCount: s.resolvedCount,
      meanBrierFirst: s.meanBrierFirst,
      meanLeadTimeDays: s.meanLeadTimeDays,
    })),
  }
}

export type EventPrediction = {
  id: string
  subjectKind: string
  scenarioType: string | null
  predictionText: string
  predictedProbability: number
  finalProbability: number
  deadline: string
  status: string
  outcome: string | null
  resolvedBy: string | null
  observedPath: string | null
  resolutionRationale: string | null
  leadTimeDays: number | null
}

export async function getEventPredictions(eventCandidateId: string): Promise<EventPrediction[]> {
  const rows = await prisma.outcomePrediction.findMany({
    where: { eventCandidateId },
    orderBy: [{ subjectKind: 'asc' }, { scenarioType: 'asc' }],
  })
  return rows.map((p) => ({
    id: p.id,
    subjectKind: p.subjectKind,
    scenarioType: p.scenarioType,
    predictionText: p.predictionText,
    predictedProbability: p.predictedProbability,
    finalProbability: p.finalProbability,
    deadline: p.deadline.toISOString(),
    status: p.status,
    outcome: p.outcome,
    resolvedBy: p.resolvedBy,
    observedPath: p.observedPath,
    resolutionRationale: p.resolutionRationale,
    leadTimeDays: p.leadTimeDays,
  }))
}
