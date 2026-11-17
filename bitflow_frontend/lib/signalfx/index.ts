/**
 * lib/signalfx — BitFlow's reactive moments. Call these from event handlers; each loads the
 * effects layer on first use (nothing on page load) and does nothing with reduced motion.
 * Every outcome they decorate is already shown as text: these only add the reaction.
 *
 *   run(el)                 a clock sweep across the Run button
 *   result(el, ok)          OK / ERR after a run
 *   pass(el)                PASS stamp before the solve celebration
 *   fail(el, passed, total) FAIL n/m (or FAIL), sparks, and a glitch on the result panel
 *   xp(from, to)            bits run along a trace into the header XP counter
 *   quest(el)               SYNC, a burst and sparks
 *   answer(el, right)       HIGH with sparks, or LOW with a glitch
 *   glint(el)               a four-point glint (badges)
 */
import type { Pt } from "./effects";

const load = () => Promise.all([import("./effects"), import("./layer")]);
const reduced = () => typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The text for a failed submission: FAIL 3/8 only when both counts are real. */
export const failLabel = (passed?: number | null, total?: number | null) =>
  typeof passed === "number" && typeof total === "number" && total > 0 && passed >= 0 && passed <= total ? `FAIL ${passed}/${total}` : "FAIL";

/** Which reaction an answered quiz option gets. */
export const answerFx = (right: boolean) => (right ? { word: "HIGH", glitch: false } : { word: "LOW", glitch: true });

function go(f: (m: Awaited<ReturnType<typeof load>>) => void) { if (!reduced()) load().then(f).catch(() => {}); }

export const signal = {
  run(el: Element | null) {
    if (!el) return;
    go(([e, l]) => { const r = el.getBoundingClientRect(); l.play(e.clockSweep({ x: r.left, y: r.top, w: r.width, h: r.height })); });
  },
  result(el: Element | null, ok: boolean) {
    if (!el) return;
    go(([e, l]) => l.play(e.word(ok ? "OK" : "ERR", l.at(el, 0.5, -0.4), ok ? e.PHOSPHOR : e.DANGER, 20, 0.6)));
  },
  pass(el: Element | null) {
    if (!el) return;
    go(([e, l]) => { const p = l.at(el, 0.5, 0.5); l.play(e.burst(p), e.pulse(p, e.GLOW, 48), e.word("PASS", l.at(el, 0.5, -0.6))); });
  },
  fail(el: Element | null, passed?: number | null, total?: number | null, panel?: Element | null) {
    if (!el) return;
    go(([e, l]) => { const p = l.at(el, 0.5, 0.5); l.play(e.sparks(p, e.DANGER, 10), e.word(failLabel(passed, total), l.at(el, 0.5, -0.6), e.DANGER)); l.flash(panel ?? el, "sig-glitch", 260); });
  },
  xp(from: Pt | null, to: Element | null, onArrive?: () => void) {
    // No target, a hidden one (e.g. the toolbar's XP on a phone), or reduced motion: just arrive.
    if (!to || reduced() || to.getBoundingClientRect().width === 0) { onArrive?.(); return; }
    load().then(([e, l]) => {
      const start = from ?? { x: innerWidth / 2, y: innerHeight / 2 }, end = l.at(to);
      l.play(e.trace(start, end, 6, 0.9, () => { l.play(e.pulse(end, e.GOLD, 22, 0.35)); onArrive?.(); }));
    }).catch(() => onArrive?.());
  },
  quest(el: Element | null) {
    if (!el) return;
    go(([e, l]) => { const p = l.at(el, 0.5, 0.5); l.play(e.burst(p, e.GOLD), e.sparks(p), e.bitSpray(p), e.word("SYNC", l.at(el, 0.5, 0))); });
  },
  answer(el: Element | null, right: boolean) {
    if (!el) return;
    const fx = answerFx(right);
    go(([e, l]) => {
      const p = l.at(el, 0.92, 0.5);
      l.play(e.word(fx.word, p, right ? e.PHOSPHOR : e.DANGER, 22, 0.65), ...(right ? [e.sparks(p, e.GLOW, 8)] : []));
      if (fx.glitch) l.flash(el, "sig-glitch", 260);
    });
  },
  glint(el: Element | null) {
    if (!el) return;
    go(([e, l]) => l.play(e.kira(l.at(el, 0.78, 0.22))));
  },
};
