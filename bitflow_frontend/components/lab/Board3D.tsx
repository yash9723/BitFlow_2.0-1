"use client";
/**
 * components/lab/Board3D.tsx — the Board Lab's board in 3D (three.js), built in code: 6 LEDs,
 * a 4-digit 7-segment display, an RGB LED, 2 push buttons and 4 slide switches. Drag to turn
 * it, scroll to zoom; hold a button or click a switch to drive the design.
 * The caller feeds it brightness (0–1, the share of cycles a light was on, so PWM dims) through
 * handle.current.update() (a prop, not a ref: next/dynamic doesn't forward refs); it only draws
 * when something changed. Without WebGL it falls back to
 * a flat drawing of the same parts.
 */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/** leds[i], digits[d][segment] (d = 0 is the rightmost), rgb [r, g, b]: 0–1; btn / sw: 0 or 1. */
export interface BoardView { leds: number[]; digits: number[][]; rgb: number[]; btn: number[]; sw: number[] }
export interface BoardHandle { update(v: BoardView): void }
interface Props {
  /** Set to the board's update() once it is drawn. */
  handle: MutableRefObject<BoardHandle | null>;
  onButton: (i: number, down: boolean) => void;
  onSwitch: (i: number) => void;
  /** Colour of each LED (CSS colour); default green. */
  ledColors?: string[];
}

export const EMPTY_VIEW: BoardView = { leds: Array(6).fill(0), digits: Array.from({ length: 4 }, () => Array(8).fill(0)), rgb: [0, 0, 0], btn: [0, 0], sw: [0, 0, 0, 0] };
const LED_X = (i: number) => 5.3 - i * 0.9;            // LED 0 on the right
const DIGIT_X = (d: number) => 4.65 - d * 1.15;         // digit 0 on the right
const SW_X = (i: number) => -1.9 - i * 1.0;             // switch 0 on the right of the group
const BTN_X = (i: number) => 4.9 - i * 1.5;
const FRONT = 2.45, LED_Z = 0.55, DISPLAY_Z = -1.95, CHIP_X = -3.4, CHIP_Z = -0.9;
const GREEN = "#2bff88";

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
  return t;
}

const glowTexture = () => canvasTexture(64, 64, (g) => {
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
});

/** White silkscreen text and outlines on the board's top face. */
const silkscreen = () => canvasTexture(1600, 960, (g) => {
  const W = 1600, H = 960;
  const at = (x: number, z: number): [number, number] => [((x + 6) / 12) * W, ((z + 3.6) / 7.2) * H];
  g.fillStyle = "rgba(225,240,230,.85)"; g.strokeStyle = "rgba(225,240,230,.5)"; g.lineWidth = 3;
  g.textAlign = "center"; g.textBaseline = "middle";
  const text = (s: string, x: number, z: number, size = 24) => { g.font = `600 ${size}px ui-monospace, monospace`; g.fillText(s, ...at(x, z)); };
  const box = (x: number, z: number, w: number, d: number) => { const [a, b] = at(x - w / 2, z - d / 2); g.strokeRect(a, b, (w / 12) * W, (d / 7.2) * H); };
  for (let i = 0; i < 6; i++) text(`LED${i}`, LED_X(i), LED_Z + 0.48, 22);
  for (let i = 0; i < 4; i++) { text(`SW${i}`, SW_X(i), FRONT + 0.8, 22); box(SW_X(i), FRONT, 0.66, 1.2); }
  text("ON ▲", SW_X(1.5), FRONT - 0.85, 18);
  for (let i = 0; i < 2; i++) text(`BTN${i}`, BTN_X(i), FRONT + 0.75, 22);
  text("RGB", -0.6, LED_Z + 0.52, 22);
  for (let d = 0; d < 4; d++) text(`hex${d}`, DIGIT_X(d), DISPLAY_Z + 1.12, 18);
  text("BITFLOW  LAB  BOARD", CHIP_X, -3.15, 30);
  text("USB", -5.25, -1.9, 18);
  // a few traces, for the look of it
  g.strokeStyle = "rgba(120,220,160,.16)"; g.lineWidth = 6;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(...at(-2.2, -0.5 + i * 0.12)); g.lineTo(...at(LED_X(i), -0.5 + i * 0.12)); g.lineTo(...at(LED_X(i), LED_Z - 0.2)); g.stroke(); }
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(...at(-3.9 + i * 0.35, 0.25)); g.lineTo(...at(SW_X(i), FRONT - 0.6)); g.stroke(); }
});

