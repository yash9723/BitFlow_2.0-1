"use client";

/**
 * components/SignalSwarm.tsx — the landing page's first-visit intro.
 *
 * The page starts blank and a swarm of signal cursors (clk, rst_n, data[7:0], …) builds it:
 * Manhattan wires are routed out of each finished block like place-and-route traces, boxes are
 * dragged out with a live W×H readout, and text is typed in behind a caret, while a clock trace
 * ticks along the bottom. Then the cursors converge and latch, and the real page is handed back.
 *
 * Mark elements to build with `data-swarm-target="place"` or `data-swarm-target="type"`.
 * `<SwarmPrelude />` must render before them: its inline script hides them before first paint
 * (only on the first visit of a session, never for reduced motion, bots or a scrolled page).
 * The timeline itself is pure and lives in lib/swarm/plan.ts.
 */

import { useEffect, useRef, useState } from "react";
import { type Target, buildTimeline, sample } from "@/lib/swarm/plan";

const SEEN_KEY = "bf-swarm-seen";
const COLORS = ["#00e87a", "#4db8ff", "#ffb84d", "#ff6bcb", "#a78bfa", "#5eead4", "#f87171", "#facc15"];
const SVG_NS = "http://www.w3.org/2000/svg";

const PRELUDE = `(function(){try{
var d=document.documentElement;
if(sessionStorage.getItem("${SEEN_KEY}"))return;
if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
if(/bot|crawl|spider|slurp|preview|lighthouse|headlesschrome/i.test(navigator.userAgent)&&!/swarm-test/.test(location.search))return;
if(location.hash||window.scrollY>0)return;
d.setAttribute("data-swarm","pending");
setTimeout(function(){if(d.getAttribute("data-swarm")==="pending")d.removeAttribute("data-swarm")},3000);
}catch(e){}})();`;

/** Inline script + CSS that hide the swarm's targets before the first paint. Render it above them. */
export function SwarmPrelude() {
  return (
    <>
      <style>{`html[data-swarm=pending] [data-swarm-target],html[data-swarm=running] [data-swarm-target]{visibility:hidden}html[data-swarm] .animate-fade_up{animation:none}`}</style>
      <script dangerouslySetInnerHTML={{ __html: PRELUDE }} />
    </>
  );
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent.appendChild(el);
  return el;
}

/** A square wave across the width, one period every 32px — the clock strip along the bottom. */
function clockPath(x0: number, x1: number, y: number): string {
  const hi = y - 7;
  const lo = y + 7;
  let d = `M${x0} ${lo}`;
  for (let x = x0, high = false; x < x1; x += 16, high = !high) {
    const next = Math.min(x + 16, x1);
    d += ` L${x} ${high ? hi : lo} L${next} ${high ? hi : lo}`;
    if (next < x1) d += ` L${next} ${high ? lo : hi}`;
  }
  return d;
}

