import { prisma } from '@/server/db'
import { type ReportType } from '@/shared/enums'
import { assertNoAdviceLanguage } from '@/server/safety/advice-language'
import { canonicalIdsForEvent } from '@/server/evidence/investigation-loop'
import { getEventCompanyImpacts } from '@/server/services/consequence'

const pct = (n: number) => `${Math.round(n * 100)}%`

const REPORT_FOCUS: Record<ReportType, string> = {
  EXECUTIVE_BRIEF: 'Executive summary of what happened, who is affected, and what to watch.',
  SALES_OPPORTUNITY_BRIEF: 'Where commercial opportunity may exist and how a team could position around it.',
  RISK_BRIEF: 'What is at risk, who is exposed, and what would confirm or weaken the risk.',
  PROCUREMENT_BRIEF: 'Procurement-relevant exposure and supplier/buyer implications.',
  MARKET_CONTEXT_BRIEF: 'Market and sector context around this event.',
  COMPANY_EXPOSURE_BRIEF: 'Named company and category exposure with evidence lineage.',
}

/** Section keys a report can render. */
type SectionKey =
  | 'summary'
  | 'reliability'
  | 'beneficiaries'
  | 'harmed'
  | 'historic'
  | 'present'
  | 'future'
  | 'scenarios'
  | 'positioning'
  | 'watch'
  | 'sources'

/** Per-report-type section SELECTION and ORDERING — this is what makes a
 *  SALES brief genuinely different from a RISK brief rather than the same body
 *  under a different header. A sales brief leads with beneficiaries and
 *  positioning; a risk brief with harmed parties, contradictions and watch
 *  signals; procurement with suppliers/buyers; etc. Reliability, sources and a
 *  non-advisory footer appear in every type. */
const REPORT_SECTIONS: Record<ReportType, SectionKey[]> = {
  EXECUTIVE_BRIEF: ['summary', 'reliability', 'harmed', 'beneficiaries', 'present', 'future', 'watch', 'sources'],
  SALES_OPPORTUNITY_BRIEF: ['summary', 'beneficiaries', 'positioning', 'scenarios', 'watch', 'reliability', 'sources'],
  RISK_BRIEF: ['summary', 'harmed', 'reliability', 'present', 'scenarios', 'watch', 'historic', 'sources'],
  PROCUREMENT_BRIEF: ['summary', 'beneficiaries', 'harmed', 'present', 'watch', 'reliability', 'sources'],
  MARKET_CONTEXT_BRIEF: ['summary', 'present', 'historic', 'future', 'scenarios', 'reliability', 'sources'],
  COMPANY_EXPOSURE_BRIEF: ['summary', 'harmed', 'beneficiaries', 'reliability', 'positioning', 'sources'],
}

const BENEFICIARY_TYPES = new Set(['BENEFICIARY', 'MIXED'])
const HARMED_TYPES = new Set(['HARMED', 'MIXED', 'EXPOSED'])

