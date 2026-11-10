/**
 * scripts/verilog-lang.check.ts — self-check for lib/verilog-lang.ts: the index, hover and
 * definitions, the instance snippet, Yosys messages, and the formatter: exact output on known
 * code, and over every template and problem in the repo it changes only whitespace and a second
 * pass changes nothing.
 *   npx tsx scripts/verilog-lang.check.ts
 */
import assert from "node:assert/strict";
import { TEMPLATES } from "@/lib/templates";
import { getAllProblems } from "@/lib/problems";
import { definitionOf, driverOf, formatVerilog, hoverFor, indexVerilog, instanceAt, instanceSnippet, moduleAt, parseYosysMessages, referencesOf, renameProblem } from "@/lib/verilog-lang";

const alu = `module alu #(parameter W = 8) (
    input  wire [W-1:0] a, b,
    input  wire [1:0]   op,
    output reg  [W-1:0] y
);
    wire [W:0] sum;   // carry out in sum[W]
    assign sum = a + b;
    always @(*) y = sum[W-1:0];
endmodule`;
const top = `module top(input clk, output [7:0] led);
    reg [7:0] count;
    /* not a declaration: wire ghost; */
    alu #(.W(8)) u (.a(count), .b(8'd1), .op(2'd0), .y(led));
endmodule`;

const index = indexVerilog([{ name: "alu.v", text: alu }, { name: "design.v", text: top }]);
assert.deepEqual(index.modules.map((m) => [m.name, m.file, m.line]), [["alu", "alu.v", 1], ["top", "design.v", 1]]);
assert.deepEqual(index.modules[0].info?.ports.map((p) => [p.dir, p.name, p.width]), [["input", "a", 8], ["input", "b", 8], ["input", "op", 2], ["output", "y", 8]]);
const decl = (name: string) => index.decls.find((d) => d.name === name);
assert.deepEqual([decl("sum")?.kind, decl("sum")?.range, decl("sum")?.module, decl("sum")?.line], ["wire", "[W:0]", "alu", 6]);
assert.deepEqual([decl("count")?.kind, decl("count")?.module, decl("count")?.line], ["reg", "top", 2]);
assert.equal(decl("b")?.range, "[W-1:0]", "a, b share the range");
assert.equal(decl("ghost"), undefined, "commented code isn't indexed");

