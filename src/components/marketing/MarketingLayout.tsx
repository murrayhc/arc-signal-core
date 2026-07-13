import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useSession } from "@/lib/useSession";

const NAV = [
  { label: "How it works", href: "/#how" },
  { label: "Proof", href: "/#proof" },
  { label: "Compare", href: "/#compare" },
  { label: "Pricing", href: "/pricing" },
];

/** Nav overlays a dark hero on `/`, and uses light styling on inner pages. */
export function MarketingHeader({ overlay = false }: { overlay?: boolean }) {
  const { user } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  const dark = overlay;
  const wrap = dark
    ? "absolute inset-x-0 top-4 z-50 mx-auto w-full lg:top-6"
    : "sticky top-0 z-40 border-b border-[color:var(--mkt-line)] bg-[color:var(--mkt-bg)]/90 backdrop-blur-xl";
  const inner = dark
    ? "mx-auto max-w-[calc(100%-2rem)] lg:max-w-[calc(100%-4rem)] rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 px-4 lg:px-6"
    : "mx-auto max-w-7xl px-6";
  const textBase = dark ? "text-white/85" : "text-[color:var(--mkt-heading)]";
  const textHover = dark ? "hover:text-white" : "hover:text-[color:var(--mkt-fg)]";

  return (
    <header className={wrap}>
      <div className={inner}>
        <div className="flex h-14 lg:h-16 items-center gap-6">
          <Link
            to="/"
            className={`mkt-display shrink-0 text-[17px] tracking-tight ${dark ? "text-white" : "text-[color:var(--mkt-fg)]"}`}
          >
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: "var(--mkt-accent)" }}
              />
              Arklight
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className={`px-3 py-1.5 rounded-md ${textBase} ${textHover} transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
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
                className={`h-9 px-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition ${
                  dark
                    ? "bg-[color:var(--mkt-accent)] text-black hover:opacity-90"
                    : "bg-[color:var(--mkt-charcoal)] text-white hover:opacity-90"
                }`}
              >
                Open Arklight <ArrowUpRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/auth"
                  search={{ mode: "signin" }}
                  className={`h-9 px-3 inline-flex items-center rounded-md text-sm ${textBase} ${textHover}`}
                >
                  Sign in
                </Link>
                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className={`h-9 px-4 inline-flex items-center rounded-md text-sm font-medium transition ${
                    dark
                      ? "bg-[color:var(--mkt-accent)] text-black hover:opacity-90"
                      : "bg-[color:var(--mkt-charcoal)] text-white hover:opacity-90"
                  }`}
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
            className={`md:hidden h-9 w-9 grid place-items-center rounded-md border ${
              dark ? "border-white/15 text-white" : "border-[color:var(--mkt-line-strong)] text-[color:var(--mkt-fg)]"
            } focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40`}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
        {open && (
          <div
            id="marketing-mobile-menu"
            className={`md:hidden mt-2 rounded-xl overflow-hidden ${
              dark ? "bg-neutral-900 text-white" : "bg-white text-[color:var(--mkt-fg)] border border-[color:var(--mkt-line)]"
            }`}
          >
            <div className="px-3 py-3 flex flex-col gap-1">
              {NAV.map((n) => (
                <a
                  key={n.href}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className={`px-3 py-2 rounded-md text-sm ${dark ? "text-white/85 hover:bg-white/10" : "text-[color:var(--mkt-heading)] hover:bg-black/5"}`}
                >
                  {n.label}
                </a>
              ))}
              <div className={`h-px my-2 ${dark ? "bg-white/10" : "bg-[color:var(--mkt-line)]"}`} />
              {user ? (
                <Link to="/app" onClick={() => setOpen(false)} className="h-10 inline-flex items-center justify-center rounded-md text-sm font-medium bg-[color:var(--mkt-accent)] text-black">
                  Open Arklight
                </Link>
              ) : (
                <>
                  <Link to="/auth" search={{ mode: "signin" }} onClick={() => setOpen(false)} className={`h-10 inline-flex items-center justify-center rounded-md text-sm ${dark ? "border border-white/15 text-white" : "border border-[color:var(--mkt-line-strong)] text-[color:var(--mkt-fg)]"}`}>
                    Sign in
                  </Link>
                  <Link to="/auth" search={{ mode: "signup" }} onClick={() => setOpen(false)} className="h-10 inline-flex items-center justify-center rounded-md text-sm font-medium bg-[color:var(--mkt-accent)] text-black">
                    Get started
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mt-24 border-t border-[color:var(--mkt-line)] bg-[color:var(--mkt-panel-2)]">
      <div className="mx-auto max-w-7xl px-6 py-16 grid grid-cols-2 md:grid-cols-5 gap-10 text-sm">
        <div className="col-span-2 md:col-span-2">
          <div className="mkt-display text-xl tracking-tight text-[color:var(--mkt-fg)]">
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--mkt-accent)" }} />
              Project Arklight
            </span>
          </div>
          <p className="mt-4 text-[color:var(--mkt-muted)] max-w-[38ch]">
            A public-signals early-warning instrument. Arklight reads the open
            public record and turns early signals into dated, testable scenarios.
          </p>
          <p className="mt-4 text-xs mkt-mono uppercase tracking-widest text-[color:var(--mkt-muted)]">
            Public signals only · Not financial advice
          </p>
        </div>
        <FooterCol
          title="Product"
          links={[
            { label: "How it works", href: "/#how" },
            { label: "Proof", href: "/#proof" },
            { label: "Compare", href: "/#compare" },
            { label: "Pricing", href: "/pricing" },
          ]}
        />
        <FooterCol
          title="Account"
          links={[
            { label: "Create account", href: "/auth?mode=signup" },
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
      <div className="border-t border-[color:var(--mkt-line)]">
        <div className="mx-auto max-w-7xl px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-[11px] mkt-mono uppercase tracking-widest text-[color:var(--mkt-muted)]">
          <span>© {new Date().getFullYear()} Project Arklight</span>
          <span>GBP · No buy · No sell · No target price</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="text-[10px] mkt-mono uppercase tracking-widest text-[color:var(--mkt-muted)]">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="text-[color:var(--mkt-heading)] hover:text-[color:var(--mkt-fg)] hover:underline underline-offset-4">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const overlay = pathname === "/";
  return (
    <div className="mkt min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-black focus:text-white focus:px-3 focus:py-2 focus:rounded"
      >
        Skip to content
      </a>
      <MarketingHeader overlay={overlay} />
      <main id="main-content" className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
