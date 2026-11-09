"use client";
/**
 * components/academy/anim/scene3d.tsx — the Academy's four 3D animations. Each one is a scene (this file) around the state in
 * lib/academy/scene3d.ts: the scene only turns "what is on at step i" into colours and positions, and eases between them.
 * Frame, controls, fallback and narration come from Stage3D.tsx; the flat version of each is the existing 2D animation
 * (or, for the chip layers, a stacked drawing from the same data).
 */
import { useMemo } from "react";
import { THREE, type Pose, type Scene3D, type Stage, approach, box, canvasTexture, label, std } from "@/lib/3d/stage";
import {
  FABRIC, FABRIC_FROM, FABRIC_LUT, FABRIC_TO, LAYERS, MEM, MEM_DATA, MEM_ROW,
  cmosCutawaySteps, fabricRoute, fabricSteps, layerSteps, memorySteps,
} from "@/lib/academy/scene3d";
import Anim3D from "./Stage3D";
import { BAD, BUS, INK, LINE, OFF, ON, WARN } from "./Player";
import { CmosGate } from "./hardware";
import { DramRefresh, LutExplorer, MemoryGrid } from "./systems";

// ── Things the scenes share ───────────────────────────────────────────────────
interface Lit { m: THREE.MeshStandardMaterial; off: THREE.Color; on: THREE.Color; cur: number; to: number; amp: number }
const makeLit = (m: THREE.MeshStandardMaterial, off: string, on: string, amp = 0.9): Lit => {
  m.color.set(off); m.emissive.set(on); m.emissiveIntensity = 0;
  return { m, off: new THREE.Color(off), on: new THREE.Color(on), cur: 0, to: 0, amp };
};
const stepLits = (lits: Lit[], dt: number, instant: boolean) => {
  let moving = false;
  for (const l of lits) {
    const a = approach(l.cur, l.to, dt, instant); l.cur = a.v; moving = moving || a.moving;
    l.m.color.lerpColors(l.off, l.on, l.cur); l.m.emissiveIntensity = l.cur * l.amp;
  }
  return moving;
};
/** A mesh that lights up, kept in `lits`. */
const litBox = (parent: THREE.Object3D, lits: Lit[], w: number, h: number, d: number, x: number, y: number, z: number, off: string, on: string, amp?: number) => {
  const l = makeLit(std(off), off, on, amp); lits.push(l);
  return { mesh: box(parent, w, h, d, l.m, x, y, z), lit: l };
};

/** Dots that run along a path while `set(1)`; positions only advance when motion is allowed. */
function makeFlow(parent: THREE.Object3D, pts: THREE.Vector3[], color: string, n = 6) {
  const seg: number[] = [0]; for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = seg[seg.length - 1], geo = new THREE.SphereGeometry(0.17, 12, 8);
  const dots = Array.from({ length: n }, () => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0 })); m.visible = false; parent.add(m); return m; });
  let amount = 0, to = 0, t = 0;
  const at = (u: number) => {
    const d = u * total; let i = 1; while (i < seg.length - 1 && seg[i] < d) i++;
    const k = (d - seg[i - 1]) / Math.max(1e-6, seg[i] - seg[i - 1]); return pts[i - 1].clone().lerp(pts[i], Math.min(1, Math.max(0, k)));
  };
  return {
    set(v: number) { to = v; },
    tick(dt: number, instant: boolean) {
      const a = approach(amount, to, dt, instant, 5); amount = a.v;
      if (!instant) t += dt * 0.4;
      dots.forEach((d, k) => { d.visible = amount > 0.03; (d.material as THREE.MeshBasicMaterial).opacity = amount; if (d.visible) d.position.copy(at(((t + k / n) % 1 + 1) % 1)); });
      return a.moving || (amount > 0.03 && !instant);
    },
  };
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ── 1. A CMOS inverter, cut open ──────────────────────────────────────────────
const CMOS_POSE: Pose = { az: -24, el: 22, dist: 17.5, target: [0, 0.1, 0] };
const CMOS_POSES = [CMOS_POSE, CMOS_POSE, { ...CMOS_POSE, az: 10 }, { ...CMOS_POSE, az: -24 }];

