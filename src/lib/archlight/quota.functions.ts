// Central per-user, per-feature usage limits by tier. One place for all quota
// logic so every gated action uses the same counting + limits.
//
// Currently covers `scan_my_items` only (Phase 2). `research` and `ask_graph`
// join here when those actions are wired to this module — their limits MUST be
// enforced here so the numbers reported to the UI match what is actually
// enforced. Owner-confirmed limits (2026-07-13):
//   scan_my_items — free 3/day, pro 10/day
//   research      — free 1/day, pro 60/month   (not wired yet)
//   ask_graph     — free 5/day, pro 25/day     (not wired yet)
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isProUser } from "./billing.functions";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type QuotaAction = "scan_my_items";
type QuotaWindow = "day" | "month";
interface TierRule {
  limit: number;
  window: QuotaWindow;
}

export const QUOTA_LIMITS: Record<QuotaAction, { free: TierRule; pro: TierRule }> = {
  // TEMP 2026-07-14: free bumped 3 -> 25 for debugging member-scan collection.
  // REVERT free.limit back to 3 once the Google-News fetch issue is resolved.
  scan_my_items: { free: { limit: 25, window: "day" }, pro: { limit: 10, window: "day" } },
};

// Window boundaries in UTC (quotas reset at 00:00 GMT daily / 1st of month).
function windowStartIso(w: QuotaWindow): string {
  const n = new Date();
  return w === "month"
    ? new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString()
    : new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())).toISOString();
}
function windowResetIso(w: QuotaWindow): string {
  const n = new Date();
  return w === "month"
    ? new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1)).toISOString()
    : new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1)).toISOString();
}

async function countUsage(action: QuotaAction, userId: string, sinceIso: string): Promise<number> {
  const db = await admin();
  // scan_my_items: this user's member-scoped scan_runs within the window.
  if (action === "scan_my_items") {
    const { count } = await db
      .from("scan_runs")
      .select("id", { count: "exact", head: true })
      .eq("triggered_by", userId)
      .eq("trigger_kind", "member_scoped")
      .gte("started_at", sinceIso);
    return count ?? 0;
  }
  return 0;
}

export interface QuotaStatus {
  action: QuotaAction;
  tier: "free" | "pro";
  limit: number;
  used: number;
  remaining: number;
  window: QuotaWindow;
  resetsAt: string;
  withinLimit: boolean;
}

export async function getQuotaStatus(userId: string, action: QuotaAction): Promise<QuotaStatus> {
  const pro = await isProUser(userId);
  const rule = pro ? QUOTA_LIMITS[action].pro : QUOTA_LIMITS[action].free;
  const used = await countUsage(action, userId, windowStartIso(rule.window));
  return {
    action,
    tier: pro ? "pro" : "free",
    limit: rule.limit,
    used,
    remaining: Math.max(0, rule.limit - used),
    window: rule.window,
    resetsAt: windowResetIso(rule.window),
    withinLimit: used < rule.limit,
  };
}

/** Throws a friendly QUOTA error if the user is over their limit for this action. */
export async function assertWithinQuota(userId: string, action: QuotaAction): Promise<QuotaStatus> {
  const s = await getQuotaStatus(userId, action);
  if (!s.withinLimit) {
    const when = s.window === "month" ? "next month" : "midnight GMT";
    const upgrade = s.tier === "free" ? " Upgrade to Pro for more." : "";
    throw new Error(
      `QUOTA: You've used all ${s.limit} scans for today on your ${s.tier} plan. Resets ${when}.${upgrade}`,
    );
  }
  return s;
}

/** UI-facing: the current user's quota status for every metered action. */
export const getMyQuotas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuotaStatus[]> => {
    const userId = context.userId as string;
    const actions = Object.keys(QUOTA_LIMITS) as QuotaAction[];
    return Promise.all(actions.map((a) => getQuotaStatus(userId, a)));
  });
