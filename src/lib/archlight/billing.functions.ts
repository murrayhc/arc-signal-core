// Subscription/tier helpers + Stripe Checkout.
// The subscriptions table is service-role-only and holds Stripe identifiers —
// never leak those to the client. Only safe fields (tier, status, period end,
// cancel flag, is_pro) are returned from getMySubscription. The Stripe secret
// key is read from process.env inside handlers only.

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const ACTIVE_STATUSES = new Set(["trialing", "active"]);

export interface MySubscription {
  tier: "free" | "pro";
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  is_pro: boolean;
}

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySubscription> => {
    const db = await admin();
    const { data, error } = await db
      .from("subscriptions")
      .select("tier, status, current_period_end, cancel_at_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return {
        tier: "free",
        status: "inactive",
        current_period_end: null,
        cancel_at_period_end: false,
        is_pro: false,
      };
    }
    const tier = (data.tier === "pro" ? "pro" : "free") as "free" | "pro";
    return {
      tier,
      status: data.status,
      current_period_end: data.current_period_end,
      cancel_at_period_end: !!data.cancel_at_period_end,
      is_pro: ACTIVE_STATUSES.has(data.status),
    };
  });

// Server-side helper — call from other server functions to gate Pro features.
export async function isProUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  const db = await admin();
  const { data, error } = await db
    .from("subscriptions")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  return ACTIVE_STATUSES.has(data.status);
}

// ---------- Stripe Checkout ----------

function resolveAppUrl(): string {
  try {
    const req = getRequest();
    const origin = req.headers.get("origin");
    if (origin) return origin.replace(/\/$/, "");
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
  } catch {
    // ignore
  }
  const fromEnv = process.env.APP_URL || process.env.VITE_APP_URL;
  return (fromEnv || "http://localhost:8080").replace(/\/$/, "");
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { priceKey?: "monthly" | "annual" }) => ({
    priceKey: data?.priceKey === "annual" ? ("annual" as const) : ("monthly" as const),
  }))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Billing is not configured (missing STRIPE_SECRET_KEY).");
    }
    const priceId =
      data.priceKey === "annual"
        ? process.env.STRIPE_PRICE_PRO_ANNUAL
        : process.env.STRIPE_PRICE_PRO_MONTHLY;
    if (!priceId) {
      throw new Error(
        `Billing price is not configured (missing STRIPE_PRICE_PRO_${data.priceKey.toUpperCase()}).`,
      );
    }

    const db = await admin();

    // Resolve email: prefer claims, fall back to profile row.
    let email: string | undefined = (context.claims as { email?: string } | undefined)?.email;
    if (!email) {
      const { data: profile } = await db
        .from("profiles")
        .select("email")
        .eq("id", context.userId)
        .maybeSingle();
      email = profile?.email ?? undefined;
    }

    // Load existing subscription row (may not exist yet).
    const { data: subRow } = await db
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secretKey);

    let customerId = subRow?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { user_id: context.userId },
      });
      customerId = customer.id;
      // Upsert onto the subscriptions row (service-role only).
      const { error: upsertErr } = await db
        .from("subscriptions")
        .upsert(
          {
            user_id: context.userId,
            stripe_customer_id: customerId,
          },
          { onConflict: "user_id" },
        );
      if (upsertErr) throw new Error(upsertErr.message);
    }

    const appUrl = resolveAppUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { user_id: context.userId },
      },
      client_reference_id: context.userId,
      metadata: { user_id: context.userId },
      success_url: `${appUrl}/settings/billing?checkout=success`,
      cancel_url: `${appUrl}/settings/billing?checkout=cancel`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }
    return { url: session.url };
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ url: string }> => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Billing is not configured (missing STRIPE_SECRET_KEY).");
    }
    const db = await admin();
    const { data: subRow, error } = await db
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const customerId = subRow?.stripe_customer_id;
    if (!customerId) {
      throw new Error("No billing account yet. Start a subscription first.");
    }

    const appUrl = resolveAppUrl();
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secretKey);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings/billing`,
    });
    if (!session.url) {
      throw new Error("Stripe did not return a portal URL.");
    }
    return { url: session.url };
  });
