// Owner-only middleware for mutating server functions.
// Requires an OWNER_TOKEN env var; requests must present a matching
// `x-owner-token` header. Applied via `.middleware([requireOwner])` on every
// data-mutating createServerFn to prevent anonymous callers from invoking
// admin/write endpoints exposed by TanStack Start.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export const requireOwner = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const expected = process.env.OWNER_TOKEN;
  if (!expected) {
    throw new Error("Forbidden: OWNER_TOKEN not configured on the server");
  }
  const req = getRequest();
  const provided = req?.headers?.get("x-owner-token") ?? "";
  if (!provided || !timingSafeEqualStr(provided, expected)) {
    throw new Error("Forbidden: owner token required");
  }
  return next();
});