function buildCmos(stage: Stage): Scene3D {
  const root = new THREE.Group(); stage.scene.add(root);
  const steps = cmosCutawaySteps(), lits: Lit[] = [];
  const W = 5.42;
  box(root, 15, 1.6, 5.4, std("#38406a"), 0, -0.8, 0);                                   // p-type substrate
  box(root, 7.2, 1.02, W, std("#6b5230"), 3.6, -0.49, 0);                                // n-well
  // sources and drains: n+ in the substrate (left), p+ in the well (right)
  for (const x of [-5.3, -1.7]) box(root, 1.4, 0.5, W, std("#d08a3a"), x, -0.24, 0);
  for (const x of [1.7, 5.3]) box(root, 1.4, 0.5, W, std("#3aa6c4"), x, -0.24, 0);
  // channels (light up when the transistor conducts)
  const nCh = litBox(root, lits, 2.2, 0.3, W, -3.5, -0.14, 0, "#2d3250", BUS, 1.6);
  const pCh = litBox(root, lits, 2.2, 0.3, W, 3.5, -0.14, 0, "#5a4630", ON, 1.6);
  // gate oxide and polysilicon gates
  for (const x of [-3.5, 3.5]) box(root, 2.2, 0.12, 4.8, std("#8fd0ff", { transparent: true, opacity: 0.7 }), x, 0.06, 0);
  const gates = [-3.5, 3.5].map((x) => litBox(root, lits, 2.2, 0.45, 4.8, x, 0.4, 0, "#8f879c", ON, 0.28));
  // wiring: input bar to both gates; output bar behind; supply and ground posts in front
  const input = litBox(root, lits, 7.2, 0.18, 0.18, 0, 1.5, 0, "#6c7388", ON, 0.9);
  const inPosts = [-3.5, 3.5].map((x) => litBox(root, lits, 0.18, 1.0, 0.18, x, 1.0, 0, "#6c7388", ON, 0.9));
  const outBar = litBox(root, lits, 7.0, 0.2, 0.2, 1.8, 2.3, -1.2, "#6c7388", ON, 0.9);
  const outPosts = [-1.7, 5.3].map((x) => litBox(root, lits, 0.2, 2.3, 0.2, x, 1.15, -1.2, "#6c7388", ON, 0.9));
  const vdd = litBox(root, lits, 0.22, 3.1, 0.22, 1.7, 1.55, 1.2, "#6c7388", ON, 0.9);
  const vddRail = litBox(root, lits, 1.8, 0.22, 0.22, 1.7, 3.1, 1.2, "#6c7388", ON, 0.9);
  const gnd = litBox(root, lits, 0.22, 3.1, 0.22, -5.3, 1.55, 1.2, "#6c7388", BUS, 0.9);
  const gndRail = litBox(root, lits, 1.8, 0.22, 0.22, -5.3, 3.1, 1.2, "#6c7388", BUS, 0.9);
  const node = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshStandardMaterial({ color: "#6c7388", emissive: new THREE.Color(ON), emissiveIntensity: 0 }));
  node.position.set(1.8, 2.3, -1.2); root.add(node);

  label(root, "p-type silicon", -5.6, -1.2, 3.1, { size: 0.55 }); label(root, "n-well", 5.6, -1.2, 3.1, { size: 0.55 });
  label(root, "NMOS", -1.9, -1.8, 3.1, { color: BUS }); label(root, "PMOS", 3.5, -1.8, 3.1, { color: ON });
  label(root, "gate", -3.5, 0.95, 3.0, { size: 0.5 }); label(root, "source", -5.5, 0.9, 3.0, { size: 0.45 }); label(root, "drain", -1.5, 0.9, 3.0, { size: 0.45 }); label(root, "channel", -3.5, -0.9, 3.2, { size: 0.45, color: BUS });
  label(root, "Vdd (1)", 2.4, 3.8, 1.2, { color: ON }); label(root, "GND (0)", -5.3, 3.8, 1.2, { color: BUS });
    const outL = [label(root, "out = ?", -1.6, 3.0, -1.2, { color: INK }), label(root, "out = 0", -1.6, 3.0, -1.2, { color: BUS }), label(root, "out = 1", -1.6, 3.0, -1.2, { color: ON })];
  const inL = [label(root, "in = 0", 0, 2.2, 0.6, { color: BUS, size: 0.5 }), label(root, "in = 1", 0, 2.2, 0.6, { color: ON, size: 0.5 })];

  const up = makeFlow(root, [V(1.7, 3.1, 1.2), V(1.7, -0.12, 1.2), V(5.3, -0.12, 1.2), V(5.3, -0.12, -1.2), V(5.3, 2.3, -1.2), V(1.8, 2.3, -1.2)], ON);
  const down = makeFlow(root, [V(1.8, 2.3, -1.2), V(-1.7, 2.3, -1.2), V(-1.7, -0.12, -1.2), V(-1.7, -0.12, 1.2), V(-5.3, -0.12, 1.2), V(-5.3, 3.1, 1.2)], BUS);
  const outColor = new THREE.Color("#6c7388"), outTarget = new THREE.Color(ON); let outAmp = 0, outAmpTo = 0;

  const apply = (i: number, instant: boolean) => {
    const st = steps[i], on = st.a === 1, hi = st.y === 1;
    inL.forEach((l, k) => { l.visible = st.a === k; }); outL.forEach((l, k) => { l.visible = (st.y === null ? 0 : st.y === 0 ? 1 : 2) === k; });
    gates.forEach((g) => { g.lit.to = on ? 1 : 0; }); input.lit.to = on ? 1 : 0; inPosts.forEach((p) => { p.lit.to = on ? 1 : 0; });
    pCh.lit.to = st.pmosOn ? 1 : 0; nCh.lit.to = st.nmosOn ? 1 : 0;
    vdd.lit.to = vddRail.lit.to = st.pmosOn ? 1 : 0.15; gnd.lit.to = gndRail.lit.to = st.nmosOn ? 1 : 0.15;
    outPosts[1].lit.to = st.pmosOn ? 1 : 0; outPosts[0].lit.to = st.nmosOn ? 1 : 0;
    outBar.lit.to = st.y === null ? 0 : 1; outTarget.set(hi ? ON : BUS); outBar.lit.on.set(hi ? ON : BUS); outAmpTo = st.y === null ? 0 : 1;
    up.set(st.pmosOn ? 1 : 0); down.set(st.nmosOn ? 1 : 0);
    if (instant) { tick(0, true); stage.request(); }
  };
  const tick = (dt: number, instant: boolean) => {
    let m = stepLits(lits, dt, instant);
    const a = approach(outAmp, outAmpTo, dt, instant); outAmp = a.v; m = m || a.moving;
    (node.material as THREE.MeshStandardMaterial).emissive.copy(outTarget); (node.material as THREE.MeshStandardMaterial).emissiveIntensity = outAmp;
    (node.material as THREE.MeshStandardMaterial).color.copy(outColor).lerp(outTarget, outAmp * 0.6);
    const f1 = up.tick(dt, instant), f2 = down.tick(dt, instant);
    return m || f1 || f2;
  };
  void vddRail; void gndRail; void LINE;
  return { apply, tick };
}

