import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { useSession } from "@/lib/useSession";

type NavItem = { label: string; href: string; route?: boolean };

const NAV: NavItem[] = [
  { label: "How it works", href: "/#how" },
  { label: "Proof", href: "/#proof" },
  { label: "Compare", href: "/#compare" },
  { label: "Pricing", href: "/pricing", route: true },
];

function TemplateCta({ children, to, search, dark }: { children: ReactNode; to: string; search?: Record<string, string>; dark: boolean }) {
  if (!dark) {
    return (
      <Link
        to={to as any}
        search={search as any}
        className="h-9 px-4 inline-flex items-center rounded-md text-sm font-medium transition bg-[color:var(--mkt-charcoal)] text-white hover:opacity-90"
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      to={to as any}
      search={search as any}
      className="group relative flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-white/20 bg-black py-2 pr-4 pl-11 text-sm tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
    >
      <span
        data-slot="button-box"
        className="absolute inset-y-0 left-1 z-40 my-auto flex size-8 flex-col items-center justify-center gap-px rounded-[5px] bg-[color:var(--mkt-accent)] transition-all duration-400 ease-out group-hover:left-[calc(100%-2.3rem)] group-hover:rotate-180 group-hover:transform"
        aria-hidden
      >
        <span className="flex flex-col gap-px">
          {[0, 1, 2, 3, 4].map((row) => (
            <span key={row} className="flex gap-px">
              {[0, 1, 2, 3, 4].map((col) => {
                const highlight = row === 2 || (row === 0 && col === 2) || (row === 1 && col === 3) || (row === 3 && col === 3) || (row === 4 && col === 2);
                return <span key={col} className={`inline-block size-0.75 shrink-0 rounded-full ${highlight ? "bg-white" : "bg-white/25"}`} />;
              })}
            </span>
          ))}
        </span>
      </span>
      <span className="absolute -inset-px rounded-lg bg-white/20 transition-[clip-path] duration-400 ease-out [clip-path:inset(0_100%_0_0)] group-hover:[clip-path:inset(0_0%_0_0)]" />
      <span className="relative inline-block text-white transition-transform duration-400 group-hover:-translate-x-8">
        {children}
      </span>
    </Link>
  );
}

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
  if (!dark) {
    const textBase = "text-[color:var(--mkt-heading)]";
    const textHover = "hover:text-[color:var(--mkt-fg)]";

    return (
      <header className="sticky top-0 z-40 border-b border-[color:var(--mkt-line)] bg-[color:var(--mkt-bg)]">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex h-14 lg:h-16 items-center gap-6">
            <Link
              to="/"
              className="mkt-display shrink-0 text-[17px] tracking-tight text-[color:var(--mkt-fg)]"
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
              {NAV.map((n) => {
                const cls = `px-3 py-1.5 rounded-md ${textBase} ${textHover} transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mkt-charcoal)]/40`;
                return n.route ? (
                  <Link key={n.href} to={n.href as any} className={cls}>{n.label}</Link>
                ) : (
                  <a key={n.href} href={n.href} className={cls}>{n.label}</a>
                );
              })}
            </nav>
            <div className="flex-1" />
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <Link
                  to="/app"
                  className="h-9 px-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition bg-[color:var(--mkt-charcoal)] text-white hover:opacity-90"
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
                    className="h-9 px-4 inline-flex items-center rounded-md text-sm font-medium transition bg-[color:var(--mkt-charcoal)] text-white hover:opacity-90"
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
              className="md:hidden h-9 w-9 grid place-items-center rounded-md border border-[color:var(--mkt-line-strong)] text-[color:var(--mkt-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mkt-charcoal)]/40"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
          {open && (
            <div
              id="marketing-mobile-menu"
              className="md:hidden mt-2 rounded-xl overflow-hidden bg-white text-[color:var(--mkt-fg)] border border-[color:var(--mkt-line)]"
            >
              <div className="px-3 py-3 flex flex-col gap-1">
                {NAV.map((n) => {
                  const cls = "px-3 py-2 rounded-md text-sm text-[color:var(--mkt-heading)] hover:bg-black/5";
                  return n.route ? (
                    <Link key={n.href} to={n.href as any} onClick={() => setOpen(false)} className={cls}>{n.label}</Link>
                  ) : (
                    <a key={n.href} href={n.href} onClick={() => setOpen(false)} className={cls}>{n.label}</a>
                  );
                })}
                <div className="h-px my-2 bg-[color:var(--mkt-line)]" />
                {user ? (
                  <Link to="/app" onClick={() => setOpen(false)} className="h-10 inline-flex items-center justify-center rounded-md text-sm font-medium bg-[color:var(--mkt-accent)] text-black">
                    Open Arklight
                  </Link>
                ) : (
                  <>
                    <Link to="/auth" search={{ mode: "signin" }} onClick={() => setOpen(false)} className="h-10 inline-flex items-center justify-center rounded-md text-sm border border-[color:var(--mkt-line-strong)] text-[color:var(--mkt-fg)]">
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

  const wrap = dark
    ? "absolute inset-x-0 top-4 z-50 mx-auto w-full lg:top-4 lg:max-w-[calc(100%-4rem)]"
    : "sticky top-0 z-40 border-b border-[color:var(--mkt-line)] bg-[color:var(--mkt-bg)]/90 backdrop-blur-xl";
  const inner = dark
    ? "mx-auto max-w-[1440px] px-8 lg:px-8"
    : "mx-auto max-w-7xl px-6";
  const textBase = dark ? "text-white/85" : "text-[color:var(--mkt-heading)]";
  const textHover = dark ? "hover:text-white" : "hover:text-[color:var(--mkt-fg)]";
  const desktopNav = user ? NAV : [...NAV, { label: "Sign in", href: "/auth", route: true }];

  return (
    <header className={wrap}>
      <div className={inner}>
        <div className="flex h-16 items-center justify-between gap-6">
          <Link
            to="/"
            className={`mkt-display flex shrink-0 items-center gap-2 text-[17px] tracking-tight lg:min-w-45 ${dark ? "text-white" : "text-[color:var(--mkt-fg)]"}`}
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
          <nav className="hidden md:block">
            <div className="flex items-baseline space-x-8">
              {desktopNav.map((n) => {
                const cls = `px-3 py-2 text-sm font-medium transition-colors duration-200 ${textBase} ${textHover} focus:outline-none focus-visible:ring-2 ${dark ? "focus-visible:ring-white/40" : "focus-visible:ring-[color:var(--mkt-charcoal)]/40"}`;
                return n.label === "Sign in" ? (
                  <Link key={n.label} to="/auth" search={{ mode: "signin" }} className={cls}>{n.label}</Link>
                ) : n.route ? (
                  <Link key={n.href} to={n.href as any} className={cls}>{n.label}</Link>
                ) : (
                  <a key={n.href} href={n.href} className={cls}>{n.label}</a>
                );
              })}
            </div>
          </nav>
          <div className="hidden md:block">
            {user ? (
              <TemplateCta to="/app" dark={dark}>Open Arklight</TemplateCta>
            ) : (
              <TemplateCta to="/auth" search={{ mode: "signup" }} dark={dark}>Start free</TemplateCta>
            )}
          </div>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="marketing-mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className={`md:hidden p-2 ${dark ? "text-white/80 hover:text-white" : "text-[color:var(--mkt-fg)] hover:text-[color:var(--mkt-heading)]"} focus:outline-none focus-visible:ring-2 ${dark ? "focus-visible:ring-white/40" : "focus-visible:ring-[color:var(--mkt-charcoal)]/40"}`}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        <div
          id="marketing-mobile-menu"
          className={`overflow-hidden rounded-xl bg-neutral-900 transition-all duration-300 ease-in-out md:hidden ${open ? "max-h-80 opacity-100" : "max-h-0 opacity-0"}`}
        >
          <div className="gap-1 px-2 pt-2 pb-3">
            {NAV.map((n) => {
              const cls = "block px-3 py-2 text-base font-medium text-white/80 transition-colors duration-200 hover:text-white";
              return n.route ? (
                <Link key={n.href} to={n.href as any} onClick={() => setOpen(false)} className={cls}>{n.label}</Link>
              ) : (
                <a key={n.href} href={n.href} onClick={() => setOpen(false)} className={cls}>{n.label}</a>
              );
            })}
            <div className="px-2 pt-4">
            {user ? (
              <Link to="/app" onClick={() => setOpen(false)} className="h-10 inline-flex w-full items-center justify-center rounded-md text-sm font-medium bg-[color:var(--mkt-accent)] text-black">
                Open Arklight
              </Link>
            ) : (
              <div className="flex flex-col gap-2">
                <Link to="/auth" search={{ mode: "signin" }} onClick={() => setOpen(false)} className="h-10 inline-flex items-center justify-center rounded-md border border-white/15 text-sm text-white">
                  Sign in
                </Link>
                <Link to="/auth" search={{ mode: "signup" }} onClick={() => setOpen(false)} className="h-10 inline-flex items-center justify-center rounded-md text-sm font-medium bg-[color:var(--mkt-accent)] text-black">
                  Start free
                </Link>
              </div>
            )}
            </div>
          </div>
        </div>
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
            { label: "Pricing", to: "/pricing" },
          ]}
        />
        <FooterCol
          title="Account"
          links={[
            { label: "Create account", to: "/auth", search: { mode: "signup" } },
            { label: "Sign in", to: "/auth", search: { mode: "signin" } },
            { label: "Open Arklight", to: "/app" },
          ]}
        />
        <FooterCol
          title="Legal"
          links={[
            { label: "Terms", to: "/terms" },
            { label: "Privacy", to: "/privacy" },
            { label: "Cookies", to: "/cookies" },
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

type FooterLink =
  | { label: string; href: string }
  | { label: string; to: string; search?: Record<string, string> };

function FooterCol({ title, links }: { title: string; links: FooterLink[] }) {
  const cls = "text-[color:var(--mkt-heading)] hover:text-[color:var(--mkt-fg)] hover:underline underline-offset-4";
  return (
    <div>
      <div className="text-[10px] mkt-mono uppercase tracking-widest text-[color:var(--mkt-muted)]">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            {"to" in l ? (
              <Link to={l.to as any} search={l.search as any} className={cls}>{l.label}</Link>
            ) : (
              <a href={l.href} className={cls}>{l.label}</a>
            )}
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
