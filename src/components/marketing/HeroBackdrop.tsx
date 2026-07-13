import { useEffect, useState } from "react";

const stars = [
  { cx: 1, cy: 12, r: 1 },
  { cx: 122, cy: 113, r: 1 },
  { cx: 108, cy: 57, r: 1 },
  { cx: 510, cy: 96, r: 1 },
  { cx: 700, cy: 93, r: 1 },
  { cx: 625, cy: 126, r: 1 },
  { cx: 821, cy: 32, r: 1 },
  { cx: 203.5, cy: 157.5, r: 0.5 },
  { cx: 167.5, cy: 94.5, r: 0.5 },
  { cx: 76.5, cy: 81.5, r: 0.5 },
  { cx: 157.5, cy: 8.5, r: 0.5 },
  { cx: 240.5, cy: 80.5, r: 0.5 },
  { cx: 256.5, cy: 64.5, r: 0.5 },
  { cx: 273.5, cy: 84.5, r: 0.5 },
  { cx: 285.5, cy: 57.5, r: 0.5 },
  { cx: 227.5, cy: 114.5, r: 0.5 },
  { cx: 202.5, cy: 55.5, r: 0.5 },
  { cx: 156.5, cy: 65.5, r: 0.5 },
  { cx: 330.5, cy: 88.5, r: 0.5 },
  { cx: 363.5, cy: 102.5, r: 0.5 },
  { cx: 476.5, cy: 80.5, r: 0.5 },
  { cx: 438.5, cy: 107.5, r: 0.5 },
  { cx: 422.5, cy: 77.5, r: 0.5 },
  { cx: 455.5, cy: 56.5, r: 0.5 },
  { cx: 488.5, cy: 35.5, r: 0.5 },
  { cx: 313.5, cy: 66.5, r: 0.5 },
  { cx: 231.5, cy: 0.5, r: 0.5 },
  { cx: 270.5, cy: 108.5, r: 0.5 },
  { cx: 573, cy: 103, r: 0.5 },
  { cx: 501.5, cy: 150.5, r: 0.5 },
  { cx: 456.5, cy: 156.5, r: 0.5 },
  { cx: 659.5, cy: 77.5, r: 0.5 },
  { cx: 746, cy: 52, r: 0.5 },
  { cx: 591.5, cy: 1.5, r: 0.5 },
  { cx: 389, cy: 123, r: 1 },
  { cx: 40, cy: 72, r: 1 },
];

