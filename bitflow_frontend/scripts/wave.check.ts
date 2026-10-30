/**
 * scripts/wave.check.ts — self-check for lib/studio/wave.ts (npx tsx scripts/wave.check.ts).
 * The generated testbenches are run on the simulator by scripts/studio-sim.check.ts.
 */
import assert from "node:assert/strict";
import {
  type WaveDiagram, WAVE_EXAMPLES, diagramFromVcdText, diagramSvg, fromVcd, fromWaveJson, generateTestbench, matchDesign,
  nsPerUnit, numberOf, resolved, setDir, stubModule, toWaveJson, validate,
} from "../lib/studio/wave";

assert.deepEqual(resolved({ name: "a", dir: "in", width: 1, values: [".", "1", ".", "0"] }, 6), ["x", "1", "1", "0", "0", "0"]);
assert.equal(numberOf("12"), 12);
assert.equal(numberOf("0x1F"), 31);
assert.equal(numberOf("hff"), 255);
assert.equal(numberOf("'b101"), 5);
assert.equal(numberOf("abc"), null);

for (const { label, diagram } of WAVE_EXAMPLES) {
  assert.deepEqual(validate(diagram).filter((i) => i.level === "error"), [], label);
  assert.match(diagramSvg(diagram), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  // WaveJSON round trip keeps every value (directions aren't part of WaveJSON)
  const back = fromWaveJson(toWaveJson(diagram));
  assert.equal(back.cycles, diagram.cycles, label);
  back.signals.forEach((s, i) => {
    const orig = diagram.signals[i];
    assert.equal(s.name, orig.name);
    assert.equal(s.dir === "clock", orig.dir === "clock");
    if (orig.dir !== "clock") assert.deepEqual(resolved(s, back.cycles), resolved(orig, diagram.cycles), `${label}: ${s.name}`);
  });
}

// Validation
const bad: WaveDiagram = { title: "", cycles: 3, period: 10, signals: [
  { name: "a", dir: "in", width: 1, values: ["0", "2", "1"] },
  { name: "b", dir: "in", width: 3, values: ["9", ".", "q"] },
  { name: "a", dir: "out", width: 1, values: ["0"] },
] };
const msgs = validate(bad).map((i) => i.msg).join("\n");
assert.match(msgs, /a, cycle 1: "2" isn't a 0, 1, x or z/);
assert.match(msgs, /b, cycle 0: 9 doesn't fit in 3 bits/);
assert.match(msgs, /b, cycle 2: "q" isn't a number/);
assert.match(msgs, /"a" is used twice/);

// WaveDrom input: groups, data cells, h/l, gaps
const wd = fromWaveJson(JSON.stringify({ signal: [
  { name: "clk", wave: "p...." }, {},
  ["bus", { name: "addr", wave: "x=.=x", data: ["0x10", "3"] }],
  { name: "valid", wave: "0h.l|." },
] }));
assert.deepEqual(wd.signals.map((s) => [s.name, s.dir, s.width]), [["clk", "clock", 1], ["addr", "in", 5], ["valid", "in", 1]]);
assert.deepEqual(resolved(wd.signals[1], 5), ["x", "0x10", "0x10", "3", "x"]);
assert.deepEqual(resolved(wd.signals[2], 5), ["0", "1", "1", "0", "0"]);
assert.throws(() => fromWaveJson('{"nope": 1}'), /WaveJSON/);

// Testbench shape: clocked inputs change 1 ns after the edge; x outputs aren't checked
const dff = WAVE_EXAMPLES[1].diagram;
const tb = generateTestbench(dff, "dff");
assert.match(tb, /always #5 clk = ~clk;/);
assert.match(tb, /@\(posedge clk\);\n        #1 d = 1'd1;\n        #4;/);
assert.ok(!/cycle 0: q expected/.test(tb), "x in cycle 0 isn't checked");
assert.match(tb, /if \(q !== 1'd0\) begin \$display\("FAIL: cycle 1: q expected 0/);
assert.match(generateTestbench(WAVE_EXAMPLES[2].diagram, "and_gate"), /y !== 1'd1/);
assert.match(stubModule(dff, "dff"), /output reg  q/);

// Matching a pasted design
const good = matchDesign(dff, "module dff (input wire clk, input wire d, output reg q); always @(posedge clk) q <= d; endmodule");
assert.deepEqual(good, { module: "dff", problems: [] });
const wrong = matchDesign(dff, "module dff (input wire clk, input wire [1:0] d, input wire en, output reg qq); endmodule");
assert.deepEqual(wrong.problems, [
  '"d" is 2 bits in the module and 1 in the diagram.',
  'The module has no port "q".',
  'Input "en" has no row, so it would float (z).',
]);

// From a waveform: clock found, sampled 3/4 into each cycle
const clk = { name: "clk", width: 1, changes: Array.from({ length: 12 }, (_, i) => ({ time: i * 5, value: i % 2 ? "1" : "0" })) };
const cnt = { name: "count", width: 4, changes: [{ time: 0, value: "xxxx" }, { time: 5, value: "0000" }, { time: 15, value: "0001" }, { time: 25, value: "0010" }] };
const fv = fromVcd([clk, cnt], 60, 4);
assert.equal(fv.period, 10);
assert.deepEqual(fv.signals.map((s) => s.dir), ["clock", "in"]);
assert.deepEqual(resolved(fv.signals[1], fv.cycles), ["1", "2", "2", "2"], "as an input: the value at the next edge");
const asOut = setDir(fv.signals[1], "out");
assert.deepEqual(resolved(asOut, fv.cycles), ["0", "1", "2", "2"], "as an output: read mid-cycle");
assert.deepEqual(resolved(setDir(asOut, "in"), fv.cycles), ["1", "2", "2", "2"], "and back");

assert.equal(nsPerUnit("1ps"), 0.001);
assert.equal(nsPerUnit("10 ns"), 10);
assert.equal(nsPerUnit("1us"), 1000);
const clkPs = { ...clk, changes: clk.changes.map((c) => ({ ...c, time: c.time * 1000 })) };
assert.equal(fromVcd([clkPs, cnt], 60000, 4, nsPerUnit("1ps")).period, 10, "edges 10000 ps apart are a 10 ns period");
// Notes: drawn over the diagram, escaped, and warned about when they point at nothing
const noted: WaveDiagram = { title: "n", cycles: 4, period: 10, signals: [{ name: "clk", dir: "clock", width: 1, values: [] }, { name: "d", dir: "in", width: 1, values: ["0"] }, { name: "q", dir: "out", width: 1, values: ["x"] }],
  notes: [{ id: "a", signal: "d", cycle: 1.5, to: { signal: "d", cycle: 2 }, text: "t<su>" }, { id: "b", signal: "q", cycle: 3, text: "ok" }, { id: "c", signal: "clk", cycle: 1, to: { signal: "q", cycle: 2 }, text: "" }] };
const nsvg = diagramSvg(noted);
assert.ok(nsvg.includes("t&#60;su&#62;") && !nsvg.includes("<su>"), "note text is escaped");
assert.ok(nsvg.includes(">ok<"));
assert.equal((nsvg.match(/fill="#ff6bcb"\/>/g) ?? []).length, 3, "both heads on one row, one between rows");
assert.deepEqual(validate(noted).filter((i) => /note/i.test(i.msg)), []);
const lost = validate({ ...noted, notes: [{ id: "x", signal: "gone", cycle: 1, text: "a" }, { id: "y", signal: "d", cycle: 9, text: "b" }] });
assert.ok(lost.some((i) => i.level === "warning" && /row "gone"/.test(i.msg)));
assert.ok(lost.some((i) => i.level === "warning" && /outside the diagram/.test(i.msg)));
assert.ok(!diagramSvg({ ...noted, notes: [{ id: "x", signal: "gone", cycle: 1, text: "zzz" }] }).includes("zzz"), "a lost note isn't drawn");
assert.deepEqual(generateTestbench(noted, "m"), generateTestbench({ ...noted, notes: [] }, "m"), "notes don't change the testbench");
// A VCD file: names once, no parameters or counters, the clock found, time in nanoseconds
const vcdFile = `$timescale 1ps $end
$scope module tb $end
$var wire 1 ! clk $end
$var reg 2 " count $end
$var integer 32 # errors $end
$var parameter 8 $ WIDTH $end
$scope module dut $end
$var wire 1 ! clk $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
0!
b00 "
#5000
1!
b01 "
#10000
0!
#15000
1!
b10 "
#20000
0!
#25000
1!
`;
const fromFile = diagramFromVcdText(vcdFile);
assert.deepEqual(fromFile.signals.map((s) => [s.name, s.dir]), [["clk", "clock"], ["count", "in"]]);
assert.equal(fromFile.period, 10);
assert.ok(fromFile.cycles >= 2);
assert.throws(() => diagramFromVcdText("not a vcd at all"), /No signals/);

console.log("wave: all checks passed");
