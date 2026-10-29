"use client";
/**
 * components/lab/Board3D.tsx — the Board Lab's board in 3D (three.js). Views (lib/lab/boards3d.ts):
 *   lab         the all-parts lab board, built in code: 6 LEDs, a 4-digit 7-segment display,
 *               an RGB LED, 2 buttons, 4 switches
 *   tangnano9k  a Tang Nano 9K, built in code to its layout: 6 LEDs, S1 / S2
 *   ulx3s, orangecrab   the real boards, exported from their KiCad designs (public/models), with
 *               lights and buttons placed on the footprints the design says they are
 * Drag to turn it, scroll to zoom; hold a button or click a switch to drive the design.
 * The caller feeds it brightness (0–1, the share of cycles a light was on, so PWM dims) through
 * handle.current.update() (a prop, not a ref: next/dynamic doesn't forward refs); it only draws
 * when something changed. Without WebGL it falls back to a flat drawing of the lights.
 */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { VIEWS, type ModelParts, type ViewId } from "@/lib/lab/boards3d";

/** leds[i], digits[d][segment] (d = 0 is the rightmost), rgb [r, g, b]: 0–1; btn / sw: 0 or 1. */
export interface BoardView { leds: number[]; digits: number[][]; rgb: number[]; btn: number[]; sw: number[] }
export interface BoardHandle { update(v: BoardView): void }
interface Props {
  /** Set to the board's update() once it is drawn. */
  handle: MutableRefObject<BoardHandle | null>;
  onButton: (i: number, down: boolean) => void;
  onSwitch: (i: number) => void;
  view?: ViewId;
  /** Colour of each LED on the lab board (CSS colour); default green. */
  ledColors?: string[];
  /** "Loading the ULX3S…", or null when the board is up. */
  onStatus?: (text: string | null) => void;
}

export const EMPTY_VIEW: BoardView = { leds: Array(6).fill(0), digits: Array.from({ length: 4 }, () => Array(8).fill(0)), rgb: [0, 0, 0], btn: [0, 0], sw: [0, 0, 0, 0] };
const LED_X = (i: number) => 5.3 - i * 0.9;            // LED 0 on the right
const DIGIT_X = (d: number) => 4.65 - d * 1.15;         // digit 0 on the right
const SW_X = (i: number) => -1.9 - i * 1.0;             // switch 0 on the right of the group
const BTN_X = (i: number) => 4.9 - i * 1.5;
const FRONT = 2.45, LED_Z = 0.55, DISPLAY_Z = -1.95, CHIP_X = -3.4, CHIP_Z = -0.9;
const GREEN = "#2bff88";
/** Every board is drawn 12 units across, so the camera fits them all the same way. */
const WIDTH = 12;
/** The ULX3S's LED colours, D0–D7, as fitted (from its KiCad values). */
const ULX3S_LEDS = ["#ff3030", "#ff9a1f", "#2bff6a", "#3d7bff", "#ff3030", "#ff9a1f", "#2bff6a", "#3d7bff"];
const TANG_LED = "#ffb030";

/** Segments a–g in a digit's top-view coordinates: [x, z, horizontal]. */
const SEGS: [number, number, boolean][] = [
  [0, -0.5, true], [0.27, -0.25, false], [0.27, 0.25, false], [0, 0.5, true], [-0.27, 0.25, false], [-0.27, -0.25, false], [0, 0, true],
];

