/**
 * scripts/chip-xray.check.ts — lib/chip-xray.ts on a real Yosys gate netlist (scripts/fixtures/xray-gates.json,
 * from scripts/fixtures/xray-design.v mapped as api/routes/asic.py maps it, with generic gates) and on a small
 * Sky130-style netlist without port directions.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { gateLines, pathByLine, xrayNetlist } from "../lib/chip-xray";
import { parseSrc, type YosysNetlist } from "../lib/hardware-diagrams";

const dir = path.join(__dirname, "fixtures");
const code = fs.readFileSync(path.join(dir, "xray-design.v"), "utf8");
const netlist: YosysNetlist = JSON.parse(fs.readFileSync(path.join(dir, "xray-gates.json"), "utf8"));
const mod = netlist.modules!.top;

// ── Every gate gets a line, and the right one ──
const lines = gateLines(mod, code);
const of = (type: RegExp) => Object.entries(mod.cells!).filter(([, c]) => type.test(c.type)).map(([n]) => lines.get(n)!);
assert.equal(lines.size, Object.keys(mod.cells!).length);
for (const [name, l] of lines) assert.ok(l.length > 0, `${name} (${mod.cells![name].type}) has a line`);
assert.ok(of(/DFF/).every((l) => l[0] === 5), "registers: their always block (line 5)");
const byLine = (n: number) => [...lines].filter(([, l]) => l.includes(n)).length;
assert.ok(byLine(7) >= 3, `the adder q + a is on line 7 (${byLine(7)} gates)`);
assert.ok(byLine(3) >= 4, `s = t ^ b is on line 3 (${byLine(3)} gates)`);
assert.ok(byLine(4) >= 1, "the parity p = ^a is on line 4");
assert.ok(byLine(1) === 0, "nothing is pinned to the port declarations");

// ── The drawable netlist: src set, ranges kept for registers ──
const { netlist: drawn } = xrayNetlist(netlist, "top", code);
const cells = Object.values(drawn.modules!.top.cells!);
assert.ok(cells.every((c) => parseSrc(c.attributes?.src).length > 0), "every gate can open its line");
assert.ok(cells.filter((c) => /DFF/.test(c.type)).every((c) => parseSrc(c.attributes?.src)[0].endLine === 7), "a register keeps its whole always block");
assert.deepEqual(xrayNetlist(netlist, "nope", code).lines.size, 0, "unknown top: unchanged");
assert.equal(xrayNetlist(netlist, "top", null).lines.size, 0, "no code (VHDL): no lines");

// ── Sky130 cells (no port_directions): outputs from pin names, short type names ──
const sky: YosysNetlist = { modules: { m: {
  ports: { a: { direction: "input", bits: [2] }, b: { direction: "input", bits: [3] }, y: { direction: "output", bits: [5] } },
  cells: {
    _1_: { type: "sky130_fd_sc_hd__nand2_1", connections: { A: [2], B: [3], Y: [4] } },
    _2_: { type: "sky130_fd_sc_hd__inv_1", connections: { A: [4], Y: [5] } },
  },
  netnames: { a: { bits: [2] }, b: { bits: [3] }, y: { bits: [5] }, _3_: { bits: [4] } },
} } };
const skyCode = "module m(input a, input b, output y);\n  assign y = a & b;\nendmodule\n";
const sx = xrayNetlist(sky, "m", skyCode);
assert.deepEqual(sx.netlist.modules!.m.cells!._1_.port_directions, { A: "input", B: "input", Y: "output" });
assert.equal(sx.netlist.modules!.m.cells!._1_.type, "nand2_1");
assert.deepEqual(sx.lines.get("_1_"), [2], "found downstream: nand → inv → y, driven on line 2");
assert.deepEqual(sx.lines.get("_2_"), [2]);

// ── Critical-path time by line ──
const stages = [
  { pin: "a", cell: "input port", edge: "rise" as const, delay: 0, arrival: 0, net: "a" },
  { pin: "_1_/A", cell: "nand2_1", edge: "rise" as const, delay: 0.01, arrival: 0.01, net: "a" },
  { pin: "_1_/Y", cell: "nand2_1", edge: "fall" as const, delay: 0.09, arrival: 0.1, net: "_3_" },
  { pin: "_2_/A", cell: "inv_1", edge: "fall" as const, delay: 0.0, arrival: 0.1, net: "_3_" },
  { pin: "_2_/Y", cell: "inv_1", edge: "rise" as const, delay: 0.05, arrival: 0.15, net: "y" },
  { pin: "y", cell: "output port", edge: "rise" as const, delay: 0, arrival: 0.15, net: null },
];
const per = pathByLine(stages, sx.lines);
assert.equal(per.length, 1);
assert.equal(per[0].line, 2);
assert.deepEqual(per[0].cells, ["_1_", "_2_"]);
assert.ok(Math.abs(per[0].delay - 0.15) < 1e-9);
assert.equal(pathByLine(stages, new Map())[0].line, null, "cells without a line");

console.log("chip-xray: all checks passed");
