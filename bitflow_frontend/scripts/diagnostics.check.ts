/**
 * scripts/diagnostics.check.ts — self-check for lib/diagnostics.ts (npx tsx scripts/diagnostics.check.ts).
 * Inputs are real simulation outputs from the API.
 */
import assert from "node:assert/strict";
import { parseDiagnostics } from "../lib/diagnostics";

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
assert.deepEqual(parseDiagnostics(undefined), { design: [], tb: [] });
assert.deepEqual(parseDiagnostics("[OK] Compilation successful → a.out\nALL TESTS PASSED"), { design: [], tb: [] });

console.log("diagnostics: all checks passed");
