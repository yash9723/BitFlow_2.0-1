/**
 * lib/ascii-chips/chips.ts — the flock BitFlow shows: ICs drifting across the page as ASCII.
 *
 * One Animal for a mixed crowd. Each chip is one of KINDS, and a kind is just a sampler: given a point
 * in body coordinates (u along the package, v across, as fractions of its size) it says what is there
 * (package face, bevelled rim, etched lettering, a lead's shoulder or foot, a lit segment) or nothing.
 * Chips hold the flock's course, keep apart, rock gently about a square-on resting angle (ASCII reads
 * best that way) and leave a faint trail. Self-check: scripts/ascii-chips.check.ts.
 */
import { HEX_SEGS } from "../board-io";
import { SHARED_TUNING, type Animal, type Creature } from "./flock";
import { INK_DARK, INK_GLOW, INK_LIT, INK_SCALE, INK_SPOT, ink, type Ink, type RGB } from "./ink";
import { frac, hash3, rand } from "./math";
import { inEllipse } from "./shapes";

const PACKAGE: RGB = [0, 70, 42];
const EDGE: RGB = [0, 118, 68];
const MARK: RGB = [0, 128, 70];
const SHOULDER: RGB = [0, 140, 80];
const PIN: RGB = [0, 232, 122];
const LIT: RGB = [0, 255, 136];
const GOLD: RGB = [255, 184, 77];
const GLINT: RGB = [205, 255, 228];

