/// <reference lib="webworker" />
/**
 * lib/synth/fpga-worker.ts — builds bitstreams (lib/synth/fpga.ts) with YoWASP
 * Yosys + nextpnr-ice40 + icepack, fetched from jsDelivr. One worker serves one
 * board: YoWASP fetches every chip database it lists on first run (220 MB), so
 * the list is cut to this board's before the first run; lib/synth/client.ts
 * starts a new worker when the board changes.
 */
import { BOARDS, type BoardId } from "./boards";
import { buildBitstream, type FpgaTools } from "./fpga";

const CDN = "https://cdn.jsdelivr.net/npm/@yowasp";
const YOSYS     = `${CDN}/yosys@0.52.893/gen/bundle.js`;
const NEXTPNR   = `${CDN}/nextpnr-ice40@0.7.519/gen/bundle.js`;
const RESOURCES = `${CDN}/nextpnr-ice40@0.7.519/gen/resources-nextpnr-ice40.js`;   // what NEXTPNR imports

let tools: Promise<FpgaTools> | null = null;

async function load(board: BoardId): Promise<FpgaTools> {
  const res = await import(/* webpackIgnore: true */ RESOURCES);
  const chips: Record<string, unknown> = res.filesystem.share.ice40;
  for (const name of Object.keys(chips)) if (name !== BOARDS[board].chipdb) delete chips[name];
  const [y, n] = await Promise.all([import(/* webpackIgnore: true */ YOSYS), import(/* webpackIgnore: true */ NEXTPNR)]);
  return { runYosys: y.runYosys, runNextpnrIce40: n.runNextpnrIce40, runIcepack: n.runIcepack };
}

self.onmessage = async (e: MessageEvent<{ id: number; board: BoardId; design: string }>) => {
  const { id, board, design } = e.data;
  try {
    tools ??= load(board);
    const result = await buildBitstream(await tools, board, design);
    self.postMessage({ id, result }, result.ok ? [result.bin.buffer] : []);
  } catch (err) {
    tools = null;
    self.postMessage({ id, failed: String(err) });
  }
};
