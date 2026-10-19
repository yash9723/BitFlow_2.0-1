"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "../../hooks/useAuth";
import { ACADEMY_TOPIC_META } from "@/lib/academy-content";
import { loadAcademyProgress } from "@/lib/academy-progress-storage";

/* ── Lattice background: electrons flowing along a chip-grid, converging
   on a central chip outline. Low-opacity, meant to blend not distract. ── */
function LatticeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    const SPACING = 64;
    let cols = 0, rows = 0;
    let chipX = 0, chipY = 0, chipSize = 0;

    function computeBounds() {
      cols = Math.ceil(width / SPACING) + 2;
      rows = Math.ceil(height / SPACING) + 2;
      chipSize = Math.min(width, height) * 0.26;
      chipX = width / 2 - chipSize / 2;
      chipY = height / 2 - chipSize / 2;
    }

    canvas.width = width;
    canvas.height = height;
    computeBounds();

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      computeBounds();
    };
    window.addEventListener("resize", resize);

    type Dir = 0 | 1 | 2 | 3;
    type Electron = { col: number; row: number; dir: Dir; progress: number; speed: number; glow: number };

    function randomDir(exclude?: Dir): Dir {
      let d = Math.floor(Math.random() * 4) as Dir;
      while (d === exclude) d = Math.floor(Math.random() * 4) as Dir;
      return d;
    }

    const COUNT = 30;
    const electrons: Electron[] = Array.from({ length: COUNT }).map(() => ({
      col: Math.floor(Math.random() * cols),
      row: Math.floor(Math.random() * rows),
      dir: randomDir(),
      progress: Math.random(),
      speed: 0.005 + Math.random() * 0.006,
      glow: 0.5 + Math.random() * 0.5,
    }));

    function step(e: Electron) {
      e.progress += e.speed;
      if (e.progress >= 1) {
        e.progress = 0;
        if (e.dir === 0) e.col += 1;
        else if (e.dir === 1) e.row += 1;
        else if (e.dir === 2) e.col -= 1;
        else e.row -= 1;
        if (e.col < 0) e.col = cols - 1;
        if (e.col > cols - 1) e.col = 0;
        if (e.row < 0) e.row = rows - 1;
        if (e.row > rows - 1) e.row = 0;
        const opposite = ((e.dir + 2) % 4) as Dir;
        e.dir = randomDir(opposite);
      }
    }

    function draw(t: number) {
      ctx!.clearRect(0, 0, width, height);

      // static lattice grid
      ctx!.strokeStyle = "rgba(0,232,122,0.045)";
      ctx!.lineWidth = 1;
      for (let c = 0; c <= cols; c++) {
        ctx!.beginPath();
        ctx!.moveTo(c * SPACING, 0);
        ctx!.lineTo(c * SPACING, height);
        ctx!.stroke();
      }
      for (let r = 0; r <= rows; r++) {
        ctx!.beginPath();
        ctx!.moveTo(0, r * SPACING);
        ctx!.lineTo(width, r * SPACING);
        ctx!.stroke();
      }
      ctx!.fillStyle = "rgba(0,232,122,0.09)";
      for (let c = 0; c <= cols; c++) {
        for (let r = 0; r <= rows; r++) {
          ctx!.beginPath();
          ctx!.arc(c * SPACING, r * SPACING, 1.2, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      // central chip — very subtle, slow pulse; meant to be felt more than seen
      const pulse = 0.55 + Math.sin(t / 1400) * 0.2;
      ctx!.strokeStyle = `rgba(0,232,122,${0.09 * pulse + 0.04})`;
      ctx!.lineWidth = 1;
      ctx!.strokeRect(chipX, chipY, chipSize, chipSize);
      const pad = chipSize * 0.2;
      ctx!.strokeStyle = `rgba(0,255,136,${0.11 * pulse + 0.03})`;
      ctx!.strokeRect(chipX + pad, chipY + pad, chipSize - pad * 2, chipSize - pad * 2);
      [[chipX, chipY], [chipX + chipSize, chipY], [chipX, chipY + chipSize], [chipX + chipSize, chipY + chipSize]].forEach(
        ([px, py]) => {
          ctx!.beginPath();
          ctx!.arc(px, py, 3, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(0,255,136,${0.12 * pulse + 0.03})`;
          ctx!.fill();
        }
      );

      // flowing electrons
      electrons.forEach((e) => {
        step(e);
        const x0 = e.col * SPACING;
        const y0 = e.row * SPACING;
        let x1 = x0, y1 = y0;
        if (e.dir === 0) x1 = x0 + SPACING;
        else if (e.dir === 1) y1 = y0 + SPACING;
        else if (e.dir === 2) x1 = x0 - SPACING;
        else y1 = y0 - SPACING;

        const x = x0 + (x1 - x0) * e.progress;
        const y = y0 + (y1 - y0) * e.progress;

        const insideChip = x > chipX && x < chipX + chipSize && y > chipY && y < chipY + chipSize;
        const r = insideChip ? 2.6 : 1.9;
        const alpha = (insideChip ? 0.55 : 0.32) + e.glow * 0.35;

        ctx!.beginPath();
        ctx!.arc(x, y, r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(0,255,136,${alpha})`;
        ctx!.shadowColor = "rgba(0,255,136,0.9)";
        ctx!.shadowBlur = insideChip ? 11 : 6;
        ctx!.fill();
        ctx!.shadowBlur = 0;
      });

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-70" />;
}

/* ── Module cards ──────────────────────────────────────────────────── */
const MODULES = [
  {
    title: "Sandbox IDE",
    href: "/sandbox",
    body: "Write, compile & simulate HDL in the browser.",
    color: "phosphor",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
  },
  {
    title: "Learning",
    href: "/learn",
    body: "Structured paths with hands-on exercises.",
    color: "info",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
        />
      </svg>
    ),
  },
  {
    title: "Academy",
    href: "/academy",
    body: "Number systems through FSMs, step by step.",
    color: "purple",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"
        />
      </svg>
    ),
  },
  {
    title: "Arena",
    href: "/arena",
    body: "Real HDL problems, instant feedback.",
    color: "warn",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
        />
      </svg>
    ),
  },
];

const CARD_STYLES: Record<string, { text: string; bg: string; border: string; shadow: string }> = {
  phosphor: {
    text: "text-phosphor",
    bg: "bg-phosphor/10",
    border: "group-hover:border-phosphor/60",
    shadow: "group-hover:shadow-[0_14px_28px_rgba(0,0,0,.45),0_0_32px_rgba(0,232,122,.4)]",
  },
  info: {
    text: "text-info",
    bg: "bg-info/10",
    border: "group-hover:border-info/60",
    shadow: "group-hover:shadow-[0_14px_28px_rgba(0,0,0,.45),0_0_32px_rgba(77,184,255,.4)]",
  },
  purple: {
    text: "text-purple-400",
    bg: "bg-purple-400/10",
    border: "group-hover:border-purple-400/60",
    shadow: "group-hover:shadow-[0_14px_28px_rgba(0,0,0,.45),0_0_32px_rgba(168,85,247,.4)]",
  },
  warn: {
    text: "text-warn",
    bg: "bg-warn/10",
    border: "group-hover:border-warn/60",
    shadow: "group-hover:shadow-[0_14px_28px_rgba(0,0,0,.45),0_0_32px_rgba(255,184,77,.4)]",
  },
};

/* ── Reusable glass panel ──────────────────────────────────────────── */
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`border border-rim/60 border-t-white/10 rounded-xl p-4 bg-pit/40 backdrop-blur-md
                  transition-all duration-300 hover:border-phosphor/30
                  hover:shadow-[0_10px_24px_rgba(0,0,0,.35),0_0_20px_rgba(0,232,122,.15)] ${className}`}
    >
      {children}
    </div>
  );
}

