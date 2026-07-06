import { beforeEach, describe, expect, it } from 'vitest'
import type { LLMProvider, LLMRequest } from '@/server/llm/types'
import { resolveCompanyImpacts } from '@/server/consequence/company-impact'
import { synthesiseContext } from '@/server/consequence/context'
import { enrichEventConsequence } from '@/server/consequence/enrich'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'
const GOOD_CONTEXT = JSON.stringify({ historic: 'h', present: 'p', future: 'f', executive: 'A Voltcore layoff signal to monitor.' })

function fake(byTask: Record<string, string>): LLMProvider {
  return { name: 'fake', async generate(req: LLMRequest) { return { text: byTask[req.taskType] ?? '', tokensIn: 1, tokensOut: 1 } } }
}

describe('enrich cooldown', () => {
  beforeEach(resetDb)

  it('a second enrich within the cooldown window is a no-op COOLDOWN', async () => {
    const { event } = await makeEventGraph(BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await resolveCompanyImpacts(event.id)
    await synthesiseContext(event.id)
    const provider = fake({
      COMPANY_IMPACT_ANALYSIS: 'Voltcore may face pressure; verify against primary sources.',
      PRESENT_CONTEXT: GOOD_CONTEXT,
    })

    const first = await enrichEventConsequence(event.id, { provider })
    expect(first.status).toBe('ENRICHED')

    const second = await enrichEventConsequence(event.id, { provider })
    expect(second.status).toBe('COOLDOWN')
    expect(second.impactsEnriched).toBe(0)
    expect(second.contextEnriched).toBe(false)
  })
})