assert.match(hoverFor(index, "alu", null)!, /module alu #\(W = 8\) \(\n  input \[W-1:0\] a,/);
assert.match(hoverFor(index, "count", "top")!, /reg \[7:0\] count\n```\nin top, design.v line 2/);
assert.equal(hoverFor(index, "nothing", null), null);
assert.deepEqual(definitionOf(index, "sum", "alu"), { file: "alu.v", line: 6 });
assert.deepEqual(definitionOf(index, "alu", "top"), { file: "alu.v", line: 1 });
assert.equal(moduleAt(top, 3), "top");
assert.equal(moduleAt(alu + "\n\n", 11), null, "after endmodule");

const snippet = instanceSnippet(index.modules[0]);
assert.equal(snippet, "alu #(\n\t.W(${2:8})\n) ${1:u_alu} (\n\t.a  (${3:a}),\n\t.b  (${4:b}),\n\t.op (${5:op}),\n\t.y  (${6:y})\n);");

assert.deepEqual(parseYosysMessages("design.v:3: ERROR: syntax error, unexpected TOK_ENDMODULE\n"), [{ line: 3, severity: "error", message: "syntax error, unexpected TOK_ENDMODULE" }]);
assert.deepEqual(parseYosysMessages("design.v:2: Warning: Identifier `\\q' is implicitly declared.\n"), [{ line: 2, severity: "warning", message: "Identifier 'q' is implicitly declared." }]);
console.log("index, hover, definitions, snippets, messages: ok");

// Formatter: exact output.
const messy = `module counter #(
parameter WIDTH = 4
)(
input wire clk,
   input wire rst,
output reg [WIDTH-1:0] count
);
always @(posedge clk)
if (rst)
count <= 0;
else if (en)
count <= count + 1;
always @(*) begin
case (count)
4'd0: y = 1;
default: begin
y = 0;
end
endcase
end
/* keep
      this as it is */
counter #(.WIDTH(4)) u (
.clk(clk),
.rst(rst)
);
endmodule`;
assert.equal(formatVerilog(messy), `module counter #(
    parameter WIDTH = 4
)(
    input wire clk,
    input wire rst,
    output reg [WIDTH-1:0] count
);
    always @(posedge clk)
        if (rst)
            count <= 0;
        else if (en)
            count <= count + 1;
    always @(*) begin
        case (count)
            4'd0: y = 1;
            default: begin
                y = 0;
            end
        endcase
    end
    /* keep
      this as it is */
    counter #(.WIDTH(4)) u (
        .clk(clk),
        .rst(rst)
    );
endmodule`);
assert.equal(formatVerilog("module a(input x, output y);\nassign y = x; // ok\nendmodule"), "module a(input x, output y);\n    assign y = x; // ok\nendmodule");
assert.equal(formatVerilog("if (a) begin\nx = 1;\nend else begin\nx = 2;\nend"), "if (a) begin\n    x = 1;\nend else begin\n    x = 2;\nend");

// Formatter over real code: only whitespace changes, and it is stable.
const corpus: [string, string][] = [];
for (const [k, t] of Object.entries(TEMPLATES)) {
  if ((t.designLanguage ?? "verilog") === "verilog") corpus.push([`template ${k} design`, t.design]);
  if ((t.testbenchLanguage ?? "verilog") === "verilog") corpus.push([`template ${k} testbench`, t.testbench]);
}
for (const p of getAllProblems()) {
  for (const [field, code] of [["starter", p.starterCode], ["public tb", p.publicTestbench], ["hidden tb", p.hiddenTestbench]] as const) {
    if (code && !/\bentity\b/i.test(code)) corpus.push([`${p.slug} ${field}`, code]);
  }
}
const squash = (s: string) => s.replace(/\s+/g, "");
for (const [label, code] of corpus) {
  const once = formatVerilog(code);
  assert.equal(squash(once), squash(code), `${label}: only whitespace changes`);
  assert.equal(formatVerilog(once), once, `${label}: a second pass changes nothing`);
}
console.log(`formatter: ok (${corpus.length} real files)`);

// ── References, rename, instance signature help (across files) ──
{
  const alu = { name: "alu.v", text: "module alu (\n  input  [3:0] a, b,\n  output [3:0] y\n);\n  // a comment about y\n  assign y = a + b;\nendmodule\n" };
  const top = { name: "design.v", text: "module top (input [3:0] a, output [3:0] y);\n  wire [3:0] b = 4'd1;\n  alu u_alu (.a(a), .b(b), .y(y));\nendmodule\n" };
  const tb = { name: "tb.v", text: "module tb;\n  reg [3:0] a; wire [3:0] y;\n  top dut (.a(a), .y(y));\n  initial $display(\"y=%d\", y);\nendmodule\n" };
  const files = [alu, top, tb];
  const at = (l: { file: string; line: number; column: number }) => `${l.file}:${l.line}:${l.column}`;

  // A port of alu: its uses inside alu, plus `.y(` at alu's instance in design.v, not the comment, not top's own y.
  assert.deepEqual(referencesOf(files, "y", "alu.v", 3).map(at), ["alu.v:3:16", "alu.v:6:10", "design.v:3:29"]);
  // top's y: inside top, plus `.y(` on top's instance in tb.v; not alu's y, not the string in tb.
  assert.deepEqual(referencesOf(files, "y", "design.v", 1).map(at), ["design.v:1:41", "design.v:3:31", "tb.v:3:20"]);
  // A module name: everywhere.
  assert.deepEqual(referencesOf(files, "alu", "design.v", 3).map(at), ["alu.v:1:8", "design.v:3:3"]);
  // A local wire is not a port: only inside its module.
  assert.deepEqual(referencesOf(files, "b", "design.v", 2).map(at), ["design.v:2:14", "design.v:3:24"]);
  assert.deepEqual(referencesOf(files, "not an id", "design.v", 1), []);

  assert.equal(renameProblem("sum_q"), null);
  assert.match(renameProblem("2x") ?? "", /starts with a letter/);
  assert.match(renameProblem("always") ?? "", /keyword/);

  const index = indexVerilog(files);
  assert.deepEqual(instanceAt(index, "module t;\n  alu u (.a(x), ")?.active, 1, "second port by position");
  assert.deepEqual(instanceAt(index, "module t;\n  alu u (.y(")?.active, 2, "a named port wins");
  assert.equal(instanceAt(index, "module t;\n  alu u (.a(x));\n  assign q = (")?.module ?? null, null, "closed list: not inside");
  assert.equal(instanceAt(index, "module t;\n  alu u (\n    .a (x),\n    ")?.module.name, "alu");
  assert.equal(instanceAt(index, "module t;\n  nope u (")?.module ?? null, null, "unknown module");
  // Where a signal is driven (the waveform's "Where is this driven?").
  const loc = (l: ReturnType<typeof driverOf>) => (l ? `${l.file}:${l.line}` : null);
  assert.equal(loc(driverOf(files, "y", "tb.dut.u_alu")), "alu.v:6", "assign in the instance's module (u_alu is an alu)");
  assert.equal(loc(driverOf(files, "y", "tb")), "tb.v:3", "tb's y comes from top's output port");
  assert.equal(loc(driverOf(files, "b", "tb.dut")), "design.v:2", "a declaration's initialiser");
  const counter = [{ name: "design.v", text: "module counter(input clk, rst, output reg [3:0] q);\n  always @(posedge clk)\n    if (rst) q <= 0;\n    else q <= q + 1;\nendmodule\n" }];
  assert.equal(loc(driverOf(counter, "q", "tb.dut")), "design.v:3", "the first assignment in the block");
  assert.equal(driverOf(counter, "nope", "tb"), null);
  console.log("references: ok");
}
console.log("verilog-lang: all checks passed");
