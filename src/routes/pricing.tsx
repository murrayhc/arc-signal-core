import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { FAQ, PricingCard } from "./index";
import { Check } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing · Project Arklight" },
      { name: "description", content: "Free is currently £0. Pro price to be announced, with a 7-day trial. Public signals only. Not financial advice." },
      { property: "og:title", content: "Pricing · Project Arklight" },
      { property: "og:description", content: "Free is £0 today. Pro price to be announced. Public signals only." },
    ],
  }),
  component: PricingPage,
});

const PLANS = {
  free: [
    "Public-signal graph",
    "Starter book, up to 10 watched items",
    "Research interrogations, 5 per 30 days",
    "Weekly in-app digest",
    "Frozen track record",
  ],
  pro: [
    "Everything in Free",
    "Slack & email alerts and briefings",
    "Unlimited book, no cap on watched items",
    "Unlimited research interrogations",
    "Advanced analytics & Narrative Divergence",
    "Priority scan cadence",
    "Track record CSV exports",
  ],
};

function PricingPage() {
  return (
    <MarketingLayout>
      <section className="mx-auto max-w-7xl px-6 pt-20 md:pt-28 pb-6">
        <div className="mkt-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--mkt-muted)]">Pricing</div>
        <h1 className="mkt-display mt-4 text-4xl md:text-6xl font-medium text-[color:var(--mkt-heading)] text-balance max-w-[22ch]">
          Free while you decide. Pro when you're ready.
        </h1>
        <p className="mt-5 max-w-2xl text-[color:var(--mkt-muted)]">
          The Free tier is currently £0. Explore the graph, run scoped research and watch calls get graded. Pro adds delivery, unlimited research and advanced analytics. No card required until you upgrade.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="grid md:grid-cols-2 gap-3">
          <PricingCard
            name="Free"
            price="£0"
            trailing="currently"
            bullets={PLANS.free}
            cta={{ label: "Start free", href: "/auth?mode=signup", primary: true }}
          />
          <PricingCard
            highlight
            name="Pro"
            price="Price to be announced"
            trailing="7-day free trial · cancel anytime"
            bullets={PLANS.pro}
            cta={{ label: "Create an account", href: "/auth?mode=signup", primary: false }}
          />
        </div>
        <p className="mt-4 text-xs text-[color:var(--mkt-muted)] max-w-2xl">
          Pricing will be published before any charge is possible. Creating an account today does not commit you to Pro.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 border-t border-[color:var(--mkt-line)]">
        <div className="grid md:grid-cols-2 gap-14">
          <div>
            <div className="mkt-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--mkt-muted)]">7-day free trial</div>
            <h2 className="mkt-display mt-3 text-2xl md:text-3xl font-medium text-[color:var(--mkt-heading)] max-w-[22ch]">How the trial works.</h2>
            <ul className="mt-6 space-y-3 text-sm text-[color:var(--mkt-heading)]">
              {[
                "You start on Free at £0 — no payment, no trial timer.",
                "When Pro pricing is published, you will be able to start a 7-day trial from Settings → Billing.",
                "The post-trial plan behaviour will be published before Pro launches.",
                "Full billing and cancellation details will be published before checkout is enabled.",
              ].map((l) => (
                <li key={l} className="flex gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--mkt-ok)" }} />
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mkt-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--mkt-muted)]">Honesty</div>
            <h2 className="mkt-display mt-3 text-2xl md:text-3xl font-medium text-[color:var(--mkt-heading)] max-w-[26ch]">What we won't claim.</h2>
            <ul className="mt-6 space-y-3 text-sm text-[color:var(--mkt-muted)]">
              <li>· No aggregate hit-rates until measured on live user calls.</li>
              <li>· No customer counts, testimonials, ratings or logo bars.</li>
              <li>· No compliance or audit badges we haven't earned.</li>
              <li>· No target prices, buy or sell language. GBP only.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 border-t border-[color:var(--mkt-line)]">
        <div className="mkt-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--mkt-muted)]">FAQ</div>
        <h2 className="mkt-display mt-3 text-2xl md:text-3xl font-medium text-[color:var(--mkt-heading)]">Pricing questions.</h2>
        <div className="mt-8 max-w-3xl">
          <FAQ
            items={[
              { q: "How much will Pro cost?", a: "The Pro price is not yet published. We will announce it before enabling checkout. Until then, no card is required, and creating an account does not commit you to any charge." },
              { q: "Can I cancel at any time?", a: "The Free tier is currently £0, so there is nothing to cancel today. Full billing and cancellation details for Pro — including the intended 7-day trial — will be published before checkout is enabled." },
              { q: "Do you offer team pricing?", a: "Team pricing has not been announced. There is no team plan or team contact flow available at this stage." },
              { q: "What happens to my data if I change plan?", a: "Plan-change behaviour and data-retention details will be shown in the product before any paid plan is launched. Nothing in your account is charged or altered until Pro pricing is published and you explicitly upgrade." },
            ]}
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14 border-t border-[color:var(--mkt-line)]">
        <div className="rounded-2xl border border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel)] p-6 md:p-8 text-sm text-[color:var(--mkt-muted)]">
          Public signals only · Not financial advice · No buy · No sell · No target price · GBP
        </div>
      </section>
    </MarketingLayout>
  );
}
