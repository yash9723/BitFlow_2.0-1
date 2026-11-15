"use client";

import React, { useEffect, useRef, useState } from "react";

/** What the form wants Bitzy to feel. Petted, dizzy, sleepy and blinking come from Bitzy itself. */
export type Mood = "idle" | "curious" | "shy" | "peek" | "surprised" | "excited" | "loading" | "success" | "error";
type Face = Mood | "petted" | "dizzy" | "sleepy" | "blink";

const GREEN = "#00e87a";
const RED = "#ff4f4f";
const SLEEP_AFTER_MS = 20_000;
const ROAM_AFTER_MS = 3_000;   // cursor still this long → Bitzy wanders around its panel
const EASE_OUT = "cubic-bezier(0.22,1,0.36,1)";

/* Eyes, one drawing per face. Left eye sits around x 90, right around x 114, y 104. */
function Eyes({ face }: { face: Face }) {
  const s = { stroke: GREEN, strokeWidth: 5, strokeLinecap: "round" as const, fill: "none" };
  switch (face) {
    case "blink":
    case "shy":
      return (
        <g {...s} strokeWidth={7}>
          <line x1={80} y1={104} x2={100} y2={104} />
          <line x1={106} y1={104} x2={124} y2={104} />
        </g>
      );
    case "peek":
      return (
        <g>
          <line x1={80} y1={104} x2={100} y2={104} {...s} strokeWidth={7} />
          <rect x={108} y={99} width={14} height={9} rx={3} fill={GREEN} className="bz-peek" />
        </g>
      );
    case "petted":
    case "success":
      return (
        <g {...s} strokeWidth={6}>
          <path d="M81,109 Q90,95 99,109" />
          <path d="M105,109 Q114,95 123,109" />
        </g>
      );
    case "surprised":
      return (
        <g>
          <circle cx={90} cy={103} r={9} fill="none" stroke={GREEN} strokeWidth={4} />
          <circle cx={114} cy={103} r={9} fill="none" stroke={GREEN} strokeWidth={4} />
          <circle cx={90} cy={103} r={3} fill={GREEN} />
          <circle cx={114} cy={103} r={3} fill={GREEN} />
        </g>
      );
    case "loading":
      return (
        <g fill={GREEN}>
          {[88, 102, 116].map((cx, i) => (
            <circle key={cx} cx={cx} cy={104} r={4.5} className="bz-dot" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </g>
      );
    case "error":
      return (
        <g {...s} stroke={RED}>
          <line x1={82} y1={96} x2={98} y2={112} />
          <line x1={82} y1={112} x2={98} y2={96} />
          <line x1={106} y1={96} x2={122} y2={112} />
          <line x1={106} y1={112} x2={122} y2={96} />
        </g>
      );
    case "dizzy":
      return (
        <g {...s} strokeWidth={3}>
          {[90, 114].map((cx) => (
            <g key={cx} className="bz-spin" style={{ transformOrigin: `${cx}px 104px` }}>
              <path d={`M${cx},104 m0,-2 a2,2 0 1,1 -2,2 a4,4 0 1,1 4,4 a6,6 0 1,1 -6,-6 a8,8 0 1,1 8,8`} />
            </g>
          ))}
        </g>
      );
    case "sleepy":
      return (
        <g {...s} strokeWidth={5}>
          <path d="M81,103 Q90,111 99,103" />
          <path d="M105,103 Q114,111 123,103" />
        </g>
      );
    default: // idle, curious, excited: the signature X + block
      return (
        <g>
          <line x1={82} y1={96} x2={98} y2={112} {...s} />
          <line x1={82} y1={112} x2={98} y2={96} {...s} />
          <rect x={107} y={93} width={15} height={22} rx={3} fill={GREEN} />
        </g>
      );
  }
}

/* Little extras around the body that say the mood out loud. */
function Extras({ face }: { face: Face }) {
  switch (face) {
    case "shy":
    case "peek":
      return (
        <g fill="rgba(255,120,160,.35)">
          <ellipse cx={74} cy={120} rx={7} ry={4} />
          <ellipse cx={130} cy={120} rx={7} ry={4} />
        </g>
      );
    case "surprised":
      return (
        <text x={150} y={42} fill="#ffb84d" fontSize={26} fontWeight={800} fontFamily="monospace" className="bz-pop">!</text>
      );
    case "sleepy":
      return (
        <g fill={GREEN} fontFamily="monospace" fontWeight={700}>
          {[0, 1, 2].map((i) => (
            <text key={i} x={146 + i * 9} y={46 - i * 9} fontSize={10 + i * 3} className="bz-z" style={{ animationDelay: `${i * 0.6}s` }}>z</text>
          ))}
        </g>
      );
    case "success":
      return (
        <g fill={GREEN}>
          {[[40, 52], [162, 50], [30, 140], [170, 138], [100, 22]].map(([x, y], i) => (
            <path
              key={i}
              d={`M${x},${y - 7} L${x + 2},${y - 2} L${x + 7},${y} L${x + 2},${y + 2} L${x},${y + 7} L${x - 2},${y + 2} L${x - 7},${y} L${x - 2},${y - 2} Z`}
              className="bz-sparkle"
              style={{ transformOrigin: `${x}px ${y}px`, animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </g>
      );
    case "error":
      return <path d="M156,66 Q150,76 156,80 Q162,76 156,66 Z" fill="#4db8ff" className="bz-drip" />;
    case "dizzy":
      return (
        <g className="bz-orbit" style={{ transformOrigin: "100px 50px" }} fill="#ffb84d">
          {[0, 120, 240].map((a) => {
            const x = 100 + 34 * Math.cos((a * Math.PI) / 180);
            const y = 50 + 12 * Math.sin((a * Math.PI) / 180);
            return <path key={a} d={`M${x},${y - 5} L${x + 1.5},${y - 1.5} L${x + 5},${y} L${x + 1.5},${y + 1.5} L${x},${y + 5} L${x - 1.5},${y + 1.5} L${x - 5},${y} L${x - 1.5},${y - 1.5} Z`} />;
          })}
        </g>
      );
    default:
      return null;
  }
}

/* Body motion and glow per face. Every animation is switched off for reduced motion (see <style>). */
const BODY_ANIM: Partial<Record<Face, string>> = {
  error: "bz_shake 0.5s ease-in-out",
  success: `bz_jump 0.7s ${EASE_OUT}`,
  excited: "bz_bounce 0.6s ease-in-out infinite",
  dizzy: "bz_wobble 0.5s ease-in-out infinite",
  loading: "bz_breathe 1s ease-in-out infinite",
};
const POSE: Partial<Record<Face, string>> = {
  curious: "rotate(-8deg)",
  sleepy: "rotate(5deg) translateY(4px)",
  shy: "translateY(3px) scale(.97)",
  peek: "rotate(4deg)",
};
const GLOW: Partial<Record<Face, string>> = {
  error: "drop-shadow-[0_0_30px_rgba(255,79,79,0.85)]",
  success: "drop-shadow-[0_0_44px_rgba(0,255,136,1)] scale-105",
  petted: "drop-shadow-[0_0_40px_rgba(0,255,136,1)] scale-105",
  excited: "drop-shadow-[0_0_34px_rgba(0,255,136,0.9)] scale-105",
  shy: "drop-shadow-[0_0_30px_rgba(0,232,122,0.8)]",
  peek: "drop-shadow-[0_0_30px_rgba(0,232,122,0.8)]",
  surprised: "drop-shadow-[0_0_30px_rgba(255,184,77,0.7)]",
  sleepy: "drop-shadow-[0_0_6px_rgba(0,232,122,0.15)] opacity-80",
};

/**
 * Bitzy, the chip mascot. Floats when idle, follows the cursor, reads along as
 * the username grows (lookX, -1..1), and reacts to whatever the form is doing.
 * Click to make it jump, click a lot to make it dizzy, leave it alone and it dozes off.
 */
export default function Bitzy({ mood, lookX = 0, caption }: { mood: Mood; lookX?: number; caption: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const leanRef = useRef<SVGGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const [jumping, setJumping] = useState(false);
  const [petted, setPetted] = useState(false);
  const pettedRef = useRef(false);
  const [blinking, setBlinking] = useState(false);
  const [dizzy, setDizzy] = useState(false);
  const [sleepy, setSleepy] = useState(false);
  const clicks = useRef<number[]>([]);

  // External moods win; Bitzy's own states fill in when the form is quiet.
  const loud = mood === "error" || mood === "success" || mood === "loading" || mood === "surprised";
  const face: Face = loud ? mood
    : dizzy ? "dizzy"
    : mood === "shy" || mood === "peek" ? mood
    : sleepy && mood === "idle" ? "sleepy"
    : petted && mood === "idle" ? "petted"
    : blinking ? "blink"
    : mood;
  const tracks = face === "idle" || face === "excited" || face === "petted" || face === "blink";
  // The animation loop reads these without re-subscribing.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const faceRef = useRef(face);
  faceRef.current = face;
  const lookRef = useRef(lookX);
  lookRef.current = lookX;
  const antennaRef = useRef<SVGGElement>(null);
  const [roaming, setRoaming] = useState(false);
  const wanders = roaming && (face === "idle" || face === "blink");

  // Idle blink — the mascot never sits perfectly still.
  useEffect(() => {
    const id = setInterval(() => {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 160);
    }, 4200);
    return () => clearInterval(id);
  }, []);

  // Doze off after a while with no input; any activity wakes it.
  useEffect(() => {
    let t = setTimeout(() => setSleepy(true), SLEEP_AFTER_MS);
    const wake = () => {
      setSleepy(false);
      clearTimeout(t);
      t = setTimeout(() => setSleepy(true), SLEEP_AFTER_MS);
    };
    const events = ["mousemove", "keydown", "pointerdown", "focusin", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, wake));
    };
  }, []);

  // Cursor: spotlight follows it, resting on Bitzy pets it, and Bitzy chases it. A rAF loop eases
  // the body toward the cursor, tilts and stretches it with speed, and swings the antenna behind.
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = { x: 0, y: 0, ex: 0, ey: 0 };
    const cur = { x: 0, y: 0, ex: 0, ey: 0, vx: 0, vy: 0 };
    let roamTimer = setTimeout(() => setRoaming(true), ROAM_AFTER_MS);

    function onMove(e: MouseEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();

      if (glowRef.current) {
        const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        glowRef.current.style.background = `radial-gradient(circle 220px at ${((px / rect.width) * 100).toFixed(1)}% ${((py / rect.height) * 100).toFixed(1)}%, rgba(0,232,122,.18), transparent 70%)`;
      }

      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height * 0.42);
      const dist = Math.hypot(dx, dy) || 1;

      const isPetted = dist < 95;
      if (isPetted !== pettedRef.current) {
        pettedRef.current = isPetted;
        setPetted(isPetted);
      }

      clearTimeout(roamTimer);
      setRoaming(false);
      roamTimer = setTimeout(() => setRoaming(true), ROAM_AFTER_MS);

      const ratio = Math.min(dist, 320) / 320;
      target.x = (dx / dist) * ratio * 30;
      target.y = (dy / dist) * ratio * 22;
      target.ex = (dx / dist) * ratio * 11;
      target.ey = (dy / dist) * ratio * 9;
    }

    let raf = 0;
    function tick() {
      const follow = tracksRef.current;
      const curious = faceRef.current === "curious";
      const px = cur.x, py = cur.y;
      cur.x += ((follow ? target.x : 0) - cur.x) * 0.09;
      cur.y += ((follow ? target.y : 0) - cur.y) * 0.09;
      cur.ex += ((follow ? target.ex : curious ? Math.max(-1, Math.min(1, lookRef.current)) * 9 : 0) - cur.ex) * 0.2;
      cur.ey += ((follow ? target.ey : curious ? 4 : 0) - cur.ey) * 0.2;
      cur.vx += (cur.x - px - cur.vx) * 0.3;
      cur.vy += (cur.y - py - cur.vy) * 0.3;

      const speed = Math.min(Math.hypot(cur.vx, cur.vy), 4);
      const rot = Math.max(-16, Math.min(16, cur.x * 0.35 + cur.vx * 3));
      const sx = 1 + speed * 0.025, sy = 1 - speed * 0.025;   // stretch along the run, squash on landing
      leanRef.current?.setAttribute(
        "transform",
        `translate(${cur.x.toFixed(2)},${cur.y.toFixed(2)}) rotate(${rot.toFixed(2)} 100 100) translate(100 110) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(-100 -110)`
      );
      eyesRef.current?.setAttribute("transform", `translate(${cur.ex.toFixed(2)},${cur.ey.toFixed(2)})`);
      antennaRef.current?.setAttribute("transform", `rotate(${Math.max(-35, Math.min(35, -cur.vx * 9)).toFixed(2)} 128 66)`);
      raf = requestAnimationFrame(tick);
    }
    if (!still) raf = requestAnimationFrame(tick);

    document.addEventListener("mousemove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(roamTimer);
      document.removeEventListener("mousemove", onMove);
    };
  }, []);

  // Reduced motion: no chasing, but the eyes still read along the username.
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const x = face === "curious" ? Math.max(-1, Math.min(1, lookX)) * 9 : 0;
    eyesRef.current?.setAttribute("transform", `translate(${x.toFixed(1)},${face === "curious" ? 4 : 0})`);
  }, [face, lookX]);

  const handleClick = () => {
    setJumping(true);
    setTimeout(() => setJumping(false), 550);
    const now = Date.now();
    clicks.current = [...clicks.current.filter((t) => now - t < 2000), now];
    if (clicks.current.length >= 5) {
      clicks.current = [];
      setDizzy(true);
      setTimeout(() => setDizzy(false), 1500);
    }
  };

  const shownCaption = face === "dizzy" ? "Whoa… stop spinning me!" : face === "sleepy" ? "Zzz… low-power mode" : caption;

  return (
    <div
      ref={panelRef}
      onClick={handleClick}
      onContextMenu={(e) => { e.preventDefault(); handleClick(); }}
      className="bitzy relative flex flex-col items-center justify-center bg-void min-h-[300px] md:min-h-full overflow-hidden cursor-pointer select-none"
    >
      <style>{`
        @keyframes bz_float  { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
        @keyframes bz_jump   { 0% { transform: translateY(0) scale(1,1); } 15% { transform: translateY(5px) scale(1.14,.84); } 45% { transform: translateY(-40px) scale(.9,1.12); } 72% { transform: translateY(0) scale(1.12,.88); } 86% { transform: translateY(-4px) scale(.97,1.03); } 100% { transform: translateY(0) scale(1,1); } }
        @keyframes bz_roam   { 0%,100% { transform: translate(0,0) rotate(0); } 20% { transform: translate(34px,-16px) rotate(7deg); } 40% { transform: translate(14px,-30px) rotate(-3deg); } 60% { transform: translate(-30px,-12px) rotate(-8deg); } 80% { transform: translate(-16px,6px) rotate(3deg); } }
        @keyframes bz_shake  { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
        @keyframes bz_bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes bz_wobble { 0%,100% { transform: rotate(-7deg); } 50% { transform: rotate(7deg); } }
        @keyframes bz_breathe{ 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); } }
        @keyframes bz_wiggle { 0%,100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
        @keyframes bz_wag    { 0%,100% { transform: rotate(-26deg); } 50% { transform: rotate(26deg); } }
        @keyframes bz_blink  { 0%,100% { opacity: 1; } 50% { opacity: .15; } }
        @keyframes bz_dot    { 0%,100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
        @keyframes bz_spin   { to { transform: rotate(360deg); } }
        @keyframes bz_z      { 0% { opacity: 0; transform: translate(0,6px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(8px,-14px); } }
        @keyframes bz_pop    { 0% { transform: scale(0); } 70% { transform: scale(1.3); } 100% { transform: scale(1); } }
        @keyframes bz_sparkle{ 0% { opacity: 0; transform: scale(0) rotate(0); } 50% { opacity: 1; transform: scale(1.2) rotate(45deg); } 100% { opacity: 0; transform: scale(.6) rotate(90deg); } }
        @keyframes bz_drip   { 0% { opacity: 0; transform: translateY(-4px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translateY(10px); } }
        @keyframes bz_peek   { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-3px); } }
        .bitzy .bz-dot     { animation: bz_dot .9s ease-in-out infinite; transform-box: fill-box; }
        .bitzy .bz-spin    { animation: bz_spin .8s linear infinite; }
        .bitzy .bz-z       { animation: bz_z 1.8s ease-out infinite; opacity: 0; }
        .bitzy .bz-pop     { animation: bz_pop .35s ${EASE_OUT}; transform-box: fill-box; transform-origin: bottom; }
        .bitzy .bz-sparkle { animation: bz_sparkle .9s ease-out infinite; }
        .bitzy .bz-drip    { animation: bz_drip 1.1s ease-in infinite; }
        .bitzy .bz-orbit   { animation: bz_spin 1.2s linear infinite; }
        .bitzy .bz-peek    { animation: bz_peek 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .bitzy, .bitzy * { animation: none !important; transition: none !important; }
          .bitzy .bz-z, .bitzy .bz-sparkle, .bitzy .bz-drip { opacity: 1; }
        }
      `}</style>

      <div
        ref={glowRef}
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(circle 220px at 50% 42%, rgba(0,232,122,.16), transparent 70%)" }}
      />

      <div className="relative flex flex-col items-center">
        <div
          style={{
            animation: wanders ? "bz_roam 9s ease-in-out infinite"
              : face === "sleepy" ? "bz_float 7s ease-in-out infinite"
              : "bz_float 4s ease-in-out infinite",
          }}
        >
          <svg
            viewBox="0 0 200 200"
            aria-hidden="true"
            style={{ animation: jumping && !loud ? `bz_jump 0.6s ${EASE_OUT}` : BODY_ANIM[face] ?? "none", transformOrigin: "50% 75%" }}
            className={`relative w-[200px] h-[200px] overflow-visible transition-[filter,opacity] duration-300 ${GLOW[face] ?? "drop-shadow-[0_0_10px_rgba(0,232,122,0.25)]"}`}
          >
            <g style={{ transform: POSE[face] ?? "none", transformOrigin: "100px 110px", transition: "transform .3s ease-out" }}>
              <g ref={leanRef}>
                <g ref={antennaRef}>
                <g
                  style={{
                    transformOrigin: "130px 66px",
                    transformBox: "view-box",
                    animation: jumping || face === "success" || face === "excited"
                      ? "bz_wag 0.14s ease-in-out infinite"
                      : face === "sleepy" ? "none" : "bz_wiggle 2.6s ease-in-out infinite",
                  }}
                >
                  <path d="M128,66 L124,50 L131,40" fill="none" stroke={face === "error" ? RED : GREEN} strokeWidth={4} strokeLinecap="round" />
                  <circle
                    cx={131}
                    cy={38}
                    r={5}
                    fill={face === "error" ? RED : face === "surprised" ? "#ffb84d" : GREEN}
                    opacity={face === "sleepy" ? 0.35 : 1}
                    style={{ animation: face === "loading" ? "bz_blink .5s steps(2) infinite" : "none" }}
                  />
                </g>
                </g>

                <rect x={34} y={80} width={14} height={8} rx={1} fill={GREEN} opacity={0.55} />
                <rect x={34} y={112} width={14} height={8} rx={1} fill={GREEN} opacity={0.55} />
                <rect x={152} y={80} width={14} height={8} rx={1} fill={GREEN} opacity={0.55} />
                <rect x={152} y={112} width={14} height={8} rx={1} fill={GREEN} opacity={0.55} />

                <path
                  d="M78,64 H122 L152,80 V132 L122,148 H78 L48,132 V80 Z"
                  fill="#0d0e11"
                  stroke={face === "error" ? RED : GREEN}
                  strokeWidth={3}
                  style={{ transition: "stroke .2s" }}
                />
                <path d="M92,90 H108 L120,98 V114 L108,122 H92 L80,114 V98 Z" fill="rgba(0,232,122,.06)" stroke="rgba(0,232,122,.35)" strokeWidth={1.5} />

                <g ref={eyesRef} style={{ transition: "transform .2s ease-out" }}>
                  <Eyes face={face} />
                </g>
              </g>
              <Extras face={face} />
            </g>
          </svg>
        </div>

        {/* Ground shadow — stays put while the body floats above it */}
        <div className="w-[130px] h-[24px] rounded-full bg-phosphor/25 blur-[18px] -mt-1 pointer-events-none" />
      </div>

      <div className={`relative mt-6 px-4 text-center font-mono text-caption tracking-[0.14em] uppercase ${face === "error" ? "text-danger" : face === "surprised" ? "text-warn" : "text-phosphor"}`}>
        {shownCaption}
      </div>
    </div>
  );
}
