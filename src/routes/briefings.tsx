import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sunrise, Check, RefreshCcw, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/archlight/AppShell";
import { listBriefings, runDailyBriefingNow } from "@/lib/archlight/briefing.functions";

export const Route = createFileRoute("/briefings")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Morning briefings" },
      { name: "description", content: "Daily per-profile briefing of what moved overnight — factual, hedged, GBP only." },
    ],
  }),
  component: BriefingsPage,
});

type TopHit = {
  item: string;
  kind: string;
  event_id: string;
  event_title: string;
  direction: string;
  relevance: number;
  rationale: string | null;
};

type Stats = {
  new_hits?: number;
  top?: TopHit[];
  resolved?: number;
  best_lead_days?: number | null;
};

function BriefingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["briefings"],
    queryFn: () => listBriefings({ data: {} }),
  });
  const runNow = useMutation({
    mutationFn: () => runDailyBriefingNow(),
    onSuccess: (r) => {
      toast.success(`Briefings: ${r.generated} generated, ${r.delivered} delivered`);
      qc.invalidateQueries({ queryKey: ["briefings"] });
    },
    onError: (e) => toast.error("Briefing failed", { description: e instanceof Error ? e.message : String(e) }),
  });

  const briefings = data?.briefings ?? [];
  const profileMap = new Map((data?.profiles ?? []).map((p) => [p.id, p]));

  // Group by profile
  const byProfile = new Map<string, typeof briefings>();
  for (const b of briefings) {
    const arr = byProfile.get(b.profile_id) ?? [];
    arr.push(b);
    byProfile.set(b.profile_id, arr);
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
              <Sunrise className="h-3.5 w-3.5"/> Morning briefing
            </div>
            <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal">What moved overnight</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              A short daily briefing per exposure profile, composed from the last 24 hours of scored hits and resolved predictions. Scheduled at 06:30 UTC and pushed to your delivery channels.
            </p>
          </div>
          <button
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${runNow.isPending ? "animate-spin" : ""}`}/>
            {runNow.isPending ? "Running…" : "Run today's briefing"}
          </button>
        </header>

        {isLoading && <div className="glass-panel rounded-xl p-6 text-sm text-muted-foreground">Loading…</div>}

        {!isLoading && briefings.length === 0 && (
          <div className="glass-panel rounded-xl p-8 text-center">
            <div className="font-display text-lg">No briefings yet</div>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
              Briefings are generated at 06:30 UTC for each active exposure profile with at least one new hit in the previous 24h. Add items on <Link to="/exposures" className="underline decoration-dotted text-[color:var(--color-signal)]">Exposures</Link>, then wait for the next scan and morning run — or use the button above.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {Array.from(byProfile.entries()).map(([profileId, list]) => {
            const profile = profileMap.get(profileId);
            return (
              <section key={profileId} className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-lg">{profile?.name ?? "Profile"}</h2>
                  {profile && (
                    <span className={`text-[10px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border ${profile.active ? "border-[color:var(--color-growth)]/60 text-[color:var(--color-growth)]" : "border-border/60 text-muted-foreground"}`}>
                      {profile.active ? "active" : "paused"}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {list.length} briefing{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="mt-3 flex flex-col gap-3">
                  {list.map((b) => {
                    const stats = (b.stats ?? {}) as Stats;
                    const top = stats.top ?? [];
                    return (
                      <li key={b.id} className="rounded-lg border border-border/50 bg-background/30 p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                            {b.briefing_date}
                          </span>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                            {stats.new_hits ?? 0} new hit{(stats.new_hits ?? 0) === 1 ? "" : "s"}
                          </span>
                          {(stats.resolved ?? 0) > 0 && (
                            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                              {stats.resolved} resolved{stats.best_lead_days != null ? ` · best lead ${stats.best_lead_days}d` : ""}
                            </span>
                          )}
                          <span className={`ml-auto inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest ${b.delivered_at ? "text-[color:var(--color-growth)]" : "text-muted-foreground"}`}>
                            {b.delivered_at ? <><Check className="h-3 w-3"/> delivered</> : "not delivered"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm">{b.summary}</p>
                        {top.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-1">
                            {top.map((t, i) => (
                              <li key={`${b.id}-${i}`} className="text-[11px] text-muted-foreground flex items-start gap-2">
                                <span className="text-[color:var(--color-signal)] font-mono tabular-nums shrink-0">
                                  {Math.round(t.relevance * 100)}%
                                </span>
                                <span className="min-w-0">
                                  <span className="text-foreground">{t.item}</span>
                                  <span className="mx-1 text-muted-foreground">·</span>
                                  <Link
                                    to="/events/$id"
                                    params={{ id: t.event_id }}
                                    className="underline decoration-dotted hover:text-foreground"
                                  >
                                    {t.event_title}
                                  </Link>
                                  <span className="ml-1 text-[10px] font-mono uppercase">({t.direction})</span>
                                  {t.rationale && <span className="block text-[11px] text-muted-foreground mt-0.5">{t.rationale}</span>}
                                </span>
                                <Link
                                  to="/events/$id"
                                  params={{ id: t.event_id }}
                                  className="shrink-0 text-muted-foreground hover:text-foreground"
                                  aria-label="Open event"
                                >
                                  <ExternalLink className="h-3 w-3"/>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
