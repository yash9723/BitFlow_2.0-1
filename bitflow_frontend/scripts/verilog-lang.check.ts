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
import { definitionOf, formatVerilog, hoverFor, indexVerilog, instanceSnippet, moduleAt, parseYosysMessages } from "@/lib/verilog-lang";

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
console.log("verilog-lang: all checks passed");
