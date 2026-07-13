import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity, ArrowRight, Building2, Compass, Database, Eye, GitBranch,
  Layers, Radar, Receipt, Scale, ShieldCheck, Signal, Sparkles, Target, Waves,
} from "lucide-react";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Project Arklight · See it forming before it becomes the news" },
      {
        name: "description",
        content:
          "Arklight reads the open public record, traces every claim to its origin, maps consequence, and turns early signals into dated, testable scenarios. Receipts, not opinions.",
      },
      { property: "og:title", content: "Project Arklight — Public-signals early warning" },
      {
        property: "og:description",
        content:
          "A precision public-intelligence instrument for investors, strategy, risk, and public-affairs teams. Public sources only. Every call frozen and graded.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Project Arklight" },
      { name: "twitter:description", content: "See it forming before it becomes the news." },
    ],
  }),
  component: LandingPage,
});

/* ------------------------------------------------------------------ */
/*  Section shell utilities                                            */
/* ------------------------------------------------------------------ */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
      {children}
    </div>
  );
}

function Section({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 border-t border-border ${className}`}
    >
      <div className="mx-auto max-w-7xl px-6 py-20 md:py-28">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero — one immersive instrument field                              */
/* ------------------------------------------------------------------ */

function HeroBackdrop({ prefersReduced }: { prefersReduced: boolean }) {
  // Grid + radar + lineage form the ambient instrument field. The chart itself
  // is placed as a flex row inside the hero so it never overlaps the copy.
  return (
    <div className="absolute inset-0 pointer-events-none select-none z-0" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full opacity-[0.35]">
        <defs>
          <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>

      {/* Radar — anchored to hero top-right corner */}
      <div className="hidden md:block absolute top-8 right-8 lg:right-16">
        <div className="relative h-28 w-28 lg:h-32 lg:w-32 rounded-full border border-border">
          <div className="absolute inset-2 rounded-full border border-border/70" />
          <div className="absolute inset-6 rounded-full border border-border/60" />
          <div className="absolute inset-10 rounded-full border border-border/50" />
          {!prefersReduced && (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--foreground) 18%, transparent) 40deg, transparent 60deg)",
                animation: "hero-spin 4s linear infinite",
              }}
            />
          )}
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-1.5 w-1.5 rounded-full bg-foreground" />
          </div>
        </div>
        <div className="mt-2 text-center text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
          Live scan
        </div>
      </div>

      <style>{`@keyframes hero-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function HeroTimeline({ prefersReduced }: { prefersReduced: boolean }) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
        <span>Illustrative view · Early signal vs. mainstream coverage</span>
        <span className="hidden sm:inline">T-0 = story published</span>
      </div>
      <svg viewBox="0 0 800 180" preserveAspectRatio="none" className="w-full h-[160px] md:h-[280px]" aria-hidden="true">
        <line x1="0" y1="150" x2="800" y2="150" stroke="currentColor" className="text-border" strokeWidth="1" />
        <line x1="600" y1="10" x2="600" y2="150" stroke="currentColor" className="text-border" strokeDasharray="4 4" />
        <text x="604" y="20" className="fill-muted-foreground" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>T-0</text>
        <path
          d="M0,148 C60,146 90,140 130,130 C170,120 210,105 250,95 C300,82 350,80 400,72 C460,62 520,55 590,42 L600,40"
          fill="none" stroke="currentColor" className="text-foreground" strokeWidth="2"
        />
        <path
          d="M0,152 L520,150 C560,148 585,140 600,128 C640,100 680,72 760,40 L800,32"
          fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth="1.5" strokeDasharray="6 4"
        />
        {[100, 220, 360, 470, 560].map((x, i) => (
          <g key={x}>
            <circle cx={x} cy={148 - i * 12} r="3" className="fill-foreground" />
            {!prefersReduced && (
              <circle cx={x} cy={148 - i * 12} r="3" className="fill-foreground/40">
                <animate attributeName="r" values="3;10;3" dur="2.4s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0;0.6" dur="2.4s" begin={`${i * 0.4}s`} repeatCount="indefinite" />
              </circle>
            )}
          </g>
        ))}
        <g style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10 }}>
          <rect x="12" y="8" width="16" height="2" className="fill-foreground" />
          <text x="34" y="12" className="fill-foreground">Early signal</text>
          <rect x="150" y="8" width="16" height="2" className="fill-muted-foreground" />
          <text x="172" y="12" className="fill-muted-foreground">Mainstream coverage</text>
        </g>
      </svg>
    </div>
  );
}