export function CmosCutaway3D() {
  const steps = useMemo(() => cmosCutawaySteps(), []);
  return (
    <Anim3D
      title="A CMOS inverter, cut open" hint="A cross-section of the silicon. Step through the input and watch which transistor forms a channel and where the current goes."
      steps={steps.length} poses={CMOS_POSES} Flat={CmosGate} build={buildCmos}
      caption={(i) => steps[i].caption}
      describe={(i) => steps[i].a === null ? "A cutaway of the two transistors in an inverter." : `Input ${steps[i].a}: the ${steps[i].pmosOn ? "PMOS" : "NMOS"} conducts and the output is ${steps[i].y}.`}
    />
  );
}

// ── 2. An FPGA's fabric ───────────────────────────────────────────────────────
const S = 4.4;
const cx = (i: number) => (i - (FABRIC.cols - 1) / 2) * S, cz = (j: number) => (j - (FABRIC.rows - 1) / 2) * S;
const sx = (i: number) => (i - FABRIC.cols / 2) * S, sz = (j: number) => (j - FABRIC.rows / 2) * S;
const FAB_POSES: Pose[] = [
  { az: -18, el: 42, dist: 27, target: [0, 0, 0] },
  { az: -22, el: 30, dist: 15, target: [cx(FABRIC_FROM.i), 1.8, cz(FABRIC_FROM.j)] },
  { az: -22, el: 30, dist: 15, target: [cx(FABRIC_FROM.i), 1.8, cz(FABRIC_FROM.j)] },
  { az: -22, el: 30, dist: 15, target: [cx(FABRIC_FROM.i), 1.8, cz(FABRIC_FROM.j)] },
  { az: -22, el: 30, dist: 15, target: [cx(FABRIC_FROM.i), 1.8, cz(FABRIC_FROM.j)] },
  { az: -12, el: 48, dist: 27, target: [0, 0, 0] },
];

