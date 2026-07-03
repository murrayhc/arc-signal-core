import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { GET as getLiveGraph } from '@/app/api/graph/live/route'
import { GET as getGraphNode } from '@/app/api/graph/node/[id]/route'
import { POST as rebuildGraphRoute } from '@/app/api/graph/rebuild/route'
import { GET as getEventGraph } from '@/app/api/graph/event/[id]/route'

const req = (method: string) => new Request('http://test.local/api', { method })

describe('graph API', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    await runFullScan()
  })

  it('GET /api/graph/live returns nodes+edges+graphStats.byType with EVENT count matching events', async () => {
    const res = await getLiveGraph()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.nodes)).toBe(true)
    expect(Array.isArray(body.edges)).toBe(true)
    expect(body.nodes.length).toBeGreaterThan(0)
    expect(body.edges.length).toBeGreaterThan(0)
    expect(body.graphStats.nodeCount).toBe(body.nodes.length)
    expect(body.graphStats.edgeCount).toBe(body.edges.length)

    const eventCount = await prisma.eventCandidate.count()
    expect(body.graphStats.byType.EVENT).toBe(eventCount)

    // Edges only reference nodes present in the response.
    const nodeIds = new Set(body.nodes.map((n: { id: string }) => n.id))
    for (const edge of body.edges) {
      expect(nodeIds.has(edge.sourceNodeId)).toBe(true)
      expect(nodeIds.has(edge.targetNodeId)).toBe(true)
    }

    expect(typeof body.activeEventCount).toBe('number')
    expect(typeof body.riskCount).toBe('number')
    expect(typeof body.opportunityCount).toBe('number')
    expect(typeof body.highUncertaintyCount).toBe('number')
    expect(body.lastScanAt).not.toBeNull()
  })

  it('GET /api/graph/node/[id] returns the node plus its 1-degree neighbourhood; 404 for unknown', async () => {
    const eventNode = await prisma.graphNode.findFirstOrThrow({ where: { nodeType: 'EVENT' } })
    const res = await getGraphNode(req('GET'), { params: Promise.resolve({ id: eventNode.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.node.id).toBe(eventNode.id)
    expect(Array.isArray(body.neighbours)).toBe(true)
    expect(body.neighbours.length).toBeGreaterThan(0)
    expect(Array.isArray(body.edges)).toBe(true)
    expect(body.edges.length).toBeGreaterThan(0)
    // every edge touches the requested node
    for (const edge of body.edges) {
      expect(edge.sourceNodeId === eventNode.id || edge.targetNodeId === eventNode.id).toBe(true)
    }

    const missing = await getGraphNode(req('GET'), { params: Promise.resolve({ id: 'nope' }) })
    expect(missing.status).toBe(404)
  })

  it('POST /api/graph/rebuild returns counts and is idempotent on node count', async () => {
    const beforeCount = await prisma.graphNode.count()
    const res = await rebuildGraphRoute()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nodesUpserted).toBeGreaterThan(0)
    expect(body.edgesUpserted).toBeGreaterThan(0)
    expect(Array.isArray(body.errors)).toBe(true)

    const afterCount = await prisma.graphNode.count()
    expect(afterCount).toBe(beforeCount)

    // second rebuild is stable too
    await rebuildGraphRoute()
    expect(await prisma.graphNode.count()).toBe(afterCount)
  })

  it('GET /api/graph/event/[id] returns the event node and neighbourhood; 404 for unknown', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow()
    const res = await getEventGraph(req('GET'), { params: Promise.resolve({ id: event.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.node.refId).toBe(event.id)
    expect(body.node.nodeType).toBe('EVENT')
    expect(Array.isArray(body.neighbours)).toBe(true)

    const missing = await getEventGraph(req('GET'), { params: Promise.resolve({ id: 'nope' }) })
    expect(missing.status).toBe(404)
  })

  it('GET /api/graph/event/[id] returns an arc with steps for a scanned event; 404 for unknown', async () => {
    const event = await prisma.eventCandidate.findFirstOrThrow()
    const res = await getEventGraph(req('GET'), { params: Promise.resolve({ id: event.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.arc).not.toBeNull()
    expect(body.arc.rootNodeId).toBe(body.node.id)
    expect(typeof body.arc.truePotentialScore).toBe('number')
    expect(typeof body.arc.confidence).toBe('number')
    expect(typeof body.arc.sourceDiversity).toBe('number')
    expect(typeof body.arc.contradictionScore).toBe('number')
    expect(typeof body.arc.chainClass).toBe('string')
    expect(Array.isArray(body.steps)).toBe(true)
    expect(body.steps.length).toBeGreaterThan(0)
    for (const step of body.steps) {
      expect(typeof step.degree).toBe('number')
      expect(typeof step.nodeType).toBe('string')
      expect(typeof step.nodeTitle).toBe('string')
      expect(typeof step.relationshipType).toBe('string')
      expect(typeof step.explanation).toBe('string')
      expect(typeof step.confidence).toBe('number')
      expect(typeof step.sourceCount).toBe('number')
    }

    const missing = await getEventGraph(req('GET'), { params: Promise.resolve({ id: 'nope' }) })
    expect(missing.status).toBe(404)
    const missingBody = await missing.json()
    expect(missingBody.arc).toBeUndefined()
  })
})
