import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Building2, ChevronDown, Command, Compass, Crosshair, Database, Download, Eye, FlaskConical, Flame, Gauge, GitBranch, HelpCircle, Layers, Moon, Play, Radar, Search, Settings, Shield, Sparkles, Sun, Target } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { getDashboard } from "@/lib/archlight/pipeline.functions";
import { GuidedTour, startGuidedTour } from "@/components/archlight/GuidedTour";

export function AppShell({ children, onRunScan, scanning }: { children: ReactNode; onRunScan?: () => void; scanning?: boolean }) {
  return (
    <div className="min-h-screen w-full flex flex-col">
      <TopNav onRunScan={onRunScan} scanning={scanning}/>
      <div className="flex-1 flex">
        <SideNav />
        <main className="flex-1 min-w-0 p-5 flex flex-col gap-5">{children}</main>
      </div>
    </div>
  );
}

function TopNav({ onRunScan, scanning }: { onRunScan?: () => void; scanning?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="flex items-center gap-6 px-5 h-14">
        <Link to="/" className="flex items-center gap-3 shrink-0">
          <div className="relative h-8 w-8 grid place-items-center rounded-md ring-signal"
               style={{ background: "linear-gradient(135deg, var(--accent), var(--panel-2))" }}>
            <Radar className="h-4 w-4" style={{ color: "var(--signal)" }}/>
          </div>
          <div className="leading-tight">
            <div className="font-display text-[15px] tracking-wide text-glow-signal">ARCHLIGHT</div>
            <div className="text-[9px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Live Intelligence Engine</div>
          </div>
        </Link>




        <div className="flex-1"/>


        <div className="flex items-center gap-1.5 shrink-0">
          <TopBtn icon={<Play className="h-3.5 w-3.5"/>} label={scanning ? "Scanning…" : "Run scan"} accent onClick={onRunScan} disabled={scanning}/>
          <a href="/api/public/exports/events" download className="hidden xl:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] border border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition">
            <Download className="h-3.5 w-3.5"/>Export CSV
          </a>
          <div className="mx-1 h-6 w-px bg-border"/>
          <AlertsBell />
          <ThemeToggle />
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/60 text-[10px] font-mono">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--color-signal)" }}/>
            live
          </div>
          <div className="h-8 w-8 rounded-full border border-border/60 grid place-items-center text-[11px] font-mono bg-accent/40">AR</div>
        </div>
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("archlight:theme");
    const dark = saved === "dark";
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  }, []);
  const toggle = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("archlight:theme", next ? "dark" : "light");
  };
  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="h-8 w-8 rounded-md border border-border/60 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition"
    >
      {isDark ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}
    </button>
  );
}

function AlertsBell() {
  const { data } = useQuery({ queryKey: ["archlight", "dashboard"], queryFn: () => getDashboard(), staleTime: 30_000 });
  const count = data?.counts.unseen_alerts ?? 0;
  return (
    <Link to="/watchlist" className="relative h-8 w-8 rounded-md border border-border/60 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition">
      <Bell className="h-4 w-4"/>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full text-[9px] font-mono grid place-items-center" style={{ background: "var(--color-signal)", color: "black" }}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

function TopLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/40"
      activeProps={{ className: "px-3 py-1.5 rounded-md bg-accent/60 text-foreground" }}
      activeOptions={{ exact: to === "/" }}
    >
      {label}
    </Link>
  );
}

export function InterrogateSearch({ className = "" }: { className?: string } = {}) {
  const [q, setQ] = useState("");
  return (
    <form
      className={`flex items-center gap-2 h-11 w-full px-4 rounded-lg border border-border/60 bg-background/50 ring-signal transition ${className}`}

      onSubmit={(e) => {
        e.preventDefault();
        if (!q.trim()) return;
        window.location.href = `/interrogate?q=${encodeURIComponent(q.trim())}`;
      }}
    >
      <Search className="h-4 w-4 text-muted-foreground"/>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
        placeholder="Interrogate a company, sector, commodity, region, theme…"
      />

      <span className="hidden xl:flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
        <Command className="h-3 w-3"/>K
      </span>
    </form>
  );
}

function TopBtn({ icon, label, accent, onClick, disabled }: { icon: ReactNode; label: string; accent?: boolean; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`hidden xl:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-[11px] border transition disabled:opacity-50 disabled:cursor-not-allowed ${
        accent ? "border-[color:var(--color-signal)]/60 text-[color:var(--color-signal)] hover:bg-[color:var(--color-signal)]/10 ring-signal"
               : "border-border/60 text-muted-foreground hover:text-foreground hover:bg-accent/40"
      }`}>
      {icon}{label}
    </button>
  );
}
function IconBtn({ children }: { children: ReactNode }) {
  return <button className="h-8 w-8 rounded-md border border-border/60 grid place-items-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition">{children}</button>;
}

