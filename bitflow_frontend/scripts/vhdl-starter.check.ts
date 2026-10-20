/**
 * scripts/vhdl-starter.check.ts — self-check for lib/vhdl-starter.ts (Verilog ports -> VHDL entity).
 * npx tsx scripts/vhdl-starter.check.ts
 */
import assert from "node:assert/strict";
import { ansiPorts, vhdlStarter } from "../lib/vhdl-starter";
import { getAllProblems } from "../lib/problems";

const ALL_PROBLEMS = getAllProblems();

// Shared declarations, reg/wire/signed, widths, and comments.
assert.deepEqual(ansiPorts(`module alu (
    input  wire [3:0] a, b,   // operands
    input  wire signed [1:0] op,
    output reg  [3:0] y,
    output zero
); endmodule`), {
  name: "alu",
  ports: [
    { dir: "in", name: "a", hi: 3, lo: 0 }, { dir: "in", name: "b", hi: 3, lo: 0 },
    { dir: "in", name: "op", hi: 1, lo: 0 }, { dir: "out", name: "y", hi: 3, lo: 0 },
    { dir: "out", name: "zero", hi: null, lo: 0 },
  ],
});

// Not faithful as VHDL -> null: parameters, several modules, non-ANSI ports, expression widths.
assert.equal(vhdlStarter("module m #(parameter W = 4) (input [W-1:0] a); endmodule"), null);
assert.equal(vhdlStarter("module a(input x); endmodule\nmodule b(input y); endmodule"), null);
assert.equal(vhdlStarter("module m(a, y); input a; output y; endmodule"), null);
assert.equal(vhdlStarter("module m(input [W-1:0] a); endmodule"), null);

const vhdl = vhdlStarter("module wires (input wire a, output wire [7:0] y); endmodule")!;
assert.match(vhdl, /entity wires is/);
assert.match(vhdl, /a : in\s+std_logic;/);
assert.match(vhdl, /y : out\s+std_logic_vector\(7 downto 0\)\n/);   // last port: no semicolon

// Names VHDL can't use as they are -> null: reserved words, underscore rules, case-only differences.
assert.equal(vhdlStarter("module the_first_wire (input wire in, output wire out); endmodule"), null);
assert.equal(vhdlStarter("module m (input wire a_, output wire y); endmodule"), null);
assert.equal(vhdlStarter("module m (input wire a__b, output wire y); endmodule"), null);
assert.equal(vhdlStarter("module m (input wire A, input wire a, output wire y); endmodule"), null);
assert.equal(vhdlStarter("module signal (input wire a, output wire y); endmodule"), null);

// Most single-module Learn problems get a VHDL starter (RISC-V steps and parameterised ones don't).
const withVhdl = ALL_PROBLEMS.filter((p) => vhdlStarter(p.starterCode));
assert.ok(withVhdl.length >= 50, `only ${withVhdl.length} problems offer VHDL`);
assert.ok(!withVhdl.some((p) => p.slug === "rv-datapath" || p.slug === "rv-cpu"), "multi-module RISC-V steps must stay Verilog-only");

console.log(`vhdl-starter check OK (${withVhdl.length} of ${ALL_PROBLEMS.length} problems offer VHDL)`);
