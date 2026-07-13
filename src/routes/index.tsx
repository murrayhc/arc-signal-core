import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  ArrowUpRight, Check, Minus, Radar, GitBranch, Compass, Target, Receipt,
  Building2, FileText, Scale, BarChart3, Newspaper, Globe2, Plus,
} from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { HeroBackdrop } from "@/components/marketing/HeroBackdrop";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Project Arklight · See it forming before it becomes the news" },
      { name: "description", content: "Arklight warns you about what is forming on the public record, for the things you follow, while there is still time to act. Every signal is traced to its source and graded on the outcome." },
      { property: "og:title", content: "Project Arklight · Public-signals early warning" },
      { property: "og:description", content: "A precision public-intelligence instrument. Public sources only. Every call frozen and graded." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Project Arklight" },
      { name: "twitter:description", content: "See it forming before it becomes the news." },
    ],
  }),
  component: LandingPage,
});

/* ------------------------------------------------------------------ */
/*  Shared bits                                                       */
/* ------------------------------------------------------------------ */

function Eyebrow({ children, tone = "dark" }: { children: ReactNode; tone?: "dark" | "light" }) {
  const cls = tone === "light"
    ? "text-white/60"
    : "text-[color:var(--mkt-muted)]";
  return (
    <div className={`mkt-mono text-[11px] uppercase tracking-[0.28em] ${cls}`}>
      {children}
    </div>
  );
}

function SectionHeader({
  eyebrow, title, sub, id,
}: { eyebrow: string; title: ReactNode; sub?: ReactNode; id?: string }) {
  return (
    <div id={id} className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mkt-display mt-4 text-3xl md:text-5xl font-medium text-[color:var(--mkt-heading)] text-balance">
        {title}
      </h2>
      {sub && <p className="mt-5 text-[color:var(--mkt-muted)] text-base md:text-lg max-w-2xl">{sub}</p>}
    </div>
  );
}

function PrimaryCta({ children, to = "/auth", search }: { children: ReactNode; to?: string; search?: Record<string, string> }) {
  return (
    <Link
      to={to as any}
      search={search as any}
      className="inline-flex items-center gap-1.5 rounded-md bg-[color:var(--mkt-accent)] px-5 h-11 text-sm font-semibold text-black hover:opacity-90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mkt-accent)]/60"
    >
      {children} <ArrowUpRight className="h-4 w-4" />
    </Link>
  );
}

function GhostCtaLight({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/20 px-5 h-11 text-sm font-medium text-white hover:bg-white/10 transition"
    >
      {children}
    </a>
  );
}

