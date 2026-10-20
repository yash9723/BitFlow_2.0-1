/**
 * scripts/diagnostics.check.ts — self-check for lib/diagnostics.ts (npx tsx scripts/diagnostics.check.ts).
 * Inputs are real simulation outputs from the API.
 */
import assert from "node:assert/strict";
import { parseDiagnostics } from "../lib/diagnostics";
import { combineDesign, dataFiles, fileNameProblem, relabelOutput, type ProjectFile } from "../lib/project-files";

const lint = `--- Lint (Verilator) ---
%Warning-MULTITOP: design.v:5:8: Multiple top level modules
                               : ... Suggest see manual; fix the duplicates, or use --top-module to select top.
    1 | module m(input [3:0] a, output [1:0] y);
      |        ^
%Warning-WIDTHTRUNC: design.v:3:12: Operator ASSIGNW expects 2 bits on the Assign RHS, but Assign RHS's VARREF 'a' generates 4 bits.
                                  : ... note: In instance 'm'
%Error: design.v:3:1: syntax error, unexpected endmodule, expecting ',' or ';'
%Error: Cannot continue
--- Compiling ---
design.v:3: syntax error
design.v:2: error: Syntax error in continuous assignment
tb.v:5: error: Unknown module type: nosuch
design.v:2: error: 'm' has already been declared in this scope.
design.v:1:      : It was declared here as a module.
design.v:4: warning: implicit definition of wire 'x'.
design.v:3: syntax error

[ERROR] Compilation failed: design.v:3: syntax error
y=1
/tmp/verilog_bc5ca9c16cc3_mjmo0huc/tb.v:4: $finish called at 1 (1s)
tb.v:9: $finish called at 100 (1ps)
`;

const d = parseDiagnostics(lint);
assert.deepEqual(d.design.map((x) => [x.line, x.column ?? null, x.severity]), [
  [5, 8, "warning"], [3, 12, "warning"], [3, 1, "error"],
  [3, null, "error"], [2, null, "error"], [2, null, "error"], [4, null, "warning"],
], "design.v diagnostics in order, deduped, notes skipped");
assert.equal(d.design[0].message, "Multiple top level modules (MULTITOP)");
assert.equal(d.design[4].message, "Syntax error in continuous assignment", "'error:' prefix stripped");
assert.deepEqual(d.tb, [{ line: 5, severity: "error", message: "Unknown module type: nosuch" }], "runtime $finish lines ignored");
const empty = { design: [], tb: [], files: { "design.v": [], "tb.v": [] } };
assert.deepEqual(parseDiagnostics(undefined), empty);
assert.deepEqual(parseDiagnostics("[OK] Compilation successful → a.out\nALL TESTS PASSED"), empty);

// ── Multi-file projects (lib/project-files.ts) ──────────────────────────────
const main = "module top(input a, output y);\n  alu u(.a(a), .y(y));\nendmodule";            // lines 1-3
const files: ProjectFile[] = [
  { name: "alu.v", content: "module alu(input a, output y);\n  assign y = ~a\nendmodule\n" },  // lines 4-6
  { name: "rom.hex", content: "00\nFF\n" },
  { name: "regs.sv", content: "module regs;\nendmodule" },                                       // lines 7-8
];
const c = combineDesign(main, files);
assert.ok(c.multi);
assert.equal(c.code.split("\n").length - 1, 8, "data files are not part of the design");
assert.deepEqual([1, 3, 4, 5, 6, 7, 8].map((n) => c.locate(n)), [
  { file: "design.v", line: 1 }, { file: "design.v", line: 3 }, { file: "alu.v", line: 1 }, { file: "alu.v", line: 2 },
  { file: "alu.v", line: 3 }, { file: "regs.sv", line: 1 }, { file: "regs.sv", line: 2 },
]);
assert.deepEqual(dataFiles(files), { "rom.hex": "00\nFF\n" });
assert.equal(dataFiles([]), undefined);
const relabelled = relabelOutput("design.v:6: syntax error\n%Error: design.v:5:14: syntax error\ndesign.v:2: error: x", c.locate)!;
assert.equal(relabelled, "alu.v:3: syntax error\n%Error: alu.v:2:14: syntax error\ndesign.v:2: error: x");
const md = parseDiagnostics(relabelled);
assert.deepEqual(Object.keys(md.files).sort(), ["alu.v", "design.v", "tb.v"]);
assert.deepEqual(md.files["alu.v"].map((x) => [x.line, x.column ?? null]), [[3, null], [2, 14]]);
assert.equal(md.design.length, 1, "design.v keeps its own line");
assert.equal(combineDesign(main, []).multi, false);
assert.equal(fileNameProblem("alu.v", files), "alu.v already exists.");
assert.equal(fileNameProblem("tb.v", files), "tb.v already exists.");
assert.match(fileNameProblem("../x.v", files) ?? "", /letters/);
assert.equal(fileNameProblem("cpu.v", files), null);
assert.match(fileNameProblem("x.py", files) ?? "", /Python/);

console.log("diagnostics: all checks passed");
