/**
 * lib/ascii-chips/chips.ts — the flock BitFlow shows: ICs drifting across the page as ASCII.
 *
 * One Animal for a mixed crowd. Each chip is one of KINDS, and a kind is just a sampler: given a point
 * in body coordinates (u along the package, v across, as fractions of its size) it says what is there
 * (package, pin, marking, a lit segment) or nothing. Chips hold the flock's course, keep apart, rock
 * gently about a square-on resting angle (ASCII reads best that way) and leave a faint trail. Self-check: scripts/ascii-chips.check.ts.
 */
import { HEX_SEGS } from "../board-io";
import { SHARED_TUNING, type Animal, type Creature } from "./flock";
import { INK_DARK, INK_GLOW, INK_LIT, INK_SCALE, INK_SPOT, ink, type Ink, type RGB } from "./ink";
import { frac, hash3, rand } from "./math";
import { inEllipse } from "./shapes";

const PACKAGE: RGB = [0, 70, 42];
const MARK: RGB = [0, 128, 70];
const PIN: RGB = [0, 232, 122];
const LIT: RGB = [0, 255, 136];
const GOLD: RGB = [255, 184, 77];

const body = (out: Ink) => ink(out, ...PACKAGE, INK_LIT, "#%");
const pin = (out: Ink) => ink(out, ...PIN, INK_SCALE, "=");
const pin1 = (out: Ink) => ink(out, ...GOLD, INK_SPOT, "o");
const box = (u: number, v: number, hu: number, hv: number) => Math.abs(u) <= hu && Math.abs(v) <= hv;
/** On one of a row of pins `pitch` apart, centred on 0? */
const onPin = (x: number, pitch: number) => Math.abs(frac(x / pitch) - 0.5) < 0.24;

export interface ChipKind {
  name: string;
  /** How far from the centre the sampler can hit, as a fraction of size. */
  reach: number;
  /** Cruising speed relative to the flock's. */
  pace: number;
  /** How fast it rocks on its own axis, rad/s. */
  rock: number;
  /** t: seconds, for anything that blinks or counts; id: the chip's own, so they don't all do it together. */
  sample(u: number, v: number, out: Ink, t: number, id: number): boolean;
}

