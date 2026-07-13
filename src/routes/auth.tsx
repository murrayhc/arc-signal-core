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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
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

  return (
    <div className="min-h-screen w-full grid place-items-center bg-background p-6">
      <div className="w-full max-w-sm glass-panel rounded-xl p-6 space-y-5 border border-border/60">
        <div className="text-center space-y-1">
          <div className="font-display text-lg tracking-wide text-glow-signal">ARCHLIGHT</div>
          <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
            {mode === "signin" ? "Sign in to continue" : "Create your account"}
          </div>
        </div>

        <div className="flex rounded-md border border-border/60 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={`flex-1 h-8 rounded ${mode === "signin" ? "bg-accent/60 text-foreground" : "text-muted-foreground"}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 h-8 rounded ${mode === "signup" ? "bg-accent/60 text-foreground" : "text-muted-foreground"}`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-background/50 border border-border/60 text-sm outline-none focus:ring-1 focus:ring-[color:var(--color-signal)]/60"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-9 px-3 rounded-md bg-background/50 border border-border/60 text-sm outline-none focus:ring-1 focus:ring-[color:var(--color-signal)]/60"
            />
          </label>
          {error && <div className="text-xs text-red-500">{error}</div>}
          {info && <div className="text-xs text-[color:var(--color-signal)]">{info}</div>}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-9 rounded-md text-sm border border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 transition disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <div className="flex-1 h-px bg-border/60" /> or continue with <div className="flex-1 h-px bg-border/60" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => oauth("google")} disabled={busy} className="h-9 rounded-md border border-border/60 text-xs hover:bg-accent/40 transition disabled:opacity-50">Google</button>
          <button type="button" onClick={() => oauth("apple")} disabled={busy} className="h-9 rounded-md border border-border/60 text-xs hover:bg-accent/40 transition disabled:opacity-50">Apple</button>
          <button type="button" onClick={() => oauth("azure")} disabled={busy} className="h-9 rounded-md border border-border/60 text-xs hover:bg-accent/40 transition disabled:opacity-50">Microsoft</button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          Google/Apple/Microsoft require the provider to be configured in Supabase; email + password works now.
        </p>
      </div>
    </div>
  );
}
