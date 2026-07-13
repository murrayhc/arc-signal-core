import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LegalShell } from "./terms";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy · Project Arklight" },
      { name: "description", content: "Draft cookie policy for Project Arklight — under legal review." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CookiesPage,
});

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 font-display text-xl tracking-tight text-foreground">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-muted-foreground">{children}</p>;
}

function CookiesPage() {
  return (
    <LegalShell eyebrow="Legal" title="Cookie Policy" updated="July 2026">
      <P>
        This page explains how Project Arklight uses cookies and similar
        technologies. It is a draft under legal review and may change.
      </P>

      <H2>1. Strictly necessary</H2>
      <P>
        We use a small number of first-party cookies and local-storage entries
        that are required for the site to work — for example to keep you signed
        in, remember your theme preference, and protect against abuse. These
        cannot be turned off.
      </P>

      <H2>2. Analytics</H2>
      <P>
        We may use privacy-respecting analytics to understand aggregate usage
        (page views, feature usage). We do not sell analytics data. Where a
        cookie banner is required by your jurisdiction, you can decline
        non-essential analytics from the banner.
      </P>

      <H2>3. Third parties</H2>
      <P>
        Some cookies may be set by processors we rely on — for authentication,
        payments and email delivery — strictly to make those functions work.
        We do not use advertising cookies.
      </P>

      <H2>4. Managing cookies</H2>
      <P>
        You can clear or block cookies in your browser settings. Doing so may
        prevent parts of Arklight from working (for example, staying signed in).
      </P>

      <H2>5. Changes</H2>
      <P>
        Updates to this policy will be shown here with a new "Updated" date.
      </P>
    </LegalShell>
  );
}
