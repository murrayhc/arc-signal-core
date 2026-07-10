import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/archlight/AppShell";
import { createWatchlist, deleteWatchlist, getWatchlists, markAlertSeen } from "@/lib/archlight/pipeline.functions";
import { Bell, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Archlight · Watchlists & alerts" },
      { name: "description", content: "Save named intelligence filters over sectors, regions, keywords and score thresholds. Every scan checks new events against every watchlist and fires an alert on a match." },
      { property: "og:title", content: "Archlight · Watchlists" },
      { property: "og:description", content: "Save intelligence filters and receive alerts when public signals match." },
    ],
  }),
  component: WatchlistPage,
});

function csv(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function WatchlistPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["archlight", "watchlists"], queryFn: () => getWatchlists() });
  type CreateInput = { name: string; description?: string; sectors: string[]; regions: string[]; keywords: string[]; min_risk: number; min_opportunity: number; min_confidence: number };
  const create = useMutation({
    mutationFn: (input: CreateInput) => createWatchlist({ data: input }),
    onSuccess: () => { toast.success("Watchlist saved"); qc.invalidateQueries({ queryKey: ["archlight", "watchlists"] }); },
    onError: (e) => toast.error("Failed", { description: e instanceof Error ? e.message : String(e) }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteWatchlist({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archlight", "watchlists"] }),
  });
  const mark = useMutation({
    mutationFn: (id: string) => markAlertSeen({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["archlight", "watchlists"] }),
  });

  const [name, setName] = useState("");
  const [sectors, setSectors] = useState("");
  const [regions, setRegions] = useState("");
  const [keywords, setKeywords] = useState("");
  const [minRisk, setMinRisk] = useState(0);
  const [minOpp, setMinOpp] = useState(0);
  const [minConf, setMinConf] = useState(0);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <header>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-2"><Eye className="h-3 w-3"/> watchlists & alerts</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1">Watchlists</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Every 6h Archlight scans public signals. Any new event matching a watchlist becomes an alert here.</p>
        </header>

        <section className="glass-panel rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><Plus className="h-4 w-4" style={{ color: "var(--color-signal)" }}/><h2 className="font-display text-sm">Create watchlist</h2></div>
          <form
            className="grid md:grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) { toast.error("Name required"); return; }
              create.mutate({
                name: name.trim(),
                sectors: csv(sectors), regions: csv(regions), keywords: csv(keywords),
                min_risk: minRisk, min_opportunity: minOpp, min_confidence: minConf,
              });
              setName(""); setSectors(""); setRegions(""); setKeywords(""); setMinRisk(0); setMinOpp(0); setMinConf(0);
            }}
          >
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-8 px-2 rounded border border-border/60 bg-background/50 text-xs"/></Field>
            <Field label="Sectors (comma)"><input value={sectors} onChange={(e) => setSectors(e.target.value)} placeholder="energy, defence" className="w-full h-8 px-2 rounded border border-border/60 bg-background/50 text-xs"/></Field>
            <Field label="Regions (comma)"><input value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="eu, uk" className="w-full h-8 px-2 rounded border border-border/60 bg-background/50 text-xs"/></Field>
            <Field label="Keywords (comma)"><input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="lithium, procurement" className="w-full h-8 px-2 rounded border border-border/60 bg-background/50 text-xs"/></Field>
            <Field label={`Min risk (${minRisk})`}><input type="range" min={0} max={1} step={0.05} value={minRisk} onChange={(e) => setMinRisk(Number(e.target.value))} className="w-full accent-[color:var(--color-signal)]"/></Field>
            <Field label={`Min opportunity (${minOpp})`}><input type="range" min={0} max={1} step={0.05} value={minOpp} onChange={(e) => setMinOpp(Number(e.target.value))} className="w-full accent-[color:var(--color-signal)]"/></Field>
            <Field label={`Min confidence (${minConf})`}><input type="range" min={0} max={1} step={0.05} value={minConf} onChange={(e) => setMinConf(Number(e.target.value))} className="w-full accent-[color:var(--color-signal)]"/></Field>
            <div className="flex items-end">
              <button type="submit" disabled={create.isPending} className="h-8 px-4 rounded border border-[color:var(--color-signal)]/60 text-xs text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50">{create.isPending ? "Saving…" : "Save watchlist"}</button>
            </div>
          </form>
        </section>

        {isLoading && <div className="glass-panel rounded-xl p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</div>}

        {data && (
          <div className="grid md:grid-cols-2 gap-5">
            <section className="glass-panel rounded-xl p-4">
              <h2 className="font-display text-sm mb-2">Saved watchlists ({data.watchlists.length})</h2>
              <ul className="space-y-2">
                {data.watchlists.map((w) => (
                  <li key={w.id} className="rounded border border-border/40 p-3 bg-background/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-display text-sm">{w.name}</div>
                      <button onClick={() => del.mutate(w.id)} className="text-[10px] font-mono text-muted-foreground hover:text-[color:var(--color-risk)] flex items-center gap-1"><Trash2 className="h-3 w-3"/>delete</button>
                    </div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {(w.sectors ?? []).length > 0 && <span className="mr-2">sectors: {w.sectors.join(", ")}</span>}
                      {(w.regions ?? []).length > 0 && <span className="mr-2">regions: {w.regions.join(", ")}</span>}
                      {(w.keywords ?? []).length > 0 && <span className="mr-2">kw: {w.keywords.join(", ")}</span>}
                    </div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      thresholds · risk ≥ {Number(w.min_risk).toFixed(2)} · opp ≥ {Number(w.min_opportunity).toFixed(2)} · conf ≥ {Number(w.min_confidence).toFixed(2)}
                    </div>
                  </li>
                ))}
                {!data.watchlists.length && <div className="text-xs italic text-muted-foreground text-center py-4">None yet.</div>}
              </ul>
            </section>

            <section className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2"><Bell className="h-4 w-4" style={{ color: "var(--color-signal)" }}/><h2 className="font-display text-sm">Alerts ({data.alerts.length})</h2></div>
              <ul className="space-y-2">
                {data.alerts.map((a) => (
                  <li key={a.id} className="rounded border p-3 bg-background/30" style={{ borderColor: a.seen ? "var(--color-border)" : (a.severity === "high" ? "var(--color-risk)" : "var(--color-signal)") }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs">{a.reason}</div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground shrink-0">{a.severity}{a.seen ? " · seen" : ""}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      <span>{new Date(a.created_at).toISOString().slice(0, 16).replace("T", " ")}</span>
                      <Link to="/events/$id" params={{ id: a.event_candidate_id }} className="underline hover:text-foreground">view event →</Link>
                      {!a.seen && <button onClick={() => mark.mutate(a.id)} className="ml-auto underline hover:text-foreground">mark seen</button>}
                    </div>
                  </li>
                ))}
                {!data.alerts.length && <div className="text-xs italic text-muted-foreground text-center py-4">No alerts yet.</div>}
              </ul>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
