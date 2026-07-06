import { beforeEach, describe, expect, it } from 'vitest'
import { POST } from '@/app/api/events/[id]/enrich/route'
import { resetDb } from '../helpers'
import { makeEventGraph } from '../factories'

describe('POST /api/events/[id]/enrich', () => {
  beforeEach(resetDb)

  it('returns DORMANT (no key/config) without error and writes nothing', async () => {
    const { event } = await makeEventGraph('Voltcore is cutting 400 jobs.', { eventClass: 'RISK' })
    const res = await POST(new Request('http://t/enrich', { method: 'POST' }), {
      params: Promise.resolve({ id: event.id }),
    })
    const body = await res.json()
    expect(body.status).toBe('DORMANT')
  })
})
