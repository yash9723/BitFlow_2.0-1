/**
 * scripts/pnr.check.ts — self-check for lib/synth/pnr.ts (npx tsx scripts/pnr.check.ts).
 * Same cases as test_pnr_summary* in tests/test_api.py, so the browser and server
 * summaries stay in step.
 */
import assert from "node:assert/strict";
import { moduleOf, pnrSummary, signalOf } from "../lib/synth/pnr";

const grid = { width: 34, height: 34 };
const report = { fmax: { "clk$SB_IO_IN_$glb_clk": { achieved: 138.29, constraint: 12 } },
  utilization: { ICESTORM_LC: { available: 7680, used: 3 }, SB_GB: { available: 8, used: 0 } } };
const placed = { modules: { top: { attributes: { top: "1" }, cells: {
  a: { attributes: { NEXTPNR_BEL: "X5/Y1/lc7" } }, b: { attributes: { NEXTPNR_BEL: "X5/Y1/lc4" } },
  c: { attributes: { NEXTPNR_BEL: "X13/Y33/io0" } } } } } };
const s = pnrSummary(report, placed, grid);
assert.deepEqual(s.fmax, [{ clock: "clk", mhz: 138.3 }]);
assert.deepEqual(Object.keys(s.utilization), ["ICESTORM_LC"]);
assert.deepEqual(s.tiles, [[5, 1, "logic", 2], [13, 33, "io", 1]]);
assert.deepEqual(s.cells, [["a", "logic", 5, 1], ["b", "logic", 5, 1], ["c", "io", 13, 33]]);
assert.deepEqual(s.critical, []);

const step = (frm: [string, number[]], to: [string, number[]], type: string, delay: number, net?: string) =>
  ({ from: { cell: frm[0], loc: frm[1] }, to: { cell: to[0], loc: to[1] }, type, delay, ...(net ? { net } : {}) });
const paths = pnrSummary({ critical_paths: [
  { from: "<async>", to: "posedge clk$SB_IO_IN_$glb_clk", path: [step(["io", [0, 5]], ["lc", [3, 5]], "routing", 1.0, "en")] },
  { from: "posedge clk$SB_IO_IN_$glb_clk", to: "posedge clk$SB_IO_IN_$glb_clk", path: [
    step(["r0", [1, 2]], ["r0", [1, 2]], "clk-to-q", 0.54),
    step(["r0", [1, 2]], ["add", [2, 2]], "routing", 0.6, "q[0]"),
    step(["add", [2, 2]], ["add", [2, 2]], "logic", 0.4)] },
] }, { modules: {} }, grid);
assert.deepEqual(paths.critical!.map((c) => c.from), ["posedge clk", "<async>"], "slowest first");
const slow = paths.critical![0];
assert.equal(slow.to, "posedge clk");
assert.equal(slow.delay_ns, 1.54);
assert.deepEqual(slow.hops.map((h) => [h.x, h.y, h.type]), [[1, 2, "start"], [1, 2, "clk-to-q"], [2, 2, "routing"], [2, 2, "logic"]]);
assert.equal(slow.hops[2].net, "q[0]");
assert.ok(!("net" in slow.hops[3]));

assert.equal(signalOf("q_SB_DFFESR_Q_7_D_SB_LUT4_O_LC"), "q");
assert.equal(signalOf("alu.sum_SB_LUT4_O"), "alu.sum");
assert.equal(signalOf("$nextpnr_ICESTORM_LC_0"), "(internal)");
assert.equal(moduleOf("cpu.alu.sum_SB_LUT4_O"), "cpu.alu");
assert.equal(moduleOf("count_SB_DFF_Q"), "top");
console.log("pnr: all checks passed");
