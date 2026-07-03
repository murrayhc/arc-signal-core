import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../helpers'
import { GET as getLensList, POST as postLens } from '@/app/api/lenses/route'
import { GET as getLensOne, PATCH as patchLens, DELETE as deleteLensRoute } from '@/app/api/lenses/[id]/route'

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function getReq(url: string) {
  return new Request(url)
}

describe('lens API', () => {
  beforeEach(resetDb)

  it('POST creates a lens', async () => {
    const res = await postLens(jsonReq('http://test.local/api/lenses', 'POST', { name: 'Recruiter lens', userType: 'RECRUITER' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.name).toBe('Recruiter lens')
    expect(body.userType).toBe('RECRUITER')

    const listRes = await getLensList()
    const listBody = await listRes.json()
    expect(listBody).toHaveLength(1)
  })

  it('POST with missing name returns 400', async () => {
    const res = await postLens(jsonReq('http://test.local/api/lenses', 'POST', { userType: 'GENERAL' }))
    expect(res.status).toBe(400)
  })

  it('POST with an invalid userType returns 400', async () => {
    const res = await postLens(jsonReq('http://test.local/api/lenses', 'POST', { name: 'Bad', userType: 'NOT_REAL' }))
    expect(res.status).toBe(400)
  })

  it('POST with an invalid riskAppetite returns 400', async () => {
    const res = await postLens(jsonReq('http://test.local/api/lenses', 'POST', { name: 'Bad', riskAppetite: 'EXTREME' }))
    expect(res.status).toBe(400)
  })

  it('GET /api/lenses/[id] returns 404 for an unknown id', async () => {
    const res = await getLensOne(getReq('http://test.local/api/lenses/nope'), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })

  it('GET /api/lenses/[id] returns the lens by id', async () => {
    const createRes = await postLens(jsonReq('http://test.local/api/lenses', 'POST', { name: 'Sector lens' }))
    const created = await createRes.json()

    const res = await getLensOne(getReq(`http://test.local/api/lenses/${created.id}`), { params: Promise.resolve({ id: created.id }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Sector lens')
  })

  it('PATCH /api/lenses/[id] updates fields', async () => {
    const createRes = await postLens(jsonReq('http://test.local/api/lenses', 'POST', { name: 'Lens to edit' }))
    const created = await createRes.json()

    const res = await patchLens(
      jsonReq(`http://test.local/api/lenses/${created.id}`, 'PATCH', { averageDealSize: '£100k' }),
      { params: Promise.resolve({ id: created.id }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.averageDealSize).toBe('£100k')
  })

  it('PATCH /api/lenses/[id] returns 404 for an unknown id', async () => {
    const res = await patchLens(
      jsonReq('http://test.local/api/lenses/nope', 'PATCH', { description: 'x' }),
      { params: Promise.resolve({ id: 'nope' }) },
    )
    expect(res.status).toBe(404)
  })

  it('PATCH /api/lenses/[id] with an invalid userType returns 400', async () => {
    const createRes = await postLens(jsonReq('http://test.local/api/lenses', 'POST', { name: 'Lens Y' }))
    const created = await createRes.json()

    const res = await patchLens(
      jsonReq(`http://test.local/api/lenses/${created.id}`, 'PATCH', { userType: 'BOGUS' }),
      { params: Promise.resolve({ id: created.id }) },
    )
    expect(res.status).toBe(400)
  })

  it('DELETE /api/lenses/[id] removes a non-default lens', async () => {
    const createRes = await postLens(jsonReq('http://test.local/api/lenses', 'POST', { name: 'Temp lens' }))
    const created = await createRes.json()

    const res = await deleteLensRoute(getReq(`http://test.local/api/lenses/${created.id}`), { params: Promise.resolve({ id: created.id }) })
    expect(res.status).toBe(200)

    const getRes = await getLensOne(getReq(`http://test.local/api/lenses/${created.id}`), { params: Promise.resolve({ id: created.id }) })
    expect(getRes.status).toBe(404)
  })

  it('DELETE /api/lenses/[id] refuses to delete the default lens (409)', async () => {
    const createRes = await postLens(jsonReq('http://test.local/api/lenses', 'POST', { name: 'Default lens', isDefault: true }))
    const created = await createRes.json()

    const res = await deleteLensRoute(getReq(`http://test.local/api/lenses/${created.id}`), { params: Promise.resolve({ id: created.id }) })
    expect(res.status).toBe(409)
  })

  it('DELETE /api/lenses/[id] returns 404 for an unknown id', async () => {
    const res = await deleteLensRoute(getReq('http://test.local/api/lenses/nope'), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(404)
  })
})
