import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LegalShell } from "./terms";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · Project Arklight" },
      { name: "description", content: "Draft privacy policy for Project Arklight — under legal review." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrivacyPage,
});

function H2({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 font-display text-xl tracking-tight text-foreground">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-muted-foreground">{children}</p>;
}

function PrivacyPage() {
  return (
    <LegalShell eyebrow="Legal" title="Privacy Policy" updated="July 2026">
      <P>
        This policy explains what personal information Project Arklight collects,
        why, and what your rights are. It is a draft under legal review and may
        change before a final version is published.
      </P>

      <H2>1. Who we are</H2>
      <P>
        Project Arklight ("Arklight", "we") is the operator of the Arklight
        service. Contact details will be published on our contact page.
      </P>

      <H2>2. Data we collect</H2>
      <P>
        Account data — name, email address, hashed password or authentication
        provider identifiers. Usage data — the entities and themes you add to
        your book, research queries you run, feature usage and diagnostic logs.
        Billing data — for Pro subscribers, we receive a customer identifier
        and subscription state from our payment processor. We do not receive or
        store full card numbers.
      </P>

      <H2>3. Public sources</H2>
      <P>
        Arklight processes only public information from named sources. We do not
        knowingly collect or store non-public, leaked or confidential material.
        Requests to remove specific public references from a user's book can be
        made from the app.
      </P>

      <H2>4. Why we use your data</H2>
      <P>
        To provide the service, authenticate you, run your scans, deliver
        briefings you have subscribed to, meet legal obligations, prevent
        abuse, and improve reliability.
      </P>

      <H2>5. Sharing</H2>
      <P>
        We do not sell personal data. We share data with processors strictly
        necessary to run the service — hosting, database, authentication, email
        delivery, payment processing — under written agreements.
      </P>

      <H2>6. Retention</H2>
      <P>
        Account and usage data is retained while your account is active, and
        for a limited period afterwards for backup and legal purposes. You may
        request deletion at any time.
      </P>

      <H2>7. Your rights</H2>
      <P>
        Subject to applicable law you may request access to, correction of, or
        deletion of your personal data, and object to certain processing.
        Requests can be sent from the app or by email once contact details are
        published.
      </P>

      <H2>8. International transfers</H2>
      <P>
        Some processors may operate outside the United Kingdom. Where relevant,
        we rely on approved safeguards for international transfers.
      </P>

      <H2>9. Changes</H2>
      <P>
        We will post a new "Updated" date at the top of this page whenever this
        policy changes. Material changes will also be communicated by email.
      </P>
    </LegalShell>
  );
}
