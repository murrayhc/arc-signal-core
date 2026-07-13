import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { useSession } from "@/lib/useSession";

const NAV = [
  { label: "How it works", href: "/#how" },
  { label: "Features", href: "/#features" },
  { label: "Proof", href: "/#proof" },
  { label: "Pricing", href: "/pricing" },
];

export function MarketingHeader() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center gap-6">
        <Link to="/" className="font-display text-[17px] tracking-tight text-foreground shrink-0">
          Arklight
        </Link>
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
            >
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="hidden md:flex items-center gap-2">
          {user ? (
            <Link
              to="/app"
              className="h-9 px-4 inline-flex items-center rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition"
            >
              Open Arklight
            </Link>
          ) : (
            <>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="h-9 px-3 inline-flex items-center rounded-md text-sm text-foreground hover:bg-accent/60 transition"
              >
                Sign in
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="h-9 px-4 inline-flex items-center rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition"
              >
                Get started
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="marketing-mobile-menu"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden h-9 w-9 grid place-items-center rounded-md border border-border text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>
      {open && (
        <div id="marketing-mobile-menu" className="md:hidden border-t border-border bg-background">
          <div className="px-6 py-4 flex flex-col gap-1">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="px-3 py-2 rounded-md text-sm text-foreground hover:bg-accent/60"
              >
                {n.label}
              </a>
            ))}
            <div className="h-px bg-border my-2" />
            {user ? (
              <Link to="/app" onClick={() => setOpen(false)} className="h-10 inline-flex items-center justify-center rounded-md text-sm font-medium bg-foreground text-background">
                Open Arklight
              </Link>
            ) : (
              <>
                <Link to="/auth" search={{ mode: "signin" }} onClick={() => setOpen(false)} className="h-10 inline-flex items-center justify-center rounded-md text-sm border border-border text-foreground">
                  Sign in
                </Link>
                <Link to="/auth" search={{ mode: "signup" }} onClick={() => setOpen(false)} className="h-10 inline-flex items-center justify-center rounded-md text-sm font-medium bg-foreground text-background">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-7xl px-6 py-14 grid grid-cols-2 md:grid-cols-4 gap-10 text-sm">
        <div className="col-span-2 md:col-span-1">
          <div className="font-display text-base text-foreground">Project Arklight</div>
          <p className="mt-3 text-xs text-muted-foreground max-w-[26ch]">
            A public-signals early-warning instrument. Receipts, not opinions.
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { label: "How it works", href: "/#how" },
            { label: "Features", href: "/#features" },
            { label: "Proof", href: "/#proof" },
            { label: "Pricing", href: "/pricing" },
          ]}
        />
        <FooterCol
          title="Company"
          links={[
            { label: "Get started", href: "/auth?mode=signup" },
            { label: "Sign in", href: "/auth?mode=signin" },
            { label: "Open Arklight", href: "/app" },
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            { label: "Terms", href: "/terms" },
            { label: "Privacy", href: "/privacy" },
            { label: "Cookies", href: "/cookies" },
          ]}
        />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 py-6 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground font-mono uppercase tracking-widest">
          <span>© {new Date().getFullYear()} Project Arklight</span>
          <span>
            Public signals only · Not financial advice · No buy · No sell · No target price · GBP
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="text-foreground hover:underline">{l.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <MarketingHeader />
      <main id="main-content" className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
