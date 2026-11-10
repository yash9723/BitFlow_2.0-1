/**
 * lib/sim/icarus.worker.ts — runs lib/sim/icarus.ts off the main thread, so a simulation that never ends
 * can be stopped by terminating the worker (lib/sim/browser-sim.ts). Posts "ready" once the three
 * WebAssembly programs (public/iverilog/, served by this site) have loaded, then the result.
 */
import { runIcarus, type Factories, type Factory, type IcarusRequest } from "./icarus";

const BASE = "/iverilog/";
let factories: Promise<Factories> | null = null;
const load = () => (factories ??= Promise.all(["ivlpp", "ivl", "vvp"].map(
  (n) => import(/* webpackIgnore: true */ `${BASE}${n}.js`).then((m) => m.default as Factory),
)).then(([ivlpp, ivl, vvp]) => ({ ivlpp, ivl, vvp, locateFile: (p: string) => BASE + p })));

self.onmessage = async (e: MessageEvent<IcarusRequest>) => {
  let f: Factories;
  try {
    f = await load();
  } catch (err) {
    self.postMessage({ type: "unavailable", error: String(err) });
    return;
  }
  self.postMessage({ type: "ready" });
  try {
    self.postMessage({ type: "result", result: await runIcarus(f, e.data) });
  } catch (err) {
    self.postMessage({ type: "unavailable", error: String(err) });
  }
};
