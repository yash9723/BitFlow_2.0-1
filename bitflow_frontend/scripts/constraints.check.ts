/**
 * scripts/constraints.check.ts — self-check for reading and editing pin constraints
 * (lib/synth/constraints.ts): every board's generated file reads back to the same pins,
 * each validation rule, setPin, and the syntax variants people write.
 *   npx tsx scripts/constraints.check.ts
 */
import assert from "node:assert/strict";
import { BOARDS, CONSTRAINT_FORMAT, boardPins, pinout, type BoardId, type PortInfo } from "@/lib/synth/boards";
import { parseConstraints, setPin, validateConstraints } from "@/lib/synth/constraints";

const port = (direction: string, width = 1): PortInfo => ({ direction, width });
const ports = { clk: port("input"), rst_n: port("input"), sw: port("input", 2), led: port("output", 3), tx: port("output"), rx: port("input") };

// Round trip: what pinout writes, parseConstraints reads back, and it passes validation.
for (const id of Object.keys(BOARDS) as BoardId[]) {
  const b = BOARDS[id];
  const r = pinout(id, ports);
  assert.equal(r.error, null, id);
  const { entries, unknown } = parseConstraints(r.format, r.constraints);
  assert.deepEqual(entries.map((e) => [e.port, e.pin]), r.assignments.map((a) => [a.port, a.pin]), `${id}: pins read back`);
  if (r.format !== "pcf") assert.deepEqual(entries.map((e) => e.io), r.assignments.map((a) => a.io), `${id}: I/O standards read back`);
  if (r.format === "lpf" || r.format === "cst" || r.format === "xdc") assert.deepEqual(entries.map((e) => e.pull), r.assignments.map((a) => a.pull), `${id}: pulls read back`);
  if (r.format === "pcf") assert.deepEqual(unknown, [], `${id}: no unknown lines`);
  const issues = validateConstraints(b, boardPins(b), ports, entries);
  assert.deepEqual(issues.filter((i) => i.level === "error"), [], `${id}: generated pins are valid`);
}
console.log("round trip: ok");

