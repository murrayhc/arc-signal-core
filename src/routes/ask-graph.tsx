import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/archlight/AppShell";
import { askGraph, graphQuery, type GraphRow } from "@/lib/archlight/graph-query.functions";
import { ArrowDown, ArrowUp, Loader2, MessageSquare, Minus, Search, Sparkles } from "lucide-react";

export const Route = createFileRoute("/ask-graph")({
  head: () => ({
    meta: [
      { title: "Project Arklight · Ask the graph" },
      { name: "description", content: "Ask plain-English questions of Arklight's world model. Answers come from deterministic, cited graph queries — the AI only maps the question to a fixed query intent." },
      { property: "og:title", content: "Project Arklight · Ask the graph" },
      { property: "og:description", content: "Deterministic, cited graph answers to natural-language questions." },
    ],
  }),
  component: AskGraphPage,
});

type AskResult =
  | { mapped: false; message: string }
  | {
      mapped: true;
      intent: string;
      params: Record<string, unknown>;
      rows: GraphRow[];
      summary: string;
    };

function AskGraphPage() {
  const [question, setQuestion] = useState("");

  const ask = useMutation({
    mutationFn: (q: string) => askGraph({ data: { question: q } }) as Promise<AskResult>,
  });
  const direct = useMutation({
    mutationFn: (v: { intent: "neighbors_of_distress" | "my_exposure_ranked" | "contagion_path" | "controls_chain"; params: Record<string, unknown> }) =>
      graphQuery({ data: v }).then((r) => ({
        mapped: true as const,
        intent: r.intent,
        params: r.params as Record<string, unknown>,
        rows: r.rows,
        summary: `Direct query: ${r.intent} · ${r.rows.length} row(s). Information only, not advice.`,
      })),
  });

  const result: AskResult | undefined = ask.data ?? direct.data;
  const busy = ask.isPending || direct.isPending;

  const runExample = (
    intent: "neighbors_of_distress" | "my_exposure_ranked" | "contagion_path" | "controls_chain",
    params: Record<string, unknown> = {},
  ) => {
    ask.reset();
    direct.mutate({ intent, params });
  };

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto w-full flex flex-col gap-5">
        <header className="glass-panel rounded-xl p-5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <MessageSquare className="h-3 w-3"/> ask the world model
          </div>
          <h1 className="font-display text-2xl mt-1">Ask the graph</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Plain-English questions, deterministic answers. The AI only maps a question to one of four fixed query intents — every returned row traces to real entities and verified edges.
          </p>
        </header>

        <section className="glass-panel rounded-xl p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const q = question.trim();
              if (!q) return;
              direct.reset();
              ask.mutate(q);
            }}
            className="flex items-center gap-2"
          >
            <div className="flex-1 flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 h-10">
              <Search className="h-4 w-4 text-muted-foreground"/>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="who is exposed to distress? · rank my exposures by stress · how is A connected to B? · who controls X?"
                className="flex-1 bg-transparent outline-none text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy || question.trim().length < 3}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md text-xs border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 disabled:opacity-50"
            >
              {ask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Sparkles className="h-3.5 w-3.5"/>}
              Ask graph
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            <Chip label="who is exposed to distress" onClick={() => runExample("neighbors_of_distress", { hops: 1, threshold: 0.5 })}/>
            <Chip label="rank my exposures by stress" onClick={() => runExample("my_exposure_ranked")}/>
            <Chip label="how is A connected to B" onClick={() => {
              setQuestion("how is A connected to B");
              ask.reset();
              direct.reset();
            }}/>
            <Chip label="who controls X" onClick={() => {
              setQuestion("who controls X");
              ask.reset();
              direct.reset();
            }}/>
          </div>
        </section>

        {ask.isError && (
          <section className="glass-panel rounded-xl p-4 text-sm text-[color:var(--color-risk)]">
            {(ask.error as Error).message}
          </section>
        )}

        {result && result.mapped === false && (
          <section className="glass-panel rounded-xl p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Could not map</div>
            <p className="mt-2 text-sm">{result.message}</p>
          </section>
        )}

        {result && result.mapped === true && (
          <>
            <section className="glass-panel rounded-xl p-4">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">interpreted as</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded border border-border/60">{result.intent}</span>
                {Object.entries(result.params ?? {}).map(([k, v]) => (
                  <span key={k} className="font-mono text-[10px] px-2 py-0.5 rounded border border-border/60 text-muted-foreground">
                    {k} · {String(v)}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-foreground/90">{result.summary}</p>
              <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                deterministic query · verified edges · not financial advice
              </p>
            </section>

            <section className="glass-panel rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-display text-sm tracking-wide">Results</h3>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">{result.rows.length} entit{result.rows.length === 1 ? "y" : "ies"}</span>
              </div>
              {result.rows.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No matches for this query in the current graph.</div>
              ) : (
                <ul className="grid md:grid-cols-2 gap-2">
                  {result.rows.map((r, idx) => (
                    <ResultCard key={`${r.entity_id}-${idx}`} row={r}/>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-mono px-2.5 h-7 rounded-full border border-border/60 text-muted-foreground hover:text-foreground hover:border-[color:var(--color-signal)]/60 hover:text-[color:var(--color-signal)] transition"
    >
      {label}
    </button>
  );
}

function ResultCard({ row }: { row: GraphRow }) {
  const color = row.stress >= 0.66 ? "var(--color-risk)" : row.stress >= 0.34 ? "var(--color-signal)" : "var(--color-growth)";
  const trajArrow = row.trajectory > 0.02 ? <ArrowUp className="h-3 w-3"/> : row.trajectory < -0.02 ? <ArrowDown className="h-3 w-3"/> : <Minus className="h-3 w-3"/>;
  const trajColor = row.trajectory > 0.02 ? "var(--color-risk)" : row.trajectory < -0.02 ? "var(--color-growth)" : "var(--color-muted)";
  return (
    <li className="rounded-lg border border-border/50 bg-background/30 p-3">
      <div className="flex items-baseline gap-2">
        <Link to="/companies/$name" params={{ name: encodeURIComponent(row.name) }} className="font-display text-sm truncate hover:text-[color:var(--color-signal)]">
          {row.name}
        </Link>
        <span className="ml-auto font-mono text-sm" style={{ color }}>{Math.round(row.stress * 100)}%</span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
        <span className="inline-flex items-center gap-1" style={{ color: trajColor }}>
          {trajArrow}
          {row.trajectory >= 0 ? "+" : ""}{(row.trajectory * 100).toFixed(0)}%
        </span>
        {row.exposure_relevance != null && (
          <span>exposure w · {row.exposure_relevance.toFixed(2)}</span>
        )}
      </div>
      {row.path.length > 1 && (
        <div className="mt-2 text-[10px] font-mono text-muted-foreground break-words">
          path · {row.path.join(" ")}
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">{row.why}</p>
    </li>
  );
}
