import { describe, expect, it } from 'vitest'
import {
  CENTRAL_COLORS,
  buildDepthMap,
  pickCentralNodes,
} from '@/components/dashboard/brain-model'
import type { GraphEdgeData, RenderNode } from '@/server/services/graph'

function node(overrides: Partial<RenderNode> & { id: string }): RenderNode {
  return {
    nodeType: 'EVENT',
    refType: 'event',
    refId: overrides.id,
    title: overrides.id,
    summary: '',
    confidence: 0.5,
    riskScore: 0,
    opportunityScore: 0,
    impactScore: 0.5,
    freshnessScore: 1,
    isFixture: false,
    group: overrides.nodeType ?? 'EVENT',
    val: 2,
    ...overrides,
  }
}

function edge(source: string, target: string): GraphEdgeData {
  return {
    id: `${source}->${target}`,
    sourceNodeId: source,
    targetNodeId: target,
    edgeType: 'SUPPORTS',
    label: '',
    weight: 0.5,
    confidence: 0.5,
    evidenceCount: 1,
  }
}

describe('pickCentralNodes', () => {
  it('selects EVENT nodes over threshold, strongest first, red=risk green=opportunity', () => {
    const centrals = pickCentralNodes([
      node({ id: 'risk-high', riskScore: 0.9, opportunityScore: 0.1 }),
      node({ id: 'opp-high', riskScore: 0.2, opportunityScore: 0.7 }),
      node({ id: 'below', riskScore: 0.3, opportunityScore: 0.2 }),
      node({ id: 'not-event', nodeType: 'SIGNAL', riskScore: 0.99 }),
    ])
    expect(centrals.map((c) => c.id)).toEqual(['risk-high', 'opp-high'])
    expect(centrals[0].kind).toBe('RISK')
    expect(centrals[1].kind).toBe('OPPORTUNITY')
    expect(CENTRAL_COLORS[centrals[0].kind]).toBe('#f4574d')
    expect(CENTRAL_COLORS[centrals[1].kind]).toBe('#37d6b0')
  })

  it('caps the central set', () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      node({ id: `e${i}`, riskScore: 0.6 + i / 100 }),
    )
    expect(pickCentralNodes(many, { cap: 4 })).toHaveLength(4)
  })

  it('falls back to top-3 scoring events when none clear the threshold', () => {
    const centrals = pickCentralNodes([
      node({ id: 'a', riskScore: 0.4 }),
      node({ id: 'b', opportunityScore: 0.3 }),
      node({ id: 'c', riskScore: 0.2 }),
      node({ id: 'd', riskScore: 0.1 }),
      node({ id: 'zero' }), // score 0 — never an anchor
    ])
    expect(centrals.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns [] when there are no scoring events at all', () => {
    expect(pickCentralNodes([node({ id: 'zero' })])).toEqual([])
  })
})

describe('buildDepthMap', () => {
  it('BFS shells from the nearest central; orphans one beyond the deepest', () => {
    const nodes = ['c1', 'c2', 's1', 's2', 's3', 'lone'].map((id) =>
      node({ id, nodeType: id.startsWith('c') ? 'EVENT' : 'SIGNAL' }),
    )
    const edges = [
      edge('c1', 's1'), // depth 1
      edge('s1', 's2'), // depth 2
      edge('c2', 's2'), // …but s2 is 1 hop from c2 → nearest wins
      edge('s2', 's3'), // depth 2 via c2
    ]
    const depths = buildDepthMap(nodes, edges, ['c1', 'c2'])
    expect(depths.get('c1')).toBe(0)
    expect(depths.get('c2')).toBe(0)
    expect(depths.get('s1')).toBe(1)
    expect(depths.get('s2')).toBe(1)
    expect(depths.get('s3')).toBe(2)
    expect(depths.get('lone')).toBe(3) // maxDepth 2 + 1
  })

  it('with no centrals every node is an orphan at depth 1', () => {
    const nodes = [node({ id: 'a' }), node({ id: 'b' })]
    const depths = buildDepthMap(nodes, [edge('a', 'b')], [])
    expect(depths.get('a')).toBe(1)
    expect(depths.get('b')).toBe(1)
  })
})
