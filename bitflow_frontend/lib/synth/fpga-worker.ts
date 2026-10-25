/// <reference lib="webworker" />
/**
 * lib/synth/fpga-worker.ts — builds bitstreams (lib/synth/fpga.ts) with YoWASP Yosys and
 * the board family's nextpnr + packer, fetched from jsDelivr. One worker serves one board:
 * YoWASP fetches every chip database it lists on first run, so the list is cut to this
 * board's before the first run; lib/synth/client.ts starts a new worker when the board changes.
 *   iCE40 / ECP5: the resource lists name each chip database (and Trellis device) by URL.
 *   Gowin: the resources are one 181 MB tar of every chip; this board's chip database comes
 *   from /fpga (scripts/vendor-gowin.mjs) instead, and gowin_pack runs in Pyodide.
 * Xilinx / Intel boards only need Yosys, for the ports (portsForExport).
 */
import { BOARDS, type BoardId } from "./boards";
import { buildBitstream, portsForExport, type FpgaTools } from "./fpga";
import type { RunYosys } from "./run";

const CDN = "https://cdn.jsdelivr.net/npm/@yowasp";
const YOSYS   = `${CDN}/yosys@0.52.893/gen/bundle.js`;
const ICE40   = `${CDN}/nextpnr-ice40@0.7.519/gen`;
const ECP5    = `${CDN}/nextpnr-ecp5@0.7.519/gen`;
const GOWIN   = `${CDN}/nextpnr-himbaechel-gowin@0.10.752/gen`;
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const GOWIN_DATA = "/fpga/gowin-0.10.752";

const load = (url: string) => import(/* webpackIgnore: true */ url);

/** Keep only `keep` among the entries of a YoWASP resource directory. */
function trim(dir: Record<string, unknown>, isChoice: (name: string) => boolean, keep: string) {
  for (const name of Object.keys(dir)) if (isChoice(name) && name !== keep) delete dir[name];
}

async function gunzip(res: Response): Promise<Uint8Array> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;   // already decoded by the server
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
}

/** Serve the Gowin resource tars from this board's chip database plus apicula, instead of all 181 MB. */
function gowinFetch(chip: string): typeof fetch {
  const real = self.fetch.bind(self);
  let tar: Promise<Uint8Array> | null = null;
  const build = async () => {
    const [chipdb, python] = await Promise.all([`chipdb-${chip}.tar.gz`, "python.tar.gz"].map(async (f) => {
      const res = await real(`${GOWIN_DATA}/${f}`);
      if (!res.ok) throw new Error(`${f}: HTTP ${res.status}`);
      return gunzip(res);
    }));
    const out = new Uint8Array(chipdb.length + python.length + 1024);   // + the tar's two end blocks
    out.set(chipdb, 0);
    out.set(python, chipdb.length);
    return out;
  };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const part = String(input instanceof Request ? input.url : input).match(/nextpnr-himbaechel-gowin-resources\.(\d)\.tar$/);
    if (!part) return real(input, init);
    if (part[1] !== "0") return new Response(new Uint8Array(0));
    tar ??= build();
    return new Response((await tar).slice());
  }) as typeof fetch;
}

/** Pyodide with what apicula needs; fastcrc (a Rust extension) is mocked: apicula falls back to Python. */
async function loadPyodide(options: object) {
  const { loadPyodide: start } = await load(`${PYODIDE}pyodide.mjs`);
  const py = await start({ ...options, indexURL: PYODIDE });
  await py.loadPackage(["micropip", "numpy", "msgspec", "lzma"]);
  await py.runPythonAsync('import micropip; micropip.add_mock_package("fastcrc", "0.3.2", modules={"fastcrc": ""})');
  return py;
}

async function tools(boardId: BoardId): Promise<FpgaTools | { runYosys: RunYosys }> {
  const board = BOARDS[boardId];
  if (board.family === "ice40") {
    const res = await load(`${ICE40}/resources-nextpnr-ice40.js`);
    trim(res.filesystem.share.ice40, () => true, board.chip);
    const [y, n] = await Promise.all([load(YOSYS), load(`${ICE40}/bundle.js`)]);
    return { runYosys: y.runYosys, runNextpnr: n.runNextpnrIce40, runPack: n.runIcepack };
  }
  if (board.family === "ecp5") {
    const res = await load(`${ECP5}/resources-nextpnr-ecp5.js`);
    trim(res.filesystem.share.ecp5, () => true, board.chip);
    trim(res.filesystem.share.trellis.database.ECP5, (name) => name.startsWith("LFE5"), board.trellis!);
    const [y, n] = await Promise.all([load(YOSYS), load(`${ECP5}/bundle.js`)]);
    return { runYosys: y.runYosys, runNextpnr: n.runNextpnrEcp5, runPack: n.runEcppack };
  }
  if (board.family === "gowin") {
    self.fetch = gowinFetch(board.chip);   // before the import: the YoWASP runtime keeps the fetch it finds
    const [y, n] = await Promise.all([load(YOSYS), load(`${GOWIN}/bundle.js`)]);
    const runPack: RunYosys = (args, files, options) => n.runGowinPack(args, files, { ...options, loadPyodide });
    return { runYosys: y.runYosys, runNextpnr: n.runNextpnrHimbaechelGowin, runPack };
  }
  return { runYosys: (await load(YOSYS)).runYosys };
}

let loaded: ReturnType<typeof tools> | null = null;

self.onmessage = async (e: MessageEvent<{ id: number; board: BoardId; design: string; export?: boolean }>) => {
  const { id, board, design } = e.data;
  try {
    loaded ??= tools(board);
    const t = await loaded;
    if (e.data.export || !("runNextpnr" in t)) {
      self.postMessage({ id, result: await portsForExport(t.runYosys, board, design) });
      return;
    }
    const result = await buildBitstream(t, board, design);
    self.postMessage({ id, result }, result.ok ? [result.bin.buffer] : []);
  } catch (err) {
    loaded = null;
    self.postMessage({ id, failed: String(err) });
  }
};