export const KINDS: ChipKind[] = [
  {
    // Dual in-line package: a long body, a notch at one end, eight legs a side.
    name: "dip", reach: 0.52, pace: 1, rock: 0.5,
    sample(u, v, out) {
      const av = Math.abs(v);
      if (box(u, v, 0.42, 0.15)) {
        if (Math.hypot(u - 0.42, v) < 0.06) return false;
        if (Math.hypot(u - 0.31, v - 0.08) < 0.035) return pin1(out);
        if (av < 0.03 && Math.abs(u) < 0.24) return ink(out, ...MARK, INK_DARK, "-");
        return body(out);
      }
      return av <= 0.25 && Math.abs(u) < 0.41 && onPin(u, 0.1025) && pin(out);
    },
  },
  {
    // Quad flat package: square, pins on all four sides, a die outline in the middle.
    name: "qfp", reach: 0.56, pace: 0.85, rock: 0.8,
    sample(u, v, out) {
      const au = Math.abs(u), av = Math.abs(v);
      if (box(u, v, 0.28, 0.28)) {
        if (Math.hypot(u - 0.2, v + 0.2) < 0.035) return pin1(out);
        const ring = Math.max(au, av);
        if (ring > 0.11 && ring < 0.15) return ink(out, ...MARK, INK_DARK, "+");
        return body(out);
      }
      if (au <= 0.38 && av < 0.26) return onPin(v, 0.087) && pin(out);
      return av <= 0.38 && au < 0.26 && onPin(u, 0.087) && pin(out);
    },
  },
  {
    // Ball grid array, seen from the ball side: every ball flickers on its own clock.
    name: "bga", reach: 0.5, pace: 0.7, rock: 0.35,
    sample(u, v, out, t, id) {
      if (!box(u, v, 0.33, 0.33)) return false;
      const col = Math.floor(u / 0.11 + 0.5), row = Math.floor(v / 0.11 + 0.5);
      if (Math.hypot(u - col * 0.11, v - row * 0.11) > 0.036) return body(out);
      const glow = 0.55 + 0.45 * Math.sin(t * 2.4 + hash3(col, row, id) * 40);
      return ink(out, LIT[0], LIT[1] * glow, LIT[2] * glow, INK_LIT, "o");
    },
  },
  {
    // Small-outline IC: little and quick, four legs a side.
    name: "soic", reach: 0.36, pace: 1.35, rock: 0.9,
    sample(u, v, out) {
      if (box(u, v, 0.26, 0.12)) return Math.hypot(u - 0.19, v - 0.06) < 0.035 ? pin1(out) : body(out);
      return Math.abs(v) <= 0.2 && Math.abs(u) < 0.25 && onPin(u, 0.125) && pin(out);
    },
  },
  {
    // LED: a dome on two legs, blinking, with a halo while it's lit.
    name: "led", reach: 0.5, pace: 1.1, rock: 0.7,
    sample(u, v, out, t, id) {
      const on = Math.sin(t * 2.2 + id * 1.9) > -0.2;
      if (inEllipse(u, v, 0.12, 0, 0.2, 0.18)) {
        return on ? ink(out, ...LIT, INK_LIT, "*+") : ink(out, ...MARK, INK_DARK, "+");
      }
      if (u < -0.06 && u > -0.44 && Math.abs(Math.abs(v) - 0.07) < 0.022) return pin(out);
      return on && inEllipse(u, v, 0.12, 0, 0.36, 0.34) && ink(out, ...PIN, INK_GLOW);
    },
  },
  {
    // Seven-segment digit, counting in hex (u runs up the digit).
    name: "seg7", reach: 0.46, pace: 0.9, rock: 0.3,
    sample(u, v, out, t, id) {
      if (!box(u, v, 0.36, 0.24)) return false;
      const lit = HEX_SEGS[Math.floor(t * 0.7 + id * 3) % 16];
      const au = Math.abs(u), av = Math.abs(v);
      // Segments a…g, as bits 0…6: three bars across (a top, g middle, d bottom) and four uprights.
      let seg = -1;
      if (av < 0.1 && Math.abs(au - 0.25) < 0.03) seg = u > 0 ? 0 : 3;
      else if (av < 0.1 && au < 0.03) seg = 6;
      else if (Math.abs(av - 0.13) < 0.03 && au > 0.04 && au < 0.22) seg = v > 0 ? (u > 0 ? 1 : 2) : (u > 0 ? 5 : 4);
      if (seg < 0) return body(out);
      return (lit >> seg) & 1 ? ink(out, ...LIT, INK_LIT, "#") : ink(out, ...MARK, INK_DARK, ".");
    },
  },
];

interface Chip extends Creature {
  /** Index into KINDS. */
  kind: number;
  /** Which way the package faces, radians: its own, not its direction of travel. */
  angle: number;
  /** The angle it rocks about: square to the screen, give or take. */
  rest: number;
}

export const chips: Animal<Chip> = {
  key: "chips",
  defaults: {
    ...SHARED_TUNING,
    density: 1,
    direction: 24,
    sway: 0.05,
    spread: 0.3,
    farthest: 0.5,
    farBias: 1.1,
    shimmer: 0,
    sparkle: 0.03,
    fog: 0.55,
    trail: 1.6,
    trailFade: 0.9,
    detail: 1.7,
  },
  area: 150000,
  max: 60,
  scale: 1.35,
  speed: 26,
  trail: PIN,

  create(c) {
    const kind = Math.floor(hash3(c.id, 5, 11) * KINDS.length);
    const rest = Math.floor(rand(0, 4)) * (Math.PI / 2) + rand(-0.2, 0.2);
    return { ...c, kind, angle: rest, rest };
  },

  update(c, flock, dt) {
    const k = flock.tuning;
    const speed = flock.cruise(c) * KINDS[c.kind].pace;
    flock.begin();
    flock.steer(c, flock.heading + c.bias * k.spread, speed, k.grip);
    flock.separate(c);
    flock.move(c, dt, speed * 1.5);
    c.angle = c.rest + 0.22 * Math.sin(flock.time * KINDS[c.kind].rock + c.id);
    if (flock.passed(c)) flock.reenter(c);
  },

  draw(c, pen) {
    const kind = KINDS[c.kind];
    const pose = { x: c.x, y: c.y, heading: c.angle, span: c.span, depth: c.depth, id: c.id };
    pen.shape(pose, kind.reach, (u, v) => kind.sample(u, v, pen.ink, pen.t, c.id));
    pen.shed(c.x, c.y, 0.02 * c.depth);
  },
};