function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const glowTexture = () => canvasTexture(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

/** Text and outlines on a board's top face; `at` maps board units (x, z) to the canvas. */
function silk(w: number, d: number, paint: (text: (s: string, x: number, z: number, size?: number) => void, at: (x: number, z: number) => [number, number], g: CanvasRenderingContext2D) => void) {
  const W = 1600, H = Math.round((1600 * d) / w);
  return canvasTexture(W, H, (g) => {
    const at = (x: number, z: number): [number, number] => [((x + w / 2) / w) * W, ((z + d / 2) / d) * H];
    g.fillStyle = "rgba(225,240,230,.85)"; g.strokeStyle = "rgba(225,240,230,.5)"; g.lineWidth = 3;
    g.textAlign = "center"; g.textBaseline = "middle";
    paint((s, x, z, size = 24) => { g.font = `600 ${size}px ui-monospace, monospace`; g.fillText(s, ...at(x, z)); }, at, g);
  });
}

const chipLabel = (lines: [string, string]) => canvasTexture(256, 256, (g) => {
  g.fillStyle = "#15181b"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(200,210,205,.75)"; g.textAlign = "center";
  g.font = "700 38px ui-monospace, monospace"; g.fillText(lines[0], 128, 118);
  g.font = "500 24px ui-monospace, monospace"; g.fillText(lines[1], 128, 158);
  g.beginPath(); g.arc(40, 40, 12, 0, Math.PI * 2); g.fill();
});

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

/** What update() drives, whichever board is shown. */
interface Parts {
  leds: ((b: number) => void)[];
  rgb: ((r: number, g: number, b: number) => void) | null;
  digits: ((b: number) => void)[][];
  buttons: ((down: boolean) => void)[];
  switches: ((on: boolean) => void)[];
  pickable: THREE.Object3D[];
}
const noParts = (): Parts => ({ leds: [], rgb: null, digits: [], buttons: [], switches: [], pickable: [] });

export default function Board3D({ handle, onButton, onSwitch, view = "lab", ledColors, onStatus }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const updateRef = useRef<(v: BoardView) => void>(() => {});
  const last = useRef<BoardView>(EMPTY_VIEW);
  const handlers = useRef({ onButton, onSwitch, onStatus });
  handlers.current = { onButton, onSwitch, onStatus };
  const [flat, setFlat] = useState<BoardView | null>(null);   // set when WebGL is missing
  const colours = (ledColors ?? []).concat(Array(6).fill(GREEN)).slice(0, 6).join(",");

  useEffect(() => {
    handle.current = { update: (v) => { last.current = v; updateRef.current(v); } };
    return () => { handle.current = null; };
  }, [handle]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (!webglOk()) { setFlat(last.current); updateRef.current = setFlat; return; }
    let alive = true;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b0e0d");
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 10.5, 9.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0.3);
    controls.enablePan = false;
    controls.minDistance = 5; controls.maxDistance = 22;
    controls.maxPolarAngle = 1.3;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2a20, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(4, 9, 6);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-5, 6, -4);
    scene.add(fill);

    const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m;
    };
    const flatOnTop = (w: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = add(new THREE.PlaneGeometry(w, d), mat, x, y, z); m.rotation.x = -Math.PI / 2; return m;
    };
    const glowTex = glowTexture();
    const glow = (color: THREE.ColorRepresentation, x: number, y: number, z: number, size: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.set(x, y, z); s.scale.set(size, size, 1); scene.add(s); return s;
    };
    /** A small SMD LED: a lens that lights and a halo; returns its brightness setter. */
    const smdLed = (color: string, x: number, y: number, z: number, w: number, d: number) => {
      const col = new THREE.Color(color);
      const mat = std(col.clone().multiplyScalar(0.25), { emissive: col, emissiveIntensity: 0, roughness: 0.3 });
      add(new THREE.BoxGeometry(w, w * 0.45, d), mat, x, y + w * 0.22, z);
      const halo = glow(col, x, y + w, z, w * 7);
      return (b: number) => { mat.emissiveIntensity = b * 3; halo.material.opacity = b * 0.9; };
    };
    /** An invisible hit box over a part, so it can be clicked on a model whose meshes are merged. */
    const hitBox = (x: number, y: number, z: number, w: number, h: number, d: number, data: object) => {
      const m = add(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }), x, y, z);
      m.userData = data;
      return m;
    };

    // ── The lab board ─────────────────────────────────────────────────────
    const buildLab = (): Parts => {
      const p = noParts();
      add(new THREE.BoxGeometry(12, 0.16, 7.2), std("#0d3a27", { roughness: 0.7 }), 0, 0, 0);
      flatOnTop(12, 7.2, new THREE.MeshBasicMaterial({ transparent: true, map: silk(12, 7.2, (text, at, g) => {
        const box = (x: number, z: number, w: number, d: number) => { const [a, b] = at(x - w / 2, z - d / 2); const [c, e] = at(x + w / 2, z + d / 2); g.strokeRect(a, b, c - a, e - b); };
        for (let i = 0; i < 6; i++) text(`LED${i}`, LED_X(i), LED_Z + 0.48, 22);
        for (let i = 0; i < 4; i++) { text(`SW${i}`, SW_X(i), FRONT + 0.8, 22); box(SW_X(i), FRONT, 0.66, 1.2); }
        text("ON ▲", SW_X(1.5), FRONT - 0.85, 18);
        for (let i = 0; i < 2; i++) text(`BTN${i}`, BTN_X(i), FRONT + 0.75, 22);
        text("RGB", -0.6, LED_Z + 0.52, 22);
        for (let d = 0; d < 4; d++) text(`hex${d}`, DIGIT_X(d), DISPLAY_Z + 1.12, 18);
        text("BITFLOW  LAB  BOARD", CHIP_X, -3.15, 30);
        text("USB", -5.25, -1.9, 18);
        g.strokeStyle = "rgba(120,220,160,.16)"; g.lineWidth = 6;   // a few traces, for the look of it
        for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(...at(-2.2, -0.5 + i * 0.12)); g.lineTo(...at(LED_X(i), -0.5 + i * 0.12)); g.lineTo(...at(LED_X(i), LED_Z - 0.2)); g.stroke(); }
        for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(...at(-3.9 + i * 0.35, 0.25)); g.lineTo(...at(SW_X(i), FRONT - 0.6)); g.stroke(); }
      }) }), 0, 0.081, 0);
      const brass = std("#c9b67a", { metalness: 0.8, roughness: 0.3 });
      for (const [x, z] of [[-5.6, -3.2], [5.6, -3.2], [-5.6, 3.2], [5.6, 3.2]]) add(new THREE.CylinderGeometry(0.18, 0.18, 0.17, 20), brass, x, 0.001, z);

      add(new THREE.BoxGeometry(2.2, 0.28, 2.2), std("#15181b"), CHIP_X, 0.22, CHIP_Z);
      flatOnTop(2.1, 2.1, new THREE.MeshStandardMaterial({ map: chipLabel(["BITFLOW", "LAB FPGA"]), roughness: 0.5 }), CHIP_X, 0.362, CHIP_Z);
      const pin = std("#bfae72", { metalness: 0.9, roughness: 0.3 });
      const pinX = new THREE.BoxGeometry(0.08, 0.05, 0.25), pinZ = new THREE.BoxGeometry(0.25, 0.05, 0.08);
      for (let k = 0; k < 10; k++) {
        const o = -0.9 + k * 0.2;
        add(pinX, pin, CHIP_X + o, 0.1, CHIP_Z - 1.2); add(pinX, pin, CHIP_X + o, 0.1, CHIP_Z + 1.2);
        add(pinZ, pin, CHIP_X - 1.2, 0.1, CHIP_Z + o); add(pinZ, pin, CHIP_X + 1.2, 0.1, CHIP_Z + o);
      }
      const steel = std("#c8ccd0", { metalness: 0.9, roughness: 0.25 });
      add(new THREE.BoxGeometry(0.7, 0.2, 0.45), steel, -1.5, 0.18, -2.4);
      add(new THREE.BoxGeometry(0.9, 0.34, 0.7), steel, -5.65, 0.25, -1.9);

      const ledCols = colours.split(",");
      p.leds = Array.from({ length: 6 }, (_, i) => {
        const col = new THREE.Color(ledCols[i]);
        const mat = std(col.clone().multiplyScalar(0.18), { emissive: col, emissiveIntensity: 0 });
        add(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 24), mat, LED_X(i), 0.19, LED_Z);
        add(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat, LED_X(i), 0.3, LED_Z);
        const halo = glow(col, LED_X(i), 0.45, LED_Z, 1.5);
        return (b: number) => { mat.emissiveIntensity = b * 2.4; halo.material.opacity = b * 0.85; };
      });

      const rgbMat = std("#3a3a3a", { emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 2 });
      add(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 28), rgbMat, -0.6, 0.22, LED_Z);
      add(new THREE.SphereGeometry(0.32, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), rgbMat, -0.6, 0.36, LED_Z);
      const rgbHalo = glow("#ffffff", -0.6, 0.55, LED_Z, 2.4);
      p.rgb = (r, g, b) => { rgbMat.emissive.setRGB(r, g, b); rgbHalo.material.color.setRGB(r, g, b); rgbHalo.material.opacity = Math.max(r, g, b) * 0.9; };

      add(new THREE.BoxGeometry(4.9, 0.36, 1.85), std("#101112", { roughness: 0.4 }), 2.9, 0.26, DISPLAY_Z);
      const segH = new THREE.BoxGeometry(0.42, 0.03, 0.09), segV = new THREE.BoxGeometry(0.09, 0.03, 0.42), dot = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12);
      p.digits = Array.from({ length: 4 }, (_, d) => {
        const lit = () => {
          const m = std("#2a1414", { emissive: new THREE.Color("#ff3b2f"), emissiveIntensity: 0 });
          return [m, (b: number) => { m.emissiveIntensity = b * 2.6; }] as const;
        };
        const segs = SEGS.map(([x, z, h]) => { const [m, set] = lit(); add(h ? segH : segV, m, DIGIT_X(d) + x, 0.455, DISPLAY_Z + z); return set; });
        const [dpm, dp] = lit();
        add(dot, dpm, DIGIT_X(d) + 0.42, 0.455, DISPLAY_Z + 0.55);
        return [...segs, dp];
      });

      p.buttons = Array.from({ length: 2 }, (_, i) => {
        const base = add(new THREE.BoxGeometry(0.95, 0.24, 0.95), std("#2b2f33"), BTN_X(i), 0.2, FRONT);
        const cap = add(new THREE.CylinderGeometry(0.3, 0.32, 0.2, 28), std(i === 0 ? "#e8e8e8" : "#e8c23a"), BTN_X(i), 0.42, FRONT);
        base.userData = cap.userData = { kind: "btn", i };
        p.pickable.push(base, cap);
        return (down: boolean) => { cap.position.y = down ? 0.34 : 0.42; };
      });
      p.switches = Array.from({ length: 4 }, (_, i) => {
        const body = add(new THREE.BoxGeometry(0.5, 0.26, 1.0), std("#1d4fd6"), SW_X(i), 0.21, FRONT);
        const knob = add(new THREE.BoxGeometry(0.32, 0.16, 0.38), std("#f2f2f2"), SW_X(i), 0.4, FRONT + 0.24);
        body.userData = knob.userData = { kind: "sw", i };
        p.pickable.push(body, knob);
        return (on: boolean) => { knob.position.z = FRONT + (on ? -0.24 : 0.24); };
      });
      return p;
    };

    // ── Tang Nano 9K, built to its layout (58.5 × 22.5 mm) ───────────────────
    const buildTang = (): Parts => {
      const p = noParts();
      const mm = WIDTH / 58.5, D = 22.5 * mm, T = 1.6 * mm;
      const X = (x: number) => (x - 29.25) * mm, Z = (y: number) => (y - 11.25) * mm, top = T / 2;
      const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number) => add(new THREE.BoxGeometry(w * mm, h * mm, d * mm), mat, X(x), top + (h * mm) / 2, Z(y));
      add(new THREE.BoxGeometry(WIDTH, T, D), std("#16181d", { roughness: 0.6 }), 0, 0, 0);
      const leds = [23.5, 25.5, 27.5, 29.5, 31.5, 33.5];
      flatOnTop(WIDTH, D, new THREE.MeshBasicMaterial({ transparent: true, map: silk(WIDTH, D, (text) => {
        text("TANG NANO 9K", X(14), Z(19.6), 34);
        leds.forEach((x, i) => text(String(i), X(x), Z(17.2), 22));
        text("S1", X(8.6), Z(6.4), 22); text("S2", X(8.6), Z(16.2), 22);
        text("GW1NR-9", X(36), Z(17.4), 20);
      }) }), 0, top + 0.002, 0);

      // Pin header pads along both long edges (the board ships without headers fitted).
      const gold = std("#d4b25a", { metalness: 0.9, roughness: 0.25 });
      const pad = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.85 * mm, 0.85 * mm, 0.08 * mm, 16), gold, 48);
      const hole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.45 * mm, 0.45 * mm, 0.1 * mm, 12), std("#050505"), 48);
      const m4 = new THREE.Matrix4();
      for (let k = 0; k < 24; k++) for (const [row, y] of [[0, 1.27], [1, 21.23]] as const) {
        m4.makeTranslation(X(1.5 + k * 2.4), top, Z(y)); pad.setMatrixAt(row * 24 + k, m4);
        m4.makeTranslation(X(1.5 + k * 2.4), top + 0.06 * mm, Z(y)); hole.setMatrixAt(row * 24 + k, m4);
      }
      scene.add(pad, hole);

      const steel = std("#c9cdd2", { metalness: 0.95, roughness: 0.22 });
      box(8.9, 3.2, 7.3, steel, 3.4, 11.25);                         // USB-C
      box(11.5, 5.6, 15, steel, 52.6, 11.25);                        // HDMI
      add(new THREE.BoxGeometry(8 * mm, 4 * mm, 9.5 * mm), std("#050505"), X(56), top + 2.9 * mm, Z(11.25));
      box(10, 0.9, 10, std("#17191c", { roughness: 0.4 }), 36, 11.25);   // GW1NR-9 (QFN88)
      flatOnTop(9.6 * mm, 9.6 * mm, new THREE.MeshStandardMaterial({ map: chipLabel(["GOWIN", "GW1NR-9C"]), roughness: 0.45 }), X(36), top + 0.92 * mm, Z(11.25));
      box(5, 0.8, 5, std("#1b1d20"), 17, 11.25);                     // BL702 (USB-JTAG)
      box(3.2, 1, 2.5, steel, 27, 6);                                // 27 MHz oscillator
      box(5, 1.2, 4, std("#1b1d20"), 26.5, 14.8);                    // flash
      box(12, 2, 3.6, std("#efe6cf", { roughness: 0.7 }), 43.5, 3.6); // LCD connector
      box(12, 0.6, 1.2, std("#1a1a1a"), 43.5, 2.2);
      for (const [x, y] of [[13, 4], [21.5, 17.5], [30.5, 4.2], [42, 17.5]]) box(1.6, 0.6, 0.8, std("#9a7a55"), x, y);   // a few passives

      p.leds = leds.map((x) => smdLed(TANG_LED, X(x), top, Z(18.8), 1.6 * mm, 0.9 * mm));
      p.buttons = [[8.6, 3.6], [8.6, 18.9]].map(([x, y], i) => {
        box(4.2, 1.6, 3.2, std("#d8d8d8", { metalness: 0.6, roughness: 0.35 }), x, y);
        const cap = add(new THREE.BoxGeometry(1.6 * mm, 0.9 * mm, 1.2 * mm), std("#1a1a1a"), X(x), top + 2 * mm, Z(y));
        const hit = hitBox(X(x), top + 1.2 * mm, Z(y), 5.5 * mm, 3 * mm, 4.5 * mm, { kind: "btn", i });
        p.pickable.push(hit, cap);
        cap.userData = { kind: "btn", i };
        return (down: boolean) => { cap.position.y = top + (down ? 1.75 : 2) * mm; };
      });
      return p;
    };

    // ── A board exported from KiCad (public/models) ──────────────────────
    const loadModel = async (id: string, def: (typeof VIEWS)[number]): Promise<Parts> => {
      const [{ GLTFLoader }, { MeshoptDecoder }, parts] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/libs/meshopt_decoder.module.js"),
        fetch(`/models/${id}.json`).then((r) => r.json() as Promise<ModelParts>),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(`/models/${id}.glb`);
      const model = gltf.scene;
      // Centre it and scale it to WIDTH; part positions (metres, board frame) get the same transform.
      const box = new THREE.Box3().setFromObject(model);
      const s = WIDTH / (box.max.x - box.min.x), cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
      model.scale.setScalar(s);
      model.position.set(-cx * s, -box.min.y * s, -cz * s);
      scene.add(model);
      const pos = ([x, z]: [number, number]): [number, number] => [(x - cx) * s, (z - cz) * s];
      const board = (0.0016 - box.min.y) * s;   // top of the 1.6 mm board (the model was lifted by -min.y: parts hang below it)
      const mm = s / 1000;
      const p = noParts();
      p.leds = parts.leds.map((xz, i) => { const [x, z] = pos(xz); return smdLed(ULX3S_LEDS[i] ?? GREEN, x, board, z, 2 * mm, 1.25 * mm); });
      if (parts.rgb) {
        const [x, z] = pos(parts.rgb);
        const halo = glow("#ffffff", x, board + 2 * mm, z, 14 * mm);
        const lens = std("#202020", { emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 3 });
        add(new THREE.BoxGeometry(1.1 * mm, 0.6 * mm, 1.1 * mm), lens, x, board + 0.35 * mm, z);
        p.rgb = (r, g, b) => { lens.emissive.setRGB(r, g, b); halo.material.color.setRGB(r, g, b); halo.material.opacity = Math.max(r, g, b) * 0.9; };
      }
      p.buttons = parts.buttons.map((xz, i) => {
        const [x, z] = pos(xz);
        p.pickable.push(hitBox(x, board + 3 * mm, z, 7 * mm, 6 * mm, 7 * mm, { kind: "btn", i }));
        const ring = glow("#ffffff", x, board + 6 * mm, z, 10 * mm);
        return (down: boolean) => { ring.material.opacity = down ? 0.55 : 0; };
      });
      p.switches = parts.switches.map((xz, i) => {
        const [x, z] = pos(xz);
        p.pickable.push(hitBox(x, board + 2 * mm, z, 2.4 * mm, 4 * mm, 9 * mm, { kind: "sw", i }));
        const lit = glow("#4da3ff", x, board + 3 * mm, z, 5 * mm);
        return (on: boolean) => { lit.material.opacity = on ? 0.8 : 0; };
      });
      if (def.ledsAsRgb && p.rgb) {   // led[0..2] are the RGB LED's red, green, blue
        const rgb = p.rgb, ch = [0, 0, 0];
        p.leds = [0, 1, 2].map((k) => (b: number) => { ch[k] = b; rgb(ch[0], ch[1], ch[2]); });
      }
      return p;
    };

    // Drawing on demand
    let frame = 0;
    const draw = () => { frame = 0; renderer.render(scene, camera); };
    const request = () => { if (!frame) frame = requestAnimationFrame(draw); };
    controls.addEventListener("change", request);
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Back off far enough that the whole board fits across, however narrow the panel.
      const across = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
      const dist = Math.max(view === "lab" ? 14 : 11, 6.6 / Math.tan(across) + 2.5);
      camera.position.sub(controls.target).setLength(dist).add(controls.target);
      controls.maxDistance = Math.max(22, dist * 1.4);
      controls.update();
      request();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    let parts = noParts();
    const apply = (v: BoardView) => {
      v.leds.forEach((b, i) => parts.leds[i]?.(b));
      parts.rgb?.(v.rgb[0], v.rgb[1], v.rgb[2]);
      v.digits.forEach((segs, d) => segs.forEach((b, s) => parts.digits[d]?.[s]?.(b)));
      v.btn.forEach((b, i) => parts.buttons[i]?.(!!b));
      v.sw.forEach((b, i) => parts.switches[i]?.(!!b));
      request();
    };
    const def = VIEWS.find((d) => d.id === view) ?? VIEWS[0];
    const ready = (p: Parts) => { parts = p; apply(last.current); updateRef.current = apply; handlers.current.onStatus?.(null); };
    if (def.model) {
      handlers.current.onStatus?.(`Loading the ${def.name}…`);
      loadModel(def.model, def).then((p) => { if (alive) ready(p); }).catch(() => {
        if (!alive) return;
        handlers.current.onStatus?.(`Couldn't load the ${def.name} model; showing the lab board.`);
        parts = buildLab(); apply(last.current); updateRef.current = apply;
      });
    } else ready(view === "tangnano9k" ? buildTang() : buildLab());

    // Picking: hold a button, click a switch; dragging anywhere else turns the board.
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects(parts.pickable, false)[0]?.object.userData as { kind: "btn" | "sw"; i: number } | undefined;
    };
    let held = -1;
    const down = (e: PointerEvent) => {
      const hit = pick(e);
      if (!hit) return;
      controls.enabled = false;
      if (hit.kind === "btn") { held = hit.i; handlers.current.onButton(hit.i, true); }
      else handlers.current.onSwitch(hit.i);
    };
    const up = () => {
      if (held >= 0) handlers.current.onButton(held, false);
      held = -1;
      controls.enabled = true;
    };
    const hover = (e: PointerEvent) => { if (e.buttons === 0) renderer.domElement.style.cursor = pick(e) ? "pointer" : "grab"; };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", hover);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((mat) => {
          (mat as THREE.MeshStandardMaterial).map?.dispose();
          mat.dispose();
        });
      });
      glowTex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      updateRef.current = () => {};
    };
  }, [colours, view]);

  return (
    <div ref={host} className="relative w-full h-full min-h-[260px]" role="img"
         aria-label={`${VIEWS.find((d) => d.id === view)?.name ?? "Lab board"} in 3D, with its LEDs and buttons`}>
      {flat && <FlatBoard v={flat} colours={colours.split(",")} />}
    </div>
  );
}