function parseArr(json: string): string[] {
  try {
    const j = JSON.parse(json)
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** Parses a persisted llmNarrativeJson into the enriched narrative shape, or
 *  null if absent/malformed. */
function safeNarrative(
  json: string | null,
): { historic: string; present: string; future: string; executive: string } | null {
  if (!json) return null
  try {
    const j = JSON.parse(json)
    if (
      j &&
      typeof j.historic === 'string' &&
      typeof j.present === 'string' &&
      typeof j.future === 'string' &&
      typeof j.executive === 'string'
    ) {
      return { historic: j.historic, present: j.present, future: j.future, executive: j.executive }
    }
  } catch {
    /* fall through to null */
  }
  return null
}

async function eventSourceNames(eventCandidateId: string): Promise<string[]> {
  const clusters = await prisma.signalCluster.findMany({ where: { eventCandidateId }, select: { id: true } })
  if (clusters.length === 0) return []
  const links = await prisma.signalClusterSignal.findMany({
    where: { clusterId: { in: clusters.map((c) => c.id) } },
    select: { signal: { select: { source: { select: { name: true } } } } },
  })
  return [...new Set(links.map((l) => l.signal.source.name))]
}

/** Assembles a deterministic, advice-guarded intelligence report for an event.
 *  Returns null for an unknown event. Every report type includes the full chain:
 *  summary → reliability → origin → who benefits / is harmed → context →
 *  scenarios → positioning → watch signals → sources. */
export async function assembleReport(
  eventCandidateId: string,
  reportType: ReportType,
): Promise<{ reportType: ReportType; markdown: string; sections: Record<string, unknown> } | null> {
  const event = await prisma.eventCandidate.findUnique({ where: { id: eventCandidateId } })
  if (!event) return null

  const canonicalIds = await canonicalIdsForEvent(eventCandidateId)
  const canonicals = canonicalIds.length ? await prisma.canonicalClaim.findMany({ where: { id: { in: canonicalIds } } }) : []
  const reliability = canonicals.reduce((m, c) => Math.max(m, c.reliabilityScore), 0)
  const originUrls = canonicals.map((c) => c.originCandidateUrl).filter((u): u is string => !!u)

  const impacts = await getEventCompanyImpacts(eventCandidateId)
  const beneficiaries = impacts.filter((i) => BENEFICIARY_TYPES.has(i.impactType))
  const harmed = impacts.filter((i) => HARMED_TYPES.has(i.impactType))

  const context = await prisma.eventContextSynthesis.findUnique({ where: { eventCandidateId } })
  const narrative = safeNarrative(context?.llmNarrativeJson ?? null)
  const scenarios = await prisma.futureScenario.findMany({ where: { eventCandidateId }, orderBy: { confidence: 'desc' } })
  const positioning = await prisma.strategicPositioningExample.findMany({ where: { eventCandidateId }, orderBy: { confidence: 'desc' } })
  const sources = await eventSourceNames(eventCandidateId)

  const watchSignals = [
    ...new Set([
      ...scenarios.flatMap((s) => parseArr(s.confirmingSignalsJson)),
      ...impacts.flatMap((i) => i.watchSignals),
    ]),
  ].slice(0, 10)

  const sections = {
    reportType,
    focus: REPORT_FOCUS[reportType],
    summary: event.summary,
    reliability,
    originSourcesTraced: originUrls.length,
    beneficiaries,
    harmed,
    aiEnhanced: !!narrative,
    executiveNarrative: narrative?.executive ?? null,
    historicContext: narrative?.historic ?? context?.historicContext ?? null,
    presentContext: narrative?.present ?? context?.presentContext ?? null,
    futureContext: narrative?.future ?? context?.futureContext ?? null,
    scenarios: scenarios.map((s) => ({ scenarioType: s.scenarioType, title: s.title, summary: s.summary, confidence: s.confidence })),
    positioning: positioning.map((p) => ({ title: p.title, userType: p.userType, howItCouldBeUsed: p.howItCouldBeUsed })),
    watchSignals,
    sources,
  }

  const impactLine = (i: { companyName: string; confidence: number; lowConfidence: boolean; impactPathway: string }) =>
    `- **${i.companyName}** (${pct(i.confidence)}${i.lowConfidence ? ', low confidence' : ''}) — ${i.impactPathway}`

  // Each section rendered as [heading, body]; the per-type ordering above
  // selects and sequences them.
  const renderSection: Record<SectionKey, () => [string, string]> = {
    summary: () => ['Summary', narrative?.executive ? `${narrative.executive}\n\n${event.summary}` : event.summary],
    reliability: () => [
      'Evidence reliability',
      `Overall reliability: ${pct(reliability)}. Origin traced to ${originUrls.length} source(s).`,
    ],
    beneficiaries: () => [
      'Who benefits',
      beneficiaries.length ? beneficiaries.map(impactLine).join('\n') : '- No specific beneficiary identified in the evidence.',
    ],
    harmed: () => [
      'Who is harmed',
      harmed.length ? harmed.map(impactLine).join('\n') : '- No specific harmed party identified in the evidence.',
    ],
    historic: () => ['Historic context', narrative?.historic ?? context?.historicContext ?? 'Not yet synthesised.'],
    present: () => ['Present context', narrative?.present ?? context?.presentContext ?? 'Not yet synthesised.'],
    future: () => ['Future outlook', narrative?.future ?? context?.futureContext ?? 'Not yet synthesised.'],
    scenarios: () => [
      'Future scenarios',
      scenarios.length ? scenarios.map((s) => `- **${s.title}** (${pct(s.confidence)}): ${s.summary}`).join('\n') : '- No scenarios generated.',
    ],
    positioning: () => [
      'Strategic positioning examples',
      positioning.length ? positioning.slice(0, 6).map((p) => `- **${p.title}**: ${p.howItCouldBeUsed}`).join('\n') : '- None generated.',
    ],
    watch: () => ['Watch signals', watchSignals.length ? watchSignals.map((w) => `- ${w}`).join('\n') : '- None.'],
    sources: () => ['Sources', sources.length ? sources.map((s) => `- ${s}`).join('\n') : '- None recorded.'],
  }

  const orderedSections = REPORT_SECTIONS[reportType]
  const body = orderedSections
    .map((key) => {
      const [heading, content] = renderSection[key]()
      return `## ${heading}\n${content}`
    })
    .join('\n\n')

  const markdown = [
    `# ${reportType.replace(/_/g, ' ').toLowerCase()} — ${event.title}`,
    ``,
    `_${REPORT_FOCUS[reportType]}_`,
    ``,
    body,
    ``,
    `---`,
    `_This is structured intelligence for context only, not investment advice._`,
  ].join('\n')

  assertNoAdviceLanguage(markdown, `report:${reportType}`)
  return { reportType, markdown, sections: { ...sections, orderedSections } }
}
