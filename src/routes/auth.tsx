import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/useSession";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in · Archlight" },
      { name: "description", content: "Sign in or create an Archlight account." },
    ],
  }),
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: sessionLoading } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionLoading && user) navigate({ to: "/" });
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
        navigate({ to: "/" });
      } else {
        const display_name = `${firstName} ${lastName}`.trim();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { first_name: firstName, last_name: lastName, display_name },
          },
        });
        if (error) throw error;
        if (data.session) {
          navigate({ to: "/" });
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
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const inputCls =
    "w-full h-10 px-3 rounded-md bg-background border border-border text-sm text-foreground outline-none transition focus:border-[color:var(--color-signal)] focus:ring-2 focus:ring-[color:var(--color-signal)]/30";
  const labelCls = "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

  return (
    <div className="min-h-screen w-full grid place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-sm p-7 space-y-6">
        <div className="text-center space-y-1.5">
          <div className="font-display text-xl tracking-wide text-glow-signal">ARCHLIGHT</div>
          <h1 className="text-lg font-semibold text-foreground">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {mode === "signin"
              ? "Sign in to continue to your workspace."
              : "Just a few details to get you started."}
          </p>
        </div>

        <div className="flex rounded-md border border-border p-0.5 text-xs bg-muted/40">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 h-8 rounded transition ${mode === "signin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
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
                <input
                  type="text"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block space-y-1.5">
                <span className={labelCls}>Last name</span>
                <input
                  type="text"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
          )}
          <label className="block space-y-1.5">
            <span className={labelCls}>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block space-y-1.5">
            <span className={labelCls}>Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
            />
          </label>
          {error && <div className="text-xs text-red-500">{error}</div>}
          {info && <div className="text-xs text-[color:var(--color-signal)]">{info}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition disabled:opacity-50"
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
      </div>
    </div>
  );
}
