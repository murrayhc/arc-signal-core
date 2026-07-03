import { beforeEach, describe, expect, it } from 'vitest'
import { runFullScan } from '@/server/pipeline/orchestrator'
import { runSeed } from '@/server/seed'
import { resetDb } from '../helpers'
import { GET as getInterrogate } from '@/app/api/interrogate/route'
import { GET as getGraphRender } from '@/app/api/graph/render/route'

function reqUrl(url: string) {
  return new Request(url)
}

describe('interrogate + graph render API', () => {
  beforeEach(async () => {
    await resetDb()
    await runSeed({ includeLive: false })
    await runFullScan()
  })

  it('GET /api/interrogate?q=technology returns a SECTOR (or THEME) query with events and a subgraph', async () => {
    const res = await getInterrogate(reqUrl('http://test.local/api/interrogate?q=technology'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(['SECTOR', 'THEME']).toContain(body.queryType)
    expect(body.query).toBe('technology')
    expect(Array.isArray(body.events)).toBe(true)
    expect(body.events.length).toBeGreaterThan(0)
    expect(Array.isArray(body.subgraph.nodes)).toBe(true)
    expect(body.subgraph.nodes.length).toBeGreaterThan(0)
    expect(Array.isArray(body.subgraph.edges)).toBe(true)
    expect(body.marketContextAvailable).toBe(true)
    expect(body.disclaimer).toBeNull()
  })

  it('GET /api/interrogate?q=BP returns TICKER with marketContextAvailable=false and a non-null disclaimer', async () => {
    const res = await getInterrogate(reqUrl('http://test.local/api/interrogate?q=BP'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.queryType).toBe('TICKER')
    expect(body.marketContextAvailable).toBe(false)
    expect(typeof body.disclaimer).toBe('string')
    expect(body.disclaimer).not.toBeNull()
    expect(Array.isArray(body.events)).toBe(true)
  })

  it('GET /api/interrogate with missing q returns 400', async () => {
    const res = await getInterrogate(reqUrl('http://test.local/api/interrogate'))
    expect(res.status).toBe(400)
  })

  it('GET /api/graph/render?nodeTypes=EVENT returns only EVENT-group nodes', async () => {
    const res = await getGraphRender(reqUrl('http://test.local/api/graph/render?nodeTypes=EVENT'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.nodes)).toBe(true)
    expect(body.nodes.length).toBeGreaterThan(0)
    for (const node of body.nodes) {
      expect(node.nodeType).toBe('EVENT')
      expect(node.group).toBe('EVENT')
      expect(typeof node.val).toBe('number')
    }
    const nodeIds = new Set(body.nodes.map((n: { id: string }) => n.id))
    for (const edge of body.edges) {
      expect(nodeIds.has(edge.sourceNodeId)).toBe(true)
      expect(nodeIds.has(edge.targetNodeId)).toBe(true)
    }
    expect(body.stats.nodeCount).toBe(body.nodes.length)
    expect(body.stats.edgeCount).toBe(body.edges.length)
  })

  it('GET /api/graph/render with no filters returns the full capped set', async () => {
    const res = await getGraphRender(reqUrl('http://test.local/api/graph/render'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.nodes.length).toBeGreaterThan(0)
    expect(body.stats.byType).toBeDefined()
  })
})
