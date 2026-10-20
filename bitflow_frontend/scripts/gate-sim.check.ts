/**
 * scripts/gate-sim.check.ts — self-check for lib/gate-sim.ts (npx tsx scripts/gate-sim.check.ts).
 * Hand-written netlists in the shape POST /board returns.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { GateSim, toNumber, type BoardNetlist } from "../lib/gate-sim";
import { synthesize } from "../lib/synth/run";
import { TEMPLATES } from "../lib/templates";
import { UartReceiver, UartTransmitter } from "../lib/uart";

// 2-bit counter with synchronous reset, plus t: a register that toggles on
// every falling edge of q[0] (a ripple stage clocked by the counter itself).
//   nets: clk=2 rst=3 q=[4,5] ~q0=6 d0=7 q0^q1=8 d1=9 t=12 ~t=13
const counter: BoardNetlist = {
  ports: {
    clk: { direction: "input",  bits: [2] },
    rst: { direction: "input",  bits: [3] },
    q:   { direction: "output", bits: [4, 5] },
    t:   { direction: "output", bits: [12] },
    one: { direction: "output", bits: ["1"] },
  },
  cells: [
    { type: "$_MUX_",   conn: { A: [8], B: ["0"], S: [3], Y: [9] } },   // listed before its input's driver
    { type: "$_NOT_",   conn: { A: [4], Y: [6] } },
    { type: "$_MUX_",   conn: { A: [6], B: ["0"], S: [3], Y: [7] } },
    { type: "$_XOR_",   conn: { A: [4], B: [5], Y: [8] } },
    { type: "$_DFF_P_", conn: { C: [2], D: [7], Q: [4] } },
    { type: "$_DFF_P_", conn: { C: [2], D: [9], Q: [5] } },
    { type: "$_NOT_",   conn: { A: [12], Y: [13] } },
    { type: "$_DFF_N_", conn: { C: [4], D: [13], Q: [12] } },
  ],
};

const sim = new GateSim(counter);
const tick = () => { sim.set("clk", [1]); sim.set("clk", [0]); };
assert.deepEqual(sim.get("one"), [1], "constant output");

sim.set("rst", [1]); tick();
assert.equal(toNumber(sim.get("q")), 0, "reset");
sim.set("rst", [0]);
const seen: number[] = [];
for (let i = 0; i < 5; i++) { tick(); seen.push(toNumber(sim.get("q"))); }
assert.deepEqual(seen, [1, 2, 3, 0, 1], "counts and wraps");
// q[0] fell at 1->2 and 3->0: two toggles
assert.deepEqual(sim.get("t"), [0], "negedge ripple stage toggled twice");
tick();
assert.deepEqual(sim.get("t"), [1], "and once more at 1->2");

// Only rising edges count: holding the clock high does nothing more
sim.set("clk", [1]); const held = toNumber(sim.get("q")); sim.set("clk", [1]);
assert.equal(toNumber(sim.get("q")), held, "no edge, no change");

// Async reset/set: a toggle register q with active-low reset to 0 (rst_n), and
// p with async set (set, active high) and active-low reset (rst_n) that wins.
//   nets: clk=2 rst_n=3 set=4 q=5 ~q=6 p=7 ~p=8
const asyncNet: BoardNetlist = {
  ports: {
    clk:   { direction: "input",  bits: [2] },
    rst_n: { direction: "input",  bits: [3] },
    set:   { direction: "input",  bits: [4] },
    q:     { direction: "output", bits: [5] },
    p:     { direction: "output", bits: [7] },
  },
  cells: [
    { type: "$_NOT_",        conn: { A: [5], Y: [6] } },
    { type: "$_DFF_PN0_",    conn: { C: [2], R: [3], D: [6], Q: [5] } },
    { type: "$_NOT_",        conn: { A: [7], Y: [8] } },
    { type: "$_DFFSR_PPN_",  conn: { C: [2], S: [4], R: [3], D: [8], Q: [7] } },
  ],
};
const a = new GateSim(asyncNet);
const atick = () => { a.set("clk", [1]); a.set("clk", [0]); };
a.set("rst_n", [1]); atick();
assert.deepEqual([a.get("q"), a.get("p")], [[1], [1]], "both toggle on the clock");
a.set("rst_n", [0]);
assert.deepEqual([a.get("q"), a.get("p")], [[0], [0]], "async reset clears without a clock edge");
atick();
assert.deepEqual(a.get("q"), [0], "and holds while asserted");
a.set("set", [1]);
assert.deepEqual(a.get("p"), [0], "reset wins over set");
a.set("rst_n", [1]);
assert.deepEqual([a.get("q"), a.get("p")], [[0], [1]], "released: q stays cleared, set now takes p high");
a.set("set", [0]); atick();
assert.deepEqual([a.get("q"), a.get("p")], [[1], [0]], "counting resumes from the reset value");

assert.throws(() => new GateSim({
  ports: {},
  cells: [{ type: "$_NOT_", conn: { A: [10], Y: [11] } }, { type: "$_NOT_", conn: { A: [11], Y: [10] } }],
}), /combinational loop/);
assert.throws(() => new GateSim({ ports: {}, cells: [{ type: "$_DLATCH_P_", conn: {} }] }), /can't simulate/);

// Two toggle registers clocking each other (a clocked by go & a==b, b by go & a!=b)
// keep producing edges forever: the simulator must stop rather than hang.
//   nets: go=2 a=3 b=4 eq=5 ca=6 ne=7 cb=8 ~a=9 ~b=10
assert.throws(() => {
  const s = new GateSim({
    ports: { go: { direction: "input", bits: [2] } },
    cells: [
      { type: "$_XNOR_",  conn: { A: [3], B: [4], Y: [5] } },
      { type: "$_AND_",   conn: { A: [2], B: [5], Y: [6] } },
      { type: "$_XOR_",   conn: { A: [3], B: [4], Y: [7] } },
      { type: "$_AND_",   conn: { A: [2], B: [7], Y: [8] } },
      { type: "$_NOT_",   conn: { A: [3], Y: [9] } },
      { type: "$_NOT_",   conn: { A: [4], Y: [10] } },
      { type: "$_DFF_P_", conn: { C: [6], D: [9], Q: [3] } },
      { type: "$_DFF_P_", conn: { C: [8], D: [10], Q: [4] } },
    ],
  });
  s.set("go", [1]);
}, /never settles/);

console.log("gate-sim: all checks passed");

// ── UART framing (lib/uart.ts): transmitter straight into receiver ──────────
const sendAndReceive = (text: string, cpb: number, line: (bit: number) => number) => {
  const txr = new UartTransmitter(cpb), rxr = new UartReceiver(cpb);
  let out = "";
  for (let i = 0; i < text.length * 11 * cpb + 4 * cpb; i++) {
    if (i === cpb) txr.send(new TextEncoder().encode(text));   // the line idles first, as on the board
    const r = rxr.sample(line(txr.next()));
    if (r !== null) out += r === "error" ? "!" : String.fromCharCode(r);
  }
  return out;
};
assert.equal(sendAndReceive("Hi, board!", 16, (b) => b), "Hi, board!", "loopback at 16 cycles/bit");
assert.equal(sendAndReceive("ok", 5, (b) => b), "ok", "odd cycles/bit");
assert.equal(sendAndReceive("A", 16, () => 0), "", "a line stuck low is never idle, so nothing is received");
// 0xFF with a stop bit that is low: a framing error.
const rxr = new UartReceiver(4);
const line = [1, 1, ...Array(4).fill(0), ...Array(32).fill(1), ...Array(4).fill(0), ...Array(8).fill(1)];
assert.deepEqual(line.map((b) => rxr.sample(b)).filter((r) => r !== null), ["error"], "framing error reported");
console.log("uart: all checks passed");

// ── The UART echo template, synthesized to gates and run on the board ──────
async function echoOnBoard() {
  if (!process.env.YOWASP_YOSYS) return console.log("uart echo on the board: skipped (set YOWASP_YOSYS)");
  const { runYosys } = await import(pathToFileURL(process.env.YOWASP_YOSYS).href);
  const net = await synthesize(runYosys, "board", TEMPLATES.uartEcho.design);
  assert.ok(net.ok, "echo template synthesizes for the board");
  const board = new GateSim(net as unknown as BoardNetlist);
  const toDesign = new UartTransmitter(16), fromDesign = new UartReceiver(16);
  toDesign.send(new TextEncoder().encode("Hello"));
  let echoed = "";
  for (let i = 0; i < 5 * 11 * 16 + 400; i++) {
    board.set("rx", [toDesign.next()]);
    board.set("clk", [1]); board.set("clk", [0]);
    const r = fromDesign.sample(board.get("tx")[0]);
    if (r !== null) echoed += r === "error" ? "!" : String.fromCharCode(r);
  }
  assert.equal(echoed, "Hello", "the board echoes what it receives");
  assert.equal(toNumber(board.get("led")), "o".charCodeAt(0) & 31, "led shows the last byte's low bits");
  console.log("uart echo on the board: ok");
}
echoOnBoard().catch((e) => { console.error(e); process.exit(1); });
