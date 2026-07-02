import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { POST as runScan } from '@/app/api/scans/run/route'
import { GET as getScan } from '@/app/api/scans/[id]/route'
import { GET as getDashboard } from '@/app/api/dashboard/route'
import { GET as getEvent, PATCH as patchEvent } from '@/app/api/events/[id]/route'
import { GET as getSources } from '@/app/api/sources/route'
import { GET as getScans } from '@/app/api/scans/route'

const req = (method: string, body?: unknown) =>
  new Request('http://test.local/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('scan API', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
  })

  it('POST /api/scans/run executes a full scan and returns the summary', async () => {
    const res = await runScan()
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.scanRunId).toBeTruthy()
    expect(body.counts.eventCandidatesCreated).toBeGreaterThan(0)
    expect(await prisma.scanRun.count()).toBe(1)
  })

  it('POST /api/scans/run returns 409 while a scan is running', async () => {
    await prisma.scanRun.create({ data: { status: 'RUNNING' } })
    const res = await runScan()
    expect(res.status).toBe(409)
  })

  it('recovers from a stale RUNNING scan left by a crash', async () => {
    const stale = await prisma.scanRun.create({
      data: { status: 'RUNNING', startedAt: new Date(Date.now() - 11 * 60 * 1000) },
    })
    const res = await runScan()
    expect(res.status).toBe(201)
    const updated = await prisma.scanRun.findUniqueOrThrow({ where: { id: stale.id } })
    expect(updated.status).toBe('FAILED')
    expect(updated.errorsJson).toContain('stale RUNNING row')
  })

  it('GET /api/scans/[id] returns counts and errors; 404 for unknown', async () => {
    const summary = await runFullScan()
    const res = await getScan(req('GET'), { params: Promise.resolve({ id: summary.scanRunId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe(summary.status)
    expect(body.eventCandidatesCreated).toBe(summary.counts.eventCandidatesCreated)
    expect(Array.isArray(body.errors)).toBe(true)
    expect(Array.isArray(body.warnings)).toBe(true)
    expect(body.errorsJson).toBeUndefined()
    expect(body.warningsJson).toBeUndefined()
    const missing = await getScan(req('GET'), { params: Promise.resolve({ id: 'nope' }) })
    expect(missing.status).toBe(404)
  })
})

describe('dashboard + events + sources API', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    await runFullScan()
  })

  it('GET /api/dashboard returns detected events in radar and inbox', async () => {
    const res = await getDashboard()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lastScan).not.toBeNull()
    expect(body.riskRadar.length).toBeGreaterThan(0)
    expect(body.opportunityRadar.length).toBeGreaterThan(0)
    expect(body.inbox.length).toBeGreaterThan(0)
    expect(body.inbox.every((c: { isFixture: boolean }) => c.isFixture)).toBe(true)
  })

  it('GET /api/events/[id] returns full interrogation payload for an entity-free event', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow({ where: { primaryEntityId: null } })
    const res = await getEvent(req('GET'), { params: Promise.resolve({ id: event.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.event.primaryEntity).toBeNull()
    expect(body.evidence.length).toBeGreaterThan(0)
    expect(body.riskOpportunities.length).toBe(1)
    expect(body.triggerConditions.length).toBeGreaterThan(0)
    expect(body.suggestedQuestions).toContain('What changed in the last seven days?')
  })

  it('PATCH /api/events/[id] updates status and rejects invalid actions', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow()
    const ok = await patchEvent(req('PATCH', { action: 'ESCALATE' }), { params: Promise.resolve({ id: event.id }) })
    expect(ok.status).toBe(200)
    expect((await ok.json()).status).toBe('ESCALATED')
    const updated = await prisma.eventCandidate.findUniqueOrThrow({ where: { id: event.id } })
    expect(updated.status).toBe('ESCALATED')

    const bad = await patchEvent(req('PATCH', { action: 'DELETE_EVERYTHING' }), { params: Promise.resolve({ id: event.id }) })
    expect(bad.status).toBe(400)
    const missing = await patchEvent(req('PATCH', { action: 'DISMISS' }), { params: Promise.resolve({ id: 'nope' }) })
    expect(missing.status).toBe(404)
  })

  it('GET /api/sources lists sources with collector support status', async () => {
    const res = await getSources()
    const body = await res.json()
    expect(body.length).toBe(3)
    expect(body.some((s: { collectorStatus: string }) => s.collectorStatus === 'UNSUPPORTED')).toBe(true)
  })

  it('GET /api/scans lists scan history with error and warning counts', async () => {
    const res = await getScans()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.length).toBe(1)
    expect(body[0].eventCandidatesCreated).toBeGreaterThan(0)
    expect(body[0].warningCount).toBe(1)
    expect(body[0].errorCount).toBe(0)
    expect(body[0].errorsJson).toBeUndefined()
  })
})
