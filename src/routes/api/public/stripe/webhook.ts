// Stripe webhook — verifies signature and syncs subscription state.
// Placed under /api/public/* so it bypasses Lovable's published-site auth
// (Stripe cannot send a bearer token). Security = signature verification.
import { createFileRoute } from "@tanstack/react-router";

type SubStatus = string;
const ACTIVE = new Set(["trialing", "active"]);

function toIsoOrNull(ts: number | null | undefined): string | null {
  if (!ts || typeof ts !== "number") return null;
  return new Date(ts * 1000).toISOString();
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function resolveUserId(
  db: Awaited<ReturnType<typeof admin>>,
  metadataUserId: string | undefined | null,
  customerId: string | undefined | null,
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;
  if (!customerId) return null;
  const { data } = await db
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function upsertFromSubscription(
  userId: string,
  sub: {
    id: string;
    status: SubStatus;
    current_period_end?: number | null;
    cancel_at_period_end?: boolean;
    customer?: string | null;
    items?: { data?: Array<{ price?: { id?: string } }> };
  },
) {
  const db = await admin();
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const isPro = ACTIVE.has(sub.status);
  const { error } = await db.from("subscriptions").upsert(
    {
      user_id: userId,
      tier: isPro ? "pro" : "free",
      status: sub.status,
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : undefined,
      price_id: priceId,
      current_period_end: toIsoOrNull(sub.current_period_end ?? null),
      cancel_at_period_end: !!sub.cancel_at_period_end,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secretKey) {
          console.error("[stripe-webhook] STRIPE_SECRET_KEY missing");
          return new Response("Billing not configured", { status: 500 });
        }
        if (!webhookSecret) {
          console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET missing");
          return new Response("Webhook secret not configured", { status: 500 });
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return new Response("Missing signature", { status: 400 });
        }
        const rawBody = await request.text();

        const Stripe = (await import("stripe")).default;
        const stripe = new Stripe(secretKey);

        let event: import("stripe").Stripe.Event;
        try {
          // Async variant works in Worker runtimes (Web Crypto).
          event = await stripe.webhooks.constructEventAsync(
            rawBody,
            signature,
            webhookSecret,
          );
        } catch (err) {
          console.error("[stripe-webhook] signature verification failed:", err instanceof Error ? err.message : err);
          return new Response("Invalid signature", { status: 400 });
        }

        try {
          const db = await admin();

          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as import("stripe").Stripe.Checkout.Session;
              const metadataUserId =
                session.metadata?.user_id ??
                (session.client_reference_id as string | undefined) ??
                null;
              const customerId =
                typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
              const userId = await resolveUserId(db, metadataUserId, customerId);
              if (!userId) {
                console.error("[stripe-webhook] no user_id for checkout.session.completed", session.id);
                break;
              }
              if (session.mode !== "subscription" || !session.subscription) break;
              const subId =
                typeof session.subscription === "string" ? session.subscription : session.subscription.id;
              const sub = await stripe.subscriptions.retrieve(subId);
              await upsertFromSubscription(userId, sub as unknown as Parameters<typeof upsertFromSubscription>[1]);
              break;
            }

            case "customer.subscription.created":
            case "customer.subscription.updated": {
              const sub = event.data.object as import("stripe").Stripe.Subscription;
              const metadataUserId = sub.metadata?.user_id ?? null;
              const customerId =
                typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
              const userId = await resolveUserId(db, metadataUserId, customerId);
              if (!userId) {
                console.error("[stripe-webhook] no user_id for", event.type, sub.id);
                break;
              }
              await upsertFromSubscription(userId, sub as unknown as Parameters<typeof upsertFromSubscription>[1]);
              break;
            }

            case "customer.subscription.deleted": {
              const sub = event.data.object as import("stripe").Stripe.Subscription;
              const metadataUserId = sub.metadata?.user_id ?? null;
              const customerId =
                typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
              const userId = await resolveUserId(db, metadataUserId, customerId);
              if (!userId) {
                console.error("[stripe-webhook] no user_id for subscription.deleted", sub.id);
                break;
              }
              const { error } = await db
                .from("subscriptions")
                .update({
                  tier: "free",
                  status: "canceled",
                  current_period_end: null,
                  cancel_at_period_end: false,
                })
                .eq("user_id", userId);
              if (error) throw new Error(error.message);
              break;
            }

            default:
              // Ignore unrelated events.
              break;
          }

          return new Response(JSON.stringify({ received: true }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[stripe-webhook] handler error:", err instanceof Error ? err.message : err);
          return new Response(
            JSON.stringify({ error: "Handler failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
      GET: async () =>
        new Response("Stripe webhook — POST from Stripe with stripe-signature header.", {
          headers: { "Content-Type": "text/plain" },
        }),
    },
  },
});
