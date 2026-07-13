import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/useSession";

const authSearchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: authSearchSchema,
  head: () => ({
    meta: [
      { title: "Sign in · Arklight" },
      { name: "description", content: "Sign in or create a Project Arklight account." },
    ],
  }),
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const { user, loading: sessionLoading } = useSession();
  const [mode, setMode] = useState<Mode>(search.mode === "signup" ? "signup" : "signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (search.mode === "signup" || search.mode === "signin") {
      setMode(search.mode);
    }
  }, [search.mode]);

  useEffect(() => {
    if (!sessionLoading && user) navigate({ to: "/app" });
  }, [user, sessionLoading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/app" });
      } else {
        const display_name = `${firstName} ${lastName}`.trim();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { first_name: firstName, last_name: lastName, display_name },
          },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/app" });
        } else {
          setInfo("Check your email to confirm your account.");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "apple" | "azure") {
    setError(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/app` },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const inputCls =
    "w-full h-10 px-3 rounded-md bg-background border border-border text-sm text-foreground outline-none transition focus:border-foreground focus:ring-2 focus:ring-foreground/20";
  const labelCls = "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

  function setModeQS(m: Mode) {
    setMode(m);
    navigate({ to: "/auth", search: { mode: m }, replace: true });
  }

  return (
    <div className="min-h-screen w-full grid place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg bg-card border border-border shadow-sm p-7 space-y-6">
        <div className="text-center space-y-1.5">
          <Link to="/" className="inline-block font-display text-xl tracking-tight text-foreground">
            Project Arklight
          </Link>
          <h1 className="text-lg font-semibold text-foreground pt-1">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {mode === "signin"
              ? "Sign in to continue to your workspace."
              : "Free to start. No card until Pro."}
          </p>
        </div>

        <div className="flex rounded-md border border-border p-0.5 text-xs bg-muted/40">
          <button
            type="button"
            onClick={() => setModeQS("signin")}
            className={`flex-1 h-8 rounded transition ${mode === "signin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setModeQS("signup")}
            className={`flex-1 h-8 rounded transition ${mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className={labelCls}>First name</span>
                <input type="text" required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
              </label>
              <label className="block space-y-1.5">
                <span className={labelCls}>Last name</span>
                <input type="text" required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
              </label>
            </div>
          )}
          <label className="block space-y-1.5">
            <span className={labelCls}>Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </label>
          <label className="block space-y-1.5">
            <span className={labelCls}>Password</span>
            <input type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </label>
          {error && <div className="text-xs text-[color:var(--color-risk)]">{error}</div>}
          {info && <div className="text-xs text-foreground">{info}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          <div className="flex-1 h-px bg-border" /> or continue with <div className="flex-1 h-px bg-border" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => oauth("google")} disabled={busy} className="h-10 rounded-md border border-border text-xs font-medium text-foreground hover:bg-accent transition disabled:opacity-50">Google</button>
          <button type="button" onClick={() => oauth("apple")} disabled={busy} className="h-10 rounded-md border border-border text-xs font-medium text-foreground hover:bg-accent transition disabled:opacity-50">Apple</button>
          <button type="button" onClick={() => oauth("azure")} disabled={busy} className="h-10 rounded-md border border-border text-xs font-medium text-foreground hover:bg-accent transition disabled:opacity-50">Microsoft</button>
        </div>

        <div className="text-center text-[11px] text-muted-foreground">
          <Link to="/" className="underline hover:text-foreground">Back to Arklight home</Link>
        </div>
      </div>
    </div>
  );
}