const seeded = (seed: number) => {
  const x = Math.sin(seed * 99.7) * 10000;
  return x - Math.floor(x);
};

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
        stroke="url(#paint0_linear_2693_2731)"
        strokeWidth="4"
      />
      <path
        opacity="0.4"
        d="M975.5 253.5C1403.57 253.5 1750.5 568.065 1750.5 956C1750.5 1343.93 1403.57 1658.5 975.5 1658.5C547.432 1658.5 200.5 1343.93 200.5 956C200.5 568.065 547.432 253.5 975.5 253.5Z"
        stroke="url(#paint1_linear_2693_2731)"
      />
      <g style={{ filter: "blur(12px)", mixBlendMode: "plus-lighter" }}>
        <path
          d="M975.5 255C1402.88 255 1749 569.029 1749 956C1749 1342.97 1402.88 1657 975.5 1657C548.119 1657 202 1342.97 202 956C202 569.029 548.119 255 975.5 255Z"
          stroke="url(#paint2_linear_2693_2731)"
          strokeWidth="4"
        />
      </g>
      <g opacity="0.4" style={{ filter: "blur(30px)", mixBlendMode: "plus-lighter" }}>
        <path
          d="M975.5 255C1398.3 255 1739 565.452 1739 946C1739 1326.55 1398.3 1637 975.5 1637C552.695 1637 212 1326.55 212 946C212 565.452 552.695 255 975.5 255Z"
          stroke="url(#paint3_linear_2693_2731)"
          strokeWidth="24"
        />
      </g>
      <g opacity="0.4" style={{ filter: "blur(30px)", mixBlendMode: "plus-lighter" }}>
        <path
          d="M975.5 255C1398.3 255 1739 565.452 1739 946C1739 1326.55 1398.3 1637 975.5 1637C552.695 1637 212 1326.55 212 946C212 565.452 552.695 255 975.5 255Z"
          stroke="url(#paint4_linear_2693_2731)"
          strokeWidth="24"
        />
      </g>
      <g opacity="0.4" style={{ filter: "blur(40px)", mixBlendMode: "plus-lighter" }}>
        <path
          d="M975.5 255C1398.3 255 1739 565.452 1739 946C1739 1326.55 1398.3 1637 975.5 1637C552.695 1637 212 1326.55 212 946C212 565.452 552.695 255 975.5 255Z"
          stroke="url(#paint5_linear_2693_2731)"
          strokeWidth="24"
        />
      </g>
      <g opacity="0.4" style={{ filter: "blur(50px)", mixBlendMode: "plus-lighter" }}>
        <path
          d="M975.5 255C1398.3 255 1739 565.452 1739 946C1739 1326.55 1398.3 1637 975.5 1637C552.695 1637 212 1326.55 212 946C212 565.452 552.695 255 975.5 255Z"
          stroke="url(#paint6_linear_2693_2731)"
          strokeWidth="24"
        />
      </g>
      <g opacity="0.4" style={{ filter: "blur(50px)", mixBlendMode: "plus-lighter" }}>
        <path
          d="M975.5 212C1398.3 212 1739 522.452 1739 903C1739 1283.55 1398.3 1594 975.5 1594C552.695 1594 212 1283.55 212 903C212 522.452 552.695 212 975.5 212Z"
          stroke="url(#paint7_linear_2693_2731)"
          strokeWidth="24"
        />
      </g>
      <g opacity="0.4" style={{ filter: "blur(100px)", mixBlendMode: "plus-lighter" }}>
        <path
          d="M975.5 212C1398.3 212 1739 522.452 1739 903C1739 1283.55 1398.3 1594 975.5 1594C552.695 1594 212 1283.55 212 903C212 522.452 552.695 212 975.5 212Z"
          stroke="url(#paint8_linear_2693_2731)"
          strokeWidth="24"
        />
      </g>
      <defs>
        <linearGradient id="paint0_linear_2693_2731" x1="976" y1="108.5" x2="976" y2="313.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FA9A63" />
          <stop offset="1" stopColor="#FA9A63" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="paint1_linear_2693_2731" x1="976" y1="108.5" x2="976" y2="582" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FA9A63" />
          <stop offset="1" stopColor="#FA9A63" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="paint2_linear_2693_2731" x1="975.5" y1="253" x2="976" y2="392" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FA9A63" />
          <stop offset="1" stopColor="#FA9A63" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="paint3_linear_2693_2731" x1="975.5" y1="243" x2="976" y2="468.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FA9A63" />
          <stop offset="1" stopColor="#FA9A63" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="paint4_linear_2693_2731" x1="975.5" y1="243" x2="976" y2="328.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FA9A63" />
          <stop offset="1" stopColor="#FA9A63" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="paint5_linear_2693_2731" x1="975.5" y1="243" x2="976" y2="334" gradientUnits="userSpaceOnUse">
          <stop stopColor="#CDA63C" />
          <stop offset="1" stopColor="#CDA63C" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="paint6_linear_2693_2731" x1="975.5" y1="243" x2="976" y2="361" gradientUnits="userSpaceOnUse">
          <stop stopColor="#CDA63C" />
          <stop offset="1" stopColor="#CDA63C" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="paint7_linear_2693_2731" x1="975.5" y1="200" x2="976" y2="336.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#CDA63C" />
          <stop offset="1" stopColor="#CDA63C" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="paint8_linear_2693_2731" x1="975.5" y1="200" x2="976" y2="780.5" gradientUnits="userSpaceOnUse">
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
      width="822"
      height="158"
      viewBox="0 0 822 158"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ animation: "mkt-fade-in 1.5s ease-in-out both" }}
    >
      {stars.map((star, i) => (
        <circle
          key={i}
          cx={star.cx}
          cy={star.cy}
          r={star.r}
          fill="white"
          className="mkt-star"
          style={{
            "--mkt-star-duration": `${2 + seeded(i) * 3}s`,
            "--mkt-star-delay": `${1.2 + seeded(i + 100) * 2.5}s`,
          } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}

function LightAbove() {
  return (
    <svg width="1424" height="651" viewBox="0 0 1424 651" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g filter="url(#filter0_f_2693_2600)" style={{ mixBlendMode: "plus-lighter" }}>
        <path d="M611.5 51L495 -188H959L849.5 51H611.5Z" fill="#FA9A63" fillOpacity="0.1" />
      </g>
      <g filter="url(#filter1_f_2693_2600)" style={{ mixBlendMode: "plus-lighter" }}>
        <path d="M611.5 219L495 -188H959L849.5 219H611.5Z" fill="#FFD99F" />
      </g>
      <g filter="url(#filter2_f_2693_2600)" style={{ mixBlendMode: "plus-lighter" }}>
        <path d="M656.49 43L568 -219H829L768.219 43H656.49Z" fill="#F6B253" fillOpacity="0.8" />
      </g>
      <defs>
        <filter id="filter0_f_2693_2600" x="-105" y="-788" width="1664" height="1439" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="300" result="effect1_foregroundBlur_2693_2600" />
        </filter>
        <filter id="filter1_f_2693_2600" x="95" y="-588" width="1264" height="1207" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="200" result="effect1_foregroundBlur_2693_2600" />
        </filter>
        <filter id="filter2_f_2693_2600" x="408" y="-379" width="581" height="582" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="80" result="effect1_foregroundBlur_2693_2600" />
        </filter>
      </defs>
    </svg>
  );
}

function GradientGrid({ className }: { className?: string }) {
  const cellSize = 70;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [filledCells, setFilledCells] = useState<Set<number>>(new Set());

  useEffect(() => {
    const update = () => {
      setSize({ width: window.innerWidth, height: window.innerHeight });
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const cols = Math.ceil(size.width / cellSize);
  const rows = Math.ceil(size.height / cellSize);

  useEffect(() => {
    const set = new Set<number>();
    const total = rows * cols;

    while (set.size < Math.min(6, total)) {
      set.add(Math.floor(Math.random() * total));
    }

    setFilledCells(set);
  }, [rows, cols]);

  return (
    <svg width="100%" height="100%" className={className}>
      <defs>
        <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
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
            x={col * cellSize}
            y={row * cellSize}
            width={cellSize}
            height={cellSize}
            fill={filledCells.has(i) ? "url(#goldGradient)" : "transparent"}
            stroke="rgba(255,255,255,0.08)"
          />
        );
      })}
    </svg>
  );
}

export function HeroBackdrop() {
  return (
    <div className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
      <div
        className="h-1/2 w-full opacity-20"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 50%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 50%, transparent 100%)",
          animation: "mkt-fade-in 0.8s ease-in-out 0.2s both",
        }}
      >
        <GradientGrid />
      </div>
      <div
        className="absolute -bottom-[18.75rem] left-1/2 flex h-full w-full -translate-x-1/2 justify-center"
        style={{ animation: "mkt-fade-in 0.8s ease-in-out 0.45s both" }}
      >
        <div className="w-fit">
          <GlobeLight />
        </div>
      </div>
      <div className="absolute -bottom-10 left-1/2 z-0 flex h-full w-full -translate-x-1/2 justify-center">
        <div className="w-fit">
          <Stars />
        </div>
      </div>
      <div
        className="absolute bottom-0 left-1/2 z-[5] flex h-full w-full -translate-x-1/2 justify-center opacity-40"
        style={{ animation: "mkt-fade-in 0.8s ease-in-out 0.7s both" }}
      >
        <div className="w-fit">
          <LightAbove />
        </div>
      </div>
    </div>
  );
}