/* ── Bitzy — the BitFlow chip mascot, reused from the login page.
   Same idle wiggle / cursor tracking / petting-glow / blink / click-jump
   behavior. The password-only states (shy, wrong-password shake) don't
   apply here and are intentionally left out. ── */
const BITZY_THOUGHTS = [
  "Let's rock today 🚀",
  "Why wait? Let's bang — start now.",
  "One problem at a time.",
  "Ready when you are.",
  "Let's build something today.",
];

function BitzyMascot({ username }: { username: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const [jumping, setJumping] = useState(false);
  const [petted, setPetted] = useState(false);
  const pettedRef = useRef(false);
  const [blinking, setBlinking] = useState(false);
  const [thoughtIdx, setThoughtIdx] = useState(0);
  const [thoughtVisible, setThoughtVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setThoughtVisible(false);
      setTimeout(() => {
        setThoughtIdx((i) => (i + 1) % BITZY_THOUGHTS.length);
        setThoughtVisible(true);
      }, 400);
    }, 4800);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 160);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const panel = panelRef.current;
      const mascot = mascotRef.current;
      const eyes = eyesRef.current;
      const glow = glowRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();

      if (glow) {
        const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        const pctX = (px / rect.width) * 100;
        const pctY = (py / rect.height) * 100;
        glow.style.background = `radial-gradient(circle 220px at ${pctX.toFixed(1)}% ${pctY.toFixed(1)}%, rgba(0,232,122,.16), transparent 70%)`;
      }

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.42;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;

      const isPetted = dist < 95;
      if (isPetted !== pettedRef.current) {
        pettedRef.current = isPetted;
        setPetted(isPetted);
      }

      const clamped = Math.min(dist, 260);
      const ratio = clamped / 260;

      if (mascot) {
        const bx = (dx / dist) * ratio * 13;
        const by = (dy / dist) * ratio * 11;
        const rot = (dx / dist) * ratio * 6;
        mascot.setAttribute("transform", `translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${rot.toFixed(1)} 100 100)`);
      }
      if (eyes) {
        const nx = (dx / dist) * ratio * 11;
        const ny = (dy / dist) * ratio * 9;
        eyes.setAttribute("transform", `translate(${nx.toFixed(1)},${ny.toFixed(1)})`);
      }
    }
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  const triggerJump = () => {
    setJumping(true);
    setTimeout(() => setJumping(false), 550);
  };

  const eyesClosed = petted || blinking;

  return (
    <div
      ref={panelRef}
      onClick={triggerJump}
      onContextMenu={(e) => {
        e.preventDefault();
        triggerJump();
      }}
      className="relative flex flex-col items-center justify-center cursor-pointer select-none py-8"
    >
      <style>{`
        @keyframes bf_float  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
        @keyframes bf_jump   { 0% { transform: translateY(0); } 35% { transform: translateY(-30px); } 55% { transform: translateY(-30px); } 100% { transform: translateY(0); } }
        @keyframes bf_wiggle { 0%,100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
        @keyframes bf_wag    { 0%,100% { transform: rotate(-26deg); } 50% { transform: rotate(26deg); } }
      `}</style>

      <div
        ref={glowRef}
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(circle 200px at 50% 42%, rgba(0,232,122,.14), transparent 70%)" }}
      />
      {/* pedestal glow — a grounded halo the mascot appears to stand on */}
      <div
        className="absolute left-1/2 top-[62%] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          width: "220px",
          height: "90px",
          background: "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,232,122,.35), rgba(0,232,122,.08) 60%, transparent 80%)",
          filter: "blur(6px)",
        }}
      />

      <div className="relative" style={{ animation: "bf_float 4s ease-in-out infinite" }}>
        {/* thought bubble — subtle, cycling, blends into the panel */}
        <div
          className="absolute -top-3 left-[calc(100%-10px)] z-10 pointer-events-none transition-opacity duration-400"
          style={{ opacity: thoughtVisible ? 1 : 0 }}
        >
          <div className="relative bg-pit/70 backdrop-blur-sm border border-phosphor/20 rounded-xl px-3 py-2 whitespace-nowrap">
            <span className="text-[11px] text-pale">{BITZY_THOUGHTS[thoughtIdx]}</span>
          </div>
          <span className="absolute -bottom-2 left-5 w-2.5 h-2.5 rounded-full bg-pit/70 border border-phosphor/20" />
          <span className="absolute -bottom-4 left-3 w-1.5 h-1.5 rounded-full bg-pit/60 border border-phosphor/15" />
        </div>

        <svg
          viewBox="0 0 200 200"
          style={{ animation: jumping ? "bf_jump 0.5s cubic-bezier(0.34,1.56,0.64,1)" : "none" }}
          className={`relative w-[140px] h-[140px] transition-[filter] duration-300 ${
            petted ? "drop-shadow-[0_0_36px_rgba(0,255,136,0.9)] scale-105" : "drop-shadow-[0_0_10px_rgba(0,232,122,0.25)]"
          }`}
        >
          <g ref={mascotRef} style={{ transition: "transform .15s ease-out" }}>
            <g
              style={{
                transformOrigin: "130px 66px",
                transformBox: "view-box",
                animation: jumping ? "bf_wag 0.14s ease-in-out infinite" : "bf_wiggle 2.6s ease-in-out infinite",
              }}
            >
              <path d="M128,66 L124,50 L131,40" fill="none" stroke="#00e87a" strokeWidth={4} strokeLinecap="round" />
              <circle cx={131} cy={38} r={5} fill="#00e87a" />
            </g>

            <rect x={34} y={80} width={14} height={8} rx={1} fill="#00e87a" opacity={0.55} />
            <rect x={34} y={112} width={14} height={8} rx={1} fill="#00e87a" opacity={0.55} />
            <rect x={152} y={80} width={14} height={8} rx={1} fill="#00e87a" opacity={0.55} />
            <rect x={152} y={112} width={14} height={8} rx={1} fill="#00e87a" opacity={0.55} />

            <path d="M78,64 H122 L152,80 V132 L122,148 H78 L48,132 V80 Z" fill="#0d0e11" stroke="#00e87a" strokeWidth={3} />
            <path d="M92,90 H108 L120,98 V114 L108,122 H92 L80,114 V98 Z" fill="rgba(0,232,122,.06)" stroke="rgba(0,232,122,.35)" strokeWidth={1.5} />

            <g ref={eyesRef}>
              <g style={{ opacity: eyesClosed ? 0 : 1, transition: "opacity .25s" }}>
                <line x1={82} y1={96} x2={98} y2={112} stroke="#00e87a" strokeWidth={5} strokeLinecap="round" />
                <line x1={82} y1={112} x2={98} y2={96} stroke="#00e87a" strokeWidth={5} strokeLinecap="round" />
                <rect x={107} y={93} width={15} height={22} rx={3} fill="#00e87a" />
              </g>
              <g style={{ opacity: eyesClosed ? 1 : 0, transition: "opacity .25s" }}>
                <line x1={80} y1={104} x2={100} y2={104} stroke="#00e87a" strokeWidth={7} strokeLinecap="round" />
                <line x1={106} y1={104} x2={124} y2={104} stroke="#00e87a" strokeWidth={7} strokeLinecap="round" />
              </g>
            </g>
          </g>
        </svg>
      </div>

      <div className="w-[130px] h-[20px] rounded-full bg-phosphor/35 blur-[16px] -mt-1 pointer-events-none" />

      <div className="relative mt-2 text-center">
        <div className="text-[13px] text-bright font-semibold">Hey {username}!! 👋</div>
        <div className="text-xs text-phosphor tracking-wide mt-0.5">Greetings from Bitzy</div>
      </div>
    </div>
  );
}

