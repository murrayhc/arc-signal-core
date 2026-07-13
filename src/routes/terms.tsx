import { createFileRoute } from "@tanstack/react-router";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import type { ReactNode } from "react";

export function LegalShell({
  eyebrow, title, updated, children,
}: { eyebrow: string; title: string; updated: string; children: ReactNode }) {
  return (
    <MarketingLayout>
      <article className="mx-auto max-w-3xl px-6 py-20 md:py-28">
        <div className="mkt-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--mkt-muted)]">{eyebrow}</div>
        <h1 className="mkt-display mt-4 text-4xl md:text-5xl font-medium text-[color:var(--mkt-heading)]">{title}</h1>
        <div className="mt-4 inline-flex items-center gap-2 rounded border border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel)] px-3 py-1.5 text-[11px] mkt-mono uppercase tracking-widest text-[color:var(--mkt-muted)]">
          Draft for legal review · Updated {updated}
        </div>
        <div className="mt-10 max-w-none text-[15px] leading-relaxed text-[color:var(--mkt-heading)] [&_h2]:mkt-display [&_h2]:text-xl [&_h2]:mt-10 [&_h2]:text-[color:var(--mkt-heading)] [&_p]:mt-3 [&_p]:text-[color:var(--mkt-muted)] [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:text-[color:var(--mkt-muted)] [&_a]:underline">
          {children}
        </div>
      </article>
    </MarketingLayout>
  );
}

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service · Project Arklight" },
      { name: "description", content: "Draft terms of service for Project Arklight — under legal review." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TermsPage,
});

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 font-display text-xl tracking-tight text-foreground">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-muted-foreground">{children}</p>;
}

function TermsPage() {
  return (
    <LegalShell eyebrow="Legal" title="Terms of Service" updated="July 2026">
      <P>
        These terms govern your use of Project Arklight ("Arklight", "we", "us").
        By creating an account or using the service you agree to them. This is a
        draft under legal review and may change before a final version is published.
      </P>

      <H2>1. What Arklight is</H2>
      <P>
        Arklight is a public-signals early-warning instrument. It reads the open
        public record, traces claims to origin, maps relationships and produces
        dated, testable scenarios. Arklight does not provide financial, legal,
        tax or investment advice. All monetary references are in GBP.
      </P>

      <H2>2. Accounts</H2>
      <P>
        You are responsible for the accuracy of your account information and for
        keeping your credentials secure. You must be at least 18 years old to
        create an account. You may not share your account or use it on behalf of
        another person without written permission.
      </P>

      <H2>3. Acceptable use</H2>
      <P>
        You will not use Arklight to break the law, infringe on the rights of
        others, submit non-public or leaked information, attempt to reverse
        engineer the service, scrape data at scale, or interfere with normal
        operation. Arklight processes only public sources; do not upload private
        or confidential material.
      </P>

      <H2>4. Subscriptions</H2>
      <P>
        Arklight offers a free tier and a paid Pro tier. Paid subscriptions
        renew automatically until cancelled. You may cancel at any time via
        Settings → Billing. Prices for Pro will be published before any charge
        is possible.
      </P>

      <H2>5. Forecasts and outcomes</H2>
      <P>
        Arklight generates probabilistic forecasts based on public signals. All
        forecasts are frozen with a probability, a deadline and supporting
        evidence at the time they are made, and are graded later against public
        outcomes. Forecasts are informational only and are not a recommendation
        to buy, sell or hold any asset.
      </P>

      <H2>6. Intellectual property</H2>
      <P>
        The Arklight software, models and interface are our intellectual property.
        Public source material remains the property of the original publishers
        and is attributed accordingly. You retain ownership of the content and
        watchlists you contribute.
      </P>

      <H2>7. Warranty and liability</H2>
      <P>
        Arklight is provided "as is" without warranties of any kind. To the
        maximum extent permitted by law, we exclude liability for indirect or
        consequential loss, including trading losses arising from use of the
        service.
      </P>

      <H2>8. Changes</H2>
      <P>
        We may update these terms. Material changes will be communicated by
        email and posted here with a new "Updated" date. Continued use after
        the effective date constitutes acceptance.
      </P>

      <H2>9. Contact</H2>
      <P>
        Questions about these terms can be sent to the address published on the
        contact page once available.
      </P>
    </LegalShell>
  );
}
