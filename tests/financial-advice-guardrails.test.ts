import { beforeEach, describe, expect, it } from 'vitest'
import { REPORT_TYPES } from '@/shared/enums'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { runConsequenceSynthesis } from '@/server/consequence/consequence-pipeline'
import { assembleReport } from '@/server/consequence/report'
import { getEventDeepReport } from '@/server/services/consequence'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const FORBIDDEN = [
  'you should buy this stock',
  'you should sell this position',
  'we issue a buy rating',
  'a sell rating on the name',
  'a hold rating on this name',
  'our target price is 45p',
  'a guaranteed profit',
  'a certain return for holders',
  'adjust your portfolio allocation',
]

describe('financial advice guardrails', () => {
  it('flags every forbidden phrase category', () => {
    for (const phrase of FORBIDDEN) {
      expect(findAdviceLanguage(phrase).length).toBeGreaterThan(0)
    }
  })

  describe('generated consequence output', () => {
    beforeEach(resetDb)

    it('produces no forbidden language across impacts, context, scenarios, positioning and every report', async () => {
      const { event } = await makeEventGraph('Voltcore is cutting 400 jobs at its Manchester plant.', {
        eventClass: 'RISK',
        sector: 'manufacturing',
      })
      await runConsequenceSynthesis([event])
      const deep = await getEventDeepReport(event.id)

      const texts: string[] = [
        ...deep.companies.map((c) => c.impactPathway),
        ...deep.scenarios.map((s) => s.summary),
        ...deep.positioning.flatMap((p) => [p.positioningAngle, p.howItCouldBeUsed, p.whyItMayMatter]),
      ]
      if (deep.context) texts.push(deep.context.historicContext, deep.context.presentContext, deep.context.futureContext)
      for (const reportType of REPORT_TYPES) {
        const r = await assembleReport(event.id, reportType)
        texts.push(r!.markdown)
      }

      for (const t of texts) expect(findAdviceLanguage(t)).toEqual([])
    })
  })
})