/* ── Compact heatmap (last ~12 weeks) for the narrow right column ──── */
function buildCompactWeeks(activity: Record<string, number>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - 83); // ~12 weeks
  const startDow = start.getDay();
  start.setDate(start.getDate() - startDow);

  const weeks: { key: string; count: number }[][] = [];
  let cursor = new Date(start);
  let week: { key: string; count: number }[] = [];
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    week.push({ key, count: activity[key] || 0 });
    if (cursor.getDay() === 6) {
      weeks.push(week);
      week = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (week.length) weeks.push(week);
  return weeks;
}

function levelForCount(count: number) {
  if (count <= 0) return "bg-muted/50 border border-white/5";
  if (count === 1) return "bg-phosphor/30";
  if (count === 2) return "bg-phosphor/60";
  return "bg-phosphor";
}

/* ── Footer ────────────────────────────────────────────────────────── */
function DashboardFooter() {
  return (
    <footer className="relative z-10 border-t border-rim/50 mt-auto">
      <div className="max-w-[1400px] mx-auto px-6 py-10 flex flex-col items-center gap-5 text-center">
        <div className="flex items-center gap-3">
          <span className="text-[11px] tracking-[0.14em] text-bright uppercase">Follow us</span>
          <a
            href="https://chat.whatsapp.com/EDj3tTHgefx1BXI95E0bPF"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="WhatsApp"
            className="w-8 h-8 rounded-full bg-white text-void flex items-center justify-center hover:-translate-y-0.5 transition-transform"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.48 1.32 5L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.02c-.24.68-1.4 1.3-1.93 1.36-.5.06-1.05.09-3.14-.65-2.64-1.02-4.34-3.7-4.47-3.87-.13-.17-1.07-1.42-1.07-2.71s.68-1.93.92-2.19c.24-.26.53-.32.7-.32.18 0 .35 0 .5.01.16.01.38-.06.6.46.24.56.8 1.95.87 2.09.07.14.11.31.02.5-.09.19-.13.31-.27.47-.13.16-.28.36-.4.48-.13.13-.27.28-.12.55.16.27.7 1.16 1.51 1.88 1.04.93 1.92 1.22 2.19 1.36.27.13.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.22.6-.13.24.09 1.53.72 1.79.85.27.13.44.2.51.31.06.12.06.65-.18 1.33z" />
            </svg>
          </a>
          <a
            href="https://www.instagram.com/bitflow__official?igsh=MWxtZDA0aHpiZnByMw=="
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="w-8 h-8 rounded-full bg-white text-void flex items-center justify-center hover:-translate-y-0.5 transition-transform"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
            </svg>
          </a>
          <a
            href="https://www.linkedin.com/company/bitflow-vlsi-community/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="w-8 h-8 rounded-full bg-white text-void flex items-center justify-center hover:-translate-y-0.5 transition-transform"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.03-1.85-3.03-1.85 0-2.14 1.45-2.14 2.94v5.66H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.59 0 4.25 2.37 4.25 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
            </svg>
          </a>
        </div>

        <Link href="/about" className="text-[11px] tracking-[0.14em] text-bright uppercase hover:text-phosphor transition-colors">
          About
        </Link>

        <div className="text-[11px] text-bright">© 2026 BitFlow. All rights reserved.</div>

        <div className="text-[11px] tracking-[0.14em] text-bright uppercase">
          Designed by <b className="text-phosphor">Naviel Advanced Engineering &amp; Technology</b>
        </div>
      </div>
    </footer>
  );
}

