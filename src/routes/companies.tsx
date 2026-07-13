import { createFileRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getCompanies } from "@/lib/archlight/pipeline.functions";
import { Building2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/companies")({
  head: () => ({
    meta: [
      { title: "Arklight · Companies mentioned in public signals" },
      { name: "description", content: "Every company Arklight has traced through public event candidates — beneficiaries, harmed parties, and mixed exposures — with average risk, opportunity and confidence scores." },
      { property: "og:title", content: "Arklight · Companies" },
      { property: "og:description", content: "Traceable company exposure across public signals." },
    ],
  }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const router = useRouter();
  const isDetail = router.state.matches.some((m) => m.routeId === "/companies/$name");
  const { data, isLoading } = useQuery({ queryKey: ["archlight", "companies"], queryFn: () => getCompanies() });
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        {!isDetail && (
          <>
            <header>
              <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2">
                <Building2 className="h-3 w-3"/> Companies register
              </div>
              <h1 className="font-display text-2xl md:text-3xl mt-1">Companies mentioned in public signals</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Aggregated from company_impacts rows across every synthesised event. Scores are averages across all impact rows.</p>
            </header>

            {isLoading && <div className="glass-panel rounded-xl p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</div>}

            {data && (
              <section className="glass-panel rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/50">
                    <tr>
                      <th className="text-left p-3">Company</th>
                      <th className="text-right p-3">Events</th>
                      <th className="text-right p-3">Impacts</th>
                      <th className="text-right p-3">Benef</th>
                      <th className="text-right p-3">Harmed</th>
                      <th className="text-right p-3">Avg risk</th>
                      <th className="text-right p-3">Avg opp</th>
                      <th className="text-right p-3">Avg conf</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.companies.map((c) => (
                      <tr key={c.name} className="border-b border-border/30 hover:bg-accent/30">
                        <td className="p-3">
                          <Link to="/companies/$name" params={{ name: encodeURIComponent(c.name) }} className="font-display hover:text-[color:var(--color-signal)]">{c.name}</Link>
                        </td>
                        <td className="p-3 text-right font-mono">{c.event_count}</td>
                        <td className="p-3 text-right font-mono">{c.impact_count}</td>
                        <td className="p-3 text-right font-mono" style={{ color: c.beneficiary_count ? "var(--color-opportunity)" : undefined }}>{c.beneficiary_count}</td>
                        <td className="p-3 text-right font-mono" style={{ color: c.harmed_count ? "var(--color-risk)" : undefined }}>{c.harmed_count}</td>
                        <td className="p-3 text-right font-mono">{Math.round(c.avg_risk * 100)}</td>
                        <td className="p-3 text-right font-mono">{Math.round(c.avg_opportunity * 100)}</td>
                        <td className="p-3 text-right font-mono">{Math.round(c.avg_confidence * 100)}</td>
                      </tr>
                    ))}
                    {!data.companies.length && (
                      <tr><td colSpan={8} className="p-6 text-center text-muted-foreground italic">No companies yet. Run a scan.</td></tr>
                    )}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
        <Outlet />
      </div>
    </AppShell>
  );
}