function HeroTemplateCta({ children, to = "/auth", search }: { children: ReactNode; to?: string; search?: Record<string, string> }) {
  return (
    <Link
      to={to as any}
      search={search as any}
      className="group relative mt-6 flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-white/20 bg-black py-2 pr-4 pl-11 text-sm tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:mt-8"
    >
      <span
        data-slot="button-box"
        className="absolute inset-y-0 left-1 z-40 my-auto flex size-8 flex-col items-center justify-center gap-px rounded-[5px] bg-[color:var(--mkt-accent)] transition-all duration-400 ease-out group-hover:left-[calc(100%-2.3rem)] group-hover:rotate-180 group-hover:transform"
        aria-hidden
      >
        <span className="flex flex-col gap-px">
          {[0, 1, 2, 3, 4].map((row) => (
            <span key={row} className="flex gap-px">
              {[0, 1, 2, 3, 4].map((col) => {
                const highlight = row === 2 || (row === 0 && col === 2) || (row === 1 && col === 3) || (row === 3 && col === 3) || (row === 4 && col === 2);
                return (
                  <span
                    key={col}
                    className={`inline-block size-0.75 shrink-0 rounded-full ${highlight ? "bg-white" : "bg-white/25"}`}
                  />
                );
              })}
            </span>
          ))}
        </span>
      </span>
      <span className="absolute -inset-px rounded-lg bg-white/20 transition-[clip-path] duration-400 ease-out [clip-path:inset(0_100%_0_0)] group-hover:[clip-path:inset(0_0%_0_0)]" />
      <span className="relative inline-block text-white transition-transform duration-400 group-hover:-translate-x-8">
        {children}
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero — dark shell + product-relevant visual                       */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="h-[60vh] w-full p-2 md:h-screen">
      <div className="relative m-0 h-full w-full overflow-hidden rounded-3xl bg-black text-white">
        <HeroBackdrop />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-[1440px] flex-col justify-between px-4 sm:px-6 lg:px-8">
          <div className="pt-32 md:pt-[10.5rem] lg:pt-[18.75rem]">
            <div className="flex w-fit rounded-full bg-neutral-900 p-1 shadow-lg shadow-black">
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="rounded-full bg-neutral-950 px-2 py-1 text-[10px] sm:text-xs">
                  Arklight
                </div>
                <div className="rounded-full pr-2 text-[10px] text-white sm:text-xs">
                  Public-signals early warning
                </div>
              </div>
            </div>
            <div className="mt-6 flex flex-col items-start gap-6 md:mt-10 lg:flex-row lg:gap-10">
              <h1 className="mkt-display text-3xl font-semibold text-balance text-white sm:text-4xl md:text-5xl lg:text-7xl">
                See it forming before it becomes the news.
              </h1>
              <div className="lg:max-w-md">
                <p className="text-sm font-medium text-balance text-neutral-300 sm:text-base lg:text-lg">
                  The move is made before the headline runs. Arklight watches the public record for the things you follow and warns you while there is still time to act. Every signal is traced to its source and graded on the outcome.
                </p>
                <HeroTemplateCta to="/auth" search={{ mode: "signup" }}>
                  Start free
                </HeroTemplateCta>
              </div>
            </div>
          </div>

          <div className="relative h-[4.5rem] sm:h-48 md:h-72" aria-hidden>
            <p className="mkt-display absolute -top-10 left-1/2 -translate-x-1/2 bg-gradient-to-r from-white/10 to-[#343434]/0 bg-clip-text text-center text-[100px] font-semibold leading-none text-transparent sm:text-[6rem] md:-top-6 md:mt-10 md:text-[160px] lg:-top-[4.5rem] lg:text-[300px]">
              Arklight
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}


/* ------------------------------------------------------------------ */
/*  Source category strip (replaces logo cloud)                        */
/* ------------------------------------------------------------------ */

const SOURCES = [
  { label: "Company registries", icon: Building2 },
  { label: "Procurement notices", icon: FileText },
  { label: "Regulatory releases", icon: Scale },
  { label: "Official statistics", icon: BarChart3 },
  { label: "Public news wires", icon: Newspaper },
  { label: "Public web signals", icon: Globe2 },
];

function SourceStrip() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
      <div className="text-center">
        <Eyebrow>Reads only from the public record</Eyebrow>
        <p className="mt-3 text-[color:var(--mkt-muted)] text-sm">
          Categories of primary source Arklight ingests. The names are descriptive, and no endorsement is claimed.
        </p>
      </div>
      <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {SOURCES.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center gap-2 rounded-xl border border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel)] px-4 py-5 text-center"
          >
            <s.icon className="h-5 w-5 text-[color:var(--mkt-heading)]" aria-hidden />
            <span className="text-xs md:text-sm text-[color:var(--mkt-heading)] font-medium">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  BentoOne — Scan / Trace / Map / Project / Prove                    */
/* ------------------------------------------------------------------ */