/* ── Types for fetched data ──────────────────────────────────────── */
type ProfileStats = {
  totalXp: number;
  activity: Record<string, number>;
  totalActiveDays: number;
  maxStreak: number;
};
type Daily = { title: string; href: string; level: string; bonusXp: number; claimedToday: boolean; streak: number };

function DashboardContent() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<ProfileStats | null>(null);
  // undefined = loading, null = none available
  const [daily, setDaily] = useState<Daily | null | undefined>(undefined);
  const [needsRecoveryCode, setNeedsRecoveryCode] = useState(false);
  const [academy, setAcademy] = useState<{ done: number; total: number; lastTitle: string | null; lastSlug: string | null }>({
    done: 0,
    total: ACADEMY_TOPIC_META.length,
    lastTitle: null,
    lastSlug: null,
  });

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((json) => {
        if (json && json.user) {
          setStats({
            totalXp: json.totalXp,
            activity: json.activity,
            totalActiveDays: json.totalActiveDays,
            maxStreak: json.maxStreak,
          });
        }
      })
      .catch(() => {});

    const p = loadAcademyProgress();
    const lastTopic = p.lastVisited ? ACADEMY_TOPIC_META.find((t) => t.slug === p.lastVisited) : undefined;
    setAcademy({
      done: p.completedTopics.length,
      total: ACADEMY_TOPIC_META.length,
      lastTitle: lastTopic?.title ?? null,
      lastSlug: lastTopic?.slug ?? null,
    });

    fetch("/api/auth/recovery-code")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNeedsRecoveryCode(d?.hasCode === false))
      .catch(() => {});
    fetch("/api/daily")
      .then((r) => r.json())
      .then((json) => {
        const p = json?.problem;
        setDaily(p ? {
          title:        p.title,
          href:         p.href,
          level:        p.learningLevel,
          bonusXp:      json.bonusXp,
          claimedToday: json.claimedToday,
          streak:       json.streak ?? 0,
        } : null);
      })
      .catch(() => setDaily(null));
  }, []);

  const pct = academy.total > 0 ? Math.round((academy.done / academy.total) * 100) : 0;
  const weeks = stats ? buildCompactWeeks(stats.activity) : [];

  return (
    <div className="relative min-h-screen bg-void text-bright overflow-hidden flex flex-col">
      <LatticeBackground />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-rim/50 bg-void/50 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2">
          <img src="/bitflow_logo_2.png" alt="BitFlow" className="w-7 h-7 object-contain" />
          <span className="font-display font-bold text-lg">BitFlow</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/classes" className="text-[12px] text-ghost hover:text-bright transition-colors">
            Classes
          </Link>
          <Link href="/contests" className="text-[12px] text-ghost hover:text-bright transition-colors">
            Contests
          </Link>
          <Link href="/leaderboard" className="text-[12px] text-ghost hover:text-bright transition-colors">
            Leaderboard
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-2 group px-2 py-1 rounded-lg hover:bg-pit/60 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-phosphor text-void flex items-center justify-center font-bold text-xs shrink-0">
              {user?.username?.charAt(0).toUpperCase() || "?"}
            </div>
            <span className="text-xs text-pale group-hover:text-bright transition-colors">
              {user?.username || "Profile"}
            </span>
          </Link>
          <button
            onClick={() => logout()}
            className="text-[12px] font-semibold text-ghost hover:text-danger transition-colors px-3 py-1.5 rounded-lg border border-rim hover:border-danger/40"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Greeting */}
      <div className="relative z-10 text-center pt-10 pb-14 px-6">
        <div className="text-[11px] tracking-[0.18em] text-phosphor uppercase mb-2">
          Hello, {user?.username || "there"} 👋
        </div>
        <h1 className="font-serif text-3xl md:text-4xl">What will you go for today?</h1>
      </div>

      {/* 20 / 60 / 20 */}
      <div className="relative z-10 flex-1 w-full max-w-[1500px] mx-auto px-6 pb-10 grid grid-cols-1 lg:grid-cols-[1fr_3fr_1fr] gap-5 items-start">
        {/* ── Left 20% ───────────────────────────────────────────── */}
        <aside className="space-y-4">
          <GlassCard>
            <div className="text-sm font-bold uppercase tracking-wider text-bright [text-shadow:0_0_10px_rgba(0,232,122,0.3)] mb-3">
              Your Progress
            </div>
            <div className="text-xs text-ghost mb-2">Digital Electronics</div>
            <div className="w-full h-2 rounded-full bg-rim overflow-hidden mb-1.5">
              <div className="h-full bg-phosphor rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-xs text-dim">
              {academy.done}/{academy.total} topics · {pct}%
            </div>
          </GlassCard>

          <GlassCard>
            <div className="text-sm font-bold uppercase tracking-wider text-bright [text-shadow:0_0_10px_rgba(0,232,122,0.3)] mb-3">
              Continue where you left off
            </div>
            <div className="space-y-3">
              <Link href={academy.lastSlug ? `/academy/${academy.lastSlug}` : "/academy"} className="flex gap-2 group">
                <span className="text-phosphor text-xs font-bold">01</span>
                <span className="text-xs text-ghost group-hover:text-bright transition-colors">
                  {academy.lastTitle ? `Resume "${academy.lastTitle}"` : "Start Academy"}
                </span>
              </Link>
              <Link href="/sandbox" className="flex gap-2 group">
                <span className="text-info text-xs font-bold">02</span>
                <span className="text-xs text-ghost group-hover:text-bright transition-colors">Resume Sandbox IDE</span>
              </Link>
              <Link href="/arena" className="flex gap-2 group">
                <span className="text-warn text-xs font-bold">03</span>
                <span className="text-xs text-ghost group-hover:text-bright transition-colors">Pick up in Arena</span>
              </Link>
            </div>
          </GlassCard>
        </aside>

        {/* ── Middle 60% ─────────────────────────────────────────── */}
        <main>
          {needsRecoveryCode && (
            <Link href="/profile#security" className="block mb-6 rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-[12px] text-warn hover:bg-warn/10 transition-colors">
              Save a recovery code so you can reset your password if you forget it. Profile → Account security →
            </Link>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {MODULES.map((m) => {
              const s = CARD_STYLES[m.color];
              return (
                <Link
                  key={m.title}
                  href={m.href}
                  className={`group flex flex-col justify-between p-4 rounded-xl
                              bg-pit/40 backdrop-blur-md border border-rim
                              transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                              hover:-translate-y-1 hover:scale-[1.04]
                              ${s.border} ${s.shadow}`}
                >
                  <div>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${s.bg} ${s.text} border border-current/20`}>
                      {m.icon}
                    </div>
                    <h2 className={`font-serif text-base mb-1 ${s.text}`}>{m.title}</h2>
                    <p className="text-[11px] text-ghost leading-snug">{m.body}</p>
                  </div>
                  <div className={`mt-3 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-70 group-hover:opacity-100 transition-opacity ${s.text}`}>
                    Enter
                    <svg className="w-2.5 h-2.5 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>

          <BitzyMascot username={user?.username || "there"} />
        </main>

        {/* ── Right 20% ──────────────────────────────────────────── */}
        <aside className="space-y-4">
          <GlassCard>
            <div className="text-sm font-bold uppercase tracking-wider text-bright [text-shadow:0_0_10px_rgba(0,232,122,0.3)] mb-3">
              Activity
            </div>
            <div className="flex gap-[3px] overflow-x-auto">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px] shrink-0">
                  {week.map((day, di) => (
                    <div key={di} title={`${day.key}: ${day.count}`} className={`w-[9px] h-[9px] rounded-[2px] ${levelForCount(day.count)}`} />
                  ))}
                </div>
              ))}
            </div>
            {stats && (
              <div className="text-xs text-dim mt-2">
                {stats.totalActiveDays} active days · {stats.maxStreak}d max streak
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <div className="text-sm font-bold uppercase tracking-wider text-bright [text-shadow:0_0_10px_rgba(0,232,122,0.3)] mb-2">
              Your XP Points
            </div>
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ filter: "drop-shadow(0 0 6px rgba(0,232,122,0.7))" }}>
                <path d="M12 2L4 9l8 13 8-13-8-7z" fill="#00e87a" fillOpacity="0.25" stroke="#00e87a" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M4 9h16M9 9l3-7 3 7M9 9l3 13M15 9l-3 13" stroke="#00e87a" strokeWidth="1" strokeOpacity="0.6" />
              </svg>
              <div className="font-serif text-2xl text-phosphor">{(stats?.totalXp ?? 0).toLocaleString()}</div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-sm font-bold uppercase tracking-wider text-bright [text-shadow:0_0_10px_rgba(0,232,122,0.3)]">
                Daily Challenge
              </div>
              {daily && daily.streak > 0 && (
                <span className="text-[11px] text-warn font-semibold" title="Consecutive days you solved the daily challenge">
                  🔥 {daily.streak}-day streak
                </span>
              )}
            </div>
            {daily ? (
              <Link href={daily.href} className="block group">
                <span className="text-xs uppercase tracking-wide text-dim">{daily.level}</span>
                <div className="text-[13px] text-pale group-hover:text-phosphor transition-colors leading-snug mt-1">
                  {daily.title}
                </div>
                <div className={`text-[11px] mt-2 ${daily.claimedToday ? "text-phosphor" : "text-warn"}`}>
                  {daily.claimedToday ? "✓ Bonus claimed today" : `+${daily.bonusXp} XP bonus if solved today`}
                </div>
              </Link>
            ) : (
              <div className="text-xs text-dim">{daily === undefined ? "Loading…" : "No challenge today."}</div>
            )}
            <Link href="/leaderboard" className="block text-[11px] text-ghost hover:text-phosphor transition-colors mt-3">
              View leaderboard →
            </Link>
          </GlassCard>
        </aside>
      </div>

      <DashboardFooter />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardContent />
    </AuthGate>
  );
}
