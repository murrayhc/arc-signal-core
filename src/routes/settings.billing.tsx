import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, ExternalLink, Sparkles } from "lucide-react";
import { AppShell } from "@/components/archlight/AppShell";
import {
  createCheckoutSession,
  createPortalSession,
  getMySubscription,
} from "@/lib/archlight/billing.functions";

export const Route = createFileRoute("/settings/billing")({
  head: () => ({
    meta: [
      { title: "Archlight · Billing" },
      { name: "description", content: "Manage your Archlight plan — upgrade to Pro or manage your subscription." },
    ],
  }),
  component: BillingPage,
  validateSearch: (search: Record<string, unknown>) => ({
    checkout:
      search.checkout === "success" || search.checkout === "cancel"
        ? (search.checkout as "success" | "cancel")
        : undefined,
  }),
});

const PRO_FEATURES = [
  "Delivery to Slack & webhooks",
  "Unlimited book & watchlist entries",
  "Unlimited research interrogations",
  "Advanced analytics & track record",
];

function BillingPage() {
  const { checkout } = Route.useSearch();
  const qc = useQueryClient();
  const [priceKey, setPriceKey] = useState<"monthly" | "annual">("monthly");
  const [redirecting, setRedirecting] = useState(false);

  const { data: sub, isLoading, refetch } = useQuery({
    queryKey: ["billing", "mySubscription"],
    queryFn: () => getMySubscription(),
  });

  useEffect(() => {
    if (checkout === "success") {
      toast.success("Welcome to Pro");
      // Webhook may lag — refetch shortly.
      const t1 = setTimeout(() => refetch(), 1500);
      const t2 = setTimeout(() => refetch(), 5000);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [checkout, refetch]);

  const checkoutMut = useMutation({
    mutationFn: () => createCheckoutSession({ data: { priceKey } }),
    onSuccess: ({ url }) => {
      setRedirecting(true);
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message ?? "Could not start checkout"),
  });

  const portalMut = useMutation({
    mutationFn: () => createPortalSession(),
    onSuccess: ({ url }) => {
      setRedirecting(true);
      window.location.href = url;
    },
    onError: (err: Error) => toast.error(err.message ?? "Could not open portal"),
  });

  const isPro = !!sub?.is_pro;
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto w-full flex flex-col gap-5">
        <header className="flex items-center justify-between">
          <div>
            <Link to="/" className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Back
            </Link>
            <h1 className="mt-1 font-display text-2xl tracking-wide">Billing</h1>
            <p className="text-sm text-muted-foreground">Your plan and subscription.</p>
          </div>
          <PlanBadge isPro={isPro} loading={isLoading} />
        </header>

        {checkout === "cancel" && (
          <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Checkout canceled — no charge was made.
          </div>
        )}

        {isLoading ? (
          <div className="rounded-lg border border-border/60 p-6 text-xs font-mono uppercase tracking-widest text-muted-foreground animate-pulse">
            Loading plan…
          </div>
        ) : isPro ? (
          <section className="rounded-lg border border-border/60 bg-background/40 p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: "var(--color-signal)" }} />
              <h2 className="font-display text-lg">Archlight Pro</h2>
            </div>
            <div className="text-sm text-muted-foreground">
              Status: <span className="text-foreground font-mono">{sub?.status}</span>
              {periodEnd && (
                <>
                  {" · "}
                  {sub?.cancel_at_period_end ? "ends on " : "renews on "}
                  <span className="text-foreground">
                    {periodEnd.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                  </span>
                </>
              )}
            </div>
            {sub?.cancel_at_period_end && (
              <div className="text-xs text-muted-foreground">
                Your subscription is set to cancel at the end of the current period.
              </div>
            )}
            <div>
              <button
                onClick={() => portalMut.mutate()}
                disabled={portalMut.isPending || redirecting}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-xs border border-border/60 hover:bg-accent/40 transition disabled:opacity-50"
              >
                {portalMut.isPending || redirecting ? "Opening portal…" : (
                  <>Manage subscription <ExternalLink className="h-3.5 w-3.5" /></>
                )}
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-[color:var(--color-signal)]/40 bg-background/40 p-5 flex flex-col gap-4 ring-signal">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: "var(--color-signal)" }} />
                <h2 className="font-display text-lg">Upgrade to Pro</h2>
              </div>
              <div className="inline-flex rounded-md border border-border/60 p-0.5 text-[11px] font-mono">
                <button
                  onClick={() => setPriceKey("monthly")}
                  className={`px-2.5 h-7 rounded ${priceKey === "monthly" ? "bg-accent/60 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setPriceKey("annual")}
                  className={`px-2.5 h-7 rounded ${priceKey === "annual" ? "bg-accent/60 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Annual
                </button>
              </div>
            </div>
            <ul className="grid sm:grid-cols-2 gap-2 text-sm">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="h-4 w-4 mt-0.5" style={{ color: "var(--color-signal)" }} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div>
              <button
                onClick={() => checkoutMut.mutate()}
                disabled={checkoutMut.isPending || redirecting}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-md text-sm border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 transition disabled:opacity-50 ring-signal"
              >
                {checkoutMut.isPending || redirecting ? "Redirecting…" : "Upgrade to Pro — 7-day free trial"}
              </button>
              <p className="mt-2 text-[11px] font-mono text-muted-foreground">
                Cancel anytime during the trial. Card required by Stripe.
              </p>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function PlanBadge({ isPro, loading }: { isPro: boolean; loading: boolean }) {
  if (loading) return null;
  return isPro ? (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] font-mono uppercase tracking-widest border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)]">
      <Sparkles className="h-3 w-3" /> Pro
    </span>
  ) : (
    <span className="inline-flex items-center h-7 px-2.5 rounded-md text-[11px] font-mono uppercase tracking-widest border border-border/60 text-muted-foreground">
      Free
    </span>
  );
}