function BentoTile({
  className = "", dark = false, children,
}: { className?: string; dark?: boolean; children: ReactNode }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-6 ${
        dark
          ? "bg-[color:var(--mkt-charcoal)] text-white border-white/10"
          : "bg-[color:var(--mkt-panel)] text-[color:var(--mkt-heading)] border-[color:var(--mkt-line)]"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function TileHead({ label, title, icon: Icon, dark }: { label: string; title: string; icon: any; dark?: boolean }) {
  return (
    <div>
      <div className={`mkt-mono text-[10px] uppercase tracking-widest ${dark ? "text-white/50" : "text-[color:var(--mkt-muted)]"}`}>{label}</div>
      <div className={`mt-2 flex items-center gap-2 mkt-display text-lg md:text-xl font-medium ${dark ? "text-white" : ""}`}>
        <Icon className="h-4 w-4" aria-hidden /> {title}
      </div>
    </div>
  );
}

function BentoOne() {
  return (
    <section id="how" className="mx-auto max-w-7xl px-6 py-16 md:py-24 scroll-mt-24">
      <SectionHeader
        eyebrow="How Arklight works · Illustrative interface"
        title={<>From raw public signal to a call you can grade later.</>}
        sub="Five stages, run continuously, and every step keeps its receipts. The values shown below are illustrative examples, not measured Arklight results."
      />

      <div className="mt-12 grid grid-cols-1 md:grid-cols-6 gap-3">
        {/* Scan — big dark */}
        <BentoTile dark className="md:col-span-4 md:row-span-2 min-h-[320px] flex flex-col justify-between">
          <TileHead dark label="01 · Scan" title="Continuous read of the open record" icon={Radar} />
          <p className="mt-3 max-w-md text-white/70 text-sm">
            Approved public sources — filings, tenders, regulatory notices, court
            records, wires — are read on a schedule, deduplicated, and clustered.
          </p>
          <div className="mt-6 grid grid-cols-6 gap-1">
            {Array.from({ length: 42 }).map((_, i) => (
              <div
                key={i}
                className="h-6 rounded"
                style={{
                  background: `rgba(255,204,0,${(0.08 + (Math.sin(i * 0.9) + 1) * 0.18).toFixed(3)})`,
                }}
              />
            ))}
          </div>
          <div className="mt-4 mkt-mono text-[10px] uppercase tracking-widest text-white/40">
            Ingest cadence · minutes to hours by source
          </div>
        </BentoTile>

        {/* Trace */}
        <BentoTile className="md:col-span-2 min-h-[320px]">
          <TileHead label="02 · Trace" title="Origin & repetition" icon={GitBranch} />
          <div className="mt-5 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--mkt-heading)]" />
              Primary filing · trusted
            </div>
            <div className="flex items-center gap-2 pl-4">
              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--mkt-muted)]" />
              Wire pickup · same content
            </div>
            <div className="flex items-center gap-2 pl-4">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--mkt-warn)" }} />
              12 co-owned outlets · flagged
            </div>
          </div>
          <p className="mt-5 text-xs text-[color:var(--mkt-muted)]">
            Group-owned repetition is treated as risk, not corroboration.
          </p>
        </BentoTile>

        {/* Map */}
        <BentoTile className="md:col-span-3 min-h-[240px]">
          <TileHead label="03 · Map" title="Who this actually reaches" icon={Compass} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
            {["Suppliers", "Regulators", "Rivals", "Buyers", "Investors", "Adjacent sectors"].map((n) => (
              <div key={n} className="rounded border border-[color:var(--mkt-line)] px-2 py-2 text-center">{n}</div>
            ))}
          </div>
          <p className="mt-4 text-xs text-[color:var(--mkt-muted)]">
            Consequence is walked through verified relationships, not free-text guesses.
          </p>
        </BentoTile>

        {/* Project */}
        <BentoTile dark className="md:col-span-3 min-h-[240px]">
          <TileHead dark label="04 · Project · Illustrative example" title="Dated, testable scenarios" icon={Target} />
          <div className="mt-4 space-y-2">
            {[
              { h: "7d", p: 0.42, t: "Notice re-issued with tighter scope" },
              { h: "30d", p: 0.68, t: "Supplier consolidation announced" },
              { h: "90d", p: 0.31, t: "Regulatory review opened" },
            ].map((r) => (
              <div key={r.h} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 text-xs">
                <span className="mkt-mono text-white/60">{r.h}</span>
                <div className="h-1.5 rounded bg-white/10 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0" style={{ width: `${r.p * 100}%`, background: "var(--mkt-accent)" }} />
                </div>
                <span className="mkt-mono text-white/60">P={r.p.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </BentoTile>

        {/* Prove */}
        <BentoTile className="md:col-span-6 min-h-[200px] flex flex-col md:flex-row md:items-center gap-6 md:gap-10">
          <div className="md:max-w-sm">
            <TileHead label="05 · Prove" title="Every call frozen and graded" icon={Receipt} />
            <p className="mt-3 text-sm text-[color:var(--mkt-muted)]">
              Probability, deadline and evidence are frozen when a projection is made.
              Outcomes are graded later from public facts — the track record is the ledger.
            </p>
          </div>
          <div className="flex-1 grid grid-cols-3 gap-3">
            {[
              { k: "Frozen", v: "Yes", note: "Written to ledger on projection" },
              { k: "Graded", v: "Outcomes", note: "Measured from public facts" },
              { k: "Confidence", v: "Explicit", note: "Uncertainty shown, not hidden" },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-[color:var(--mkt-line)] p-4">
                <div className="mkt-mono text-[10px] uppercase tracking-widest text-[color:var(--mkt-muted)]">{s.k}</div>
                <div className="mkt-display mt-1 text-lg">{s.v}</div>
                <div className="mt-1 text-xs text-[color:var(--mkt-muted)]">{s.note}</div>
              </div>
            ))}
          </div>
        </BentoTile>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Illustrative scenarios (replaces case studies)                     */
/* ------------------------------------------------------------------ */

const SCENARIOS = [
  {
    tag: "Regulatory tension",
    title: "A quiet consultation, then a rules change",
    body: "Arklight ties a low-noise consultation opening to a related enforcement action from six weeks earlier — projecting a rule tightening window with a dated confidence band.",
  },
  {
    tag: "Supply-chain disruption",
    title: "Charges filed against a single supplier",
    body: "Multiple filings against a mid-tier supplier are clustered with cancelled tenders and hiring pauses at three of its buyers, projecting a consolidation event.",
  },
  {
    tag: "Labour-market shift",
    title: "Redundancy notices ahead of the wire",
    body: "Statutory redundancy notices lodged in a region are combined with plant-level filings and procurement freezes, projecting a sector-level contraction weeks before news coverage.",
  },
];

function Scenarios() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <SectionHeader
          eyebrow="Illustrative scenarios"
          title="What an early Arklight signal looks like."
          sub="Constructed examples — no customers named. Every real projection is dated, evidenced, and graded on outcome."
        />
        <div className="mkt-mono text-[10px] uppercase tracking-widest text-[color:var(--mkt-muted)]">
          Not investment advice
        </div>
      </div>
      <div className="mt-10 grid md:grid-cols-3 gap-3">
        {SCENARIOS.map((s) => (
          <article key={s.title} className="group rounded-2xl border border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel)] p-6 flex flex-col">
            <div className="mkt-mono text-[10px] uppercase tracking-widest text-[color:var(--mkt-muted)]">{s.tag}</div>
            <h3 className="mkt-display mt-3 text-xl font-medium text-[color:var(--mkt-heading)]">{s.title}</h3>
            <p className="mt-3 text-sm text-[color:var(--mkt-muted)] flex-1">{s.body}</p>
            <div className="mt-6 h-24 rounded-lg border border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel-2)] relative overflow-hidden">
              <div className="absolute inset-x-0 bottom-0 flex items-end gap-1 px-2 pb-2 h-full">
                {Array.from({ length: 22 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t"
                    style={{
                      height: `${(18 + (Math.sin(i * 0.7 + s.title.length) + 1) * 30).toFixed(2)}%`,
                      background: i > 15 ? "var(--mkt-accent)" : "rgba(30,29,25,0.15)",
                    }}
                  />
                ))}
              </div>
              <span className="absolute top-2 right-3 mkt-mono text-[10px] uppercase tracking-widest text-[color:var(--mkt-muted)]">
                Signal onset · pre-coverage
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Proof, not promises                                                */
/* ------------------------------------------------------------------ */

function Proof() {
  return (
    <section id="proof" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 md:py-24">
      <div className="rounded-3xl border border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel)] p-6 md:p-12">
        <SectionHeader
          eyebrow="Proof, not promises"
          title="Frozen calls. Traceable evidence. Graded outcomes."
          sub="We do not publish aggregate hit-rates until they are measured on live user calls. What we do show, from day one, is the ledger machinery itself."
        />
        <div className="mt-10 grid md:grid-cols-4 gap-3">
          {[
            { k: "Every call frozen", v: "Probability, deadline, evidence written to ledger at time of projection." },
            { k: "Evidence lineage", v: "Each claim traces back to primary source, timestamp, and cluster." },
            { k: "Confidence grading", v: "Uncertainty is shown, not hidden — no false precision." },
            { k: "Outcome review", v: "Outcomes measured from public facts. Hits, misses, still-open calls." },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-[color:var(--mkt-line)] p-5">
              <div className="mkt-mono text-[10px] uppercase tracking-widest text-[color:var(--mkt-muted)]">{s.k}</div>
              <div className="mt-3 text-sm text-[color:var(--mkt-heading)]">{s.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  BentoTwo — quality mechanics                                       */
/* ------------------------------------------------------------------ */

function BentoTwo() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
      <SectionHeader
        eyebrow="Signal quality"
        title="The mechanics that keep the signal honest."
      />
      <div className="mt-10 grid md:grid-cols-3 gap-3">
        <BentoTile className="md:row-span-2 min-h-[380px] flex flex-col justify-between">
          <div>
            <TileHead label="Source diversity · Illustrative example" title="Weighted by primary vs echo" icon={Radar} />
            <p className="mt-3 text-sm text-[color:var(--mkt-muted)]">
              Primary filings carry more weight than downstream pickups. Group-owned repetition
              is discounted or flagged. Weights below are sample values.
            </p>
          </div>
          <div className="mt-6 space-y-2 text-xs">
            {[
              { l: "Primary registry", w: 0.9 },
              { l: "Regulator release", w: 0.85 },
              { l: "Independent wire", w: 0.6 },
              { l: "Aggregator repeat", w: 0.2 },
            ].map((r) => (
              <div key={r.l} className="grid grid-cols-[130px_1fr_36px] items-center gap-3">
                <span className="text-[color:var(--mkt-heading)]">{r.l}</span>
                <div className="h-1.5 rounded bg-[color:var(--mkt-line)] relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0" style={{ width: `${r.w * 100}%`, background: "var(--mkt-charcoal)" }} />
                </div>
                <span className="mkt-mono text-[color:var(--mkt-muted)]">{r.w.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </BentoTile>

        <BentoTile className="min-h-[180px]">
          <TileHead label="Narrative divergence" title="When claims disagree, we say so" icon={GitBranch} />
          <p className="mt-3 text-xs text-[color:var(--mkt-muted)]">Disagreements between sources are surfaced, not smoothed into consensus.</p>
        </BentoTile>

        <BentoTile dark className="min-h-[180px]">
          <TileHead dark label="Contradiction detection" title="Claim vs later filing" icon={Scale} />
          <p className="mt-3 text-xs text-white/60">A claim that is later contradicted by a primary source is marked and re-graded.</p>
        </BentoTile>

        <BentoTile dark className="min-h-[180px]">
          <TileHead dark label="Scan cadence" title="Minutes, not weeks" icon={Radar} />
          <p className="mt-3 text-xs text-white/60">Priority sources on Pro run at tighter cadence with faster delivery.</p>
        </BentoTile>

        <BentoTile className="min-h-[180px]">
          <TileHead label="Evidence freshness" title="Every claim carries its timestamp" icon={Receipt} />
          <p className="mt-3 text-xs text-[color:var(--mkt-muted)]">Age of the underlying evidence is shown alongside the projection.</p>
        </BentoTile>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Comparison table                                                   */
/* ------------------------------------------------------------------ */

const COMPARISON: { row: string; ark: string; conv: string }[] = [
  { row: "Discovery", ark: "Event-first — clusters signals into a single call", conv: "Feed-first — you scroll until you notice" },
  { row: "Evidence", ark: "Every claim traces back to primary source", conv: "Headline links, provenance unclear" },
  { row: "Uncertainty", ark: "Explicit probability + deadline", conv: "Implied by tone" },
  { row: "Repetition", ark: "Group-owned echoes are flagged, not counted", conv: "Repetition read as corroboration" },
  { row: "Outcomes", ark: "Frozen at projection, graded from facts", conv: "No public ledger" },
  { row: "Delivery", ark: "Dated scenarios and briefings", conv: "Alert firehose" },
];

function Comparison() {
  return (
    <section id="compare" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-16 md:py-24">
      <SectionHeader
        eyebrow="Arklight vs conventional monitoring"
        title="Built to be answered for."
        sub="Only defensible distinctions — no straw men. Compare the mechanics."
      />
      {/* desktop table */}
      <div className="mt-10 hidden md:block rounded-2xl border border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel)] overflow-hidden">
        <div className="grid grid-cols-3 px-8 py-5 mkt-mono text-[10px] uppercase tracking-widest text-[color:var(--mkt-muted)] border-b border-[color:var(--mkt-line)]">
          <span></span>
          <span className="text-[color:var(--mkt-heading)]">Arklight</span>
          <span>Conventional monitoring</span>
        </div>
        {COMPARISON.map((r) => (
          <div key={r.row} className="grid grid-cols-3 px-8 py-5 border-b border-[color:var(--mkt-line)] last:border-b-0 text-sm">
            <span className="mkt-display text-[color:var(--mkt-heading)]">{r.row}</span>
            <span className="text-[color:var(--mkt-heading)] flex items-start gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--mkt-ok)" }} />
              {r.ark}
            </span>
            <span className="text-[color:var(--mkt-muted)] flex items-start gap-2">
              <Minus className="h-4 w-4 mt-0.5 shrink-0" />
              {r.conv}
            </span>
          </div>
        ))}
      </div>
      {/* mobile stack */}
      <div className="mt-8 md:hidden space-y-3">
        {COMPARISON.map((r) => (
          <div key={r.row} className="rounded-xl border border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel)] p-4">
            <div className="mkt-display font-medium">{r.row}</div>
            <div className="mt-2 text-sm flex gap-2"><Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--mkt-ok)" }} /><span>{r.ark}</span></div>
            <div className="mt-2 text-sm text-[color:var(--mkt-muted)] flex gap-2"><Minus className="h-4 w-4 mt-0.5 shrink-0" /><span>{r.conv}</span></div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing preview                                                    */
/* ------------------------------------------------------------------ */

function PricingPreview() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
      <SectionHeader
        eyebrow="Pricing"
        title="Free while you decide. Pro when you're ready."
        sub="Free is currently £0. Pro price will be announced before any charge is possible."
      />
      <div className="mt-10 grid md:grid-cols-2 gap-3">
        <PricingCard
          name="Free"
          price="£0"
          trailing="currently"
          bullets={[
            "Public-signal graph",
            "Starter book — up to 10 watched items",
            "5 research interrogations / month",
            "Weekly in-app digest",
            "Frozen track record",
          ]}
          cta={{ label: "Start free", href: "/auth?mode=signup", primary: true }}
        />
        <PricingCard
          highlight
          name="Pro"
          price="Price to be announced"
          trailing="7-day free trial · cancel anytime"
          bullets={[
            "Everything in Free",
            "Slack & email delivery",
            "Unlimited book & research",
            "Advanced analytics & Narrative Divergence",
            "Priority scan cadence",
          ]}
          cta={{ label: "Create an account", href: "/auth?mode=signup", primary: false }}
        />
      </div>
      <div className="mt-6 text-xs text-[color:var(--mkt-muted)]">
        Creating an account today does not commit you to any charge.
      </div>
    </section>
  );
}

export function PricingCard({
  name, price, trailing, bullets, cta, highlight,
}: {
  name: string; price: string; trailing?: string; bullets: string[];
  cta: { label: string; href: string; primary: boolean }; highlight?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-6 md:p-8 ${
        highlight
          ? "bg-[color:var(--mkt-charcoal)] text-white border-white/10"
          : "bg-[color:var(--mkt-panel)] text-[color:var(--mkt-heading)] border-[color:var(--mkt-line)]"
      }`}
    >
      {highlight && (
        <span
          aria-hidden
          className="absolute -top-16 -right-16 h-40 w-40 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(255,204,0,0.35), transparent 70%)" }}
        />
      )}
      <div className="relative flex items-baseline justify-between">
        <div className="mkt-display text-xl">{name}</div>
        {highlight && <span className="mkt-mono text-[10px] uppercase tracking-widest text-[color:var(--mkt-accent)]">Recommended</span>}
      </div>
      <div className="relative mt-4 flex items-baseline gap-2 flex-wrap">
        <div className="mkt-display text-3xl md:text-4xl">{price}</div>
        {trailing && <div className={`text-xs ${highlight ? "text-white/60" : "text-[color:var(--mkt-muted)]"}`}>{trailing}</div>}
      </div>
      <ul className="relative mt-6 space-y-2 text-sm">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-3">
            <Check className={`h-4 w-4 mt-0.5 shrink-0 ${highlight ? "text-[color:var(--mkt-accent)]" : ""}`} style={!highlight ? { color: "var(--mkt-ok)" } : {}} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <a
        href={cta.href}
        className={`relative mt-7 h-11 inline-flex items-center justify-center px-4 rounded-md text-sm font-semibold w-full transition ${
          highlight
            ? "bg-[color:var(--mkt-accent)] text-black hover:opacity-90"
            : "bg-[color:var(--mkt-charcoal)] text-white hover:opacity-90"
        }`}
      >
        {cta.label}
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  About                                                              */
/* ------------------------------------------------------------------ */

function About() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
      <div className="grid md:grid-cols-[1fr_1.2fr] gap-10 items-start">
        <div>
          <Eyebrow>About</Eyebrow>
          <h2 className="mkt-display mt-4 text-3xl md:text-5xl font-medium text-[color:var(--mkt-heading)]">
            Built for decisions under uncertainty.
          </h2>
        </div>
        <div className="space-y-5 text-[color:var(--mkt-heading)]">
          <p>
            Arklight exists because the news is the last, not the first, sign that
            something has changed. The primary record — filings, tenders, notices,
            registries — moves earlier and is answerable to something.
          </p>
          <p className="text-[color:var(--mkt-muted)]">
            The instrument is built to be argued with. Every claim is traceable.
            Every projection is dated. Every outcome is graded from public facts.
            That is what receipts, not opinions, means.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ                                                                */
/* ------------------------------------------------------------------ */

const FAQ_ITEMS = [
  { q: "What sources does Arklight use?", a: "Only public sources: company registries, procurement notices, regulatory releases, official statistics, public news wires and public web signals. Nothing private, nothing leaked. Attribution is preserved on every claim." },
  { q: "Does Arklight predict the future?", a: "No. Arklight surfaces dated, testable scenarios with explicit probabilities. Each projection is frozen and later graded against public outcomes. Uncertainty is shown, not hidden." },
  { q: "How does confidence work?", a: "Confidence combines source weighting (primary vs echo), cluster strength, contradiction signals, and evidence freshness. It is expressed as a number, with a deadline, and reviewed on outcome." },
  { q: "Is this financial advice?", a: "No. Arklight is not a broker or adviser and does not recommend buys, sells, or target prices. All figures are GBP. Use it as one input into your own decisions." },
  { q: "What is stored?", a: "Your account, your watched items, and your research history. The public-signal record itself is derived from public sources. See the Privacy page for detail." },
  { q: "How do I start?", a: "Create a free account and open Arklight. The Free tier is currently £0 and includes the graph, up to 10 watched items, and 5 research interrogations per 30 days." },
];

export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-[color:var(--mkt-line)] border-y border-[color:var(--mkt-line)]">
      {items.map((it, i) => {
        const isOpen = open === i;
        const id = `faq-panel-${i}`;
        return (
          <div key={it.q}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={id}
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full flex items-center justify-between gap-6 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mkt-charcoal)]/40 rounded"
            >
              <span className="text-base md:text-lg text-[color:var(--mkt-heading)]">{it.q}</span>
              <Plus
                aria-hidden
                className={`h-5 w-5 text-[color:var(--mkt-heading)] transition-transform ${isOpen ? "rotate-45" : ""}`}
              />
            </button>
            {isOpen && (
              <div id={id} className="pb-6 text-[15px] text-[color:var(--mkt-muted)] leading-relaxed max-w-3xl">
                {it.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FAQSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-24">
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10">
        <div>
          <SectionHeader eyebrow="FAQ" title="Straight answers." />
          <div className="mt-10 rounded-2xl border border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel)] p-6">
            <div className="mkt-display text-lg">Still deciding?</div>
            <p className="mt-2 text-sm text-[color:var(--mkt-muted)]">
              The Free tier is £0. You can explore the graph and research
              without a card. Upgrade only when the receipts speak for themselves.
            </p>
            <div className="mt-5">
              <PrimaryCta to="/auth" search={{ mode: "signup" }}>Start free</PrimaryCta>
            </div>
          </div>
        </div>
        <FAQ items={FAQ_ITEMS} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Final CTA                                                          */
/* ------------------------------------------------------------------ */

function FinalCta() {
  return (
    <section className="px-2 md:px-3 pb-3">
      <div className="mkt-hero-shell relative overflow-hidden rounded-3xl">
        <div className="absolute inset-0 mkt-hero-grid opacity-60" aria-hidden />
        <div className="relative px-6 md:px-12 py-16 md:py-24 max-w-6xl mx-auto text-center">
          <Eyebrow tone="light">Ready</Eyebrow>
          <h2 className="mkt-display mt-4 text-white text-3xl md:text-5xl font-medium text-balance">
            See it forming, then grade the call.
          </h2>
          <p className="mt-4 text-white/70 max-w-xl mx-auto">
            Create a free account and open Arklight. Public sources only. Not
            financial advice.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta to="/auth" search={{ mode: "signup" }}>Start free</PrimaryCta>
            <GhostCtaLight href="/pricing">See pricing</GhostCtaLight>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function LandingPage() {
  return (
    <MarketingLayout>
      <Hero />
      <SourceStrip />
      <BentoOne />
      <Scenarios />
      <Proof />
      <BentoTwo />
      <Comparison />
      <PricingPreview />
      <About />
      <FAQSection />
      <FinalCta />
    </MarketingLayout>
  );
}