function buildFabric(stage: Stage): Scene3D {
  const root = new THREE.Group(); stage.scene.add(root);
  const steps = fabricSteps(), lits: Lit[] = [], route = fabricRoute(FABRIC_FROM, FABRIC_TO);
  box(root, FABRIC.cols * S + 1.2, 0.4, FABRIC.rows * S + 1.2, std("#1b222b"), 0, -0.3, 0);
  for (let j = 0; j <= FABRIC.rows; j++) box(root, FABRIC.cols * S, 0.1, 0.13, std("#39414f"), 0, 0.06, sz(j));
  for (let i = 0; i <= FABRIC.cols; i++) box(root, 0.13, 0.1, FABRIC.rows * S, std("#39414f"), sx(i), 0.06, 0);
  const clbMat = std("#2c3e52"), aMat = std("#2f5d49"), bMat = std("#2f4f6a");
  for (let i = 0; i < FABRIC.cols; i++) for (let j = 0; j < FABRIC.rows; j++) {
    const a = i === FABRIC_FROM.i && j === FABRIC_FROM.j, b = i === FABRIC_TO.i && j === FABRIC_TO.j;
    box(root, 2.6, 0.7, 2.6, a ? aMat : b ? bMat : clbMat, cx(i), 0.35, cz(j));
  }
  for (let i = 0; i <= FABRIC.cols; i++) for (let j = 0; j <= FABRIC.rows; j++) box(root, 0.5, 0.3, 0.5, std("#6b7384"), sx(i), 0.2, sz(j));
  label(root, "logic block", cx(FABRIC_FROM.i), 1.5, cz(FABRIC_FROM.j) + 1.9, { size: 0.5, color: ON });
  const nextL = label(root, "next block", cx(FABRIC_TO.i), 1.5, cz(FABRIC_TO.j) - 1.9, { size: 0.5, color: BUS });
  const overview = [label(root, "switch box", sx(3), 1.2, sz(3) + 0.6, { size: 0.45 }), label(root, "wiring channel", sx(2), 0.9, sz(0) - 0.6, { size: 0.45 })];

  // the route, lit when the signal travels it
  const segs: Lit[] = [];
  route.forEach((n, k) => {
    litBox(root, segs, 0.55, 0.42, 0.55, sx(n.i), 0.3, sz(n.j), "#6b7384", WARN, 1);
    if (k) { const p = route[k - 1], horizontal = p.j === n.j; litBox(root, segs, horizontal ? Math.abs(sx(n.i) - sx(p.i)) : 0.26, 0.2, horizontal ? 0.26 : Math.abs(sz(n.j) - sz(p.j)), (sx(n.i) + sx(p.i)) / 2, 0.16, (sz(n.j) + sz(p.j)) / 2, "#39414f", WARN, 1); }
  });
  lits.push(...segs);
  const flow = makeFlow(root, route.map((n) => V(sx(n.i), 0.55, sz(n.j))), WARN, 8);

  // the lifted look-up table above block A
  const lutG = new THREE.Group(); lutG.position.set(cx(FABRIC_FROM.i), 0.8, cz(FABRIC_FROM.j)); root.add(lutG);
  box(lutG, 3.0, 0.2, 2.2, std("#3a5a7a"), 0, 0, 0);
  const bits = FABRIC_LUT.map((b, k) => {
    const l = makeLit(std(b ? "#1d6b46" : "#242a36"), b ? "#1d6b46" : "#242a36", WARN, 1.1); lits.push(l);
    const m = box(lutG, 0.5, 0.35, 0.5, l.m, -1.05 + (k % 4) * 0.7, 0.28, k < 4 ? -0.35 : 0.35);
    if (b) l.m.emissive.set(ON), (l.m.emissiveIntensity = 0.35);
    return { m, l, one: b === 1 };
  });
  const ffLit = litBox(lutG, lits, 0.6, 0.45, 0.6, 1.8, 0.3, 0, "#3b4254", ON, 1.1);
  const inLits = [0, 1, 2].map((k) => litBox(lutG, lits, 0.12, 0.9, 0.12, -0.9 + k * 0.9, -0.5, 1.2, "#3b4254", ON, 1.2));
  label(lutG, "look-up table (8 bits)", 0, 1.25, 0, { size: 0.5, color: INK });
  label(lutG, "flip-flop", 1.8, 1.0, 0, { size: 0.42 });
  const inValues = ["a = 1", "b = 0", "c = 1"].map((t, k) => label(lutG, t, -0.9 + k * 0.9, -1.2, 1.3, { size: 0.4, color: t.endsWith("1") ? ON : BUS }));
  const addrL = label(lutG, "address 101 reads bit 5", -0.1, 2.35, 0, { size: 0.5, color: WARN });
  const outL = label(lutG, "output 1", 3.2, 0.5, 0, { size: 0.5, color: ON });
  let lut = 0, lutTo = 0, selected = -1;

  const apply = (i: number, instant: boolean) => {
    const st = steps[i];
    lutTo = st.lutUp ? 1 : 0; selected = st.address ?? -1;
    inLits.forEach((l, k) => { l.lit.to = st.inputs ? 1 : 0; l.lit.on.set(st.inputs && st.inputs[k] ? ON : BUS); }); inValues.forEach((v) => { v.visible = !!st.inputs; });
    bits.forEach((b, k) => { b.l.to = k === selected ? 1 : 0; });
    ffLit.lit.to = st.ff ? 1 : 0;
    segs.forEach((l) => { l.to = st.routed ? 1 : 0; }); flow.set(st.routed ? 1 : 0);
    addrL.visible = st.address !== null; outL.visible = st.address !== null; nextL.visible = st.routed || i === 0; overview.forEach((o) => { o.visible = i === 0 || i === steps.length - 1; });
    if (instant) { tick(0, true); stage.request(); }
  };
  const tick = (dt: number, instant: boolean) => {
    const a = approach(lut, lutTo, dt, instant, 5); lut = a.v;
    lutG.visible = lut > 0.01; lutG.scale.setScalar(Math.max(0.01, lut)); lutG.position.y = 0.8 + lut * 2.6;
    const m = stepLits(lits, dt, instant), f = flow.tick(dt, instant);
    return a.moving || m || f;
  };
  return { apply, tick };
}

