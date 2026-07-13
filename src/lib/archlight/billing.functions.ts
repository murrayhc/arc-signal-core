// Subscription/tier helpers. The subscriptions table is service-role-only and
// holds Stripe identifiers — never leak those to the client. Only safe fields
// (tier, status, period end, cancel flag, is_pro) are returned.

import { createServerFn } from "@tanstack/react-start";
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
