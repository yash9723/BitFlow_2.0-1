"use client";

import AsciiChips from "@/components/AsciiChips";

/* ── Background decoration data — same shapes used on the landing hero ── */
const TRACES = [
  { d: "M170,180 L170,20" }, { d: "M210,180 L210,20" }, { d: "M250,180 L250,20" },
  { d: "M170,320 L170,480" }, { d: "M210,320 L210,480" }, { d: "M250,320 L250,480" },
  { d: "M140,210 L20,210" }, { d: "M140,250 L20,250" }, { d: "M140,290 L20,290" },
  { d: "M280,210 L400,210" }, { d: "M280,250 L400,250" }, { d: "M280,290 L400,290" },
];
const PADS = [
  { cx: 170, cy: 20 }, { cx: 210, cy: 20 }, { cx: 250, cy: 20 },
  { cx: 170, cy: 480 }, { cx: 210, cy: 480 }, { cx: 250, cy: 480 },
  { cx: 20, cy: 210 }, { cx: 20, cy: 250 }, { cx: 20, cy: 290 },
  { cx: 400, cy: 210 }, { cx: 400, cy: 250 }, { cx: 400, cy: 290 },
];
const DIE_CELLS = [
  { x: 151.4, y: 216.2, delay: "0s" },
  { x: 176.2, y: 265.8, delay: ".3s" },
  { x: 201, y: 191.4, delay: ".6s" },
  { x: 201, y: 290.6, delay: ".9s" },
  { x: 225.8, y: 241, delay: "1.2s" },
  { x: 250.6, y: 216.2, delay: "1.5s" },
  { x: 176.2, y: 216.2, delay: "1.8s" },
  { x: 225.8, y: 290.6, delay: "2.1s" },
];
const GR_RINGS = [
  { x: 180, y: 220, s: 60 },
  { x: 162.7, y: 202.7, s: 94.6 },
  { x: 134.9, y: 174.9, s: 150.2 },
  { x: 88.5, y: 128.5, s: 243 },
  { x: 10.8, y: 50.8, s: 398.4 },
];

/* ── Full-page background: rings + radiating chip, scaled to cover the whole viewport ── */
function PageBackground() {
  return (
    <svg
      className="bf-bg absolute inset-0 w-full h-full opacity-70"
      viewBox="0 0 420 500"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <style>{`@media (prefers-reduced-motion: reduce) { .bf-bg * { animation: none !important; } }`}</style>
      <g>
        {GR_RINGS.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.s}
            height={r.s}
            fill="none"
            stroke="rgba(0,232,122,.13)"
            strokeWidth={1}
            className="animate-pulse_glow"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </g>

      {TRACES.map((t, i) => (
        <g key={i}>
          <path d={t.d} fill="none" stroke="rgba(0,232,122,.16)" strokeWidth={1.2} />
          <path
            d={t.d}
            pathLength={100}
            fill="none"
            stroke="#00ff88"
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="16 84"
            className="animate-trace_flow"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        </g>
      ))}

      {PADS.map((p, i) => (
        <g key={i}>
          <circle cx={p.cx} cy={p.cy} r={4} fill="#0d0e11" stroke="#00e87a" strokeWidth={1.2} opacity={0.7} />
          <circle
            cx={p.cx}
            cy={p.cy}
            r={1.6}
            fill="#00e87a"
            className="animate-pulse_glow"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        </g>
      ))}

      <rect x={140} y={180} width={140} height={140} rx={8} fill="#0d0e11" stroke="rgba(0,232,122,.35)" strokeWidth={1.2} />
      <g stroke="rgba(0,232,122,.12)" strokeWidth={1}>
        <line x1={172.8} y1={188} x2={172.8} y2={312} />
        <line x1={197.6} y1={188} x2={197.6} y2={312} />
        <line x1={222.4} y1={188} x2={222.4} y2={312} />
        <line x1={247.2} y1={188} x2={247.2} y2={312} />
        <line x1={148} y1={212.8} x2={272} y2={212.8} />
        <line x1={148} y1={237.6} x2={272} y2={237.6} />
        <line x1={148} y1={262.4} x2={272} y2={262.4} />
        <line x1={148} y1={287.2} x2={272} y2={287.2} />
      </g>
      {DIE_CELLS.map((c, i) => (
        <rect
          key={i}
          x={c.x}
          y={c.y}
          width={18}
          height={18}
          rx={2}
          fill="#00e87a"
          className="animate-cell_pulse"
          style={{ animationDelay: c.delay }}
        />
      ))}
      <circle cx={210} cy={250} r={6} fill="#00e87a" className="animate-pulse_soft" />
    </svg>
  );
}

export default function LoginBackground() {
  return (
    <>
      <PageBackground />
      <AsciiChips className="absolute inset-0 opacity-70" direction={35} />
    </>
  );
}
