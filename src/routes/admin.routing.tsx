import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/archlight/AppShell";
import { getRoutingInfo } from "@/lib/archlight/pipeline.functions";
import { Settings } from "lucide-react";

const routingQuery = queryOptions({
  queryKey: ["archlight", "routing"],
  queryFn: () => getRoutingInfo(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/admin/routing")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Model routing and principles" },
      { name: "description", content: "How Arklight routes intelligence tasks to models: cheap fast models for tagging, strong reasoning for impact and scenarios, guardrails on every output." },
      { property: "og:title", content: "Project Arklight · Model routing" },
      { property: "og:description", content: "Cost-aware, task-aware model routing with schema validation and financial-advice guardrails." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(routingQuery),
  component: RoutingPage,
});

function RoutingPage() {
  const { data } = useSuspenseQuery(routingQuery);
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto w-full flex flex-col gap-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Engine internals</div>
          <h1 className="font-display text-2xl md:text-3xl mt-1 text-glow-signal flex items-center gap-3">
            <Settings className="h-6 w-6" style={{ color: "var(--color-reason)" }}/> Model routing
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Arklight routes each intelligence task to a model chosen for cost, latency, and reasoning depth. Every output is schema-validated and passes the financial-advice guardrail before storage.
          </p>
        </div>

        <section className="glass-panel rounded-xl p-4">
          <h2 className="font-display text-sm mb-3">Task → model</h2>
          <ul className="grid md:grid-cols-2 gap-2 text-xs">
            {Object.entries(data.router).map(([task, model]) => (
              <li key={task} className="flex items-center justify-between rounded border border-border/50 bg-background/30 p-2.5">
                <span className="font-mono">{task}</span>
                <span className="text-muted-foreground font-mono">{model}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-panel rounded-xl p-4">
          <h2 className="font-display text-sm mb-3">Principles</h2>
          <ul className="space-y-2 text-sm">
            {data.principles.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-signal)" }}/>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass-panel rounded-xl p-4">
          <h2 className="font-display text-sm mb-3">Guardrails</h2>
          <p className="text-xs text-muted-foreground">
            Every model output is scanned for forbidden financial-advice phrasing (buy/sell/hold ratings, target price, guaranteed return, investment recommendation, portfolio allocation, "should buy/sell/hold"). Rejected outputs are logged and dropped; nothing forbidden is persisted or shown.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
