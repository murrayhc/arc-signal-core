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
    historicContext: context?.historicContext ?? null,
    presentContext: context?.presentContext ?? null,
    futureContext: context?.futureContext ?? null,
    scenarios: scenarios.map((s) => ({ scenarioType: s.scenarioType, title: s.title, summary: s.summary, confidence: s.confidence })),
    positioning: positioning.map((p) => ({ title: p.title, userType: p.userType, howItCouldBeUsed: p.howItCouldBeUsed })),
    watchSignals,
    sources,
  }

  const impactLine = (i: { companyName: string; confidence: number; lowConfidence: boolean; impactPathway: string }) =>
    `- **${i.companyName}** (${pct(i.confidence)}${i.lowConfidence ? ', low confidence' : ''}) — ${i.impactPathway}`

  const markdown = [
    `# ${reportType.replace(/_/g, ' ').toLowerCase()} — ${event.title}`,
    ``,
    `_${REPORT_FOCUS[reportType]}_`,
    ``,
    `## Summary`,
    event.summary,
    ``,
    `## Evidence reliability`,
    `Overall reliability: ${pct(reliability)}. Origin traced to ${originUrls.length} source(s).`,
    ``,
    `## Who benefits`,
    beneficiaries.length ? beneficiaries.map(impactLine).join('\n') : '- No specific beneficiary identified in the evidence.',
    ``,
    `## Who is harmed`,
    harmed.length ? harmed.map(impactLine).join('\n') : '- No specific harmed party identified in the evidence.',
    ``,
    `## Historic context`,
    context?.historicContext ?? 'Not yet synthesised.',
    ``,
    `## Present context`,
    context?.presentContext ?? 'Not yet synthesised.',
    ``,
    `## Future scenarios`,
    scenarios.length ? scenarios.map((s) => `- **${s.title}** (${pct(s.confidence)}): ${s.summary}`).join('\n') : '- No scenarios generated.',
    ``,
    `## Strategic positioning examples`,
    positioning.length ? positioning.slice(0, 6).map((p) => `- **${p.title}**: ${p.howItCouldBeUsed}`).join('\n') : '- None generated.',
    ``,
    `## Watch signals`,
    watchSignals.length ? watchSignals.map((w) => `- ${w}`).join('\n') : '- None.',
    ``,
    `## Sources`,
    sources.length ? sources.map((s) => `- ${s}`).join('\n') : '- None recorded.',
    ``,
    `---`,
    `_This is structured intelligence for context only, not investment advice._`,
  ].join('\n')

  assertNoAdviceLanguage(markdown, `report:${reportType}`)
  return { reportType, markdown, sections }
}