export function FpgaFabric3D() {
  const steps = useMemo(() => fabricSteps(), []);
  return (
    <Anim3D
      title="Inside an FPGA: logic blocks and routing" hint="A grid of programmable blocks. Lift one block's look-up table out, step through what it does, and follow the result along the wiring."
      steps={steps.length} poses={FAB_POSES} Flat={LutExplorer} build={buildFabric} azLimit={55}
      caption={(i) => steps[i].caption}
      describe={(i) => `An FPGA's grid of logic blocks and switch boxes, step ${i + 1} of ${steps.length}.`}
    />
  );
}

// ── 3. A DRAM array ───────────────────────────────────────────────────────────
const MS = 2.6;
const mx = (c: number) => (c - (MEM.cols - 1) / 2) * MS, mz = (r: number) => (r - (MEM.rows - 1) / 2) * MS;
const MEM_POSE: Pose = { az: -28, el: 34, dist: 22, target: [0, 0.8, 1.0] };
const MEM_POSES = [MEM_POSE, { ...MEM_POSE, az: -16, el: 30 }, { ...MEM_POSE, az: -10, el: 26 }, MEM_POSE, MEM_POSE, MEM_POSE];

function buildMemory(stage: Stage): Scene3D {
  const root = new THREE.Group(); stage.scene.add(root);
  const steps = memorySteps(), lits: Lit[] = [];
  box(root, MEM.cols * MS + 3.2, 0.3, MEM.rows * MS + 5.4, std("#171d24"), 0, -0.15, 1.2);
  const words = Array.from({ length: MEM.rows }, (_, r) => litBox(root, lits, MEM.cols * MS + 1.2, 0.16, 0.16, 0, 0.5, mz(r), "#47506a", WARN, 1.1));
  const bitLines = Array.from({ length: MEM.cols }, (_, c) => litBox(root, lits, 0.16, 0.16, MEM.rows * MS + 3.2, mx(c), 0.12, 1.2, "#47506a", ON, 1.0));
  const transistors: Lit[][] = [], fills: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; cur: number; to: number }[] = [];
  const glass = std("#9fd4ff", { transparent: true, opacity: 0.16, roughness: 0.2 });
  for (let r = 0; r < MEM.rows; r++) { transistors.push([]); for (let c = 0; c < MEM.cols; c++) {
    transistors[r].push(litBox(root, lits, 0.75, 0.55, 0.75, mx(c), 0.45, mz(r), "#3b4254", WARN, 0.9).lit);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.7, 20, 1, true), glass); cyl.position.set(mx(c), 1.65, mz(r)); root.add(cyl);
    const fm = new THREE.MeshStandardMaterial({ color: ON, emissive: new THREE.Color(ON), emissiveIntensity: 0.35, roughness: 0.4 });
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.6, 20), fm); fill.position.set(mx(c), 0.9, mz(r)); root.add(fill);
    fills.push({ mesh: fill, mat: fm, cur: 1, to: 1 });
  } }
  const senses = Array.from({ length: MEM.cols }, (_, c) => litBox(root, lits, 1.0, 0.5, 1.0, mx(c), 0.25, mz(MEM.rows - 1) + 3.2, "#2a3040", ON, 1.2));
  box(root, 1.6, 0.9, MEM.rows * MS, std("#2d3a4c"), mx(0) - 3.4, 0.45, 0);
  label(root, "row decoder", mx(0) - 3.4, 1.5, mz(MEM.rows - 1) + 0.1, { size: 0.5 });
  label(root, "word line", mx(MEM.cols - 1) + 2.8, 0.9, mz(MEM_ROW), { size: 0.5, color: WARN });
  label(root, "bit line", mx(MEM.cols - 1) + 0.6, 0.4, mz(MEM.rows - 1) + 2.0, { size: 0.5, color: ON });
  label(root, "sense amplifiers", 0, 0.9, mz(MEM.rows - 1) + 4.2, { size: 0.5 });
  label(root, "capacitor holds the bit", mx(0), 3.0, mz(0), { size: 0.5 });
  label(root, "access transistor", mx(0) - 0.2, -0.7, mz(0) - 1.3, { size: 0.45 });
  // a ring at half height on every capacitor: a charge below it reads as 0
  const ring = new THREE.TorusGeometry(0.52, 0.025, 6, 24), ringMat = new THREE.MeshBasicMaterial({ color: WARN });
  for (let r = 0; r < MEM.rows; r++) for (let c = 0; c < MEM.cols; c++) { const t = new THREE.Mesh(ring, ringMat); t.rotation.x = Math.PI / 2; t.position.set(mx(c), 0.95, mz(r)); root.add(t); }
  label(root, "ring = halfway: below it a cell reads 0", mx(MEM.cols - 1) + 0.2, 2.9, mz(0) - 0.4, { size: 0.42, color: WARN });

  const apply = (i: number, instant: boolean) => {
    const st = steps[i];
    words.forEach((w, r) => { w.lit.to = st.row === r ? 1 : 0; });
    transistors.forEach((row, r) => row.forEach((l) => { l.to = st.row === r ? 1 : 0; }));
    bitLines.forEach((b, c) => { b.lit.to = st.senseRow ? 1 : 0; b.lit.on.set(st.senseRow && st.senseRow[c] ? ON : BUS); });
    senses.forEach((s, c) => { s.lit.to = st.senseRow ? 1 : 0; s.lit.on.set(st.senseRow && st.senseRow[c] ? ON : BUS); });
    fills.forEach((f, k) => { f.to = st.charge[k]; const gone = MEM_DATA[k] === 1 && st.charge[k] < 0.5; f.mat.color.set(gone ? BAD : ON); f.mat.emissive.set(gone ? BAD : ON); });
    if (instant) { tick(0, true); stage.request(); }
  };
  const tick = (dt: number, instant: boolean) => {
    let m = stepLits(lits, dt, instant);
    fills.forEach((f) => {
      const a = approach(f.cur, f.to, dt, instant, 4); f.cur = a.v; m = m || a.moving;
      const h = Math.max(0.03, f.cur * 1.6); f.mesh.scale.y = h / 1.6; f.mesh.position.y = 0.1 + h / 2 + 0.05;
      f.mesh.visible = f.cur > 0.02 || f.to > 0.02;
    });
    return m;
  };
  return { apply, tick };
}