function HeroLineage() {
  return (
    <div className="hidden lg:block w-[280px] shrink-0 ml-auto">
      <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
        Evidence lineage
      </div>
      <ol className="space-y-1.5 text-[11px]">
        {[
          { k: "SRC", v: "Companies House filing" },
          { k: "→", v: "Regional wire, 14:02" },
          { k: "→", v: "National desk, 09:41 next day" },
        ].map((r) => (
          <li key={r.v} className="flex items-center gap-2 rounded-md border border-border bg-background/85 backdrop-blur-sm px-2 py-1.5">
            <span className="text-[9px] font-mono text-muted-foreground w-6">{r.k}</span>
            <span className="text-foreground">{r.v}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Landing page                                                       */
/* ------------------------------------------------------------------ */

function LandingPage() {
  const [prefersReduced, setPrefersReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(m.matches);
    const l = () => setPrefersReduced(m.matches);
    m.addEventListener("change", l);
    return () => m.removeEventListener("change", l);
  }, []);

  return (
    <MarketingLayout>
      {/* ===== HERO ===== */}
      <section
        className="relative overflow-hidden border-b border-border flex flex-col"
        style={{
          minHeight: "620px",
          height: "calc(100svh - 4rem - 64px)",
          maxHeight: "920px",
        }}
      >
        <HeroBackdrop prefersReduced={prefersReduced} />

        {/* Copy sits on the quiet upper region of the field — no card */}
        <div className="relative z-10 mx-auto max-w-7xl w-full px-6 pt-10 md:pt-16 shrink-0">
          <Eyebrow>Public-signals early warning</Eyebrow>
          <h1 className="mt-4 font-display text-[36px] leading-[1.05] tracking-tight sm:text-5xl md:text-[68px] md:leading-[0.98] text-foreground max-w-[18ch]">
            See it forming before it becomes the news.
          </h1>
          <p className="mt-4 md:mt-6 max-w-xl text-[15px] md:text-lg text-muted-foreground">
            Arklight reads the open public record, traces every claim to its origin,
            maps who it reaches, and turns early signals into dated, testable scenarios.
          </p>

          <div className="mt-6 md:mt-7 flex flex-wrap items-center gap-3">
            <a
              href="/auth?mode=signup"
              className="h-11 inline-flex items-center gap-2 px-5 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Start free <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#how"
              className="h-11 inline-flex items-center gap-2 px-5 rounded-md text-sm font-medium border border-border bg-background/70 backdrop-blur-sm text-foreground hover:bg-accent/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
            >
              See how it works
            </a>
          </div>

          <div className="mt-4 md:mt-5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
            Public sources only · Every call frozen and graded · Not financial advice
          </div>
        </div>

        {/* Flex spacer keeps copy and instrument apart at any viewport height */}
        <div className="flex-1 min-h-4" aria-hidden="true" />

        {/* Instrument row: lineage (desktop right) + timeline strip along the bottom */}
        <div className="relative z-10 mx-auto max-w-7xl w-full px-6 md:px-10 pb-6 shrink-0">
          <div className="hidden lg:flex justify-end mb-4">
            <HeroLineage />
          </div>
          <HeroTimeline prefersReduced={prefersReduced} />
        </div>
      </section>




      {/* ===== SOURCE STRIP ===== */}
      <Section id="sources">
        <div className="grid md:grid-cols-[1fr_auto] gap-8 items-end">
          <div>
            <Eyebrow>The record we read</Eyebrow>
            <h2 className="mt-3 font-display text-3xl md:text-4xl tracking-tight max-w-[24ch]">
              The open record. Nothing private. Nothing leaked.
            </h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            33+ named outlets tracked across the political spectrum, alongside primary-source registries.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { icon: Signal, label: "News wires" },
            { icon: Building2, label: "Company filings" },
            { icon: Layers, label: "Tenders & contracts" },
            { icon: Waves, label: "Insolvency notices" },
            { icon: ShieldCheck, label: "Regulatory actions" },
            { icon: Scale, label: "Court records" },
          ].map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="h-20 rounded-md border border-border bg-card px-4 flex items-center gap-3"
            >
              <Icon className="h-4 w-4 text-foreground" />
              <span className="text-sm text-foreground">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== CASE ===== */}
      <Section id="case">
        <div className="grid md:grid-cols-2 gap-14 items-start">
          <div>
            <Eyebrow>The case</Eyebrow>
            <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-tight max-w-[18ch]">
              By the time it is news, the move has already begun.
            </h2>
          </div>
          <div className="space-y-4 text-[15px] leading-relaxed text-muted-foreground">
            <p>
              A regulator opens a consultation. A supplier files an unusual charge.
              A small trade paper runs a paragraph nobody re-shares. Three weeks later
              a national headline explains what the market already priced in.
            </p>
            <p className="text-foreground">
              Arklight is built for the space between the first document and the loud headline —
              detecting what is <em className="not-italic underline decoration-foreground/30 underline-offset-4">forming</em>,
              not just reporting what is confirmed.
            </p>
          </div>
        </div>
      </Section>

      {/* ===== HOW IT WORKS ===== */}
      <Section id="how" className="bg-muted/30">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-tight">
          Scan · Trace · Map · Project · Prove
        </h2>

        <ol className="mt-12 grid md:grid-cols-5 gap-4">
          {HOW_STEPS.map((s, i) => (
            <li key={s.title} className="rounded-md border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Step {String(i + 1).padStart(2, "0")}
                </span>
                <s.icon className="h-4 w-4 text-foreground" />
              </div>
              <div className="mt-3 font-display text-lg tracking-tight text-foreground">{s.title}</div>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ===== FEATURES ===== */}
      <Section id="features">
        <Eyebrow>Capability</Eyebrow>
        <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-tight max-w-[22ch]">
          A working instrument — not a dashboard of decoration.
        </h2>

        <div className="mt-14 space-y-24">
          <FeatureBand
            eyebrow="Lineage"
            title="Every claim traced to its origin."
            body="See who reported it first, who repeated it, and where the trail actually ends. Repetition is not corroboration."
            visual={<LineageVisual />}
            reverse={false}
          />
          <FeatureBand
            eyebrow="Book scoring"
            title="Scored to your book — priority, not portfolio value."
            body="Add the entities, sectors, and themes you care about. Signals are ranked by how strongly they touch what you watch. No holdings, no P&L."
            visual={<BookScoreVisual />}
            reverse
          />
          <FeatureBand
            eyebrow="Narrative Divergence"
            title="Left, centre, and right — measured on the same event."
            body="A 0–100 gauge quantifies how far coverage diverges from a neutral baseline, using AllSides political-lean data."
            visual={<DivergenceVisual />}
            reverse={false}
          />
          <FeatureBand
            eyebrow="Four horizons"
            title="Dated scenarios instead of vibes."
            body="Every projection ships with a horizon, a probability, and the leading and contradicting signals that would move it."
            visual={<HorizonsVisual />}
            reverse
          />
          <FeatureBand
            eyebrow="Frozen track record"
            title="Calibrated forecasts. Graded later."
            body="Probability, deadline, and evidence are frozen when a call is made. Outcomes are graded from measured facts, not memory."
            visual={<LedgerVisual />}
            reverse={false}
          />
          <FeatureBand
            eyebrow="Delivery"
            title="Slack and email — for Pro."
            body="Pro users receive prioritised alerts and briefings pushed to their channels. Free users read everything in-app."
            visual={<DeliveryVisual />}
            reverse
          />
        </div>
      </Section>

      {/* ===== PROOF ===== */}
      <Section id="proof" className="bg-muted/30">
        <div className="grid md:grid-cols-2 gap-14 items-start">
          <div>
            <Eyebrow>Proof</Eyebrow>
            <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-tight max-w-[18ch]">
              A forecast should leave a receipt.
            </h2>
            <p className="mt-6 text-[15px] text-muted-foreground max-w-md">
              Probability, deadline, and evidence are frozen when a call is made,
              then graded later against public outcomes. Track record builds from
              measured outcomes, not marketing claims.
            </p>
          </div>
          <LedgerVisual full />
        </div>
      </Section>

      {/* ===== NARRATIVE DIVERGENCE ===== */}
      <Section id="divergence">
        <div className="grid md:grid-cols-[1fr_auto] gap-8 items-end">
          <div>
            <Eyebrow>Narrative Divergence</Eyebrow>
            <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-tight max-w-[22ch]">
              How far the story pulls from a neutral baseline.
            </h2>
          </div>
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Political-lean data: AllSides
          </p>
        </div>

        <div className="mt-10 rounded-md border border-border bg-card p-6 md:p-10">
          <DivergenceVisual full />
          <p className="mt-6 max-w-2xl text-sm text-muted-foreground">
            Left, centre and right coverage of the same event, compared side-by-side.
            Repetition inside one lane is not independent corroboration — the gauge
            makes that visible.
          </p>
          <div className="mt-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Illustrative view
          </div>
        </div>
      </Section>

      {/* ===== PRICING TEASER ===== */}
      <Section id="pricing-teaser" className="bg-muted/30">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-tight">
          Start free. Upgrade when the receipts speak for themselves.
        </h2>

        <div className="mt-10 grid md:grid-cols-2 gap-4">
          <PricingCard
            name="Free"
            price="£0"
            trailing="currently"
            bullets={[
              "Public-signal graph",
              "Starter book — up to 10 watched items",
              "5 research interrogations / month",
              "Track record and weekly digest in-app",
            ]}
            cta={{ label: "Start free", href: "/auth?mode=signup", primary: true }}
          />
          <PricingCard
            name="Pro"
            price="Price to be announced"
            trailing="7-day free trial"
            highlight
            bullets={[
              "Slack and email alerts and briefings",
              "Unlimited book and research",
              "Advanced analytics and Narrative Divergence",
              "Everything in Free",
            ]}
            cta={{ label: "See pricing", href: "/pricing", primary: false }}
          />
        </div>
      </Section>

      {/* ===== FAQ ===== */}
      <Section id="faq">
        <Eyebrow>FAQ</Eyebrow>
        <h2 className="mt-3 font-display text-3xl md:text-5xl tracking-tight">
          Questions we hear most often.
        </h2>
        <div className="mt-10 max-w-3xl">
          <FAQ items={FAQ_ITEMS} />
        </div>
      </Section>

      {/* ===== CTA ===== */}
      <Section id="cta" className="bg-foreground text-background border-t-0">
        <div className="text-center">
          <h2 className="font-display text-3xl md:text-5xl tracking-tight">
            Start seeing the signal before the summary.
          </h2>
          <p className="mt-4 text-sm md:text-base opacity-80">
            Free to start. No card until Pro.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="/auth?mode=signup"
              className="h-11 inline-flex items-center gap-2 px-5 rounded-md text-sm font-medium bg-background text-foreground hover:opacity-90 transition"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="/pricing"
              className="h-11 inline-flex items-center gap-2 px-5 rounded-md text-sm font-medium border border-background/30 text-background hover:bg-background/10 transition"
            >
              See pricing
            </a>
          </div>
        </div>
      </Section>
    </MarketingLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Feature band + visuals                                             */
/* ------------------------------------------------------------------ */

function FeatureBand({
  eyebrow,
  title,
  body,
  visual,
  reverse,
}: {
  eyebrow: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  reverse: boolean;
}) {
  return (
    <div className={`grid md:grid-cols-2 gap-10 items-center ${reverse ? "md:[&>div:first-child]:order-2" : ""}`}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="mt-3 font-display text-2xl md:text-3xl tracking-tight max-w-[22ch]">
          {title}
        </h3>
        <p className="mt-4 text-[15px] text-muted-foreground leading-relaxed max-w-md">
          {body}
        </p>
      </div>
      <div className="rounded-md border border-border bg-card p-5">
        {visual}
        <div className="mt-4 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Illustrative view
        </div>
      </div>
    </div>
  );
}

function LineageVisual() {
  const rows = [
    { t: "T-14d", k: "Primary", v: "Regulator publishes consultation PDF", strong: true },
    { t: "T-11d", k: "Wire", v: "Trade paper republishes 2 paragraphs" },
    { t: "T-6d",  k: "Wire", v: "Regional broadsheet repeats trade-paper phrasing" },
    { t: "T-2d",  k: "News", v: "Two nationals — same wording, no new source" },
    { t: "T-0",   k: "News", v: "Story becomes mainstream headline" },
  ];
  return (
    <ol className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.t} className="flex items-center gap-3 rounded border border-border bg-background px-3 py-2">
          <span className="w-14 text-[10px] font-mono text-muted-foreground">{r.t}</span>
          <span className={`text-[10px] font-mono uppercase tracking-widest w-16 ${r.strong ? "text-foreground" : "text-muted-foreground"}`}>{r.k}</span>
          <span className={`flex-1 text-sm ${r.strong ? "text-foreground font-medium" : "text-muted-foreground"}`}>{r.v}</span>
        </li>
      ))}
    </ol>
  );
}

function BookScoreVisual() {
  const rows = [
    { entity: "Northern Rail freight",  score: 82, tag: "risk" as const },
    { entity: "Copper LT contracts",    score: 64, tag: "opportunity" as const },
    { entity: "Independent gas suppliers", score: 47, tag: "risk" as const },
    { entity: "UK offshore wind consenting", score: 31, tag: "opportunity" as const },
  ];
  const color = (t: "risk" | "opportunity") =>
    t === "risk" ? "var(--color-risk)" : "var(--color-opportunity)";
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.entity} className="grid grid-cols-[1fr_auto] gap-3 items-center">
          <div>
            <div className="text-sm text-foreground">{r.entity}</div>
            <div className="mt-1 h-1.5 rounded-full bg-border/70 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${r.score}%`, background: color(r.tag) }}
              />
            </div>
          </div>
          <div className="text-[11px] font-mono text-foreground w-12 text-right">{r.score}</div>
        </li>
      ))}
    </ul>
  );
}