export default function SignalSwarm() {
  const [active, setActive] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);
  const finishRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (document.documentElement.getAttribute("data-swarm") === "pending") setActive(true);
  }, []);

  useEffect(() => {
    if (!active || !layerRef.current) return;
    const root = document.documentElement;
    const layer = layerRef.current;
    root.setAttribute("data-swarm", "running");
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode: it just plays again next time */
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const els = new Map<string, HTMLElement>();
    const targets: Target[] = [];
    document.querySelectorAll<HTMLElement>("[data-swarm-target]").forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.top >= vh - 8 || r.bottom <= 0) return;
      const id = `t${i}`;
      els.set(id, el);
      targets.push({
        id,
        kind: el.dataset.swarmTarget === "type" ? "type" : "place",
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(Math.min(r.width, vw - r.left)),
        h: Math.round(r.height),
      });
    });
    const tl = buildTimeline(targets, vw, vh, vw < 640 ? 5 : 8);

    // ── build the overlay once; each frame only updates attributes ──
    const stage = svg("svg", { width: vw, height: vh, viewBox: `0 0 ${vw} ${vh}`, class: "bf-swarm-svg" }, layer);
    const wireLayer = svg("g", { fill: "none", "stroke-linejoin": "round" }, stage);
    const parts = tl.jobs.map((j) => {
      const color = COLORS[j.cursor % COLORS.length];
      const wire = svg("polyline", { stroke: color, "stroke-width": 1.5, opacity: 0 }, wireLayer);
      const vias = [0, 1].map(() => svg("circle", { r: 2.5, fill: color, opacity: 0 }, wireLayer));
      const box = svg("rect", { fill: `${color}0d`, stroke: color, "stroke-width": 1, "stroke-dasharray": "4 3", opacity: 0 }, stage);
      const badge = svg("g", { opacity: 0 }, stage);
      const badgeBg = svg("rect", { rx: 3, height: 16, fill: color }, badge);
      const badgeText = svg("text", { "font-size": 10, fill: "#07080a", "font-family": "var(--font-mono), monospace", y: 11.5 }, badge);
      const caret = svg("line", { stroke: color, "stroke-width": 2, opacity: 0 }, stage);
      return { job: j, color, wire, vias, box, badge, badgeBg, badgeText, caret };
    });

    const clkY = vh - 22;
    const clkX0 = 46;
    const clock = svg("g", {}, stage);
    svg("text", { x: 14, y: clkY + 4, "font-size": 11, fill: "#80839d", "font-family": "var(--font-mono), monospace" }, clock).textContent = "clk";
    const clkPath = svg("path", { d: clockPath(clkX0, vw - 14, clkY), fill: "none", stroke: "#00e87a", "stroke-width": 1.25, opacity: 0.8 }, clock);
    const clkLen = clkPath.getTotalLength?.() || vw * 2;
    clkPath.setAttribute("stroke-dasharray", `${clkLen}`);
    const latchRing = svg("circle", { cx: tl.latchPoint.x, cy: tl.latchPoint.y, r: 0, fill: "none", stroke: "#00e87a", "stroke-width": 2, opacity: 0 }, stage);

    const cursorEls = tl.cursors.map((c, i) => {
      const color = COLORS[i % COLORS.length];
      const el = document.createElement("div");
      el.className = "bf-swarm-cursor";
      el.innerHTML = `
        <svg class="i-arrow" width="18" height="18" viewBox="0 0 18 18"><path d="M2 1.5 L2 15 L5.6 11.6 L8.3 17 L10.6 16 L8 10.8 L13 10.8 Z" fill="${color}" stroke="#07080a" stroke-width="1.2" stroke-linejoin="round"/></svg>
        <svg class="i-cross" width="18" height="18" viewBox="-9 -9 18 18"><path d="M0 -8 V8 M-8 0 H8" stroke="${color}" stroke-width="1.5"/><circle r="2.5" fill="none" stroke="${color}"/></svg>
        <svg class="i-beam" width="12" height="20" viewBox="-6 -10 12 20"><path d="M-3.5 -9 H3.5 M0 -9 V9 M-3.5 9 H3.5" stroke="${color}" stroke-width="1.6" fill="none"/></svg>
        <span style="background:${color}">${c.label}</span>`;
      layer.appendChild(el);
      return el;
    });

    // ── run ──
    let raf = 0;
    let finished = false;
    const t0 = performance.now();

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      els.forEach((el) => {
        el.style.removeProperty("visibility");
        el.style.removeProperty("clip-path");
      });
      // "done" (not removed) so the page's own fade-in animations don't replay under the finished page
      root.setAttribute("data-swarm", "done");
      removeListeners();
      setActive(false);
    };
    finishRef.current = finish;

    const frame = (now: number) => {
      const t = now - t0;
      const f = sample(tl, t);

      f.targets.forEach((tf, i) => {
        const el = els.get(tf.id);
        const p = parts[i];
        if (el && tf.reveal > 0) {
          el.style.visibility = "visible";
          const hidden = `${((1 - tf.reveal) * 100).toFixed(2)}%`;
          el.style.clipPath = tf.reveal >= 1 ? "" : tf.kind === "type" ? `inset(-4px ${hidden} -4px -4px)` : `inset(0 0 ${hidden} 0)`;
        }
        if (tf.box) {
          const b = tf.box;
          p.box.setAttribute("x", `${b.x}`);
          p.box.setAttribute("y", `${b.y}`);
          p.box.setAttribute("width", `${Math.max(0, b.w)}`);
          p.box.setAttribute("height", `${Math.max(0, b.h)}`);
          p.box.setAttribute("opacity", "1");
          const label = `${Math.round(b.w)} × ${Math.round(b.h)}`;
          if (p.badgeText.textContent !== label) p.badgeText.textContent = label;
          const bw = label.length * 6.2 + 10;
          p.badgeBg.setAttribute("width", `${bw}`);
          p.badgeText.setAttribute("x", "5");
          // below-left of the dragging corner, clear of the cursor's own label
          const bx = Math.max(4, b.x + b.w - bw - 6);
          const by = Math.min(b.y + b.h + 6, vh - 20);
          p.badge.setAttribute("transform", `translate(${bx} ${by})`);
          p.badge.setAttribute("opacity", "1");
        } else {
          // fade the box out over the reveal, then hide it
          const fade = tf.kind === "place" && tf.reveal > 0 && tf.reveal < 1 ? `${1 - tf.reveal}` : "0";
          p.box.setAttribute("opacity", fade);
          p.badge.setAttribute("opacity", "0");
        }
        if (tf.caret !== null) {
          const j = p.job.target;
          const ch = Math.min(j.h, 34);
          const cy = j.y + j.h / 2;
          p.caret.setAttribute("x1", `${tf.caret}`);
          p.caret.setAttribute("x2", `${tf.caret}`);
          p.caret.setAttribute("y1", `${cy - ch / 2}`);
          p.caret.setAttribute("y2", `${cy + ch / 2}`);
          p.caret.setAttribute("opacity", Math.floor(t / 260) % 2 === 0 ? "1" : "0.35");
        } else p.caret.setAttribute("opacity", "0");
      });

      parts.forEach((p) => {
        p.wire.setAttribute("opacity", "0");
        p.vias.forEach((v) => v.setAttribute("opacity", "0"));
      });
      let wi = 0;
      parts.forEach((p) => {
        if (!p.job.wire || t < p.job.wireStart) return;
        const w = f.wires[wi++];
        if (!w) return;
        p.wire.setAttribute("points", w.pts.map((q) => `${q.x},${q.y}`).join(" "));
        p.wire.setAttribute("opacity", `${0.75 * w.alpha}`);
        // a via at each bend the trace has already passed
        w.pts.slice(1, -1).forEach((q, k) => {
          const v = p.vias[k];
          if (!v) return;
          v.setAttribute("cx", `${q.x}`);
          v.setAttribute("cy", `${q.y}`);
          v.setAttribute("opacity", `${w.alpha}`);
        });
      });

      clkPath.setAttribute("stroke-dashoffset", `${clkLen * (1 - Math.min(1, t / tl.builtAt || 1))}`);
      clock.setAttribute("opacity", `${1 - f.latch}`);

      f.cursors.forEach((c, i) => {
        const el = cursorEls[i];
        el.dataset.mode = c.mode;
        el.style.transform = `translate(${c.x}px, ${c.y}px)`;
        el.style.opacity = `${1 - f.latch}`;
      });

      if (f.latch > 0) {
        latchRing.setAttribute("r", `${8 + f.latch * 90}`);
        latchRing.setAttribute("opacity", `${1 - f.latch}`);
      }

      if (f.done) finish();
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // any real interaction hands the page back at once
    const onKey = (e: KeyboardEvent) => {
      if (["Escape", " ", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) finish();
    };
    const opts = { passive: true } as const;
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", finish, opts);
    window.addEventListener("touchmove", finish, opts);
    window.addEventListener("resize", finish);
    function removeListeners() {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", finish);
      window.removeEventListener("touchmove", finish);
      window.removeEventListener("resize", finish);
    }

    return () => {
      finish();
      layer.replaceChildren();
    };
  }, [active]);

  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <style>{`
        .bf-swarm-svg{position:absolute;inset:0}
        .bf-swarm-cursor{position:absolute;left:0;top:0;will-change:transform}
        .bf-swarm-cursor svg{position:absolute;left:0;top:0}
        .bf-swarm-cursor .i-cross{left:-9px;top:-9px}
        .bf-swarm-cursor .i-beam{left:-6px;top:-10px}
        .bf-swarm-cursor .i-cross,.bf-swarm-cursor .i-beam{display:none}
        .bf-swarm-cursor[data-mode=drag] .i-arrow,.bf-swarm-cursor[data-mode=type] .i-arrow{display:none}
        .bf-swarm-cursor[data-mode=drag] .i-cross{display:block}
        .bf-swarm-cursor[data-mode=type] .i-beam{display:block}
        .bf-swarm-cursor span{position:absolute;left:14px;top:16px;white-space:nowrap;border-radius:4px;padding:1px 6px;
          font:600 10px/16px var(--font-mono),monospace;color:#07080a}
      `}</style>
      <div ref={layerRef} className="absolute inset-0" aria-hidden="true" />
      <button
        type="button"
        onClick={() => finishRef.current()}
        className="pointer-events-auto absolute bottom-12 right-4 px-3 py-1.5 rounded-md border border-rim bg-pit/90 text-[12px] text-pale hover:text-bright hover:border-muted transition-colors font-mono"
      >
        Skip intro <span className="text-dim">Esc</span>
      </button>
    </div>
  );
}
