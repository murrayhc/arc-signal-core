// Admin-only middleware for operator/mutating server functions.
// Composes requireSupabaseAuth (authenticates the user) with the has_role
// Postgres RPC. Replaces the retired owner-token middleware (requireOwner).
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = (context as { userId?: string }).userId;
    if (!userId) throw new Error("Forbidden: admin role required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("has_role", {
      _role: "admin",
      _user_id: userId,
    });
    if (error) throw new Error(`Forbidden: role check failed (${error.message})`);
    if (data !== true) throw new Error("Forbidden: admin role required");

    return next();
  });
