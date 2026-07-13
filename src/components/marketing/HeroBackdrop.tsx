import { useEffect, useState } from "react";

/**
 * Port of the purchased template's hero animation layers:
 * gradient grid (top mask) + concentric globe rings + twinkling stars +
 * warm "light above" glow. Uses CSS animations (no motion dep).
 */

const stars = [
  { cx: 1, cy: 12, r: 1 }, { cx: 122, cy: 113, r: 1 }, { cx: 108, cy: 57, r: 1 },
  { cx: 510, cy: 96, r: 1 }, { cx: 700, cy: 93, r: 1 }, { cx: 625, cy: 126, r: 1 },
  { cx: 821, cy: 32, r: 1 }, { cx: 203.5, cy: 157.5, r: 0.5 }, { cx: 167.5, cy: 94.5, r: 0.5 },
  { cx: 76.5, cy: 81.5, r: 0.5 }, { cx: 157.5, cy: 8.5, r: 0.5 }, { cx: 240.5, cy: 80.5, r: 0.5 },
  { cx: 256.5, cy: 64.5, r: 0.5 }, { cx: 273.5, cy: 84.5, r: 0.5 }, { cx: 285.5, cy: 57.5, r: 0.5 },
  { cx: 227.5, cy: 114.5, r: 0.5 }, { cx: 202.5, cy: 55.5, r: 0.5 }, { cx: 156.5, cy: 65.5, r: 0.5 },
  { cx: 330.5, cy: 88.5, r: 0.5 }, { cx: 363.5, cy: 102.5, r: 0.5 }, { cx: 476.5, cy: 80.5, r: 0.5 },
  { cx: 438.5, cy: 107.5, r: 0.5 }, { cx: 422.5, cy: 77.5, r: 0.5 }, { cx: 455.5, cy: 56.5, r: 0.5 },
  { cx: 488.5, cy: 35.5, r: 0.5 }, { cx: 313.5, cy: 66.5, r: 0.5 }, { cx: 231.5, cy: 0.5, r: 0.5 },
  { cx: 270.5, cy: 108.5, r: 0.5 }, { cx: 573, cy: 103, r: 0.5 }, { cx: 501.5, cy: 150.5, r: 0.5 },
  { cx: 456.5, cy: 156.5, r: 0.5 }, { cx: 659.5, cy: 77.5, r: 0.5 }, { cx: 746, cy: 52, r: 0.5 },
  { cx: 591.5, cy: 1.5, r: 0.5 }, { cx: 389, cy: 123, r: 1 }, { cx: 40, cy: 72, r: 1 },
];

// Deterministic pseudo-random so SSR and client agree.
function seeded(seed: number) {
  const x = Math.sin(seed * 99.7) * 10000;
  return x - Math.floor(x);
}

function GlobeLight() {
  return (
    <svg
      width="1951"
      height="1806"
      viewBox="0 0 1951 1806"
      fill="none"
      overflow="visible"
      xmlns="http://www.w3.org/2000/svg"
      style={{ animation: "mkt-fade-in 0.8s ease-out 0.3s both" }}
    >
      <path
        d="M975.5 255C1402.88 255 1749 569.029 1749 956C1749 1342.97 1402.88 1657 975.5 1657C548.119 1657 202 1342.97 202 956C202 569.029 548.119 255 975.5 255Z"
        stroke="url(#mkt_g0)" strokeWidth="4"
      />
      <path opacity="0.4"
        d="M975.5 253.5C1403.57 253.5 1750.5 568.065 1750.5 956C1750.5 1343.93 1403.57 1658.5 975.5 1658.5C547.432 1658.5 200.5 1343.93 200.5 956C200.5 568.065 547.432 253.5 975.5 253.5Z"
        stroke="url(#mkt_g1)" />
      <g style={{ filter: "blur(12px)", mixBlendMode: "plus-lighter" }}>
        <path d="M975.5 255C1402.88 255 1749 569.029 1749 956C1749 1342.97 1402.88 1657 975.5 1657C548.119 1657 202 1342.97 202 956C202 569.029 548.119 255 975.5 255Z"
          stroke="url(#mkt_g2)" strokeWidth="4" />
      </g>
      {[30, 30, 40, 50].map((b, i) => (
        <g key={i} opacity="0.4" style={{ filter: `blur(${b}px)`, mixBlendMode: "plus-lighter" }}>
          <path d="M975.5 255C1398.3 255 1739 565.452 1739 946C1739 1326.55 1398.3 1637 975.5 1637C552.695 1637 212 1326.55 212 946C212 565.452 552.695 255 975.5 255Z"
            stroke={`url(#mkt_g${3 + i})`} strokeWidth="24" />
        </g>
      ))}
      <g opacity="0.4" style={{ filter: "blur(50px)", mixBlendMode: "plus-lighter" }}>
        <path d="M975.5 212C1398.3 212 1739 522.452 1739 903C1739 1283.55 1398.3 1594 975.5 1594C552.695 1594 212 1283.55 212 903C212 522.452 552.695 212 975.5 212Z"
          stroke="url(#mkt_g7)" strokeWidth="24" />
      </g>
      <g opacity="0.4" style={{ filter: "blur(100px)", mixBlendMode: "plus-lighter" }}>
        <path d="M975.5 212C1398.3 212 1739 522.452 1739 903C1739 1283.55 1398.3 1594 975.5 1594C552.695 1594 212 1283.55 212 903C212 522.452 552.695 212 975.5 212Z"
          stroke="url(#mkt_g8)" strokeWidth="24" />
      </g>
      <defs>
        {[
          ["mkt_g0", 108.5, 313.5, "#FA9A63"],
          ["mkt_g1", 108.5, 582, "#FA9A63"],
          ["mkt_g2", 253, 392, "#FA9A63"],
          ["mkt_g3", 243, 468.5, "#FA9A63"],
          ["mkt_g4", 243, 328.5, "#FA9A63"],
          ["mkt_g5", 243, 334, "#CDA63C"],
          ["mkt_g6", 243, 361, "#CDA63C"],
          ["mkt_g7", 200, 336.5, "#CDA63C"],
        ].map(([id, y1, y2, color]) => (
          <linearGradient key={id as string} id={id as string} x1="976" y1={y1 as number} x2="976" y2={y2 as number} gradientUnits="userSpaceOnUse">
            <stop stopColor={color as string} />
            <stop offset="1" stopColor={color as string} stopOpacity="0" />
          </linearGradient>
        ))}
        <linearGradient id="mkt_g8" x1="975.5" y1="200" x2="976" y2="780.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Stars() {
  return (
    <svg
      width="822" height="158" viewBox="0 0 822 158" fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ animation: "mkt-fade-in 1.5s ease-in-out both" }}
    >
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.cx} cy={s.cy} r={s.r}
          fill="white"
          style={{
            animation: `mkt-twinkle ${(2 + seeded(i) * 3).toFixed(3)}s ease-in-out ${(1.2 + seeded(i + 100) * 2.5).toFixed(3)}s infinite`,
          }}
        />
      ))}
    </svg>
  );
}

