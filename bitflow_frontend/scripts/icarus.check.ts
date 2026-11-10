/**
 * scripts/icarus.check.ts — the in-browser simulator (lib/sim/icarus.ts) run in Node on the vendored
 * WebAssembly (public/iverilog/): a passing testbench with a waveform and a data file, SystemVerilog,
 * a compile error located in the right file, an -Wall warning, a runtime $fatal, and the output cleanup.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cleanLines, compileHint, missingSystemTask, runIcarus, type Factories, type Factory } from "../lib/sim/icarus";

const dir = path.join(__dirname, "..", "public", "iverilog");
const load = async (n: string) => (await import(pathToFileURL(path.join(dir, `${n}.js`)).href)).default as Factory;

(async () => {
  const f: Factories = { ivlpp: await load("ivlpp"), ivl: await load("ivl"), vvp: await load("vvp"), locateFile: (p) => path.join(dir, p) };
  const vcdText = (r: { waveform: { vcd_base64: string | null } }) => Buffer.from(r.waveform.vcd_base64 ?? "", "base64").toString();

  const counter = `module counter #(parameter WIDTH = 4)(input wire clk, rst, en, output reg [WIDTH-1:0] count);
  always @(posedge clk) begin if (rst) count <= 0; else if (en) count <= count + 1'b1; end
endmodule`;
  const tb = `\`timescale 1ns/1ps
module tb; reg clk=0, rst=1, en=0; wire [3:0] count; reg [7:0] mem [0:3];
  counter #(.WIDTH(4)) dut(.clk(clk),.rst(rst),.en(en),.count(count));
  always #5 clk = ~clk;
  initial begin $dumpfile("dump.vcd"); $dumpvars(0, tb); $readmemh("rom.hex", mem);
    $display("mem[2]=%h", mem[2]);
    #12 rst=0; en=1; repeat(6) @(posedge clk); #1 $display("count=%0d", count);
    if (count !== 6) $display("FAIL"); else $display("ALL TESTS PASSED"); $finish; end
endmodule`;

  const ok = await runIcarus(f, { design: counter, testbench: tb, files: { "rom.hex": "11 22 33 44\n" } });
  assert.equal(ok.status, "success", ok.stdout);
  assert.equal(ok.exit_code, 0);
  assert.match(ok.stdout, /mem\[2\]=33/);
  assert.match(ok.stdout, /count=6\nALL TESTS PASSED/);
  assert.match(ok.stdout, /^--- Compiling ---\n[^]*\n\[OK\] Compilation successful/m);
  assert.match(ok.stdout, /module counter declared here: design\.v:1/, "-Wall: counter has no `timescale, as on the server");
  assert.doesNotMatch(ok.stdout, /dynamic linking|system\.vpi/);
  assert.ok(ok.waveform.available && /\$var wire 4 \S+ count/.test(vcdText(ok)), "the waveform has count");

  const sv = await runIcarus(f, {
    design: "module d; endmodule",
    testbench: "module tb; typedef enum logic [1:0] {A, B, C} st_t; st_t s; int i;\n initial begin s = B; for (i = 0; i < 3; i++); $display(\"s=%0d i=%0d\", s, i); end endmodule",
  });
  assert.equal(sv.status, "success", sv.stdout);
  assert.match(sv.stdout, /s=1 i=3/);
  assert.ok(!sv.waveform.available);
  assert.match(sv.stdout, /No VCD file produced/);

  const bad = await runIcarus(f, { design: "module bad(input a, output y);\n  assign y = a &;\nendmodule", testbench: "module tb; endmodule" });
  assert.equal(bad.status, "compile_error");
  assert.equal(bad.exit_code, 2);
  assert.match(bad.stdout, /^design\.v:2: syntax error/m, "errors name design.v, without a leading slash");
  assert.match(bad.stdout, /\[ERROR\] Compilation failed: design\.v:2/);

  const missing = await runIcarus(f, { design: "module a; endmodule", testbench: "module tb; nope u(); endmodule" });
  assert.equal(missing.status, "compile_error");
  assert.match(missing.stdout, /tb\.v:1: error: Unknown module type: nope/);
  assert.match(missing.stdout, /Hint: there is no module named 'nope'/);

  const warn = await runIcarus(f, { design: "module w(input a, output y);\n  assign c = a;\n  assign y = c;\nendmodule", testbench: "module tb; endmodule" });
  assert.equal(warn.status, "success");
  assert.match(warn.stdout, /design\.v:2: warning: implicit definition of wire 'c'/, "-Wall");

  const fatal = await runIcarus(f, { design: "module d; endmodule", testbench: "module tb; initial $fatal(1, \"boom\"); endmodule" });
  assert.equal(fatal.status, "runtime_error", fatal.stdout);
  assert.match(fatal.stdout, /boom/);

  // SystemVerilog system tasks aren't in this build: detected, so Run falls back to the server.
  const sv2009 = await runIcarus(f, { design: "module d; endmodule", testbench: "module tb; reg [1:0] x; initial $display(\"%0d\", $isunknown(x)); endmodule" });
  assert.equal(missingSystemTask(sv2009.stdout), "$isunknown", sv2009.stdout);
  assert.equal(missingSystemTask(ok.stdout), null);

  assert.deepEqual(cleanLines(["/tb.v:3: error: x", "error: Failed to open 'system.vpi' because:", "     : dynamic linking not enabled", "plain"]),
                   ["tb.v:3: error: x", "plain"]);
  assert.equal(compileHint("x"), null);

  console.log(`icarus: all checks passed (counter in ${ok.duration_ms} ms)`);
  process.exit(0);   // Emscripten's exit() in Node sets process.exitCode from the runs that were meant to fail
})().catch((e) => { console.error(e); process.exit(1); });
