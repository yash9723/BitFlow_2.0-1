/** scripts/asic-path.check.ts — lib/asic-path.ts on paths shaped like OpenSTA's (tests/test_asic.py SETUP_REPORT). */
import assert from "node:assert/strict";
import { pathCells, slowestCell, type PathStage } from "../lib/asic-path";

const st = (pin: string, cell: string, delay: number, arrival: number, net: string | null = null): PathStage =>
  ({ pin, cell, edge: "rise", delay, arrival, net });

// Register to register: _20_ (CLK, Q) → _15_ and4 → _23_ D
const reg = pathCells([
  st("_20_/CLK", "dfxtp_1", 0, 0),
  st("_20_/Q", "dfxtp_1", 0.372, 0.372, "q[0]"),
  st("_15_/X", "and4_1", 0.246, 0.619, "_04_"),
  st("_23_/D", "dfxtp_1", 0.003, 0.622),
]);
assert.deepEqual(reg.map((c) => c.instance), ["_20_", "_15_", "_23_"]);
assert.deepEqual(reg[0].pins, ["CLK", "Q"]);
assert.equal(reg[0].delay, 0.372);
assert.equal(reg[0].net, "q[0]", "the net leaving the start register");
assert.equal(reg[2].arrival, 0.622);
assert.equal(slowestCell(reg), 0);
assert.ok(reg.every((c) => !c.port));

// Combinational: input port → gate → output port
const comb = pathCells([st("a", "input port", 0, 0, "a"), st("_7_/Y", "nand2_1", 0.1, 0.1, "y"), st("y", "output port", 0, 0.1)]);
assert.deepEqual(comb.map((c) => [c.instance, c.port]), [["a", true], ["_7_", false], ["y", true]]);
assert.equal(slowestCell(comb), 1);

// Floating-point sums stay readable, and empty paths are fine.
assert.equal(pathCells([st("_1_/A", "inv_1", 0.1, 0.1), st("_1_/Y", "inv_1", 0.2, 0.3)])[0].delay, 0.3);
assert.deepEqual(pathCells([]), []);
assert.equal(slowestCell([]), -1);

console.log("asic-path: all checks passed");