export function MemoryArray3D() {
  const steps = useMemo(() => memorySteps(), []);
  return (
    <Anim3D
      title="Inside a DRAM array" hint="One transistor and one capacitor per bit. Select a row, read it, then watch the charge leak and a refresh save it."
      steps={steps.length} poses={MEM_POSES} Flat={DramFlat} build={buildMemory} azLimit={60}
      caption={(i) => steps[i].caption}
      describe={(i) => `A four by four DRAM array, step ${i + 1} of ${steps.length}. ${steps[i].lost ? `${steps[i].lost} bits have been lost.` : "No bits lost."}`}
    />
  );
}
function DramFlat() { return <div className="space-y-3"><DramRefresh /><MemoryGrid /></div>; }

// ── 4. The layers of a chip ───────────────────────────────────────────────────
const LAYER_H = 0.38, LAYER_GAP = 1.25;
const LSTEPS = layerSteps();
const LAYER_POSE: Pose = { az: -32, el: 24, dist: 25, target: [2.4, 4.2, 0] };
const LAYER_POSES = LSTEPS.map((st) => (st.gap ? { ...LAYER_POSE, target: [2.4, 4.2, 0] as [number, number, number] } : { ...LAYER_POSE, dist: 18, target: [2.4, 2.2, 0] as [number, number, number] }));
const layerY = (i: number, gap: number) => i * (LAYER_H + LAYER_GAP * gap);

