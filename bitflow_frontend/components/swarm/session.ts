/**
 * components/swarm/session.ts — one run of the signal swarm, framework-free.
 *
 *   boot terminal → opening build of the first screen (the "main" batch: wires, drag boxes,
 *   typing, decrypting headlines, pixel-dissolve reveals) → latch + "SYNTHESIS COMPLETE" →
 *   the cursors chase the visitor's mouse and leave.
 *
 * Everything below the fold stays hidden until it is scrolled into view; then a short "exit"
 * batch of 3–4 cursors flies in and builds it. The visitor's mouse is a `you@bitflow` cursor
 * the swarm dodges, and clicking a block that is still being built finishes it at once.
 *
 * All overlay content lives in page coordinates inside `.bf-swarm-world`, which is shifted by
 * the scroll position each frame; the HUD (boot box, CRT, clock, status) is fixed.
 */
import { BOOT_MS } from "@/lib/swarm/boot";
import { repel } from "@/lib/swarm/motion";
import { type Target, type Timeline, type View, buildTimeline, sample } from "@/lib/swarm/plan";
import { sendCount } from "@/lib/beacon";
import { scrollOffset } from "@/lib/swarm/replay";
import { Decrypt, Dissolve, type Particle, createBoot, drawParticles, spawnBurst } from "./effects";
import {
  COLORS,
  type CursorView,
  type JobParts,
  PHOSPHOR,
  clockPath,
  createCursor,
  createJobParts,
  div,
  drawCursor,
  drawJobParts,
  drawWire,
  removeCursor,
  removeJobParts,
  svg,
} from "./overlay";

export const SEEN_KEY = "bf-swarm-seen";

const OUTRO_MS = 900;
const MAX_SESSION_MS = 45_000;
const BATCH_GAP_MS = 250;
const MAX_SCROLL_BATCHES = 3;
const STATUS = "SYNTHESIS COMPLETE · 0 errors · 0 warnings";

interface TargetState {
  id: string;
  el: HTMLElement;
  kind: Target["kind"];
  decrypt: boolean;
  rect: { x: number; y: number; w: number; h: number };
  state: "hidden" | "scheduled" | "done";
  dissolve?: Dissolve;
  decryptFx?: Decrypt;
}

interface Batch {
  tl: Timeline;
  main: boolean;
  parts: JobParts[];
  cursors: CursorView[];
}

export interface SessionOptions {
  /** Started from a replay button / the command palette rather than a first visit. */
  replay: boolean;
  /** The session is over and its DOM cleared. */
  onEnd: () => void;
}

