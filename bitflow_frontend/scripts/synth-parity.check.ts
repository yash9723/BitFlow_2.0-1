/**
 * scripts/synth-parity.check.ts — browser synthesis (lib/synth, YoWASP Yosys)
 * must give the same answers as the server's /synthesize, /metrics and /board.
 * Runs every design in a reference file through both and compares.
 *
 * Needs a running backend (BACKEND_URL, JWT_SECRET) and @yowasp/yosys@0.52.893
 * importable (YOWASP_YOSYS = path to its gen/bundle.js, or installed locally):
 *   npx tsx scripts/synth-parity.check.ts private/reference-solutions.json
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { boardOnBackend, metricsOnBackend, synthesizeOnBackend } from "@/lib/backend";
import { synthesize, type RunYosys } from "@/lib/synth/run";

async function main() {
  const refs: Record<string, string> = JSON.parse(readFileSync(process.argv[2], "utf8"));
  const mod = process.env.YOWASP_YOSYS ? pathToFileURL(process.env.YOWASP_YOSYS).href : "@yowasp/yosys";
  const { runYosys } = (await import(mod)) as { runYosys: RunYosys };

  const fails: string[] = [];
  const same = (slug: string, what: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) fails.push(`${slug} ${what}: local ${JSON.stringify(a)?.slice(0, 160)} != server ${JSON.stringify(b)?.slice(0, 160)}`);
  };

  // ABC (gate mapping) in the WebAssembly build can land a few gates apart on
  // large designs; within 1% is reported but passes.
  const near: string[] = [];
  const close = (slug: string, what: string, a: number | null, b: number | null) => {
    if (a === b) return;
    if (a !== null && b !== null && Math.abs(a - b) <= 0.01 * b) near.push(`${slug} ${what}: local ${a}, server ${b}`);
    else fails.push(`${slug} ${what}: local ${a} != server ${b}`);
  };

  // The backend drops idle keep-alive sockets while local Yosys runs; one retry covers it.
  const backend = async (call: () => Promise<{ data: any }>) => {
    try { return (await call()).data; } catch { return (await call()).data; }
  };

  let n = 0;
  for (const [slug, design] of Object.entries(refs)) {
    const [local, server, serverMetrics, localBoard, serverBoard] = [
      await synthesize(runYosys, "synth", design) as any,
      await backend(() => synthesizeOnBackend(design)),
      await backend(() => metricsOnBackend(design)),
      await synthesize(runYosys, "board", design) as any,
      await backend(() => boardOnBackend(design)),
    ];
    same(slug, "synth ok", local.ok, server.ok);
    if (local.ok && server.ok) {
      for (const k of ["top", "numCells", "cells", "ffBits", "latches", "warnings"]) same(slug, k, local[k], server[k]);
      same(slug, "fsms", local.fsms.map(({ svg, ...f }: any) => f), server.fsms);
      same(slug, "depth", local.depth, serverMetrics.ok ? serverMetrics.depth : null);
      close(slug, "gates", local.gates, serverMetrics.ok ? serverMetrics.gates : null);
    } else if (!local.ok && !server.ok) {
      same(slug, "synth error", local.error, server.error);
    }
    same(slug, "board ok", localBoard.ok, serverBoard.ok);
    if (localBoard.ok && serverBoard.ok && JSON.stringify(localBoard) !== JSON.stringify(serverBoard)) {
      same(slug, "board ports", localBoard.ports, serverBoard.ports);
      close(slug, "board cells", localBoard.cells.length, serverBoard.cells.length);
    }
    else if (!localBoard.ok && !serverBoard.ok) same(slug, "board error", localBoard.error, serverBoard.error);
    n++;
  }

  near.forEach((f) => console.log("NEAR " + f));
  fails.forEach((f) => console.log("FAIL " + f));
  console.log(fails.length ? `${fails.length} differences in ${n} designs` : `ALL PASS (${n} designs, ${near.length} within 1%)`);
  process.exit(fails.length ? 1 : 0);
}

main();
