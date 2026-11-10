/**
 * lib/sim/icarus.ts — Icarus Verilog run in WebAssembly (public/iverilog/, GPL; see SOURCE.md there).
 *
 * Mirrors api/sandbox.py: design.v and tb.v compiled together at -g2012 with -Wall, then run with vvp;
 * the result is a SimulateResponse with the same terminal text, statuses and exit codes, so the
 * terminal, lib/diagnostics.ts and the waveform viewer can't tell the two apart.
 *
 * The three programs (ivlpp → ivl → vvp) each run once per call in a fresh module instance, files passed
 * through their in-memory file systems. The caller supplies the module factories: lib/sim/icarus.worker.ts
 * in the browser, scripts/icarus.check.ts in Node. A run that never ends is the caller's to stop (the
 * worker is terminated). No VPI modules beyond the built-in system tasks; no Verilator lint.
 */

import type { SimulateResponse } from "@/lib/types";

/** An Emscripten module factory (MODULARIZE + EXPORT_ES6) for one of the three programs. */
export type Factory = (opts: Record<string, unknown>) => Promise<EmModule>;
interface EmModule {
  FS: {
    writeFile(path: string, data: string | Uint8Array): void;
    readFile(path: string, opts?: { encoding: "utf8" }): string | Uint8Array;
    readdir(path: string): string[];
  };
  callMain(args: string[]): number | void;
}
export interface Factories { ivlpp: Factory; ivl: Factory; vvp: Factory; locateFile?: (path: string) => string }

export interface IcarusRequest {
  design: string;
  testbench: string;
  files?: Record<string, string>;   // $readmemh data and the like, next to design.v
  compileOnly?: boolean;            // stop after compiling: the editor's live check
}

export const MAX_OUTPUT = 1_000_000;            // characters of terminal output kept
export const MAX_VCD = 8 * 1024 * 1024;         // a larger dump is dropped

// What iverilog's driver writes for `iverilog -g2012 -Wall`; tgt-vvp and system.vpi are linked in.
const CONF = `basedir:/
module:system.vpi
module:v2009.vpi
generation:2012
generation:no-specify
warnings:ailpstv
out:/out.vvp
iwidth:32
widthcap:65536
functor:cprop
functor:nodangle
flag:DLL=vvp.tgt
`;

// The build has its VPI modules linked in; its attempts to load them dynamically fail harmlessly.
const NOISE = /dynamic linking not enabled|Failed to open '(system|v2009|v2005_math)\.vpi'/;
const COMPILE_ERROR = /^\S+\.s?v:\d+: (?:error: )?.*(?:error|Unknown module|I give up)/i;   // api/sandbox.py