export function startSession(layer: HTMLElement, opts: SessionOptions) {
  const root = document.documentElement;
  const shell = layer.parentElement ?? layer;
  root.setAttribute("data-swarm", "running");
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode: it just plays again next time */
  }
  if (opts.replay) sendCount("/~intro/replayed");

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const phone = vw < 640;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  // ── DOM ──
  layer.replaceChildren();
  const world = div("bf-swarm-world", layer);
  const fx = div("bf-swarm-world", world); // dissolve canvases + bursts, under the cursors
  const stage = svg("svg", { class: "bf-swarm-stage", width: 1, height: 1 }, world);
  const wiresG = svg("g", { fill: "none", "shape-rendering": "crispEdges" }, stage);
  const cursorLayer = div("bf-swarm-world", world);
  const hud = div("bf-swarm-hud", layer);
  hud.style.cssText = "position:absolute;inset:0";
  const crt = div("bf-swarm-crt", hud);
  const flash = div("bf-swarm-flash", hud);
  const status = div("bf-swarm-status", hud);
  status.textContent = STATUS;
  const clock = svg("svg", { width: vw, height: 44, style: "position:absolute;left:0;bottom:0" }, hud);
  const clkText = svg("text", { x: 14, y: 27, fill: "#80839d", style: "font-size:14px" }, clock);
  clkText.textContent = "clk";
  const clkPath = svg("path", { d: clockPath(46, vw - 14, 22), fill: "none", stroke: PHOSPHOR, "stroke-width": 2, opacity: 0.8, "shape-rendering": "crispEdges" }, clock);
  const clkLen = clkPath.getTotalLength?.() || vw * 2;
  clkPath.setAttribute("stroke-dasharray", `${clkLen}`);
  const you = div("bf-swarm-you", layer);
  const youChip = div("bf-swarm-chip", you);
  youChip.innerHTML = "<b>&gt;</b>you@bitflow";
  let boot: ReturnType<typeof createBoot> | null = createBoot(hud);

  // ── targets, in page coordinates ──
  const start = scrollOffset();
  const states = new Map<string, TargetState>();
  document.querySelectorAll<HTMLElement>("[data-swarm-target]").forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return; // display:none here (e.g. desktop-only nav)
    const id = `t${i}`;
    states.set(id, {
      id,
      el,
      kind: el.dataset.swarmTarget === "type" ? "type" : "place",
      decrypt: el.hasAttribute("data-swarm-decrypt"),
      rect: {
        x: Math.round(r.left + start.x),
        y: Math.round(r.top + start.y),
        w: Math.round(Math.min(r.width, vw - r.left)),
        h: Math.round(r.height),
      },
      state: "hidden",
    });
  });
  const asTarget = (s: TargetState): Target => ({ id: s.id, kind: s.kind, ...s.rect });
  const viewNow = (): View => ({ ...scrollOffset(), w: vw, h: vh });

  const batches: Batch[] = [];
  let nextLabel = 0;
  const addBatch = (targets: TargetState[], main: boolean, t: number) => {
    targets.forEach((s) => (s.state = "scheduled"));
    const tl = buildTimeline(targets.map(asTarget), vw, vh, main
      ? { cursors: phone ? 6 : 10, start: BOOT_MS, view: viewNow() }
      : { cursors: Math.min(4, targets.length + 1), labelOffset: nextLabel, start: t, finale: "exit", speed: 1.4, view: viewNow() });
    if (!main) nextLabel += tl.cursors.length;
    batches.push({
      tl,
      main,
      parts: tl.jobs.map((j) => createJobParts(stage, wiresG, j, COLORS[tl.cursors[j.cursor].signal % COLORS.length])),
      cursors: tl.cursors.map((c, i) =>
        createCursor(cursorLayer, c.label, COLORS[c.signal % COLORS.length], main ? BOOT_MS + 120 + i * 110 : t + i * 80),
      ),
    });
    return tl;
  };
  const top = start.y;
  const main = addBatch([...states.values()].filter((s) => s.rect.y < top + vh - 8 && s.rect.y + s.rect.h > top), true, 0);
  const latchRing = svg("circle", { cx: main.latchPoint.x, cy: main.latchPoint.y, r: 0, fill: "none", stroke: PHOSPHOR, "stroke-width": 2, opacity: 0 }, stage);

  // ── reveal helpers ──
  const complete = (s: TargetState) => {
    if (s.state === "done") return;
    s.dissolve?.remove();
    s.decryptFx?.restore();
    s.el.style.removeProperty("clip-path");
    s.el.style.visibility = "visible";
    s.state = "done";
  };

  const apply = (s: TargetState, reveal: number, building: boolean, t: number) => {
    if (s.state === "done") return;
    if (s.kind === "place") {
      if (reveal <= 0) return;
      if (!s.dissolve) {
        s.el.style.visibility = "visible";
        s.dissolve = new Dissolve(fx, s.rect, s.id);
      }
      s.dissolve.step(reveal);
    } else if (s.decrypt) {
      if (!building && reveal <= 0) return;
      if (!s.decryptFx) {
        s.el.style.visibility = "visible";
        s.decryptFx = new Decrypt(s.el);
      }
      s.decryptFx.step(reveal, t);
    } else {
      if (reveal <= 0) return;
      s.el.style.visibility = "visible";
      s.el.style.clipPath = `inset(-4px ${((1 - reveal) * 100).toFixed(2)}% -4px -4px)`;
    }
    if (reveal >= 1) complete(s);
  };

  // ── input ──
  let mouse: { x: number; y: number } | null = null; // client coords
  let particles: Particle[] = [];
  let now = 0;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    mouse = { x: e.clientX, y: e.clientY };
    if (finePointer) {
      you.style.opacity = "1";
      you.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }
  };
  const onDown = (e: PointerEvent) => {
    // only blocks still being built: everything already visible keeps its normal click
    const { x: ox, y: oy } = scrollOffset();
    const x = e.clientX + ox;
    const y = e.clientY + oy;
    for (const s of states.values()) {
      const r = s.rect;
      if (s.state !== "scheduled" || x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      complete(s);
      particles = particles.concat(spawnBurst(fx, x, y, PHOSPHOR, now));
      break;
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") end("skipped");
  };
  const onResize = () => {
    if (window.innerWidth !== vw) end(null); // width changed: the measured layout is stale (height changes are mobile URL bars)
  };
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true, capture: true });
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", onResize);

  // ── frame loop ──
  let raf = 0;
  let ended = false;
  let mainGone = false;
  let lastBatchAt = -Infinity;
  const t0 = performance.now();

  const removeBatch = (b: Batch) => {
    b.parts.forEach(removeJobParts);
    b.cursors.forEach(removeCursor);
    batches.splice(batches.indexOf(b), 1);
  };

  const frame = (ts: number) => {
    const t = (now = ts - t0);
    const { x: sx, y: sy } = scrollOffset();
    world.style.transform = `translate(${-sx}px, ${-sy}px)`;
    if (boot && boot.draw(t)) boot = null;

    // scroll-build: anything scrolled into view gets its own little batch; anything scrolled past unbuilt just appears
    if (t > BOOT_MS && t - lastBatchAt > BATCH_GAP_MS && batches.filter((b) => !b.main).length < MAX_SCROLL_BATCHES) {
      const due: TargetState[] = [];
      for (const s of states.values()) {
        if (s.state !== "hidden") continue;
        if (s.rect.y + s.rect.h < sy) complete(s);
        else if (s.rect.y < sy + vh * 0.92) due.push(s);
      }
      if (due.length) {
        addBatch(due, false, t);
        lastBatchAt = t;
      }
    }

    const mp = mouse ? { x: mouse.x + sx, y: mouse.y + sy } : null;
    for (const b of batches.slice()) {
      const f = sample(b.tl, t);
      f.targets.forEach((tf, i) => {
        const s = states.get(tf.id);
        if (!s) return;
        const building = t >= b.tl.jobs[i].buildStart;
        apply(s, tf.reveal, building, t);
        drawJobParts(b.parts[i], s.decrypt ? { ...tf, caret: null } : tf, t, s.state === "done");
      });
      let wi = 0;
      b.parts.forEach((p) => {
        const on = p.job.wire && t >= p.job.wireStart;
        drawWire(p, on ? f.wires[wi++] ?? null : null);
      });

      if (b.main) {
        const outro = t - b.tl.end; // > 0: chasing the mouse, then gone
        if (outro > OUTRO_MS) {
          removeBatch(b);
          mainGone = true;
          sendCount("/~intro/watched");
          shell.dataset.phase = "scroll";
          crt.style.opacity = "0";
          clock.remove();
          status.remove();
          flash.remove();
          continue;
        }
        const alpha = outro > OUTRO_MS - 300 ? Math.max(0, (OUTRO_MS - outro) / 300) : 1;
        f.cursors.forEach((c, i) => {
          const cv = b.cursors[i];
          if (outro > 0) {
            // chase: each cursor lags differently, gathering in a small ring around the mouse
            if (mp) {
              const a = (i / f.cursors.length) * Math.PI * 2;
              const k = 0.07 + (i % 5) * 0.018;
              drawCursor(cv, cv.x + (mp.x + Math.cos(a) * 26 - cv.x) * k, cv.y + (mp.y + 14 + Math.sin(a) * 26 - cv.y) * k, "move", t, alpha);
            } else drawCursor(cv, cv.x, cv.y, "move", t, alpha);
            return;
          }
          // dodge the visitor's mouse while flying about; working cursors hold their line
          const push = mp && c.mode === "move" ? repel(c, mp, 120, 0.7) : { x: 0, y: 0 };
          cv.ox += (push.x - cv.ox) * 0.2;
          cv.oy += (push.y - cv.oy) * 0.2;
          drawCursor(cv, c.x + cv.ox, c.y + cv.oy, c.mode, t, t < BOOT_MS ? 0 : 1); // hidden behind the boot box
        });
        // latch: ring, white flash and a jolt, then the status line
        if (f.latch > 0) {
          latchRing.setAttribute("r", `${8 + f.latch * 90}`);
          latchRing.setAttribute("opacity", `${1 - f.latch}`);
        }
        const sinceLatch = t - b.tl.latchAt;
        flash.style.opacity = sinceLatch > 0 && sinceLatch < 70 ? "0.16" : "0";
        hud.style.transform = sinceLatch > 0 && sinceLatch < 70 ? "translateX(3px)" : "";
        status.style.opacity = sinceLatch > 0 ? (sinceLatch < 140 && Math.floor(sinceLatch / 35) % 2 ? "0.3" : "1") : "0";
        clkPath.setAttribute("stroke-dashoffset", `${clkLen * (1 - Math.min(1, Math.max(0, (t - BOOT_MS) / (b.tl.builtAt - BOOT_MS))))}`);
        clock.style.opacity = `${1 - f.latch}`;
      } else {
        if (t > b.tl.end) {
          removeBatch(b);
          continue;
        }
        f.cursors.forEach((c, i) => {
          const cv = b.cursors[i];
          const push = mp && c.mode === "move" ? repel(c, mp, 120, 0.7) : { x: 0, y: 0 };
          cv.ox += (push.x - cv.ox) * 0.2;
          cv.oy += (push.y - cv.oy) * 0.2;
          drawCursor(cv, c.x + cv.ox, c.y + cv.oy, c.mode, t, 1);
        });
      }
    }
    particles = drawParticles(particles, t);

    const allDone = [...states.values()].every((s) => s.state === "done");
    if ((mainGone && allDone && !batches.length && !particles.length) || t > MAX_SESSION_MS) {
      end(null);
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // ── the end ──
  function end(reason: "skipped" | null) {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    // reveal everything, then drop the inline visibility so a replay's CSS can hide it again
    states.forEach((s) => {
      complete(s);
      s.el.style.removeProperty("visibility");
    });
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerdown", onDown, { capture: true });
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    // "done" (not removed) so the page's own fade-in animations don't replay under the finished page
    root.setAttribute("data-swarm", "done");
    if (reason && !mainGone) sendCount(`/~intro/${reason}`);
    layer.replaceChildren();
    delete shell.dataset.phase;
    opts.onEnd();
  }

  return {
    skip: () => end("skipped"),
    /** Unmount / replay: tear down without counting it as a skip. */
    destroy: () => end(null),
  };
}
