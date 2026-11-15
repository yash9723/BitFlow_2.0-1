/**
 * lib/3d/stage.ts — a small three.js stage for the Academy's 3D animations (components/academy/anim/Stage3D.tsx).
 * One canvas in a host element, a camera that eases between poses, OrbitControls limited to turning (no zoom or pan, so the
 * page still scrolls), a render loop that runs only while something moves, context-loss handling and a full dispose.
 * Pinned to three 0.170.0 like the Board Lab (components/lab/Board3D.tsx, which keeps its own copy of these helpers).
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export { THREE };

export function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}
export const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Where the camera sits: turned `az` degrees around the vertical axis, raised `el` degrees, `dist` units from `target`. */
export interface Pose { az: number; el: number; dist: number; target?: [number, number, number] }

/** What a scene gives the stage. `apply` moves it to a step; `tick` eases it there and says whether it still moves. */
export interface Scene3D {
  apply(step: number, instant: boolean): void;
  tick?(dt: number, instant: boolean): boolean;
}

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  host: HTMLElement;
  /** Draw soon (a scene calls this after changing something outside tick). */
  request(): void;
  setPose(p: Pose, instant?: boolean): void;
  /** Turn the camera by degrees around the target (the buttons next to the canvas). */
  rotateBy(deg: number): void;
}
export interface Handle { stage: Stage; scene: Scene3D; setPose(p: Pose, instant?: boolean): void; rotateBy(deg: number): void; request(): void; destroy(): void }

const toPosition = (p: Pose): THREE.Vector3 => {
  const az = (p.az * Math.PI) / 180, el = (p.el * Math.PI) / 180, t = p.target ?? [0, 0, 0];
  return new THREE.Vector3(t[0] + p.dist * Math.cos(el) * Math.sin(az), t[1] + p.dist * Math.sin(el), t[2] + p.dist * Math.cos(el) * Math.cos(az));
};

export interface StageOptions {
  pose: Pose;
  /** How far (degrees, each way) the reader can turn the view away from straight on. */
  azLimit?: number;
  background?: string;
  build: (stage: Stage) => Scene3D;
  /** The browser took the GL context away (a phone short of memory): the caller shows its flat version. */
  onLost?: () => void;
}

const dispose = (root: THREE.Object3D) => {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
};

export function makeStage(host: HTMLElement, o: StageOptions): Handle {
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  Object.assign(renderer.domElement.style, { display: "block", width: "100%", height: "100%", touchAction: "pan-y" });
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.background ?? "#0b0e0d");
  scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2230, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); sun.position.set(6, 12, 9); scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.6); fill.position.set(-8, 4, -6); scene.add(fill);

  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableZoom = false; controls.enablePan = false; controls.enableDamping = false;
  // OrbitControls sets touch-action:none; a vertical swipe should scroll the page, so undo it. A horizontal drag still turns the view.
  renderer.domElement.style.touchAction = "pan-y";
  const lim = ((o.azLimit ?? 70) * Math.PI) / 180;
  controls.minAzimuthAngle = -lim; controls.maxAzimuthAngle = lim;
  controls.minPolarAngle = 0.25; controls.maxPolarAngle = 1.45;

  let pose = o.pose, target = toPosition(pose), lookAt = new THREE.Vector3(...(pose.target ?? [0, 0, 0]));
  let easing = false, dead = false, raf = 0, last = 0, lastDraw = 0;
  camera.position.copy(target); controls.target.copy(lookAt); controls.update();

  let handleScene: Scene3D = { apply() {} };
  const loop = (now: number) => {
    raf = 0;
    if (dead) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0.016);
    last = now;
    const reduced = reducedMotion();
    let more = handleScene.tick?.(dt, reduced) ?? false;
    if (easing) {
      const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
      camera.position.lerp(target, k); controls.target.lerp(lookAt, k);
      if (camera.position.distanceTo(target) < 0.02 && controls.target.distanceTo(lookAt) < 0.02) { camera.position.copy(target); controls.target.copy(lookAt); easing = false; }
      controls.update();
      more = more || easing;
    }
    if (more && now - lastDraw < 28) { raf = requestAnimationFrame(loop); return; }   // about 30 frames a second is plenty for these
    lastDraw = now;
    renderer.render(scene, camera);
    if (more) raf = requestAnimationFrame(loop); else last = 0;
  };
  const request = () => { if (!raf && !dead) raf = requestAnimationFrame(loop); };
  controls.addEventListener("change", request);
  controls.addEventListener("start", () => { easing = false; });   // the reader took over: stop easing back

  const setPose = (p: Pose, instant = false) => {
    pose = p; target = toPosition(p); lookAt = new THREE.Vector3(...(p.target ?? [0, 0, 0]));
    if (instant || reducedMotion()) { camera.position.copy(target); controls.target.copy(lookAt); controls.update(); easing = false; } else easing = true;
    request();
  };
  const rotateBy = (deg: number) => {
    const off = camera.position.clone().sub(controls.target);
    const a = Math.atan2(off.x, off.z) + (deg * Math.PI) / 180, c = Math.max(-lim, Math.min(lim, a));
    const r = Math.hypot(off.x, off.z);
    camera.position.set(controls.target.x + r * Math.sin(c), camera.position.y, controls.target.z + r * Math.cos(c));
    controls.update(); request();
  };

  const stage: Stage = { scene, camera, host, request, setPose, rotateBy };

  const size = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = camera.aspect < 1.6 ? 42 : 34;   // a narrower canvas needs a wider view to keep the whole scene in
    camera.updateProjectionMatrix(); request();
  };
  const ro = new ResizeObserver(size);
  ro.observe(host);
  const lost = (e: Event) => { e.preventDefault(); o.onLost?.(); };
  renderer.domElement.addEventListener("webglcontextlost", lost);

  handleScene = o.build(stage);
  size();

  return {
    stage, scene: handleScene, setPose, rotateBy, request,
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      dispose(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

// ── Small builders the scenes share ───────────────────────────────────────────
export const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...extra });

/** A box with its centre at (x, y, z). */
export function box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); parent.add(m); return m;
}

/** Text that always faces the camera (a canvas drawn once). */
export function label(parent: THREE.Object3D, text: string, x: number, y: number, z: number, opts: { color?: string; size?: number } = {}) {
  const px = 44, pad = 14, c = document.createElement("canvas"), g = c.getContext("2d")!;
  g.font = `600 ${px}px ui-monospace, monospace`;
  c.width = Math.ceil(g.measureText(text).width) + pad * 2; c.height = px + pad * 2;
  g.font = `600 ${px}px ui-monospace, monospace`; g.textBaseline = "middle"; g.textAlign = "center";
  g.fillStyle = "rgba(7,8,10,.72)"; g.beginPath(); g.roundRect?.(0, 0, c.width, c.height, 14); g.fill();
  g.fillStyle = opts.color ?? "#e6e8f0"; g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const h = opts.size ?? 0.7; s.scale.set((h * c.width) / c.height, h, 1);
  s.position.set(x, y, z); s.renderOrder = 10; parent.add(s); return s;
}

/** A painted top face: `paint` draws on a w × h canvas. */
export function canvasTexture(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; paint(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

/** Ease `cur` towards `to`; true while it is still moving. Snaps when `instant`. */
export function approach(cur: number, to: number, dt: number, instant: boolean, rate = 7): { v: number; moving: boolean } {
  if (instant || Math.abs(to - cur) < 0.002) return { v: to, moving: false };
  return { v: cur + (to - cur) * (1 - Math.exp(-dt * rate)), moving: true };
}