/** iverilog's lines as the server shows them: no leading "/" on file names, no noise. */
export function cleanLines(lines: string[]): string[] {
  return lines
    .filter((l) => !NOISE.test(l))
    .map((l) => l.replace(/(^|[\s(])\/([\w.-]+\.s?v:\d+)/g, "$1$2"));
}

/**
 * A system task this build lacks: it links system.vpi only, so the SystemVerilog ones ($isunknown,
 * $countones, $onehot…) that native Icarus loads from v2009.vpi are missing. The run should go to the server.
 */
export function missingSystemTask(stdout: string): string | null {
  return /System task\/function (\$\w+)\(\) is not defined by any module/.exec(stdout)?.[1] ?? null;
}

/** api/sandbox.py compile_hint: a plain next step for the two compile errors students hit most. */
export function compileHint(cause: string): string | null {
  let m = /'(\w+)' has already been declared/.exec(cause);
  if (m) return `'${m[1]}' is declared twice. If it is a module, your files contain two copies of it: delete one (or load a template, which replaces both editors).`;
  m = /Unknown module type: (\w+)/.exec(cause);
  if (m) return `there is no module named '${m[1]}'. Check the name, or the testbench may belong to a different design.`;
  return null;
}

const toBase64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** One program run: its printed lines and exit code (Emscripten's exit() becomes a thrown status we catch). */
async function run(factory: Factory, locateFile: Factories["locateFile"], args: string[],
                   files: Record<string, string | Uint8Array>): Promise<{ lines: string[]; code: number; module: EmModule }> {
  const lines: string[] = [];
  let code = 0;
  let size = 0;
  const keep = (s: string) => { if (size < MAX_OUTPUT) { lines.push(s); size += s.length + 1; } };
  const module = await factory({
    ...(locateFile ? { locateFile } : {}),
    print: keep, printErr: keep,
    noInitialRun: true,
    quit: (status: number, toThrow: unknown) => { code = status; throw toThrow; },
  });
  for (const [name, data] of Object.entries(files)) module.FS.writeFile("/" + name, data);
  try {
    const rc = module.callMain(args);
    if (typeof rc === "number") code = rc;
  } catch (e) {
    const status = (e as { status?: number } | null)?.status;
    if (typeof status === "number") code = status;
    else if (code === 0) throw e;
  }
  return { lines, code, module };
}

const STATUS = ["success", "file_missing", "compile_error", "timeout", "runtime_error", "internal_error"] as const;

export async function runIcarus(f: Factories, req: IcarusRequest): Promise<SimulateResponse> {
  const t0 = Date.now();
  const nl = (s: string) => (s.endsWith("\n") ? s : s + "\n");
  const data = req.files ?? {};
  const stdout: string[] = [];
  const done = (exit_code: number, vcd: string | null = null): SimulateResponse => ({
    status: STATUS[exit_code] ?? "unknown",
    exit_code, success: exit_code === 0,
    stdout: stdout.join("\n"), stderr: "",
    waveform: vcd !== null && vcd.length <= MAX_VCD
      ? { available: true, size_bytes: vcd.length, vcd_base64: toBase64(vcd) }
      : { available: false, size_bytes: vcd?.length ?? 0, vcd_base64: null },
    duration_ms: Date.now() - t0,
    workspace_id: "browser",
  });

  // 1. Preprocess both files in one pass (shared `define`s; `include` sees the data files), with `line markers.
  stdout.push("--- Compiling ---");
  const pp = await run(f.ivlpp, f.locateFile, ["-L", "/design.v", "/tb.v"],
                       { ...data, "design.v": nl(req.design), "tb.v": nl(req.testbench) });
  if (pp.code !== 0) {
    stdout.push(cleanLines(pp.lines).join("\n"), "[ERROR] Compilation failed (preprocessor).");
    return done(2);
  }

  // 2. Compile; the `line markers make diagnostics name design.v / tb.v.
  const ivl = await run(f.ivl, f.locateFile, ["-C/ivl.conf", "--", "/src.v"],
                        { "ivl.conf": CONF, "src.v": pp.lines.join("\n") + "\n" });
  let program: Uint8Array | null = null;
  try { program = ivl.module.FS.readFile("/out.vvp") as Uint8Array; } catch { program = null; }
  const compileOut = cleanLines(ivl.lines);
  if (compileOut.length) stdout.push(compileOut.join("\n"));
  if (ivl.code !== 0 || !program) {
    const cause = compileOut.map((l) => l.trim()).find((l) => COMPILE_ERROR.test(l)) ?? null;
    stdout.push(cause ? `[ERROR] Compilation failed: ${cause}` : "[ERROR] Compilation failed (iverilog exited with error).");
    const hint = cause && compileHint(cause);
    if (hint) stdout.push(`Hint: ${hint}`);
    return done(2);
  }
  stdout.push("[OK] Compilation successful → a.out");
  if (req.compileOnly) return done(0);

  // 3. Simulate. Testbenches pick their own dump name: take whichever .vcd appears.
  stdout.push("\n--- Simulating (in your browser) ---");
  const sim = await run(f.vvp, f.locateFile, ["/a.out"], { ...data, "a.out": program });
  if (sim.lines.length) stdout.push(cleanLines(sim.lines).join("\n"));
  stdout.push(sim.code !== 0 ? `[ERROR] Simulation runtime error (vvp exit code: ${sim.code}).` : "[OK] Simulation finished successfully.");
  const dumps = sim.module.FS.readdir("/").filter((n) => n.endsWith(".vcd"));
  const vcd = dumps.length ? (sim.module.FS.readFile("/" + dumps[0], { encoding: "utf8" }) as string) : null;
  if (vcd === null) stdout.push("[WARN] No VCD file produced. Check that your testbench calls $dumpfile/$dumpvars.");
  else if (vcd.length > MAX_VCD) stdout.push(`[WARN] The waveform is ${(vcd.length / 1048576).toFixed(1)} MB, over the 8 MB limit: dump fewer signals or a shorter time.`);
  else stdout.push(`[OK] Waveform written → wave.vcd (${vcd.length} bytes)`);
  return done(sim.code === 0 ? 0 : 4, vcd);
}