function LightAbove() {
  return (
    <svg width="1424" height="651" viewBox="0 0 1424 651" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g filter="url(#mkt_lf0)" style={{ mixBlendMode: "plus-lighter" }}>
        <path d="M611.5 51L495 -188H959L849.5 51H611.5Z" fill="#FA9A63" fillOpacity="0.1" />
      </g>
      <g filter="url(#mkt_lf1)" style={{ mixBlendMode: "plus-lighter" }}>
        <path d="M611.5 219L495 -188H959L849.5 219H611.5Z" fill="#FFD99F" />
      </g>
      <g filter="url(#mkt_lf2)" style={{ mixBlendMode: "plus-lighter" }}>
        <path d="M656.49 43L568 -219H829L768.219 43H656.49Z" fill="#F6B253" fillOpacity="0.8" />
      </g>
      <defs>
        <filter id="mkt_lf0" x="-105" y="-788" width="1664" height="1439" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="300" />
        </filter>
        <filter id="mkt_lf1" x="95" y="-588" width="1264" height="1207" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="200" />
        </filter>
        <filter id="mkt_lf2" x="408" y="-379" width="581" height="582" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="80" />
        </filter>
      </defs>
    </svg>
  );
}

function GradientGrid() {
  const cellSize = 70;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [filled, setFilled] = useState<Set<number>>(new Set());

  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: Math.max(window.innerHeight, 700) });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const cols = Math.max(1, Math.ceil(size.width / cellSize));
  const rows = Math.max(1, Math.ceil((size.height / 2) / cellSize));

  useEffect(() => {
    const total = rows * cols;
    if (!total) return;
    const set = new Set<number>();
    while (set.size < Math.min(6, total)) set.add(Math.floor(Math.random() * total));
    setFilled(set);
  }, [rows, cols]);

  if (!size.width) return null;
  return (
    <svg width="100%" height="100%">
      <defs>
        <linearGradient id="mkt_goldGrid" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--mkt-accent)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--mkt-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: rows * cols }).map((_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        return (
          <rect
            key={i}
            x={col * cellSize} y={row * cellSize}
            width={cellSize} height={cellSize}
            fill={filled.has(i) ? "url(#mkt_goldGrid)" : "transparent"}
            stroke="rgba(255,255,255,0.08)"
          />
        );
      })}
    </svg>
  );
}

export function HeroBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* Gradient grid (top half, masked) */}
      <div
        className="absolute inset-x-0 top-0 h-1/2 opacity-20"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 50%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 50%, transparent 100%)",
          animation: "mkt-fade-in 0.8s ease-in-out 0.2s both",
        }}
      >
        <GradientGrid />
      </div>

      {/* Globe rings, huge, anchored below the fold */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-[300px] w-fit"
        style={{ animation: "mkt-fade-in 0.8s ease-in-out 0.45s both" }}>
        <GlobeLight />
      </div>

      {/* Stars, sitting just above the globe crest */}
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-10 w-fit z-[1]">
        <Stars />
      </div>

      {/* Warm light shaft */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-fit opacity-40"
        style={{ animation: "mkt-fade-in 0.8s ease-in-out 0.7s both" }}>
        <LightAbove />
      </div>
    </div>
  );
}
