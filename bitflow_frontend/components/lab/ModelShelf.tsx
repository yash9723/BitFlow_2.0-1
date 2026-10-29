"use client";
/**
 * components/lab/ModelShelf.tsx — a few 3D models side by side (the microcontrollers in the
 * "FPGA vs microcontroller" lesson), from public/models (scripts/board-models.mjs). Shows only
 * the models that have been built (listed in public/models/CREDITS.json), and nothing if none have.
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Credit = { id: string; credit: string };

export default function ModelShelf({ ids }: { ids: string[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [have, setHave] = useState<Credit[]>([]);
  const key = ids.join(",");

  useEffect(() => {
    const wanted = key.split(",");
    fetch("/models/CREDITS.json").then((r) => (r.ok ? r.json() : [])).then((all: Credit[]) => setHave(all.filter((c) => wanted.includes(c.id)))).catch(() => setHave([]));
  }, [key]);

  useEffect(() => {
    const el = host.current;
    if (!el || have.length === 0) return;
    let alive = true;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b0e0d");
    scene.add(new THREE.HemisphereLight(0xffffff, 0x1a2a20, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(3, 8, 6);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    let frame = 0;
    const draw = () => { frame = 0; renderer.render(scene, camera); };
    const request = () => { if (!frame) frame = requestAnimationFrame(draw); };
    controls.addEventListener("change", request);
    const size = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      renderer.domElement.style.width = "100%"; renderer.domElement.style.height = "100%";
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      request();
    };
    const observer = new ResizeObserver(size);
    observer.observe(el);

    (async () => {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/libs/meshopt_decoder.module.js"),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const models = await Promise.all(have.map((c) => loader.loadAsync(`/models/${c.id}.glb`).then((g) => g.scene).catch(() => null)));
      if (!alive) return;
      // Each model scaled to 4 units across, lined up left to right.
      models.forEach((m, i) => {
        if (!m) return;
        // Some models are exported standing up: lay a board flat (its thinnest side up).
        const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
        if (size.z < size.y && size.z <= size.x) m.rotation.x = -Math.PI / 2;
        else if (size.x < size.y && size.x <= size.z) m.rotation.z = Math.PI / 2;
        m.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(m), s = 4 / Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
        const c = box.getCenter(new THREE.Vector3());
        m.scale.setScalar(s);
        m.position.set((i - (models.length - 1) / 2) * 5 - c.x * s, -box.min.y * s, -c.z * s);
        scene.add(m);
      });
      camera.position.set(0, 5, 6 + models.length * 1.6);
      controls.target.set(0, 0, 0);
      controls.update();
      size();
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose()); });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [have]);

  if (have.length === 0) return null;
  return (
    <figure className="space-y-1 max-w-3xl">
      <div ref={host} className="h-56 sm:h-64 rounded-lg border border-rim overflow-hidden" role="img"
           aria-label="Microcontroller boards in 3D, for comparison" />
      <figcaption className="font-mono text-[9px] text-dim">
        Microcontrollers for comparison (drag to turn). Models: {have.map((c) => c.credit.split(", sketchfab")[0]).join("; ")}, CC Attribution. <a href="/lab/credits" className="underline hover:text-ghost">Credits</a>
      </figcaption>
    </figure>
  );
}