function SideNav() {
  const [engineOpen, setEngineOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("archlight:engine-nav-open");
    if (saved !== null) setEngineOpen(saved === "true");
  }, []);

  const toggleEngine = () => {
    setEngineOpen((prev) => {
      const next = !prev;
      localStorage.setItem("archlight:engine-nav-open", String(next));
      return next;
    });
  };

  const groups = [
    { label: "HOME", items: [{ icon: Gauge, label: "Overview", to: "/" }] },
    {
      label: "MY BOOK",
      items: [
        { icon: Crosshair, label: "My book", to: "/exposures" },
        { icon: Eye, label: "Watchlist & alerts", to: "/watchlist" },
        { icon: Bell, label: "Briefings", to: "/briefings" },
      ],
    },
    {
      label: "EXPLORE",
      items: [
        { icon: Layers, label: "Digest", to: "/digest" },
        { icon: Search, label: "Research", to: "/interrogate" },
        { icon: Target, label: "Research history", to: "/interrogations" },
        { icon: Compass, label: "Graph lookup", to: "/ask-graph" },
        { icon: Building2, label: "Companies", to: "/companies" },
        { icon: GitBranch, label: "Evidence", to: "/arcs" },
      ],
    },
    { label: "OPENINGS", items: [{ icon: Sparkles, label: "Opportunities", to: "/opportunities" }] },
    { label: "PROOF", items: [{ icon: Flame, label: "Track record", to: "/track-record" }] },
    {
      label: "ENGINE",
      collapsible: true,
      items: [
        { icon: Radar, label: "Scans", to: "/scans" },
        { icon: Database, label: "Sources", to: "/sources" },
        { icon: Settings, label: "Scan settings", to: "/settings/scan" },
        { icon: Settings, label: "Delivery channels", to: "/settings/delivery" },
        { icon: Shield, label: "Review queue", to: "/review" },
        { icon: Settings, label: "Model routing", to: "/admin/routing" },
        { icon: FlaskConical, label: "Backtest harness", to: "/backtest" },
      ],
    },
  ];

  return (
    <aside className="hidden md:flex flex-col w-[220px] shrink-0 border-r border-border/60 bg-background/40 backdrop-blur-xl">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              {group.collapsible ? (
                <>
                  <button
                    onClick={toggleEngine}
                    className="w-full flex items-center justify-between px-2.5 h-8 rounded-md text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-accent/40 transition"
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${!engineOpen ? "-rotate-90" : ""}`} />
                  </button>
                  {engineOpen && (
                    <p className="px-2.5 pb-1 text-[10px] text-muted-foreground">
                      Operator tools — run the engine, tune sources & settings.
                    </p>
                  )}
                  {engineOpen && (
                    <ul className="space-y-0.5">
                      {group.items.map(({ icon: Icon, label, to }) => (
                        <li key={to}>
                          <Link
                            to={to}
                            className="flex items-center gap-2.5 px-2.5 h-8 rounded-md text-xs transition text-muted-foreground hover:text-foreground hover:bg-accent/40"
                            activeProps={{ className: "flex items-center gap-2.5 px-2.5 h-8 rounded-md text-xs bg-accent/60 text-foreground border border-border/60" }}
                            activeOptions={{ exact: to === "/" }}
                          >
                            <Icon className="h-3.5 w-3.5"/>{label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <div className="px-2.5 h-6 flex items-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {group.label}
                  </div>
                  <ul className="space-y-0.5">
                    {group.items.map(({ icon: Icon, label, to }) => (
                      <li key={to}>
                        <Link
                          to={to}
                          className="flex items-center gap-2.5 px-2.5 h-8 rounded-md text-xs transition text-muted-foreground hover:text-foreground hover:bg-accent/40"
                          activeProps={{ className: "flex items-center gap-2.5 px-2.5 h-8 rounded-md text-xs bg-accent/60 text-foreground border border-border/60" }}
                          activeOptions={{ exact: to === "/" }}
                        >
                          <Icon className="h-3.5 w-3.5"/>{label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="m-3 mt-0 rounded-lg glass-panel p-3 text-[11px] space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <Flame className="h-3.5 w-3.5" style={{ color: "var(--color-signal)" }}/>
          <span className="font-display tracking-wide">System online</span>
        </div>
        <Row k="Pipeline" v="active" c="var(--color-growth)"/>
        <Row k="Guardrails" v="on" c="var(--color-signal)"/>
        <Row k="Advice" v="none" c="var(--color-muted-foreground)"/>
        <div className="pt-2 border-t border-border/50 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <Compass className="h-3 w-3"/> Living intelligence graph
        </div>
      </div>
    </aside>
  );
}

function Row({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
      <span className="text-muted-foreground">{k}</span>
      <span style={{ color: c ?? "var(--color-foreground)" }}>{v}</span>
    </div>
  );
}

export { Building2 };