const SEG_PATHS = ["M8 4h20l-3 5H11z", "M30 6l-1 25-4 3 1-24z", "M29 37l-1 25-5-4 1-21z", "M7 66h20l-3-5H10z", "M6 36l-1 22 4 4 1-23z", "M7 6l4 4-1 21-4 3z", "M9 34l3-3h14l3 3-3 3H12z"];

/** The lights drawn flat, for browsers without WebGL (the controls below the board still work). */
function FlatBoard({ v, colours }: { v: BoardView; colours: string[] }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0d3a27] rounded p-4">
      <div className="flex gap-2">{[3, 2, 1, 0].map((d) => (
        <svg key={d} viewBox="0 0 40 70" className="w-8 h-14 bg-black rounded" aria-label={`hex${d}`}>
          {SEG_PATHS.map((p, k) => <path key={k} d={p} fill="#ff3b2f" opacity={0.12 + v.digits[d][k] * 0.88} />)}
        </svg>
      ))}</div>
      <div className="flex items-center gap-3">
        <span className="w-5 h-5 rounded-full border border-rim" title="RGB" style={{ background: `rgb(${v.rgb.map((c) => Math.round(c * 255)).join(",")})` }} />
        {[5, 4, 3, 2, 1, 0].map((i) => (
          <span key={i} className="w-4 h-4 rounded-full border border-rim" title={`LED${i}`} style={{ background: colours[i], opacity: 0.15 + v.leds[i] * 0.85 }} />
        ))}
      </div>
    </div>
  );
}
