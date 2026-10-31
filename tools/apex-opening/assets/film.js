/**
 * assets/film.js — the 3D in the APEX opening. Blocks fall and lock into "APEX", built from the same
 * Jersey 10 pixels as the page title, fire catches below them, the camera dives through it, then pulls
 * back to the exact spot where each voxel sits under the flat title in index.html. Every frame is a pure
 * function of time: HyperFrames renders frames out of order.
 */
import * as THREE from "./three.module.min.js";

const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const f = clamp01((v - a) / (b - a)); return f * f * (3 - 2 * f); };

const LENGTH = 7.4;        // seconds; the root's data-duration in index.html
const DEPTH = 4;           // voxels deep
const FLAMES = 15000, EMBERS = 260;
const UNIT = 3 / 56;       // one Jersey 10 pixel, as a fraction of the font size

const root = document.getElementById("root");
const W = +root.dataset.width, H = +root.dataset.height;
const canvas = document.getElementById("stage");

/** The ink of "APEX" as grid cells: x from the glyph origin, y up from the baseline. */
function letterCells() {
  const size = 560, u = size * UNIT, page = document.createElement("canvas");
  page.width = Math.ceil(40 * u); page.height = 700;
  const ctx = page.getContext("2d", { willReadFrequently: true });
  ctx.font = `${size}px "Jersey 10"`;
  ctx.fillText("APEX", 0, 500);
  const ink = ctx.getImageData(0, 0, page.width, page.height).data, cells = [];
  for (let y = -6; y < 26; y++) for (let x = 0; x < 40; x++) {
    const px = Math.round((x + 0.5) * u), py = Math.round(500 - (y + 0.5) * u);
    if (ink[(py * page.width + px) * 4 + 3] > 128) cells.push([x, y]);
  }
  return cells;
}