function layerTexture(id: string) {
  const W = 512, H = 360, rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  return canvasTexture(W, H, (g) => {
    const fill = { wafer: "#4a5068", diffusion: "#38406a", gate: "#262c3e", contacts: "#242838", metal1: "#262a3a", mid: "#242838", top: "#262a3a", passivation: "#5fa8d6" }[id] ?? "#333";
    g.fillStyle = fill; g.fillRect(0, 0, W, H);
    if (id === "wafer") { g.strokeStyle = "rgba(255,255,255,.06)"; for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } }
    if (id === "diffusion") for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) { g.fillStyle = (r + c) % 2 ? "#d08a3a" : "#3aa6c4"; g.fillRect(24 + c * 60, 20 + r * 66, 40, 40); }
    if (id === "gate") { g.fillStyle = "#b7a7c9"; for (let c = 0; c < 8; c++) g.fillRect(40 + c * 60, 8, 10, H - 16); }
    if (id === "contacts") { g.fillStyle = "#c8ccd8"; for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) g.fillRect(28 + c * 40, 22 + r * 56, 9, 9); }
    if (id === "metal1") { g.fillStyle = "#d9a066"; for (let r = 0; r < 12; r++) g.fillRect(10, 14 + r * 29, W - 20 - (r % 3) * 70, 9); }
    if (id === "mid") { g.fillStyle = "#7fb0e0"; for (let c = 0; c < 14; c++) g.fillRect(24 + c * 34, 10, 9, H - 20 - (c % 3) * 60); g.fillStyle = "#c8ccd8"; for (let k = 0; k < 24; k++) g.fillRect(20 + rnd() * (W - 60), 20 + rnd() * (H - 60), 9, 9); }
    if (id === "top") { g.fillStyle = "#e0c07a"; for (let r = 0; r < 5; r++) g.fillRect(8, 24 + r * 66, W - 16, 24); }
    if (id === "passivation") { g.fillStyle = "#e0c07a"; for (let k = 0; k < 14; k++) { g.fillRect(14 + k * 34, 8, 22, 22); g.fillRect(14 + k * 34, H - 30, 22, 22); } }
  });
}

