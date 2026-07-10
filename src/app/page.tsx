import Link from 'next/link'
import { getDashboardData } from '@/server/services/dashboard'
import { getGraphForRender } from '@/server/services/graph'
import {
  getEventConfidenceSummary,
  getLastScanCounters,
  getRegionalPressure,
  getTrendSignals,
} from '@/server/services/command-centre'
import { getConsequenceSummariesForEvents } from '@/server/services/consequence'
import { listWatchMarkets } from '@/server/watch/service'
import { getActiveProvider } from '@/server/llm/provider'
import { getMarketStatus } from '@/server/market/provider'
import { EventCard } from '@/components/EventCard'
import { OpportunityCard } from '@/components/OpportunityCard'
import { InboxList } from '@/components/InboxList'
import { TopNav } from '@/components/dashboard/TopNav'
import { SideNav } from '@/components/dashboard/SideNav'
import { CommandBar } from '@/components/dashboard/CommandBar'
import { StatChips } from '@/components/dashboard/StatChips'
import { ScanStatusCompact } from '@/components/dashboard/ScanStatusCompact'
import { SelectionProvider } from '@/components/dashboard/SelectionProvider'
import { IntelligenceBrain } from '@/components/dashboard/IntelligenceBrain'
import { NodeDetailPanel } from '@/components/dashboard/NodeDetailPanel'
import { ActiveOpportunities } from '@/components/dashboard/ActiveOpportunities'
import { TopRisks } from '@/components/dashboard/TopRisks'
import { ScanCoverage, SourceStrip } from '@/components/dashboard/ScanCoverage'
import { TrendSignals } from '@/components/dashboard/TrendSignals'
import { RegionalPressure } from '@/components/dashboard/RegionalPressure'
import { MarketFocus } from '@/components/dashboard/MarketFocus'
import { SystemConfidence } from '@/components/dashboard/SystemConfidence'
import { GlobalPulseTicker, type TickerItem } from '@/components/dashboard/GlobalPulseTicker'
import { pct } from '@/components/dashboard/chrome'

export const dynamic = 'force-dynamic'

/** Secondary drawer: the pre-redesign card sections, preserved one click away. */
function Drawer({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border border-line bg-abyss/40">
      <summary className="cursor-pointer list-none px-3 py-2 font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-dim transition hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="mr-2 inline-block text-signal transition-transform group-open:rotate-90">▸</span>
        {title}
      </summary>
      <div className="border-t border-line/60 p-3">{children}</div>
    </details>
  )
}

