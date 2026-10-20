/// <reference lib="webworker" />
/**
 * lib/synth/worker.ts — runs Yosys (YoWASP WebAssembly build, the same 0.52 the
 * server uses) off the main thread. Started and fed by lib/synth/client.ts,
 * which draws the diagrams (elkjs's bundle takes over any worker it loads in).
 * Yosys is fetched from jsDelivr on first use (~6 MB compressed), then cached.
 */
import { synthesize, type RunYosys, type SynthKind } from "./run";

const YOSYS_URL = "https://cdn.jsdelivr.net/npm/@yowasp/yosys@0.52.893/gen/bundle.js";

let runYosys: Promise<RunYosys> | null = null;

self.onmessage = async (e: MessageEvent<{ id: number; kind: SynthKind; design: string }>) => {
  const { id, kind, design } = e.data;
  try {
    runYosys ??= import(/* webpackIgnore: true */ YOSYS_URL).then((m) => m.runYosys as RunYosys);
    const result = await synthesize(await runYosys, kind, design);
    self.postMessage({ id, result });
  } catch (err) {
    runYosys = null;                     // a failed download is retried next time
    self.postMessage({ id, failed: String(err) });
  }
};
