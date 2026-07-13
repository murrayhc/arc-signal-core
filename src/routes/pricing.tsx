import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { FAQ } from "./index";
import { Check, Minus } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing · Project Arklight" },
      {
        name: "description",
        content:
          "Start free. Upgrade to Pro when the receipts speak for themselves. 7-day free trial. Pro price to be announced.",
      },
      { property: "og:title", content: "Pricing · Project Arklight" },
      {
        property: "og:description",
        content: "Free forever, or Pro with 7-day trial. Public signals only. Not financial advice.",
      },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-7xl px-6 pt-16 pb-8 md:pt-24">
        <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">Pricing</div>
        <h1 className="mt-4 font-display text-4xl md:text-6xl tracking-tight max-w-[20ch]">
          Free while you decide. Pro when you're ready.
        </h1>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Arklight is free forever for individuals to explore the graph and grade forecasts.
          Pro adds delivery, unlimited research, and advanced analytics. No card required until you upgrade.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="grid md:grid-cols-2 gap-4">
          <Plan
            name="Free"
            price="£0"
            trailing="forever"
            rows={[
              ["Public-signal graph", true],
              ["Starter book — up to 10 watched items", true],
              ["Research interrogations — 5 / month", true],
              ["Weekly digest (in-app)", true],
              ["Frozen track record", true],
              ["Slack & email delivery", false],
              ["Unlimited book & research", false],
              ["Advanced analytics & Narrative Divergence", false],
            ]}
            cta={{ label: "Start free", href: "/auth?mode=signup", primary: true }}
          />
          <Plan
            highlight
            name="Pro"
            price="Price to be announced"
            trailing="7-day free trial · cancel anytime"
            rows={[
              ["Everything in Free", true],
              ["Slack & email alerts and briefings", true],
              ["Unlimited book — no cap on watched items", true],
              ["Unlimited research interrogations", true],
              ["Advanced analytics & Narrative Divergence", true],
              ["Priority scan cadence", true],
              ["Track record exports (CSV)", true],
              ["Named support contact", true],
            ]}
            cta={{ label: "Create an account", href: "/auth?mode=signup", primary: false }}
            footnote="Pricing will be published before any charge is possible. Creating an account today does not commit you to Pro."
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 border-t border-border">
        <div className="grid md:grid-cols-2 gap-14">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">
              7-day free trial
            </div>
            <h2 className="mt-3 font-display text-2xl md:text-3xl tracking-tight max-w-[20ch]">
              How the trial works.
            </h2>
            <ul className="mt-5 space-y-3 text-sm text-foreground">
              <li>· You start on Free — no payment, no trial timer.</li>
              <li>· When Pro pricing is published, you can start a 7-day trial from Settings → Billing.</li>
              <li>· If you don't upgrade, you stay on Free with everything you already have.</li>
              <li>· You can cancel at any time during or after the trial.</li>
            </ul>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">Honesty</div>
            <h2 className="mt-3 font-display text-2xl md:text-3xl tracking-tight max-w-[24ch]">
              What we won't claim.
            </h2>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              <li>· No hit rates or Brier scores until they are measured on live user calls.</li>
              <li>· No customer counts, testimonials, ratings or logo bars.</li>
              <li>· No compliance or audit badges we haven't earned.</li>
              <li>· No target prices, buy or sell language. GBP only.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 border-t border-border">
        <div className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground">FAQ</div>
        <h2 className="mt-3 font-display text-2xl md:text-3xl tracking-tight">Pricing questions.</h2>
        <div className="mt-8 max-w-3xl">
          <FAQ
            items={[
              { q: "How much will Pro cost?", a: "The Pro price is not yet published. We will announce it before enabling checkout. Until then, no card is required, and creating an account does not commit you to any charge." },
              { q: "Can I cancel at any time?", a: "Yes. Free is free forever. Pro is a monthly subscription with a 7-day free trial and can be cancelled at any time from Settings → Billing." },
              { q: "Do you offer team pricing?", a: "Team pricing will be introduced alongside Pro. If you have a specific team need in the meantime, contact us and we will work with you." },
              { q: "What happens to my data if I downgrade?", a: "Your book, research history and frozen calls remain in your account. Free-tier caps apply again — anything beyond the caps becomes read-only rather than deleted." },
            ]}
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 border-t border-border">
        <div className="rounded-md border border-border bg-card p-6 md:p-8 text-sm text-muted-foreground">
          Public signals only · Not financial advice · No buy · No sell · No target price · GBP
        </div>
      </section>
    </MarketingLayout>
  );
}

function Plan({
  name, price, trailing, rows, cta, highlight, footnote,
}: {
  name: string;
  price: string;
  trailing?: string;
  rows: [string, boolean][];
  cta: { label: string; href: string; primary: boolean };
  highlight?: boolean;
  footnote?: string;
}) {
  return (
    <div className={`rounded-md border ${highlight ? "border-foreground" : "border-border"} bg-card p-6 md:p-8`}>
      <div className="flex items-baseline justify-between">
        <div className="font-display text-xl tracking-tight text-foreground">{name}</div>
        {highlight && (
          <span className="text-[10px] font-mono uppercase tracking-widest text-foreground">Recommended</span>
        )}
      </div>
      <div className="mt-4 flex items-baseline gap-2 flex-wrap">
        <div className="font-display text-3xl md:text-4xl tracking-tight text-foreground">{price}</div>
        {trailing && <div className="text-xs text-muted-foreground">{trailing}</div>}
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        {rows.map(([label, included]) => (
          <li key={label} className="flex items-start gap-3">
            {included ? (
              <Check className="h-4 w-4 mt-0.5 text-foreground shrink-0" />
            ) : (
              <Minus className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            )}
            <span className={included ? "text-foreground" : "text-muted-foreground line-through/none"}>{label}</span>
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
      {footnote && <div className="mt-3 text-[11px] text-muted-foreground">{footnote}</div>}
    </div>
  );
}