/** The package's top face: a dark block with a faint grain. */
const body = (out: Ink) => ink(out, ...PACKAGE, INK_LIT, ".:");
/** The lighter rim where the top face turns down to the sides. */
const bevel = (out: Ink) => ink(out, ...EDGE, INK_LIT, "=");
/** Part-number lettering etched into the package: each cell keeps its own character. */
const etched = (out: Ink) => ink(out, ...PACKAGE, INK_LIT, "BF74HC0138");
/** A lead, `along` running 0 at the package to 1 at its tip: a dim shoulder, then a bright foot. */
const lead = (out: Ink, along: number) => ink(out, ...(along > 0.5 ? PIN : SHOULDER), INK_SCALE, "=");
const pin1 = (out: Ink) => ink(out, ...GOLD, INK_SPOT, "o");
const box = (u: number, v: number, hu: number, hv: number) => Math.abs(u) <= hu && Math.abs(v) <= hv;
/** On one of a row of leads `pitch` apart, centred on 0? `half` is half a lead's width, as a share of the pitch. */
const onPin = (x: number, pitch: number, half = 0.24) => Math.abs(frac(x / pitch) - 0.5) < half;

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
    // Dual in-line package: a long body with a notch at one end, two rows of lettering, eight leads a side.
    name: "dip", reach: 0.52, pace: 1, rock: 0.5,
    sample(u, v, out) {
      const au = Math.abs(u), av = Math.abs(v);
      if (box(u, v, 0.42, 0.15)) {
        if (Math.hypot(u - 0.42, v) < 0.07) return false;
        if (Math.hypot(u - 0.33, v - 0.085) < 0.03) return pin1(out);
        if (au > 0.39 || av > 0.122) return bevel(out);
        if (au < 0.27 && Math.abs(av - 0.06) < 0.026) return etched(out);
        return body(out);
      }
      return av <= 0.25 && au < 0.41 && onPin(u, 0.1025) && lead(out, (av - 0.15) / 0.1);
    },
  },
  {
    // Quad flat package: square with a chamfered pin-1 corner, eight leads a side, a die outline around a logo block.
    name: "qfp", reach: 0.56, pace: 0.85, rock: 0.8,
    sample(u, v, out) {
      const au = Math.abs(u), av = Math.abs(v), ring = Math.max(au, av);
      if (ring <= 0.28) {
        if (u - v > 0.48) return false;
        if (Math.hypot(u - 0.18, v + 0.18) < 0.03) return pin1(out);
        if (ring > 0.25 || u - v > 0.44) return bevel(out);
        if (ring < 0.055) return ink(out, ...LIT, INK_LIT, "#");
        if (ring > 0.105 && ring < 0.135) return ink(out, ...MARK, INK_DARK, "+");
        if (au < 0.19 && Math.abs(v - 0.195) < 0.026) return etched(out);
        return body(out);
      }
      if (au <= 0.38 && av < 0.25) return onPin(v, 0.0625) && lead(out, (au - 0.28) / 0.1);
      return av <= 0.38 && au < 0.25 && onPin(u, 0.0625) && lead(out, (av - 0.28) / 0.1);
    },
  },
  {
    // Ball grid array, seen from the ball side: a substrate rim, a corner fiducial, a heat spreader in the
    // middle, and balls that each flicker on their own clock.
    name: "bga", reach: 0.5, pace: 0.7, rock: 0.35,
    sample(u, v, out, t, id) {
      const ring = Math.max(Math.abs(u), Math.abs(v));
      if (ring > 0.33) return false;
      if (u - v > 0.57) return pin1(out);
      if (ring > 0.305) return bevel(out);
      if (ring < 0.135) return ring > 0.11 ? bevel(out) : etched(out);
      const col = Math.floor(u / 0.09 + 0.5), row = Math.floor(v / 0.09 + 0.5);
      if (Math.hypot(u - col * 0.09, v - row * 0.09) > 0.03) return body(out);
      const glow = 0.55 + 0.45 * Math.sin(t * 2.4 + hash3(col, row, id) * 40);
      return ink(out, LIT[0], LIT[1] * glow, LIT[2] * glow, INK_LIT, "o");
    },
  },
  {
    // Small-outline IC: little and quick, one row of lettering, four gull-wing leads a side.
    name: "soic", reach: 0.36, pace: 1.35, rock: 0.9,
    sample(u, v, out) {
      const au = Math.abs(u), av = Math.abs(v);
      if (box(u, v, 0.26, 0.12)) {
        if (Math.hypot(u - 0.19, v - 0.06) < 0.028) return pin1(out);
        if (au > 0.235 || av > 0.095) return bevel(out);
        if (au < 0.14 && av < 0.028) return etched(out);
        return body(out);
      }
      // A gull-wing lead: a narrow shoulder that widens into the foot.
      const along = (av - 0.12) / 0.08;
      return av <= 0.2 && au < 0.25 && onPin(u, 0.125, along > 0.5 ? 0.34 : 0.18) && lead(out, along);
    },
  },
  {
    // LED: a dome with a flat on the cathode side and a glint on the lens, two legs (the anode the longer),
    // blinking, with a halo while it is lit.
    name: "led", reach: 0.5, pace: 1.1, rock: 0.7,
    sample(u, v, out, t, id) {
      const on = Math.sin(t * 2.2 + id * 1.9) > -0.2;
      if (inEllipse(u, v, 0.12, 0, 0.2, 0.18) && v > -0.14) {
        if (inEllipse(u, v, 0.19, 0.06, 0.05, 0.045)) return ink(out, ...(on ? GLINT : EDGE), INK_LIT, "*");
        if (!inEllipse(u, v, 0.12, 0, 0.16, 0.14)) return on ? ink(out, ...PIN, INK_LIT, "+") : bevel(out);
        return on ? ink(out, ...LIT, INK_LIT, "*+") : ink(out, ...MARK, INK_DARK, "+");
      }
      if (u < -0.06 && u > (v > 0 ? -0.46 : -0.38) && Math.abs(Math.abs(v) - 0.07) < 0.022) return lead(out, (-0.06 - u) / 0.4);
      return on && inEllipse(u, v, 0.12, 0, 0.36, 0.34) && ink(out, ...PIN, INK_GLOW);
    },
  },
  {
    // Seven-segment digit in a bezel, counting in hex (u runs up the digit); the decimal point lights on odd digits.
    name: "seg7", reach: 0.46, pace: 0.9, rock: 0.3,
    sample(u, v, out, t, id) {
      if (!box(u, v, 0.36, 0.24)) return false;
      const digit = Math.floor(t * 0.7 + id * 3) % 16, lit = HEX_SEGS[digit];
      const au = Math.abs(u), av = Math.abs(v);
      if (au > 0.33 || av > 0.21) return bevel(out);
      // Segments a…g, as bits 0…6: three bars across (a top, g middle, d bottom) and four uprights.
      let seg = -1, glowing = false;
      if (av < 0.1 && Math.abs(au - 0.25) < 0.03) seg = u > 0 ? 0 : 3;
      else if (av < 0.1 && au < 0.03) seg = 6;
      else if (Math.abs(av - 0.13) < 0.03 && au > 0.04 && au < 0.22) seg = v > 0 ? (u > 0 ? 1 : 2) : (u > 0 ? 5 : 4);
      if (seg >= 0) glowing = ((lit >> seg) & 1) === 1;
      else if (Math.hypot(u + 0.27, v - 0.185) < 0.024) glowing = (digit & 1) === 1;
      else return body(out);
      return glowing ? ink(out, ...LIT, INK_LIT, "#") : ink(out, ...MARK, INK_DARK, ".");
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
  area: 95000,
  max: 60,
  scale: 1.15,
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
