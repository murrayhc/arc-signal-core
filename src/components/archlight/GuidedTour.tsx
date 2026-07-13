import { useEffect, useLayoutEffect, useState, useCallback, useRef } from "react";

type Step = {
  selector: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  { selector: '[data-tour-to="/"]', title: "Overview", body: "Your daily start: what's changed on the things you watch since you were last here, with a clear next step for each." },
  { selector: '[data-tour-to="/exposures"]', title: "My book", body: "Tell Archlight what you hold or care about — companies, suppliers, sectors, commodities, keywords. Every event is scored against this." },
  { selector: '[data-tour-to="/watchlist"]', title: "Watchlist & alerts", body: "Save filters for topics you want to follow and get alerted the moment a new event matches." },
  { selector: '[data-tour-to="/briefings"]', title: "Briefings", body: "A daily summary of what moved on your book, delivered on a schedule." },
  { selector: '[data-tour-to="/digest"]', title: "Digest", body: "A 7-day rollup of the biggest risks, openings and scenarios across everything Archlight watches." },
  { selector: '[data-tour-to="/interrogate"]', title: "Research", body: "Ask Archlight to investigate any company, sector, commodity or theme and get a cited deep-research brief." },
  { selector: '[data-tour-to="/interrogations"]', title: "Research history", body: "Every research brief you've run, saved so you can reopen it." },
  { selector: '[data-tour-to="/ask-graph"]', title: "Graph lookup", body: "Ask plain-English questions about how entities connect — who's exposed, who controls whom — answered only from verified data." },
  { selector: '[data-tour-to="/companies"]', title: "Companies", body: "Every company Archlight has traced, with its risk, exposure and connections." },
  { selector: '[data-tour-to="/arcs"]', title: "Evidence", body: "Follow any signal back through its full chain: source → claim → event → who it affects." },
  { selector: '[data-tour-to="/opportunities"]', title: "Opportunities", body: "Strategic openings surfaced from the signals, with the reasoning and evidence behind each. Never financial advice." },
  { selector: '[data-tour-to="/track-record"]', title: "Track record", body: "The receipts: how often Archlight's calls have been right, and how early — calibrated, not opinion." },
  { selector: '[data-tour-id="engine"]', title: "Engine", body: "Operator tools: run scans, tune sources and settings, review flagged calls. Most readers never need these." },
];

const DONE_KEY = "archlight:tour-done";
export const TOUR_EVENT = "archlight:start-tour";

export function GuidedTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [reduced, setReduced] = useState(false);
  const [entering, setEntering] = useState(true);
  const prevStep = useRef(0);

  const start = useCallback(() => {
    setStep(0);
    setEntering(true);
    setActive(true);
  }, []);

  const end = useCallback(() => {
    setActive(false);
    try { localStorage.setItem(DONE_KEY, "1"); } catch {}
  }, []);

  const goToStep = useCallback((next: number) => {
    if (next === step) return;
    prevStep.current = step;
    setStep(next);
    setEntering(true);
  }, [step]);

  // Auto-start on first visit (desktop only)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const done = (() => { try { return localStorage.getItem(DONE_KEY) === "1"; } catch { return true; } })();
    const isDesktop = window.innerWidth >= 768;
    if (!done && isDesktop) {
      const t = window.setTimeout(() => start(), 600);
      return () => window.clearTimeout(t);
    }
  }, [start]);

  // Listen for external start requests
  useEffect(() => {
    const onStart = () => start();
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, [start]);

  // Entrance animation reset
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setEntering(false), reduced ? 0 : 200);
    return () => window.clearTimeout(t);
  }, [active, step, reduced]);

  // Track target rect
  useLayoutEffect(() => {
    if (!active) { setRect(null); return; }
    const s = STEPS[step];
    const measure = () => {
      const el = document.querySelector(s.selector) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
      setRect(el.getBoundingClientRect());
    };
    measure();
    const t = window.setTimeout(measure, reduced ? 0 : 250);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step, reduced]);

  if (!active) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;


  const highlightStyle: React.CSSProperties | undefined = rect
    ? {
        position: "fixed",
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
        border: "2px solid var(--color-signal)",
        borderRadius: 8,
        boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
        pointerEvents: "none",
        zIndex: 99,
        transition: reduced ? "none" : "top .2s ease, left .2s ease, width .2s ease, height .2s ease",
      }
    : undefined;

  const tooltipStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top: Math.max(12, Math.min(window.innerHeight - 200, rect.top - 8)),
        left: Math.min(window.innerWidth - 340, rect.right + 12),
        width: 320,
        zIndex: 100,
        transition: reduced ? "none" : "top 220ms ease-out, left 220ms ease-out, opacity 180ms ease-out, transform 180ms ease-out",
        opacity: entering ? 0 : 1,
        transform: entering ? "translateY(6px) scale(0.98)" : "translateY(0) scale(1)",
      }
    : {
        position: "fixed",
        top: 80,
        left: 240,
        width: 320,
        zIndex: 100,
        transition: reduced ? "none" : "opacity 180ms ease-out, transform 180ms ease-out",
        opacity: entering ? 0 : 1,
        transform: entering ? "translateY(6px) scale(0.98)" : "translateY(0) scale(1)",
      };

  const arrowStyle: React.CSSProperties = {
    position: "absolute",
    top: 18,
    left: -6,
    width: 12,
    height: 12,
    background: "var(--primary)",
    transform: "rotate(45deg)",
    borderRadius: 2,
  };

  return (
    <>
      {highlightStyle && <div style={highlightStyle} aria-hidden="true" />}
      <div
        style={tooltipStyle}
        className="rounded-lg p-4 shadow-lg bg-[var(--primary)] text-white"
        role="dialog"
        aria-label={`Tour step ${step + 1}: ${s.title}`}
      >
        <div style={arrowStyle} aria-hidden="true" />
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/80">{step + 1} / {STEPS.length}</span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/90">Guide</span>
        </div>
        <div className="font-display text-sm mb-1 text-white">{s.title}</div>
        <p className="text-xs leading-relaxed mb-3 text-white/85">{s.body}</p>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={end}
            className="h-8 px-3 rounded-md text-xs border border-white/40 text-white hover:bg-white/10 transition"
          >
            Skip
          </button>
          <button
            onClick={() => (isLast ? end() : goToStep(step + 1))}
            className="h-8 px-3 rounded-md text-xs bg-white text-[var(--primary)] hover:bg-white/90 transition shadow-sm"
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}

export function startGuidedTour() {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT));
}
