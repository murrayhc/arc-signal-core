import { beforeEach, describe, expect, it } from 'vitest'
import { runConsequenceSynthesis } from '@/server/consequence/consequence-pipeline'
import { getEventDeepReport } from '@/server/services/consequence'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

describe('event interrogation deep output', () => {
  beforeEach(resetDb)

  it('getEventDeepReport returns every deep section populated for a synthesised event', async () => {
    const { event } = await makeEventGraph('Voltcore is cutting 400 jobs at its Manchester plant.', {
      eventClass: 'RISK',
      sector: 'manufacturing',
    })
    await runConsequenceSynthesis([event])
    const deep = await getEventDeepReport(event.id)

    expect(deep.companies.length).toBeGreaterThan(0)
    expect(deep.beneficiaries.length + deep.harmed.length).toBeGreaterThan(0)
    expect(deep.context).not.toBeNull()
    expect(deep.context!.presentContext.length).toBeGreaterThan(0)
    expect(deep.scenarios).toHaveLength(5)
    expect(deep.positioning.length).toBeGreaterThan(0)
    expect(deep.watchSignals.length).toBeGreaterThan(0)
  })
})
