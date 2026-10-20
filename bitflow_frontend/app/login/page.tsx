"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../hooks/useAuth";

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
      className="absolute inset-0 w-full h-full opacity-70"
      viewBox="0 0 420 500"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
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

/* ── Canvas particle field: dots wander the page, spiral into the centre chip and vanish ── */
function BackgroundParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    if (!ctx) return;

    let raf = 0;
    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    window.addEventListener("resize", resize);

    type Particle = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      state: "wander" | "spiral";
      angle: number;
      radius: number;
      opacity: number;
    };

    const COUNT = 46;
    const CAPTURE_R = 150;

    function respawn(p: Particle) {
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { p.x = Math.random() * width; p.y = -10; }
      else if (edge === 1) { p.x = width + 10; p.y = Math.random() * height; }
      else if (edge === 2) { p.x = Math.random() * width; p.y = height + 10; }
      else { p.x = -10; p.y = Math.random() * height; }
      p.vx = (Math.random() - 0.5) * 0.4;
      p.vy = (Math.random() - 0.5) * 0.4;
      p.state = "wander";
      p.opacity = 0.3 + Math.random() * 0.5;
    }

    const particles: Particle[] = Array.from({ length: COUNT }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      state: "wander" as const,
      angle: 0,
      radius: 0,
      opacity: 0.3 + Math.random() * 0.5,
    }));

    function tick() {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;

      particles.forEach((p) => {
        if (p.state === "wander") {
          p.vx += (Math.random() - 0.5) * 0.05;
          p.vy += (Math.random() - 0.5) * 0.05;
          p.vx = Math.max(-0.6, Math.min(0.6, p.vx));
          p.vy = Math.max(-0.6, Math.min(0.6, p.vy));
          p.x += p.vx;
          p.y += p.vy;

          if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) {
            respawn(p);
          }

          const dx = p.x - cx;
          const dy = p.y - cy;
          const dist = Math.hypot(dx, dy);
          if (dist < CAPTURE_R) {
            p.state = "spiral";
            p.radius = dist;
            p.angle = Math.atan2(dy, dx);
          }
        } else {
          p.angle += 0.22;
          p.radius *= 0.94;
          p.x = cx + p.radius * Math.cos(p.angle);
          p.y = cy + p.radius * Math.sin(p.angle);
          p.opacity *= 0.96;
          if (p.radius < 2 || p.opacity < 0.03) {
            respawn(p);
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,232,122,${p.opacity})`;
        ctx.shadowColor = "rgba(0,232,122,0.8)";
        ctx.shadowBlur = 6;
        ctx.fill();
      });

      raf = requestAnimationFrame(tick);
    }

    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

/* ── The chip mascot: idles with a gentle float, tracks the cursor with
   both body and eyes, closes its eyes on password focus AND on a failed
   login, shakes red on error, and jumps with a perked antenna on
   right-click. Eyes now match the reference video (X + block), sized up. ── */
function ChipMascot({
  shy,
  excited,
  error,
  caption,
}: {
  shy: boolean;
  excited: boolean;
  error: boolean;
  caption: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const shyRef = useRef(shy);
  shyRef.current = shy;
  const [jumping, setJumping] = useState(false);
  const [petted, setPetted] = useState(false);
  const pettedRef = useRef(false);
  const [blinking, setBlinking] = useState(false);

  // Idle blink — the mascot never sits perfectly still.
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

      // Spotlight follows the cursor exactly, clamped to the panel bounds.
      if (glow) {
        const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        const pctX = (px / rect.width) * 100;
        const pctY = (py / rect.height) * 100;
        glow.style.background = `radial-gradient(circle 220px at ${pctX.toFixed(1)}% ${pctY.toFixed(1)}%, rgba(0,232,122,.18), transparent 70%)`;
      }

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height * 0.42;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy) || 1;

      // Cursor resting on the mascot — it lights up and squints happily.
      const isPetted = dist < 95;
      if (isPetted !== pettedRef.current) {
        pettedRef.current = isPetted;
        setPetted(isPetted);
      }

      if (!shyRef.current) {
        const clamped = Math.min(dist, 260);
        const ratio = clamped / 260;

        // Whole body leans toward the cursor — slower and shorter than the eyes.
        if (mascot) {
          const bx = (dx / dist) * ratio * 13;
          const by = (dy / dist) * ratio * 11;
          const rot = (dx / dist) * ratio * 6;
          mascot.setAttribute("transform", `translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${rot.toFixed(1)} 100 100)`);
        }

        // Eyes track the cursor direction more tightly, inside the body.
        if (eyes) {
          const nx = (dx / dist) * ratio * 11;
          const ny = (dy / dist) * ratio * 9;
          eyes.setAttribute("transform", `translate(${nx.toFixed(1)},${ny.toFixed(1)})`);
        }
      }
    }
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    if (shy) {
      eyesRef.current?.setAttribute("transform", "translate(0,0)");
      mascotRef.current?.setAttribute("transform", "translate(0,0) rotate(0 100 100)");
    }
  }, [shy]);

  const triggerJump = () => {
    setJumping(true);
    setTimeout(() => setJumping(false), 550);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    triggerJump();
  };

  const eyesClosed = shy || error || petted || blinking;

  return (
    <div
      ref={panelRef}
      onClick={triggerJump}
      onContextMenu={handleContextMenu}
      className="relative flex flex-col items-center justify-center bg-void min-h-[300px] md:min-h-full overflow-hidden cursor-pointer select-none"
    >
      <style>{`
        @keyframes bf_float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
        @keyframes bf_jump  { 0% { transform: translateY(0); } 35% { transform: translateY(-30px); } 55% { transform: translateY(-30px); } 100% { transform: translateY(0); } }
        @keyframes bf_shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
        @keyframes bf_wiggle { 0%,100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
        @keyframes bf_wag    { 0%,100% { transform: rotate(-26deg); } 50% { transform: rotate(26deg); } }
      `}</style>

      <div
        ref={glowRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle 220px at 50% 42%, rgba(0,232,122,.16), transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        <div style={{ animation: "bf_float 4s ease-in-out infinite" }}>
          <svg
            viewBox="0 0 200 200"
            style={{
              animation: error
                ? "bf_shake 0.5s ease-in-out"
                : jumping
                ? "bf_jump 0.5s cubic-bezier(0.34,1.56,0.64,1)"
                : "none",
            }}
            className={`relative w-[200px] h-[200px] transition-[filter] duration-300 ${
              error
                ? "drop-shadow-[0_0_30px_rgba(255,79,79,0.85)]"
                : petted
                ? "drop-shadow-[0_0_40px_rgba(0,255,136,1)] scale-105"
                : shy
                ? "drop-shadow-[0_0_30px_rgba(0,232,122,0.8)]"
                : excited
                ? "drop-shadow-[0_0_34px_rgba(0,255,136,0.9)] scale-105"
                : "drop-shadow-[0_0_10px_rgba(0,232,122,0.25)]"
            }`}
          >
            <g ref={mascotRef} style={{ transition: "transform .15s ease-out" }}>
              <g
                style={{
                  transformOrigin: "130px 66px",
                  transformBox: "view-box",
                  animation: jumping
                    ? "bf_wag 0.14s ease-in-out infinite"
                    : "bf_wiggle 2.6s ease-in-out infinite",
                }}
              >
                <path d="M128,66 L124,50 L131,40" fill="none" stroke="#00e87a" strokeWidth={4} strokeLinecap="round" />
                <circle cx={131} cy={38} r={5} fill="#00e87a" />
              </g>

              <rect x={34} y={80} width={14} height={8} rx={1} fill="#00e87a" opacity={0.55} />
              <rect x={34} y={112} width={14} height={8} rx={1} fill="#00e87a" opacity={0.55} />
              <rect x={152} y={80} width={14} height={8} rx={1} fill="#00e87a" opacity={0.55} />
              <rect x={152} y={112} width={14} height={8} rx={1} fill="#00e87a" opacity={0.55} />

              <path
                d="M78,64 H122 L152,80 V132 L122,148 H78 L48,132 V80 Z"
                fill="#0d0e11"
                stroke={error ? "#ff4f4f" : "#00e87a"}
                strokeWidth={3}
                style={{ transition: "stroke .2s" }}
              />
              <path d="M92,90 H108 L120,98 V114 L108,122 H92 L80,114 V98 Z" fill="rgba(0,232,122,.06)" stroke="rgba(0,232,122,.35)" strokeWidth={1.5} />

              {/* Eyes — matches the reference: X (left) + block (right), bigger than before */}
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

        {/* Ground shadow — stays put while the body floats above it */}
        <div className="w-[130px] h-[24px] rounded-full bg-phosphor/25 blur-[18px] -mt-1 pointer-events-none" />
      </div>

      <div className={`relative mt-6 text-[11px] tracking-[0.14em] uppercase ${error ? "text-danger" : "text-phosphor"}`}>
        {caption}
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [role, setRole] = useState<"STUDENT" | "ADMIN">("STUDENT");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secretPassword, setSecretPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Sign-up spam protection (lib/bot-check.ts): a timed form token + honeypot.
  const [formToken, setFormToken] = useState("");
  const [website, setWebsite] = useState("");

  // /login?mode=register opens straight on the sign-up form (landing page CTA).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "register") setIsSignUp(true);
  }, []);

  useEffect(() => {
    if (!isSignUp) return;
    fetch("/api/auth/register").then((r) => r.json()).then((d) => setFormToken(d.formToken ?? "")).catch(() => {});
  }, [isSignUp]);

  const [shy, setShy] = useState(false);
  const [excited, setExcited] = useState(false);
  const [error, setError] = useState(false);

  const triggerError = () => {
    setError(true);
    setTimeout(() => setError(false), 650);
  };

  /** ?next= when it is a path on this site (never another origin), else the role's home. */
  const afterSignIn = (role: string) => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) return next;
    return role === "ADMIN" ? "/admin" : "/dashboard";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const res = await register(username, password, role, role === "ADMIN" ? secretPassword : undefined, { formToken, website });
        if (res.error) {
          setErrorMsg(res.error);
          triggerError();
          if (role === "ADMIN" && res.error.toLowerCase().includes("secret password")) {
            setSecretPassword("");
          }
        } else {
          setTimeout(() => {
            router.push(afterSignIn(role));
          }, 500);
        }
      } else {
        const res = await login(username, password, role);
        if (res.error) {
          setErrorMsg(res.error);
          triggerError();
        } else {
          setTimeout(() => {
            router.push(afterSignIn(role));
          }, 500);
        }
      }
    } catch (err) {
      setErrorMsg("An unexpected error occurred. Please try again.");
      triggerError();
    } finally {
      setLoading(false);
    }
  };

  const caption = error
    ? "Access denied!"
    : shy
    ? "Encrypting input…"
    : excited
    ? isSignUp
      ? "Ready to register!"
      : "Ready to authorize!"
    : "Hey Hello!! I'm Bitzy 👋";

  return (
    <div className="relative min-h-screen bg-void overflow-hidden flex flex-col items-center justify-center px-6 py-12 text-bright">
      <style>{`
        .bf-input:-webkit-autofill,
        .bf-input:-webkit-autofill:hover,
        .bf-input:-webkit-autofill:focus,
        .bf-input:-webkit-autofill:active {
          -webkit-text-fill-color: #e8eaf6;
          -webkit-box-shadow: 0 0 0px 1000px #141a15 inset;
          box-shadow: 0 0 0px 1000px #141a15 inset;
          transition: background-color 9999s ease-in-out 0s;
          caret-color: #e8eaf6;
        }
      `}</style>
      <PageBackground />
      <BackgroundParticles />

      <Link
        href="/"
        className="relative z-10 font-display font-bold text-lg text-bright hover:text-phosphor transition-colors mb-8"
      >
        BitFlow
      </Link>

      <div className="relative z-10 w-full max-w-4xl grid grid-cols-1 md:grid-cols-[0.85fr_1fr] bg-pit/90 backdrop-blur-xl border border-phosphor/25 rounded-[20px] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.6),0_0_60px_rgba(0,232,122,0.08)]">
        <ChipMascot shy={shy} excited={excited} error={error} caption={caption} />

        <div className="p-8 md:p-10 flex flex-col">
          <h1 className="font-serif text-2xl text-bright mb-1">
            {isSignUp ? "Create your account" : "Welcome back!"}
          </h1>
          <p className="text-[12.5px] text-ghost mb-6">
            {isSignUp ? "Set up a new BitFlow profile" : "Enter your login details to continue to BitFlow"}
          </p>

          {/* Role tabs */}
          <div className="flex bg-shaft border border-rim/60 rounded-lg p-1 mb-5">
            <button
              type="button"
              onClick={() => {
                setRole("STUDENT");
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold tracking-wider uppercase transition-all duration-150 ${
                role === "STUDENT" ? "bg-phosphor/10 text-phosphor border border-phosphor/30" : "text-ghost hover:text-pale"
              }`}
            >
              Student Profile
            </button>
            <button
              type="button"
              onClick={() => {
                setRole("ADMIN");
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold tracking-wider uppercase transition-all duration-150 ${
                role === "ADMIN" ? "bg-info/10 text-info border border-info/30" : "text-ghost hover:text-pale"
              }`}
            >
              Admin Profile
            </button>
          </div>

          {errorMsg && (
            <div
              className={`p-3 rounded-lg border text-[11px] mb-5 ${
                role === "ADMIN" ? "border-danger/30 bg-danger/10 text-danger" : "border-warn/30 bg-warn/10 text-warn"
              }`}
            >
              <div className="flex gap-2">
                <span className="font-bold">⚠ ERROR:</span>
                <span className="flex-1">{errorMsg}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-[11px] text-pale mb-1.5">Username</label>
              <input
                id="username"
                type="text"
                required
                autoComplete="username"
                {...(isSignUp && {
                  minLength: 3,
                  maxLength: 24,
                  pattern: "(?:[A-Za-z0-9_.]|-){3,24}",   // = usernameProblem(); no "-" inside the class (v-flag rules)
                  title: "3–24 characters: letters, numbers, dots, dashes and underscores",
                })}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. system_operator"
                className="bf-input w-full bg-[#141a15] border border-rim rounded-lg px-3.5 py-2.5 text-[13px] text-bright placeholder-dim/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:outline-none focus:border-phosphor transition-colors"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[11px] text-pale mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  {...(isSignUp && { minLength: 8, maxLength: 200 })}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setShy(true)}
                  onBlur={() => setShy(false)}
                  placeholder="••••••••"
                  className="bf-input w-full bg-[#141a15] border border-rim rounded-lg px-3.5 py-2.5 pr-11 text-[13px] text-bright placeholder-dim/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:outline-none focus:border-phosphor transition-colors"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ghost hover:text-phosphor transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.09A9.77 9.77 0 0112 5c5.05 0 8.7 3.55 10 7-.42 1.13-1.05 2.19-1.86 3.12M6.53 6.53C4.5 7.86 2.94 9.77 2 12c1.3 3.45 4.95 7 10 7 1.4 0 2.7-.27 3.86-.75" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12c1.3-3.45 4.95-7 10-7s8.7 3.55 10 7c-1.3 3.45-4.95 7-10 7s-8.7-3.55-10-7z" />
                      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {role === "ADMIN" && isSignUp && (
              <div>
                <label htmlFor="admin-secret" className="block text-[11px] text-info mb-1.5">Secret Admin Key</label>
                <div className="relative">
                  <input
                    id="admin-secret"
                    type={showSecret ? "text" : "password"}
                    required
                    value={secretPassword}
                    onChange={(e) => setSecretPassword(e.target.value)}
                    onFocus={() => setShy(true)}
                    onBlur={() => setShy(false)}
                    placeholder="Enter system master password"
                    className="bf-input w-full bg-[#141a1f] border border-info/40 rounded-lg px-3.5 py-2.5 pr-11 text-[13px] text-info placeholder-info/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus:outline-none focus:border-info transition-colors"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-info/70 hover:text-info transition-colors"
                    aria-label={showSecret ? "Hide password" : "Show password"}
                  >
                    {showSecret ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.58 10.58a2 2 0 002.83 2.83M9.88 5.09A9.77 9.77 0 0112 5c5.05 0 8.7 3.55 10 7-.42 1.13-1.05 2.19-1.86 3.12M6.53 6.53C4.5 7.86 2.94 9.77 2 12c1.3 3.45 4.95 7 10 7 1.4 0 2.7-.27 3.86-.75" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12c1.3-3.45 4.95-7 10-7s8.7 3.55 10 7c-1.3 3.45-4.95 7-10 7s-8.7-3.55-10-7z" />
                        <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
                <span className="block text-[10px] text-dim/70 mt-1">
                  Required for admin credentials initialization.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-[12px] pt-1">
              <label className="flex items-center gap-2 text-ghost">
                <input type="checkbox" defaultChecked className="accent-phosphor" />
                Remember me
              </label>
              <Link href="/reset-password" className="text-phosphor hover:text-phosphor-glow transition-colors">
                Forgot password?
              </Link>
            </div>

            {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
            {isSignUp && (
              <div aria-hidden="true" className="absolute -left-[9999px] w-px h-px overflow-hidden">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
                       value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              onMouseEnter={() => setExcited(true)}
              onMouseLeave={() => setExcited(false)}
              className={`w-full py-3 rounded-lg text-[13px] font-bold tracking-wide uppercase transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
                role === "ADMIN" ? "bg-info text-void hover:bg-info/85" : "bg-phosphor text-void hover:bg-phosphor-glow"
              }`}
            >
              {loading ? "Decrypting..." : isSignUp ? "Create Profile" : "Authorize"}
            </button>
            {isSignUp && (
              <p className="text-[11px] text-ghost text-center">
                By creating an account you agree to the{" "}
                <Link href="/terms" className="text-phosphor hover:underline">Terms</Link> and{" "}
                <Link href="/privacy" className="text-phosphor hover:underline">Privacy policy</Link>.
              </p>
            )}
          </form>

          <div className="flex items-center gap-3 my-5 text-[11px] text-dim">
            <div className="flex-1 h-px bg-rim" />
            Or
            <div className="flex-1 h-px bg-rim" />
          </div>

          <button
            type="button"
            onClick={() => setErrorMsg("Google sign-in isn't connected yet — coming soon.")}
            onMouseEnter={() => setExcited(true)}
            onMouseLeave={() => setExcited(false)}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg border border-rim bg-shaft text-[12.5px] text-pale hover:border-muted hover:text-bright transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0012 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 010-4.2V7.05H2.18a11 11 0 000 9.9l3.66-2.85z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 00-9.82 6.05l3.66 2.85C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            Continue with Google
          </button>

          <div className="mt-6 text-center border-t border-rim/40 pt-4">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg(null);
              }}
              className="text-[11px] font-semibold text-phosphor animate-text_glow transition-colors underline decoration-dotted"
            >
              {isSignUp ? "Already registered? Sign in here" : "Need a new account? Register here"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