export default async function DashboardPage() {
  const [data, graph, watchMarkets, trends, regions, confidence, counters, llmProvider] =
    await Promise.all([
      getDashboardData(),
      getGraphForRender(),
      listWatchMarkets(),
      getTrendSignals(),
      getRegionalPressure(),
      getEventConfidenceSummary(),
      getLastScanCounters(),
      getActiveProvider(),
    ])
  const market = getMarketStatus()
  const marketConfigured = market.status === 'CONFIGURED'
  const llmConfigured = llmProvider !== null

  const hasEvents = data.inbox.length > 0
  const fixtureOnly = hasEvents && data.inbox.every((item) => item.isFixture)
  const healthySources = data.sources.filter((s) => s.healthStatus === 'HEALTHY').length
  const activeSources = data.sources.filter((s) => s.isActive).length
  const issueCount = data.lastScan?.errors.length ?? 0
  // Risk pressure column: the RISK_RADAR feed as-is. The pipeline already
  // routes MIXED events into this feed, and the feed respects dismissals —
  // merging from the status-unfiltered inbox would resurrect dismissed events.
  const risks = data.riskRadar
  const consequenceSummaries = await getConsequenceSummariesForEvents([
    ...new Set([...risks, ...data.opportunityRadar].map((c) => c.eventId)),
  ])
  const replayTarget = data.inbox[0] ? `/events/${data.inbox[0].eventId}#graph-replay` : '/graph'

  const ticker: TickerItem[] = [
    ...(data.lastScan
      ? [{ label: 'Last scan', value: data.lastScan.status.replace(/_/g, ' ').toLowerCase(), tone: issueCount > 0 ? ('warn' as const) : ('teal' as const) }]
      : [{ label: 'Scans', value: 'none yet' }]),
    { label: 'Graph', value: `${graph.stats.nodeCount} nodes · ${graph.stats.edgeCount} edges`, tone: 'signal' },
    ...trends.slice(0, 3).map((t) => ({
      label: t.novelty >= 0.6 ? 'Rising signal' : 'Signal',
      value: `${t.title} ${pct(t.strength)}${t.isFixture ? ' · fixture' : ''}`,
      tone: 'teal' as const,
    })),
    ...(risks[0]
      ? [{ label: 'Top risk', value: `${risks[0].title} ${pct(risks[0].riskScore)}${risks[0].isFixture ? ' · fixture' : ''}`, tone: 'risk' as const }]
      : []),
    ...(data.opportunityRadar[0]
      ? [{ label: 'Top opportunity', value: `${data.opportunityRadar[0].title} ${pct(data.opportunityRadar[0].commercialValueScore)}${data.opportunityRadar[0].isFixture ? ' · fixture' : ''}`, tone: 'gold' as const }]
      : []),
    { label: 'Sources', value: `${healthySources}/${data.sources.length} healthy`, tone: healthySources === data.sources.length ? 'teal' : 'warn' },
    {
      label: 'Markets',
      value: marketConfigured ? `provider ${market.provider}` : 'Market provider not configured',
      tone: marketConfigured ? 'teal' : 'faint',
    },
    {
      label: 'Commodities',
      value: marketConfigured ? `provider ${market.provider}` : 'Commodity provider not configured',
      tone: marketConfigured ? 'teal' : 'faint',
    },
    { label: 'LLM layer', value: llmConfigured ? 'active' : 'dormant', tone: llmConfigured ? 'signal' : 'faint' },
    {
      label: 'System confidence',
      value: confidence.avgConfidence === null ? '—' : pct(confidence.avgConfidence),
      tone: 'signal',
    },
  ]

  return (
    <div className="cc-mesh flex h-dvh min-h-[40rem] flex-col bg-void font-body text-ink">
      <h1 className="sr-only">Archlight — live intelligence command centre</h1>
      <TopNav
        issueCount={issueCount}
        meanConfidence={confidence.avgConfidence}
        modelConfigured={llmConfigured}
      />

      <div className="flex min-h-0 flex-1">
        <SideNav
          lastScan={
            data.lastScan
              ? {
                  startedAt: data.lastScan.startedAt,
                  status: data.lastScan.status,
                  errorCount: data.lastScan.errors.length,
                }
              : null
          }
          activeSources={activeSources}
          healthySources={healthySources}
          totalSources={data.sources.length}
        />

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3 p-3">
            {/* Command row: interrogation + scan outcome */}
            <div className="flex flex-col gap-2">
              <CommandBar />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ScanStatusCompact lastScan={data.lastScan} />
                {fixtureOnly && (
                  <p className="border border-warn/50 bg-warn/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-warn">
                    Fixture intelligence data shown — run a scan to populate live events
                  </p>
                )}
              </div>
            </div>

            <StatChips
              counts={data.counts}
              opportunityCount={data.opportunityRadar.length}
              healthySources={healthySources}
              totalSources={data.sources.length}
              meanConfidence={confidence.avgConfidence}
            />

            {/* The command centre: opportunities | BRAIN | risks / node detail */}
            <SelectionProvider>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)_minmax(17rem,20rem)] xl:auto-rows-[minmax(28rem,calc(100dvh-21rem))]">
                <div className="order-2 min-h-80 lg:order-1">
                  <ActiveOpportunities cards={data.opportunityRadar} summaries={consequenceSummaries} />
                </div>
                <div className="order-1 lg:order-2">
                  <IntelligenceBrain
                    nodes={graph.nodes}
                    edges={graph.edges}
                    byType={graph.stats.byType}
                    signalsLastScan={counters?.signalsCreated ?? null}
                    meanConfidence={confidence.avgConfidence}
                    lastScanAt={data.lastScan?.startedAt ?? null}
                  />
                </div>
                {/* id lives on the wrapper so the #top-risks anchor survives
                    the panel swapping to node detail */}
                <div id="top-risks" className="order-3 min-h-80 lg:col-span-2 xl:col-span-1">
                  <NodeDetailPanel>
                    <TopRisks risks={risks} summaries={consequenceSummaries} />
                  </NodeDetailPanel>
                </div>
              </div>
            </SelectionProvider>

            {/* Operational grid */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              <ScanCoverage counters={counters} sources={data.sources} />
              <TrendSignals trends={trends} />
              <RegionalPressure regions={regions} />
              <MarketFocus
                watchMarkets={watchMarkets}
                marketConfigured={marketConfigured}
                marketProvider={market.provider}
              />
              <SystemConfidence
                meanConfidence={confidence.avgConfidence}
                highConfidenceShare={confidence.highConfidenceShare}
                eventCount={confidence.eventCount}
                healthySources={healthySources}
                totalSources={data.sources.length}
                llmConfigured={llmConfigured}
                marketConfigured={marketConfigured}
                lastScanStatus={data.lastScan?.status ?? null}
              />
            </div>

            {/* Graph replay — preserved action, now an operational shortcut */}
            <div className="flex flex-wrap items-center gap-3 border border-line bg-abyss/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-ink-faint">Graph replay</p>
              <p className="text-xs text-ink-dim">
                Step through how the intelligence graph formed across scans.
              </p>
              <Link
                href={replayTarget}
                className="ml-auto border border-violet/50 bg-violet/10 px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-violet transition hover:bg-violet/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet"
              >
                Open graph replay →
              </Link>
            </div>

            {/* Secondary intelligence: the full card feeds, one click away */}
            {hasEvents && (
              <div className="space-y-2">
                <Drawer title={`Live Risk Radar — ${data.riskRadar.length}`}>
                  {data.riskRadar.length === 0 ? (
                    <p className="text-xs text-ink-faint">No risk events detected.</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {data.riskRadar.map((card) => (
                        <EventCard key={card.eventId} card={card} />
                      ))}
                    </div>
                  )}
                </Drawer>
                <Drawer title={`Opportunity Signals — ${data.opportunitySignals.length}`}>
                  {data.opportunitySignals.length === 0 ? (
                    <p className="text-xs text-ink-faint">No opportunity events detected.</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {data.opportunitySignals.map((card) => (
                        <EventCard key={card.eventId} card={card} />
                      ))}
                    </div>
                  )}
                </Drawer>
                <Drawer title={`Opportunity Radar — ${data.opportunityRadar.length}`}>
                  {data.opportunityRadar.length === 0 ? (
                    <p className="text-xs text-ink-faint">No commercial opportunities detected.</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {data.opportunityRadar.map((card) => (
                        <OpportunityCard key={card.id} card={card} />
                      ))}
                    </div>
                  )}
                </Drawer>
                <Drawer title={`Emerging Event Inbox — ${data.inbox.length}`}>
                  <InboxList items={data.inbox} />
                </Drawer>
              </div>
            )}

            <Drawer title={`Data provenance — ${data.sources.length} sources`}>
              <SourceStrip sources={data.sources} />
              <p className="mt-3 flex gap-3 text-[10px] text-ink-faint">
                <Link href="/scans" className="underline hover:text-ink">
                  Scan history
                </Link>
                <Link href="/admin/sources" className="underline hover:text-ink">
                  Source admin
                </Link>
                <Link href="/graph" className="underline hover:text-ink">
                  Graph stats
                </Link>
                <Link href="/review" className="underline hover:text-ink">
                  Review queue
                </Link>
                <Link href="/track-record" className="underline hover:text-ink">
                  Track record
                </Link>
              </p>
            </Drawer>
          </div>
        </main>
      </div>

      <GlobalPulseTicker items={ticker} />
    </div>
  )
}