// Validation rules (iCEstick, .pcf).
const stick = BOARDS.icestick;
const check = (text: string, p: Record<string, PortInfo>) => validateConstraints(stick, boardPins(stick), p, parseConstraints("pcf", text).entries);
const msgs = (text: string, p: Record<string, PortInfo>) => check(text, p).map((i) => `${i.level}: ${i.message}`);
let m = msgs("set_io clk 21\nset_io led[0] 99\n", { clk: port("input"), led: port("output", 2) });
assert.deepEqual(m, ["error: No pin for led[1]."]);
m = msgs("set_io clk 21\nset_io a 99\nset_io b 99\n", { clk: port("input"), a: port("output"), b: port("output") });
assert.deepEqual(m, ["error: Pin 99 is used by both a and b."]);
m = msgs("set_io clk 21\nset_io ghost 99\n", { clk: port("input") });
assert.deepEqual(m, ["error: ghost isn't a port of the design."]);
m = msgs("set_io clk 21\nset_io a 1\n", { clk: port("input"), a: port("output") });
assert.match(m[0], /^warning: Pin 1 \(a\) isn't one of the .* labelled pins/);
m = msgs("set_io clk 78\n", { clk: port("input") });
assert.deepEqual(m, ["warning: clk isn't on the board's 12 MHz oscillator (pin 21)."]);
m = msgs("set_io clk 21\nset_io a 99\n", { clk: port("input"), a: port("input") });
assert.deepEqual(m, ["warning: a is an input on LED D1."]);
m = msgs("set_io clk 21\nset_io o 21\n", { clk: port("input"), o: port("output") });
assert.ok(m.includes("error: Pin 21 is used by both clk and o."));
assert.equal(check("set_io clk 21\nset_io x 99\n", { clk: port("input") })[0].line, 1, "issues name their line");
console.log("validation: ok");

// Syntax variants.
let p = parseConstraints("pcf", "# my pins\nset_io -nowarn -pullup yes btn 10   # user button\nset_io -pullup_resistor 3P3K x 11\nfoo bar\n");
assert.deepEqual(p.entries.map(({ port, pin, pull }) => [port, pin, pull]), [["btn", "10", "UP"], ["x", "11", undefined]]);
assert.deepEqual(p.unknown, [3]);
p = parseConstraints("xdc", "set_property PACKAGE_PIN W5 [get_ports clk]\nset_property IOSTANDARD LVCMOS33 [get_ports clk]\n" +
  "set_property -dict {PACKAGE_PIN U16 IOSTANDARD LVCMOS33 PULLDOWN true} [get_ports {led[0]}]\ncreate_clock -period 10 [get_ports clk]\n");
assert.deepEqual(p.entries.map(({ port, pin, io, pull }) => [port, pin, io, pull]), [["clk", "W5", "LVCMOS33", undefined], ["led[0]", "U16", "LVCMOS33", "DOWN"]]);
p = parseConstraints("lpf", 'LOCATE COMP "clk" SITE "G2"; // 25 MHz\nIOBUF PORT "clk" PULLMODE=NONE IO_TYPE=LVCMOS33;\n');
assert.deepEqual(p.entries.map(({ port, pin, io, pull }) => [port, pin, io, pull]), [["clk", "G2", "LVCMOS33", undefined]]);
p = parseConstraints("cst", 'IO_LOC "clk" 52;\nIO_PORT "clk" IO_TYPE=LVCMOS33 PULL_MODE=UP;\nCLOCK_LOC "clk" BUFG;\nnonsense;\n');
assert.deepEqual(p.entries.map(({ port, pin, pull }) => [port, pin, pull]), [["clk", "52", "UP"]]);
assert.deepEqual(p.unknown, [3]);
p = parseConstraints("qsf", 'set_location_assignment PIN_P11 -to clk\nset_instance_assignment -name IO_STANDARD "3.3-V LVTTL" -to clk\n');
assert.deepEqual(p.entries.map(({ port, pin, io }) => [port, pin, io]), [["clk", "P11", "3.3-V LVTTL"]]);
console.log("syntax: ok");

// setPin changes only the pin, and keeps comments.
assert.equal(setPin("pcf", "set_io led 99 # 99 is D1\nset_io clk 21", 0, "98"), "set_io led 98 # 99 is D1\nset_io clk 21");
assert.equal(setPin("lpf", 'LOCATE COMP "led" SITE "B2"; # D0', 0, "C2"), 'LOCATE COMP "led" SITE "C2"; # D0');
assert.equal(setPin("cst", 'IO_LOC "led" 10; // LED0', 0, "11"), 'IO_LOC "led" 11; // LED0');
assert.equal(setPin("xdc", "set_property -dict { PACKAGE_PIN U16 IOSTANDARD LVCMOS33 } [get_ports {led}];", 0, "E19"),
  "set_property -dict { PACKAGE_PIN E19 IOSTANDARD LVCMOS33 } [get_ports {led}];");
assert.equal(setPin("qsf", 'set_location_assignment PIN_A8 -to "led"', 0, "A9"), 'set_location_assignment PIN_A9 -to "led"');
for (const id of ["icebreaker", "ulx3s-25f", "tangnano20k", "arty-a7-35t", "de10-lite"] as BoardId[]) {
  const r = pinout(id, { led: port("output") });
  const format = CONSTRAINT_FORMAT[BOARDS[id].family];
  const [e] = parseConstraints(format, r.constraints).entries;
  const moved = BOARDS[id].gpio[0].pin;
  assert.equal(parseConstraints(format, setPin(format, r.constraints, e.line, moved)).entries[0].pin, moved, `${id}: setPin`);
}
console.log("setPin: ok");
console.log("constraints: all checks passed");
