import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { formatDateUK } from "@/lib/format-datetime";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getSourceDetail } from "@/lib/archlight/pipeline.functions";
import { ArrowLeft, Database, ExternalLink, Loader2 } from "lucide-react";

export const Route = createFileRoute("/sources/$id")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Source detail" },
      { name: "description", content: "Reliability, health, recent documents and lineage contribution for a single Arklight source." },
      { property: "og:title", content: "Project Arklight · Source detail" },
      { property: "og:description", content: "Provenance and health for a single public-signal source." },
    ],
  }),
  component: SourceDetailPage,
});

function SourceDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ["archlight", "source", id],
    queryFn: () => getSourceDetail({ data: { id } }),
  });
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
        <button onClick={() => router.history.back()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit"><ArrowLeft className="h-3.5 w-3.5"/>Back</button>
        {isLoading && <div className="glass-panel rounded-xl p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Loading…</div>}
        {data?.source && (
          <>
            <header className="glass-panel rounded-xl p-5">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2"><Database className="h-3 w-3"/> source</div>
              <h1 className="font-display text-2xl mt-1">{data.source.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span className="px-2 py-1 rounded border border-border/60">type · {data.source.source_type}</span>
                <span className="px-2 py-1 rounded border border-border/60">status · {data.source.status}</span>
                <span className="px-2 py-1 rounded border border-border/60">feed · {data.source.feed_kind}</span>
                <span className="px-2 py-1 rounded border border-border/60">reliability {Math.round(Number(data.source.reliability_score) * 100)}</span>
                <span className="px-2 py-1 rounded border border-border/60">health {Math.round(Number(data.source.health_score) * 100)}</span>
                {data.source.is_synthetic && <span className="px-2 py-1 rounded border border-border/60">synthetic</span>}
              </div>
              {data.source.feed_url && <div className="mt-2 text-[11px] font-mono text-muted-foreground break-all">feed · {data.source.feed_url}</div>}
            </header>

            <section className="glass-panel rounded-xl p-4">
              <h2 className="font-display text-sm mb-3">Recent documents ({data.documents.length})</h2>
              <ul className="space-y-2">
                {data.documents.map((d) => (
                  <li key={d.id} className="rounded border border-border/40 bg-background/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm">{d.title}</div>
                      <div className="flex items-center gap-2 shrink-0">
                        {d.is_likely_copy && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--color-risk)", color: "var(--color-risk)" }}>likely copy · {Number(d.copy_loop_score).toFixed(2)}</span>}
                        {d.is_synthetic && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50">synthetic</span>}
                        {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ExternalLink className="h-3 w-3"/>open</a>}
                      </div>
                    </div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {d.published_at ? new Date(d.published_at).toISOString().slice(0, 10) : "—"} · collected {d.fetched_at ? new Date(d.fetched_at).toISOString().slice(0, 10) : "—"}
                    </div>
                  </li>
                ))}
                {!data.documents.length && <div className="text-xs italic text-muted-foreground text-center py-4">No documents yet.</div>}
              </ul>
            </section>

            <section className="glass-panel rounded-xl p-4">
              <h2 className="font-display text-sm mb-2">Lineage contributions</h2>
              <div className="grid grid-cols-4 gap-3 text-center">
                <Metric k="Origin" v={String((data.lineage as Array<{ relation_to_origin: string | null }>).filter((l) => l.relation_to_origin === "origin_candidate").length)}/>
                <Metric k="Independent" v={String((data.lineage as Array<{ relation_to_origin: string | null }>).filter((l) => l.relation_to_origin === "independent_support").length)}/>
                <Metric k="Likely copy" v={String((data.lineage as Array<{ is_likely_copy: boolean | null }>).filter((l) => l.is_likely_copy).length)} c="var(--color-risk)"/>
                <Metric k="Total" v={String(data.lineage.length)}/>
              </div>
            </section>

            <Link to="/sources" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground underline w-fit">← all sources</Link>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="rounded-md border border-border/50 p-2 bg-background/30">
      <div className="font-display text-lg leading-none" style={c ? { color: c } : undefined}>{v}</div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{k}</div>
    </div>
  );
}