function DivergenceVisual({ full = false }: { full?: boolean }) {
  const value = 68;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        <span>Left</span><span>Centre</span><span>Right</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-border/60 overflow-hidden">
        <div className="h-full" style={{ width: `${value}%`, background: "var(--color-foreground)" }} />
      </div>
      <div className="mt-4 flex items-baseline gap-3">
        <div className="font-display text-4xl tracking-tight text-foreground">{value}</div>
        <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">/ 100 divergence</div>
      </div>
      {full && (
        <div className="mt-6 grid md:grid-cols-3 gap-3">
          {[
            { lane: "Left", quote: "‘…framed as a public-safety failure.’" },
            { lane: "Centre", quote: "‘…described as an operational review.’" },
            { lane: "Right",  quote: "‘…characterised as regulatory overreach.’" },
          ].map((l) => (
            <div key={l.lane} className="rounded border border-border bg-background p-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{l.lane}</div>
              <div className="mt-1 text-sm text-foreground">{l.quote}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HorizonsVisual() {
  const rows = [
    { h: "72h",  p: 62, label: "Consultation extended" },
    { h: "14d",  p: 41, label: "Two majors alter guidance" },
    { h: "90d",  p: 28, label: "Contract award reallocated" },
    { h: "180d", p: 17, label: "New primary regulation drafted" },
  ];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.h} className="grid grid-cols-[3rem_1fr_auto] gap-3 items-center rounded border border-border bg-background px-3 py-2">
          <span className="text-[11px] font-mono text-foreground">{r.h}</span>
          <span className="text-sm text-foreground truncate">{r.label}</span>
          <span className="text-[11px] font-mono text-muted-foreground">p = 0.{String(r.p).padStart(2, "0")}</span>
        </li>
      ))}
    </ul>
  );
}

function LedgerVisual({ full = false }: { full?: boolean }) {
  const rows = [
    { date: "2026-06-01", claim: "Consultation extends past deadline",   verdict: "hit"  as const, p: 0.62 },
    { date: "2026-05-18", claim: "Contract award reallocated within 90d", verdict: "hit"  as const, p: 0.44 },
    { date: "2026-05-02", claim: "Two majors alter guidance in 14d",     verdict: "miss" as const, p: 0.41 },
    { date: "2026-04-11", claim: "Insolvency filed by supplier",         verdict: "hit"  as const, p: 0.72 },
    { date: "2026-03-28", claim: "Regulatory action escalates in 30d",    verdict: "open" as const, p: 0.36 },
  ];
  const tone = (v: "hit" | "miss" | "open") =>
    v === "hit" ? "var(--color-opportunity)" : v === "miss" ? "var(--color-risk)" : "var(--color-muted-foreground)";
  const visible = full ? rows : rows.slice(0, 4);
  return (
    <div className="text-[13px]">
      <div className="grid grid-cols-[6rem_1fr_4rem_3rem] gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground pb-2 border-b border-border">
        <span>Frozen</span><span>Claim</span><span className="text-right">Prob.</span><span className="text-right">Grade</span>
      </div>
      <ul className="divide-y divide-border">
        {visible.map((r) => (
          <li key={r.date + r.claim} className="grid grid-cols-[6rem_1fr_4rem_3rem] gap-2 items-center py-2.5">
            <span className="font-mono text-[11px] text-muted-foreground">{r.date}</span>
            <span className="text-foreground truncate">{r.claim}</span>
            <span className="font-mono text-[11px] text-foreground text-right">{r.p.toFixed(2)}</span>
            <span
              className="text-[10px] font-mono uppercase tracking-widest text-right"
              style={{ color: tone(r.verdict) }}
            >
              {r.verdict}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeliveryVisual() {
  return (
    <div className="space-y-2">
      {[
        { ch: "Slack #book-signals", body: "Northern Rail freight — new insolvency notice from a tier-2 supplier.", meta: "priority · 82" },
        { ch: "Email · weekly digest", body: "3 new frozen calls, 2 graded (1 hit, 1 miss), narrative divergence up 12 pts.", meta: "Mon 07:00" },
        { ch: "Slack #ops-risk", body: "Regulator opened consultation touching 4 items on your book.", meta: "priority · 64" },
      ].map((m) => (
        <div key={m.ch} className="rounded border border-border bg-background p-3">
          <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>{m.ch}</span><span>{m.meta}</span>
          </div>
          <div className="mt-1 text-sm text-foreground">{m.body}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pricing card                                                       */
/* ------------------------------------------------------------------ */

function PricingCard({
  name, price, trailing, bullets, cta, highlight,
}: {
  name: string;
  price: string;
  trailing?: string;
  bullets: string[];
  cta: { label: string; href: string; primary: boolean };
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-md border ${highlight ? "border-foreground" : "border-border"} bg-card p-6 md:p-8`}>
      <div className="flex items-baseline justify-between">
        <div className="font-display text-xl tracking-tight text-foreground">{name}</div>
        {highlight && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-foreground">Pro</span>
        )}
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <div className="font-display text-3xl md:text-4xl tracking-tight text-foreground">{price}</div>
        {trailing && <div className="text-xs text-muted-foreground">{trailing}</div>}
      </div>
      <ul className="mt-6 space-y-2 text-sm text-foreground">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span aria-hidden className="mt-2 h-1 w-1 rounded-full bg-foreground shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <a
        href={cta.href}
        className={`mt-7 h-10 inline-flex items-center justify-center px-4 rounded-md text-sm font-medium w-full transition ${
          cta.primary
            ? "bg-foreground text-background hover:opacity-90"
            : "border border-border text-foreground hover:bg-accent/60"
        }`}
      >
        {cta.label}
      </a>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Accessible FAQ                                                     */
/* ------------------------------------------------------------------ */

export function FAQ({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-border border-y border-border">
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
              className="w-full flex items-center justify-between gap-6 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 rounded"
            >
              <span className="text-base md:text-lg text-foreground">{it.q}</span>
              <span aria-hidden className={`text-foreground transition-transform ${isOpen ? "rotate-45" : ""}`}>+</span>
            </button>
            {isOpen && (
              <div id={id} className="pb-6 text-[15px] text-muted-foreground leading-relaxed max-w-3xl">
                {it.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const HOW_STEPS = [
  { title: "Scan",    icon: Radar,    body: "Approved public sources are read continuously — wires, filings, tenders, regulatory notices, court records." },
  { title: "Trace",   icon: GitBranch, body: "Origin is identified; group-co-owned repetition and score manipulation are flagged as risk, not evidence." },
  { title: "Map",     icon: Compass,  body: "Affected entities and sectors are mapped through verified relationships — who this actually reaches." },
  { title: "Project", icon: Target,   body: "Dated scenarios across four horizons, with leading and contradicting signals attached." },
  { title: "Prove",   icon: Receipt,  body: "Every call is frozen — probability, deadline, evidence — then graded from measured outcomes." },
];

const FAQ_ITEMS = [
  {
    q: "What does Arklight do?",
    a: "Arklight is a public-signals early-warning instrument. It continuously reads the open public record, traces claims to origin, maps who a development helps and harms through verified relationships, and turns those signals into dated, testable scenarios that are frozen and graded later.",
  },
  {
    q: "Is this financial advice?",
    a: "No. Arklight is not a broker, adviser, or product that recommends what to buy or sell. There is no buy, sell, or target-price language in the product. All figures are GBP. Use it as one input into your own decisions.",
  },
  {
    q: "Where does the data come from?",
    a: "Only public sources: news wires, company filings, tenders and contracts, insolvency notices, regulatory actions, court records, and other primary registries. Nothing private and nothing leaked. Attribution is preserved on every claim.",
  },
  {
    q: "How does Arklight prove its forecasts?",
    a: "When a projection is made, probability, deadline and supporting evidence are frozen. Later, outcomes are graded from measured public facts — hits, misses and still-open calls. The track record you see is the ledger, not a marketing summary.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. The Free tier is currently £0, with in-app track record and weekly digest. Pro starts with a 7-day free trial and can be cancelled at any time — no lock-in.",
  },
];

// Suppress unused-import warnings for icons kept for symmetry.
void Activity; void Sparkles; void Database; void Eye;
