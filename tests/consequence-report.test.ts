import { beforeEach, describe, expect, it } from 'vitest'
import { REPORT_TYPES } from '@/shared/enums'
import { findAdviceLanguage } from '@/server/safety/advice-language'
import { runConsequenceSynthesis } from '@/server/consequence/consequence-pipeline'
import { assembleReport } from '@/server/consequence/report'
import { resetDb } from './helpers'
import { makeEventGraph } from './factories'

const LAYOFF_BODY = 'Voltcore is cutting 400 jobs at its Manchester plant.'

describe('assembleReport', () => {
  beforeEach(resetDb)

  it('assembles an executive brief with who-benefits / who-is-harmed and no advice language', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await runConsequenceSynthesis([event])
    const report = await assembleReport(event.id, 'EXECUTIVE_BRIEF')

    expect(report).not.toBeNull()
    expect(report!.markdown).toContain('Test event')
    expect(report!.markdown.toLowerCase()).toContain('who benefits')
    expect(report!.markdown.toLowerCase()).toContain('who is harmed')
    expect(findAdviceLanguage(report!.markdown)).toEqual([])
  })

  it('returns null for an unknown event', async () => {
    expect(await assembleReport('does-not-exist', 'EXECUTIVE_BRIEF')).toBeNull()
  })

  it('every report type produces advice-clean markdown', async () => {
    const { event } = await makeEventGraph(LAYOFF_BODY, { eventClass: 'RISK', sector: 'manufacturing' })
    await runConsequenceSynthesis([event])
    for (const reportType of REPORT_TYPES) {
      const r = await assembleReport(event.id, reportType)
      expect(r!.markdown.length).toBeGreaterThan(0)
      expect(findAdviceLanguage(r!.markdown)).toEqual([])
    }
  })
})