async function build() {
  await document.fonts.load('160px "Jersey 10"');
  await document.fonts.ready;
  const cells = letterCells();
  const top = Math.max(...cells.map((c) => c[1])), right = Math.max(...cells.map((c) => c[0]));
  const middle = new THREE.Vector3((right + 1) / 2, (top + 1) / 2, 0);

  // Where the flat title sits decides where the camera has to end up. Measured once.
  const scale = document.getElementById("root").getBoundingClientRect().width / W;
  const apex = document.getElementById("title-apex").getBoundingClientRect();
  const baseline = document.getElementById("baseline").getBoundingClientRect();
  const fontPx = parseFloat(getComputedStyle(document.getElementById("title")).fontSize);
  const perCell = fontPx * UNIT;
  const originX = (apex.left - root.getBoundingClientRect().left) / scale, baselineY = (baseline.bottom - root.getBoundingClientRect().top) / scale;

  const fov = 2 * Math.atan(Math.tan((46 * Math.PI) / 360) / (W / H));
  const finalZ = H / (2 * perCell * Math.tan(fov / 2));
  const finalAim = new THREE.Vector3((W / 2 - originX) / perCell, (baselineY - H / 2) / perCell, 0);
  const finalEye = finalAim.clone().setZ(finalZ);

  // The fire fills the bottom of the final frame, as the page's own does.
  const visible = H / perCell;
  const floor = finalAim.y - visible / 2 - 8;
  const fireHeight = visible * 0.4;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x050405);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera((fov * 180) / Math.PI, W / H, 0.5, 2500);

  scene.add(new THREE.AmbientLight(0x8a8f9c, 1.2));
  const key = new THREE.DirectionalLight(0xfff0e0, 2.4); key.position.set(-30, 40, 60); scene.add(key);
  const rim = new THREE.DirectionalLight(0x7ea2ff, 1.1); rim.position.set(40, 30, -60); scene.add(rim);
  const firelight = new THREE.PointLight(0xff6a20, 0, 0, 0); firelight.position.set(middle.x, floor + fireHeight * 0.7, 30); scene.add(firelight);

  // The letters. Front layer in the title's three flame bands, the body behind it in steel.
  const blockGeo = new THREE.BoxGeometry(1, 1, 1);
  const letters = new THREE.InstancedMesh(blockGeo, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, transparent: true }), cells.length * DEPTH);
  letters.frustumCulled = false;
  scene.add(letters);
  const blocks = [];
  const bandOf = (y) => { const f = (y + 0.5) / (top + 1); return f > 0.68 ? 0xffc860 : f > 0.36 ? 0xff7a1a : 0xe8261b; };
  cells.forEach(([x, y], c) => {
    for (let k = 0; k < DEPTH; k++) {
      const i = blocks.length, seed = hash(c * 7 + k * 131);
      blocks.push({
        x: x + 0.5, y: y + 0.5, z: -k - 0.5,
        start: 0.55 + (x / (right + 1)) * 0.8 + seed * 0.6,   // sweeps across the word, loosely
        drop: 55 + hash(i + 9) * 45, spin: hash(i + 21) * 7,
        color: new THREE.Color(k === 0 ? bandOf(y) : k === DEPTH - 1 ? 0x4a4c52 : 0xb9bcc4),
      });
    }
  });

  // The fire: self-lit cubes rising from the floor, shrinking away and going red as they rise.
  // Each face a different brightness, so a cube up close still reads as a cube.
  const flameGeo = new THREE.BoxGeometry(1, 1, 1);
  const faceShades = [0.72, 0.72, 1, 0.5, 0.86, 0.6];
  flameGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(faceShades.flatMap((b) => Array(4).fill([b, b, b]).flat())), 3));
  const flames = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true }), FLAMES);
  flames.frustumCulled = false;
  scene.add(flames);
  const across = (visible * (W / H)) / 2 + 45;
  const flameSeeds = Array.from({ length: FLAMES }, (_, i) => ({
    x: finalAim.x + (hash(i + 0.5) * 2 - 1) * across,
    z: -35 + hash(i + 1000.5) * 145,
    phase: hash(i + 2000.5), period: 1.1 + hash(i + 3000.5) * 1.2, size: 1.2 + hash(i + 4000.5) * 2.2,
  }));
  const STOPS = [[0, 0xfff0c8], [0.14, 0xffc860], [0.36, 0xff7a1a], [0.66, 0xe8261b], [1, 0xa81a10]].map(([at, hex]) => [at, new THREE.Color(hex)]);
  const flameColor = new THREE.Color();
  const shade = (life) => {
    const n = Math.max(1, STOPS.findIndex(([at]) => at >= life));
    flameColor.copy(STOPS[n - 1][1]).lerp(STOPS[n][1], (life - STOPS[n - 1][0]) / (STOPS[n][0] - STOPS[n - 1][0]));
  };

  // Glowing ground for the close shots, so gaps between the low cubes show fire and not black. It fades away behind the flames.
  const groundCanvas = document.createElement("canvas");
  groundCanvas.width = 8; groundCanvas.height = 256;
  const gg = groundCanvas.getContext("2d"), bed = gg.createLinearGradient(0, 0, 0, 256);
  bed.addColorStop(0, "rgba(255,110,30,0)"); bed.addColorStop(0.3, "rgba(255,110,30,1)");
  gg.fillStyle = bed; gg.fillRect(0, 0, 8, 256);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(across * 4, 300),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(groundCanvas), transparent: true, depthWrite: false, toneMapped: false }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(finalAim.x, floor - 1, 80);
  scene.add(ground);

  // A wide glow behind it all, so the fire lights the dark rather than sitting on it.
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 8; glowCanvas.height = 256;
  const g = glowCanvas.getContext("2d"), ramp = g.createLinearGradient(0, 0, 0, 256);
  ramp.addColorStop(0, "rgba(255,70,20,0)"); ramp.addColorStop(0.6, "rgba(255,70,20,0.05)"); ramp.addColorStop(1, "rgba(255,110,30,0.4)");
  g.fillStyle = ramp; g.fillRect(0, 0, 8, 256);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(across * 3, fireHeight * 2.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  glow.position.set(finalAim.x, floor + fireHeight * 1.1, -50);
  scene.add(glow);

  // Embers: on from the very first frame, in the black before anything else.
  const embers = new THREE.InstancedMesh(blockGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), EMBERS);
  embers.frustumCulled = false;
  scene.add(embers);

  // The one camera move: settle on the word, dive through the fire, pull back to the title.
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const [mx, my] = [middle.x, middle.y], up = (share) => floor + fireHeight * share;
  const shots = [
    { at: 0, eye: v(mx, my + 2, 58), aim: v(mx, my, 0) },
    { at: 2.35, eye: v(mx, my, 44), aim: v(mx, my, 0) },                     // the word, as the last block lands
    { at: 3.0, eye: v(mx - 22, my - 22, 80), aim: v(mx - 6, up(1.1), 20) },   // tips over and drops
    { at: 3.6, eye: v(mx - 12, up(1.05), 125), aim: v(mx - 4, up(0.55), 40) }, // into the flame tops
    { at: 4.25, eye: v(mx + 6, up(0.5), 62), aim: v(mx + 6, up(0.6), 0) },     // inside the fire
    { at: 4.75, eye: v(mx + 8, up(0.8), 190), aim: v(mx + 2, my - 34, 0) },     // backing out, the word above the flames
    { at: 5.35, eye: finalEye, aim: finalAim },
  ];
  // Smooth in time through the shots, slowing to rest at each end of the film's move.
  const slope = (key, i) => i === 0 || i === shots.length - 1 ? v(0, 0, 0)
    : shots[i + 1][key].clone().sub(shots[i - 1][key]).divideScalar(shots[i + 1].at - shots[i - 1].at);
  const through = (key, t, out) => {
    if (t >= shots[shots.length - 1].at) return out.copy(shots[shots.length - 1][key]);
    const i = shots.findIndex((shot, n) => t >= shot.at && t < shots[n + 1].at), a = shots[i], b = shots[i + 1];
    const span = b.at - a.at, f = (t - a.at) / span, f2 = f * f, f3 = f2 * f;
    return out.copy(a[key]).multiplyScalar(2 * f3 - 3 * f2 + 1).add(b[key].clone().multiplyScalar(3 * f2 - 2 * f3))
      .add(slope(key, i).multiplyScalar((f3 - 2 * f2 + f) * span)).add(slope(key, i + 1).multiplyScalar((f3 - f2) * span));
  };

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), aim = new THREE.Vector3();

  function renderAt(rawT) {
    const t = Math.min(rawT, LENGTH);

    blocks.forEach((b, i) => {
      const f = clamp01((t - b.start) / 0.5), fall = f * f;   // gravity: it speeds up until it stops dead
      e.set((1 - fall) * b.spin, (1 - fall) * b.spin * 0.6, 0);
      q.setFromEuler(e);
      p.set(b.x, b.y + b.drop * (1 - fall), b.z);
      const shown = t < b.start ? 0 : 1;
      s.set(shown, shown, shown);
      letters.setMatrixAt(i, m.compose(p, q, s));
      const flash = f >= 1 ? 1 - smooth(0, 0.28, t - b.start - 0.5) : 0;
      letters.setColorAt(i, c.copy(b.color).lerp(flameColor.set(0xffffff), flash * 0.75));
    });
    letters.instanceMatrix.needsUpdate = true;
    letters.instanceColor.needsUpdate = true;
    letters.material.opacity = 1 - smooth(5.75, 6.05, t);   // by now the flat title has taken over

    through("eye", t, camera.position);
    const burn = smooth(2.1, 3.0, t);
    q.identity();
    flameSeeds.forEach((f, i) => {
      const life = (t / f.period + f.phase) % 1;
      const tongue = 0.5 + 0.3 * Math.sin(f.x * 0.11 + t * 2.3) * Math.sin(f.x * 0.047 - t * 1.1) + 0.2 * Math.sin(f.x * 0.29 + f.z * 0.08 - t * 3.4);
      const height = burn * fireHeight * (0.45 + 0.75 * tongue);
      const size = f.size * Math.pow(1 - life, 0.55) * Math.min(1, burn * 3);
      p.set(f.x + Math.sin(t * 2.2 + f.phase * 40) * 1.6 * life, floor + life * height, f.z);
      const near = size * smooth(9, 26, p.distanceTo(camera.position));   // one cube passing the lens would fill the frame
      s.set(near, near, near);
      flames.setMatrixAt(i, m.compose(p, q, s));
      shade(clamp01(life * (1.15 - 0.3 * tongue)));
      flames.setColorAt(i, flameColor);
    });
    flames.instanceMatrix.needsUpdate = true;
    flames.instanceColor.needsUpdate = true;
    glow.material.opacity = burn;
    ground.material.opacity = smooth(2.6, 3.2, t) * (1 - smooth(4.4, 5.1, t));
    firelight.intensity = burn * (2.2 + 0.5 * Math.sin(t * 9.1) + 0.3 * Math.sin(t * 15.7));

    for (let i = 0; i < EMBERS; i++) {
      const life = (t / (2.6 + hash(i + 5000.5) * 2.4) + hash(i + 6000.5)) % 1;
      const size = 0.28 + hash(i + 7000.5) * 0.3;
      p.set(
        middle.x + (hash(i + 8000.5) * 2 - 1) * across * 0.8 + Math.sin(t * 1.4 + i) * 2.5,
        floor + 10 + life * (visible * 1.05),
        -30 + hash(i + 9000.5) * 95,
      );
      s.set(size, size, size);
      embers.setMatrixAt(i, m.compose(p, q, s));
      embers.setColorAt(i, c.set(life < 0.5 ? 0xffb050 : life < 0.8 ? 0xff5a20 : 0x8a1408));
    }
    embers.instanceMatrix.needsUpdate = true;
    embers.instanceColor.needsUpdate = true;

    camera.lookAt(through("aim", t, aim));
    renderer.render(scene, camera);
  }

  window.addEventListener("hf-seek", (ev) => renderAt(ev.detail.time));
  renderAt(0);
}

build().then(window.__filmBuilt);
