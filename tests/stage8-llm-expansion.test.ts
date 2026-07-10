import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { prisma } from '@/server/db'
import {
  buildSimilarity,
  cosineSimilarity,
  getActiveEmbeddingProvider,
  lexicalSimilarity,
  type EmbeddingProvider,
} from '@/server/evidence/embeddings/registry'
import { assignCanonicalClaims } from '@/server/evidence/canonical'
import { runLLMTask } from '@/server/llm/run'
import type { LLMProvider, LLMRequest, LLMResponse } from '@/server/llm/types'
import { resetDb } from './helpers'
import { makeAtomicClaim, makeDocument, makeSource } from './factories'

// ── Embedding registry ──────────────────────────────────────────────────────

describe('embedding registry', () => {
  it('is dormant by default (no provider, lexical fallback)', () => {
    expect(getActiveEmbeddingProvider()).toBeNull()
  })

  it('cosine similarity is correct and clamped', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1, 5)
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5)
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(0) // negatives floored
    expect(cosineSimilarity([1, 2, 3], [])).toBe(0) // mismatched length
  })

  it('buildSimilarity returns lexical when dormant and semantic when a provider is injected', async () => {
    const dormant = await buildSimilarity(['a', 'b'], null)
    expect(dormant.mode).toBe('lexical')

    // Fake provider: maps text → a 2-D vector; paraphrases point the same way.
    const fake: EmbeddingProvider = {
      name: 'fake-embed',
      status: () => 'CONFIGURED',
      async embed(texts) {
        return texts.map((t) =>
          /layoff|cut|jobs|redundanc/i.test(t) ? [1, 0.1] : /profit|earnings|revenue/i.test(t) ? [0.1, 1] : [0.5, 0.5],
        )
      },
    }
    const semantic = await buildSimilarity(
      ['Voltcore will cut 400 jobs', 'Voltcore announces redundancies', 'Voltcore profit rises'],
      fake,
    )
    expect(semantic.mode).toBe('semantic')
    // Paraphrase (jobs cut vs redundancies) scores HIGH semantically even
    // though the lexical blend would score them lower.
    const semParaphrase = semantic.fn('Voltcore will cut 400 jobs', 'Voltcore announces redundancies')
    const lexParaphrase = lexicalSimilarity('Voltcore will cut 400 jobs', 'Voltcore announces redundancies')
    expect(semParaphrase).toBeGreaterThan(lexParaphrase)
    // A different topic scores low.
    expect(semantic.fn('Voltcore will cut 400 jobs', 'Voltcore profit rises')).toBeLessThan(0.6)
  })

  it('degrades to lexical if the provider throws', async () => {
    const broken: EmbeddingProvider = {
      name: 'broken',
      status: () => 'CONFIGURED',
      async embed() {
        throw new Error('embedding service down')
      },
    }
    const { mode, fn } = await buildSimilarity(['voltcore layoffs', 'voltcore layoffs'], broken)
    expect(mode).toBe('lexical')
    expect(fn('voltcore layoffs', 'voltcore layoffs')).toBeGreaterThan(0) // still works via lexical
  })
})

// ── Canonical clustering honours an injected semantic similarity ────────────

describe('canonical clustering with semantic similarity', () => {
  beforeEach(resetDb)

  it('groups a paraphrase that the lexical blend would split, when semantic sim is provided', async () => {
    const source = await makeSource()
    const doc = await makeDocument(source.id)
    const origin = await makeAtomicClaim({
      documentId: doc.id,
      sourceId: source.id,
      claimType: 'LAYOFF_SIGNAL',
      claimText: 'Voltcore will cut 400 jobs at its Manchester plant',
      entitiesJson: JSON.stringify(['Voltcore']),
      eventDate: new Date('2026-06-20T09:00:00Z'),
    })
    const paraphrase = await makeAtomicClaim({
      documentId: doc.id,
      sourceId: source.id,
      claimType: 'LAYOFF_SIGNAL',
      claimText: 'Battery maker Voltcore confirms hundreds of redundancies',
      entitiesJson: JSON.stringify(['Voltcore']),
      eventDate: new Date('2026-06-21T09:00:00Z'),
    })

    // A semantic similarity that rates these paraphrases as the same claim.
    const semantic = (a: string, b: string) =>
      /voltcore/i.test(a) && /voltcore/i.test(b) && /(cut|redundanc)/i.test(a) && /(cut|redundanc)/i.test(b) ? 0.9 : 0.1

    const result = await assignCanonicalClaims([origin, paraphrase], { similarity: semantic })
    // Both atomics land on ONE canonical claim.
    const reloadedOrigin = await prisma.atomicClaim.findUniqueOrThrow({ where: { id: origin.id } })
    const reloadedParaphrase = await prisma.atomicClaim.findUniqueOrThrow({ where: { id: paraphrase.id } })
    expect(reloadedParaphrase.canonicalClaimId).toBe(reloadedOrigin.canonicalClaimId)
    expect(result.created).toHaveLength(1)
  })
})

// ── JSON repair retry ───────────────────────────────────────────────────────

class ScriptedProvider implements LLMProvider {
  name = 'scripted'
  private call = 0
  constructor(private readonly responses: string[]) {}
  async generate(_req: LLMRequest): Promise<LLMResponse> {
    const text = this.responses[Math.min(this.call, this.responses.length - 1)]
    this.call++
    return { text, tokensIn: 5, tokensOut: 10 }
  }
}

describe('JSON repair retry', () => {
  beforeEach(resetDb)
  const schema = z.object({ summary: z.string() })

  it('repairs a malformed-JSON first response into a valid one (one bounded retry)', async () => {
    const provider = new ScriptedProvider([
      'here is your answer: {summary: not valid json',
      JSON.stringify({ summary: 'a clean repaired summary' }),
    ])
    const result = await runLLMTask(
      { taskType: 'REPORT_SYNTHESIS', system: 's', prompt: 'p' },
      { provider, validate: { schema } },
    )
    expect(result.status).toBe('SUCCEEDED')
    expect((result.parsed as { summary: string }).summary).toBe('a clean repaired summary')
  })

  it('does NOT repair an advice-language failure — hard reject stands', async () => {
    const provider = new ScriptedProvider([
      JSON.stringify({ summary: 'you should buy this stock now' }), // schema-valid but advice
      JSON.stringify({ summary: 'a clean summary' }), // would pass, but must NOT be reached
    ])
    const result = await runLLMTask(
      { taskType: 'REPORT_SYNTHESIS', system: 's', prompt: 'p' },
      { provider, validate: { schema } },
    )
    expect(result.status).toBe('REJECTED_VALIDATION')
    expect(result.text).toBeUndefined()
  })

  it('gives up after one repair attempt if it is still malformed', async () => {
    const provider = new ScriptedProvider(['still not json', 'also not json'])
    const result = await runLLMTask(
      { taskType: 'REPORT_SYNTHESIS', system: 's', prompt: 'p' },
      { provider, validate: { schema } },
    )
    expect(result.status).toBe('REJECTED_VALIDATION')
  })
})
