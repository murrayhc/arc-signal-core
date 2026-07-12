// Client-side function middleware that attaches the owner token (stored in
// localStorage under `owner_token`) as `x-owner-token` on every server-fn RPC.
// Registered in src/start.ts alongside attachSupabaseAuth.
import { createMiddleware } from "@tanstack/react-start";

export const attachOwnerToken = createMiddleware({ type: "function" }).client(async ({ next }) => {
  let token = "";
  try {
    if (typeof window !== "undefined") {
      token = window.localStorage.getItem("owner_token") ?? "";
    }
  } catch {
    token = "";
  }
  return next({
    headers: token ? { "x-owner-token": token } : {},
  });
});