function buildLayers(stage: Stage): Scene3D {
  const root = new THREE.Group(); stage.scene.add(root);
  const layers = LAYERS.map((l, i) => {
    const side = new THREE.MeshStandardMaterial({ color: "#2d3348", roughness: 0.6, transparent: true });
    const top = new THREE.MeshStandardMaterial({ map: layerTexture(l.id), roughness: 0.5, transparent: true, emissive: new THREE.Color(ON), emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, LAYER_H, 7), [side, side, top, side, side, side]); root.add(mesh);
    if (l.id === "passivation") { side.opacity = 0.55; top.opacity = 0.7; }
    const tag = label(root, `${i + 1}  ${l.name}`, 5.6, 0, 0, { size: 0.5, color: INK }); tag.center.set(0, 0.5);
    return { mesh, side, top, tag, y: layerY(i, 1), cur: 0, to: 0, baseOpacity: l.id === "passivation" ? 0.7 : 1, glow: 0, glowTo: 0 };
  });
  let gap = 1, gapTo = 1;
  const apply = (i: number, instant: boolean) => {
    const st = LSTEPS[i]; gapTo = st.gap;
    layers.forEach((l, k) => { l.to = k < st.visible ? 1 : 0; l.glowTo = k === st.focus ? 0.1 : 0; });
    if (instant) { tick(0, true); stage.request(); }
  };
  const tick = (dt: number, instant: boolean) => {
    const g = approach(gap, gapTo, dt, instant, 4); gap = g.v; let m = g.moving;
    layers.forEach((l, k) => {
      const a = approach(l.cur, l.to, dt, instant, 6), b = approach(l.glow, l.glowTo, dt, instant, 8); l.cur = a.v; l.glow = b.v; m = m || a.moving || b.moving;
      l.y = layerY(k, gap) + (1 - l.cur) * 2.5;
      l.mesh.position.y = l.y; l.mesh.visible = l.cur > 0.02;
      l.top.opacity = l.cur * l.baseOpacity; l.side.opacity = l.cur * (l.baseOpacity < 1 ? 0.55 : 1); l.top.emissiveIntensity = l.glow;
      l.tag.position.set(5.6, layerY(k, 0.3 + 0.7 * gap) + (1 - l.cur) * 2.5, 0); l.tag.visible = l.cur > 0.5; (l.tag.material as THREE.SpriteMaterial).opacity = l.cur;
    });
    return m;
  };
  return { apply, tick };
}

/** Flat version: the same layers as a stack of bars. */
function LayersFlat() {
  return (
    <figure className="rounded-xl border border-phosphor/20 bg-pit p-4 space-y-3">
      <figcaption className="text-[14px] font-semibold text-bright">The layers of a chip, bottom to top</figcaption>
      <ol className="flex flex-col-reverse gap-1.5">
        {LAYERS.map((l, i) => (
          <li key={l.id} className="rounded border border-rim/60 px-3 py-2 text-[13px]" style={{ background: ["#4a5068", "#38406a", "#2f3446", "#262a3a", "#3a2f26", "#262e3c", "#3a3526", "#2a4a5f"][i], color: INK }}>
            <strong className="text-bright">{i + 1}. {l.name}.</strong> {l.role}
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-ghost">{LSTEPS[LSTEPS.length - 1].caption}</p>
    </figure>
  );
}

export function ChipLayers3D() {
  return (
    <Anim3D
      title="How a chip is built, layer by layer" hint="An exploded view of the layers, from the silicon up to the protective coat. Step through to add each one."
      steps={LSTEPS.length} poses={LAYER_POSES} Flat={LayersFlat} build={buildLayers} azLimit={60}
      caption={(i) => LSTEPS[i].caption}
      describe={(i) => (LSTEPS[i].focus >= 0 ? `${LSTEPS[i].visible} of ${LAYERS.length} layers shown, the latest is ${LAYERS[LSTEPS[i].focus].name}.` : "All the layers pressed together.")}
    />
  );
}
void BAD; void OFF;