const chipLabel = () => canvasTexture(256, 256, (g) => {
  g.fillStyle = "#15181b"; g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(200,210,205,.75)"; g.textAlign = "center";
  g.font = "700 40px ui-monospace, monospace"; g.fillText("BITFLOW", 128, 118);
  g.font = "500 24px ui-monospace, monospace"; g.fillText("LAB FPGA", 128, 158);
  g.beginPath(); g.arc(40, 40, 12, 0, Math.PI * 2); g.fill();
});

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export default function Board3D({ handle, onButton, onSwitch, ledColors }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const updateRef = useRef<(v: BoardView) => void>(() => {});
  const handlers = useRef({ onButton, onSwitch });
  handlers.current = { onButton, onSwitch };
  const [flat, setFlat] = useState<BoardView | null>(null);   // set when WebGL is missing
  const colours = (ledColors ?? []).concat(Array(6).fill(GREEN)).slice(0, 6).join(",");

  useEffect(() => {
    handle.current = { update: (v) => updateRef.current(v) };
    return () => { handle.current = null; };
  }, [handle]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (!webglOk()) { setFlat(EMPTY_VIEW); updateRef.current = setFlat; return; }

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
    controls.minDistance = 7; controls.maxDistance = 22;
    controls.maxPolarAngle = 1.3;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2a20, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(4, 9, 6);
    scene.add(sun);

    const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); scene.add(m); return m;
    };
    const flatOnTop = (w: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = add(new THREE.PlaneGeometry(w, d), mat, x, y, z); m.rotation.x = -Math.PI / 2; return m;
    };

    // Board, silkscreen, mounting holes
    add(new THREE.BoxGeometry(12, 0.16, 7.2), std("#0d3a27", { roughness: 0.7 }), 0, 0, 0);
    flatOnTop(12, 7.2, new THREE.MeshBasicMaterial({ map: silkscreen(), transparent: true }), 0, 0.081, 0);
    const brass = std("#c9b67a", { metalness: 0.8, roughness: 0.3 });
    for (const [x, z] of [[-5.6, -3.2], [5.6, -3.2], [-5.6, 3.2], [5.6, 3.2]]) add(new THREE.CylinderGeometry(0.18, 0.18, 0.17, 20), brass, x, 0.001, z);

    // FPGA with its pins, oscillator, USB
    add(new THREE.BoxGeometry(2.2, 0.28, 2.2), std("#15181b"), CHIP_X, 0.22, CHIP_Z);
    flatOnTop(2.1, 2.1, new THREE.MeshStandardMaterial({ map: chipLabel(), roughness: 0.5 }), CHIP_X, 0.362, CHIP_Z);
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

    const glowTex = glowTexture();
    const glow = (color: THREE.ColorRepresentation, x: number, y: number, z: number, size: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      s.position.set(x, y, z); s.scale.set(size, size, 1); scene.add(s); return s;
    };

    // LEDs
    const ledCols = colours.split(",");
    const leds = Array.from({ length: 6 }, (_, i) => {
      const col = new THREE.Color(ledCols[i]);
      const mat = std(col.clone().multiplyScalar(0.18), { emissive: col, emissiveIntensity: 0 });
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 24), mat, LED_X(i), 0.19, LED_Z);
      add(new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat, LED_X(i), 0.3, LED_Z);
      return { mat, halo: glow(col, LED_X(i), 0.45, LED_Z, 1.5) };
    });

    // RGB LED
    const rgbMat = std("#3a3a3a", { emissive: new THREE.Color(0, 0, 0), emissiveIntensity: 2 });
    add(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 28), rgbMat, -0.6, 0.22, LED_Z);
    add(new THREE.SphereGeometry(0.32, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), rgbMat, -0.6, 0.36, LED_Z);
    const rgbHalo = glow("#ffffff", -0.6, 0.55, LED_Z, 2.4);

    // 7-segment display (segment 7 = the decimal point)
    add(new THREE.BoxGeometry(4.9, 0.36, 1.85), std("#101112", { roughness: 0.4 }), 2.9, 0.26, DISPLAY_Z);
    const segH = new THREE.BoxGeometry(0.42, 0.03, 0.09), segV = new THREE.BoxGeometry(0.09, 0.03, 0.42), dot = new THREE.CylinderGeometry(0.055, 0.055, 0.03, 12);
    const digits = Array.from({ length: 4 }, (_, d) => {
      const lit = () => std("#2a1414", { emissive: new THREE.Color("#ff3b2f"), emissiveIntensity: 0 });
      const segs = SEGS.map(([x, z, h]) => { const m = lit(); add(h ? segH : segV, m, DIGIT_X(d) + x, 0.455, DISPLAY_Z + z); return m; });
      const dp = lit();
      add(dot, dp, DIGIT_X(d) + 0.42, 0.455, DISPLAY_Z + 0.55);
      return [...segs, dp];
    });

    // Buttons and switches (pickable)
    const pickable: THREE.Object3D[] = [];
    const buttons = Array.from({ length: 2 }, (_, i) => {
      const base = add(new THREE.BoxGeometry(0.95, 0.24, 0.95), std("#2b2f33"), BTN_X(i), 0.2, FRONT);
      const cap = add(new THREE.CylinderGeometry(0.3, 0.32, 0.2, 28), std(i === 0 ? "#e8e8e8" : "#e8c23a"), BTN_X(i), 0.42, FRONT);
      base.userData = cap.userData = { kind: "btn", i };
      pickable.push(base, cap);
      return cap;
    });
    const switches = Array.from({ length: 4 }, (_, i) => {
      const body = add(new THREE.BoxGeometry(0.5, 0.26, 1.0), std("#1d4fd6"), SW_X(i), 0.21, FRONT);
      const knob = add(new THREE.BoxGeometry(0.32, 0.16, 0.38), std("#f2f2f2"), SW_X(i), 0.4, FRONT + 0.24);
      body.userData = knob.userData = { kind: "sw", i };
      pickable.push(body, knob);
      return knob;
    });

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
      const dist = Math.max(14, 6.6 / Math.tan(across) + 2.5);
      camera.position.sub(controls.target).setLength(dist).add(controls.target);
      controls.maxDistance = Math.max(22, dist * 1.4);
      controls.update();
      request();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    updateRef.current = (v) => {
      v.leds.forEach((b, i) => { if (leds[i]) { leds[i].mat.emissiveIntensity = b * 2.4; leds[i].halo.material.opacity = b * 0.85; } });
      v.digits.forEach((segs, d) => segs.forEach((b, s) => { if (digits[d]?.[s]) digits[d][s].emissiveIntensity = b * 2.6; }));
      const [r, g, b] = v.rgb;
      rgbMat.emissive.setRGB(r, g, b);
      rgbHalo.material.color.setRGB(r, g, b);
      rgbHalo.material.opacity = Math.max(r, g, b) * 0.9;
      buttons.forEach((cap, i) => { cap.position.y = v.btn[i] ? 0.34 : 0.42; });
      switches.forEach((knob, i) => { knob.position.z = FRONT + (v.sw[i] ? -0.24 : 0.24); });
      request();
    };

    // Picking: hold a button, click a switch; dragging anywhere else turns the board.
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pick = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects(pickable)[0]?.object.userData as { kind: "btn" | "sw"; i: number } | undefined;
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
  }, [colours]);

  return (
    <div ref={host} className="relative w-full h-full min-h-[260px]" role="img"
         aria-label="Lab board: 6 LEDs, a 4-digit display, an RGB LED, 2 buttons and 4 switches">
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
