/**
 * lib/studio/circuit.ts — the circuit editor (/studio/circuit): parts and wires,
 * compiled to the board's gate netlist so lib/gate-sim.ts runs them live,
 * structural Verilog export, and a self-checking testbench.
 *
 * All wires are 1 bit. Every input pin has at most one driver (unconnected reads
 * 0); outputs fan out freely. Flip-flops start at 0, like `reg q = 1'b0`.
 * Testbenches change one input at a time (a clock and its data never move at
 * the same instant, so Icarus can't race) and check every output after each
 * change against GateSim. Self-check: scripts/circuit.check.ts.
 */
import { type Bit, type BoardNetlist, GateSim, toNumber } from "../gate-sim";
import { nameProblem } from "./logic-min";

export type PartKind =
  | "switch" | "button" | "clock" | "const0" | "const1"
  | "not" | "and" | "or" | "xor" | "nand" | "nor" | "xnor" | "mux2" | "dff"
  | "led" | "seg7";
export interface Part { id: string; kind: PartKind; x: number; y: number; label: string; n?: number; reset?: boolean }
export interface PinRef { part: string; pin: string }
/** bend: where the user dragged the wire's middle run (x of the vertical run; y when it routes backwards). */
export interface Wire { id: string; from: PinRef; to: PinRef; bend?: number }
/** A text note on the canvas: no logic, exported as a comment. */
export interface Note { id: string; x: number; y: number; text: string }
export interface Circuit { module: string; parts: Part[]; wires: Wire[]; notes?: Note[] }
/** One input change, as the editor records it and the testbench replays it. */
export interface InputEvent { port: string; value: number }

export const INPUT_KINDS: PartKind[] = ["switch", "button", "clock"];
export const OUTPUT_KINDS: PartKind[] = ["led", "seg7"];
const RESERVED = new Set(["errors", "dut"]);
const GATE_OPS: Record<string, { cell: string; last: string; op: string; invert: boolean }> = {
  and: { cell: "$_AND_", last: "$_AND_", op: "&", invert: false },
  or: { cell: "$_OR_", last: "$_OR_", op: "|", invert: false },
  xor: { cell: "$_XOR_", last: "$_XOR_", op: "^", invert: false },
  nand: { cell: "$_AND_", last: "$_NAND_", op: "&", invert: true },
  nor: { cell: "$_OR_", last: "$_NOR_", op: "|", invert: true },
  xnor: { cell: "$_XOR_", last: "$_XNOR_", op: "^", invert: true },
};

export function pins(p: Part): { inputs: string[]; outputs: string[] } {
  switch (p.kind) {
    case "switch": case "button": case "clock": case "const0": case "const1": return { inputs: [], outputs: ["out"] };
    case "not": return { inputs: ["a"], outputs: ["y"] };
    case "mux2": return { inputs: ["d0", "d1", "s"], outputs: ["y"] };
    case "dff": return { inputs: p.reset ? ["d", "clk", "rst"] : ["d", "clk"], outputs: ["q"] };
    case "led": return { inputs: ["in"], outputs: [] };
    case "seg7": return { inputs: ["a", "b", "c", "d", "e", "f", "g"], outputs: [] };
    default: return { inputs: ["a", "b", "c", "d"].slice(0, Math.max(2, Math.min(4, p.n ?? 2))), outputs: ["y"] };
  }
}

const key = (r: PinRef) => `${r.part}.${r.pin}`;
const isInput = (p: Part) => INPUT_KINDS.includes(p.kind);
const isOutput = (p: Part) => OUTPUT_KINDS.includes(p.kind);
export const inputParts = (c: Circuit) => c.parts.filter(isInput);
export const outputParts = (c: Circuit) => c.parts.filter(isOutput);

export interface Compiled {
  net: BoardNetlist;
  /** The net an output pin drives (for colouring wires). */
  netOf: (r: PinRef) => Bit | undefined;
}

/** The circuit as the board's netlist: input/output parts become ports, gates and flip-flops become cells. */
export function compile(c: Circuit): Compiled {
  let next = 2;
  const outNet = new Map<string, Bit>();
  for (const p of c.parts) {
    for (const o of pins(p).outputs) outNet.set(`${p.id}.${o}`, p.kind === "const0" ? "0" : p.kind === "const1" ? "1" : next++);
  }
  const driver = new Map(c.wires.map((w) => [key(w.to), w.from]));
  const inNet = (p: Part, pin: string): Bit => {
    const d = driver.get(`${p.id}.${pin}`);
    return (d && outNet.get(key(d))) ?? "0";
  };
  const cells: BoardNetlist["cells"] = [];
  const ports: BoardNetlist["ports"] = {};
  for (const p of c.parts) {
    const y = outNet.get(`${p.id}.${pins(p).outputs[0]}`)!;
    if (isInput(p)) { ports[p.label] = { direction: "input", bits: [y] }; continue; }
    if (p.kind === "led") { ports[p.label] = { direction: "output", bits: [inNet(p, "in")] }; continue; }
    if (p.kind === "seg7") { ports[p.label] = { direction: "output", bits: pins(p).inputs.map((pin) => inNet(p, pin)) }; continue; }
    if (p.kind === "not") cells.push({ type: "$_NOT_", conn: { A: [inNet(p, "a")], Y: [y] } });
    else if (p.kind === "mux2") cells.push({ type: "$_MUX_", conn: { A: [inNet(p, "d0")], B: [inNet(p, "d1")], S: [inNet(p, "s")], Y: [y] } });
    else if (p.kind === "dff") {
      cells.push(p.reset
        ? { type: "$_DFF_PP0_", conn: { C: [inNet(p, "clk")], D: [inNet(p, "d")], Q: [y], R: [inNet(p, "rst")] } }
        : { type: "$_DFF_P_", conn: { C: [inNet(p, "clk")], D: [inNet(p, "d")], Q: [y] } });
    } else if (GATE_OPS[p.kind]) {
      const g = GATE_OPS[p.kind];
      const ins = pins(p).inputs.map((pin) => inNet(p, pin));
      let acc = ins[0];
      for (let i = 1; i < ins.length; i++) {
        const last = i === ins.length - 1;
        const out: Bit = last ? y : next++;
        cells.push({ type: last ? g.last : g.cell, conn: { A: [acc], B: [ins[i]], Y: [out] } });
        acc = out;
      }
    }
  }
  return { net: { ports, cells }, netOf: (r) => outNet.get(key(r)) };
}

export interface CircuitIssue { level: "error" | "warning"; msg: string; at?: string }

export function validate(c: Circuit): CircuitIssue[] {
  const out: CircuitIssue[] = [];
  const mp = nameProblem(c.module);
  if (mp) out.push({ level: "error", msg: `Module name "${c.module}" ${mp}.` });
  const seen = new Set<string>([c.module]);
  for (const p of c.parts) {
    if (p.kind === "const0" || p.kind === "const1") continue;
    const np = nameProblem(p.label);
    if (np) out.push({ level: "error", msg: `Label "${p.label}" ${np}.`, at: p.id });
    else if (RESERVED.has(p.label)) out.push({ level: "error", msg: `"${p.label}" is used by the testbench; pick another label.`, at: p.id });
    else if (seen.has(p.label)) out.push({ level: "error", msg: `"${p.label}" is used twice (labels become Verilog names).`, at: p.id });
    seen.add(p.label);
  }
  const driven = new Set(c.wires.map((w) => key(w.to)));
  for (const p of c.parts) {
    for (const pin of pins(p).inputs) {
      if (!driven.has(`${p.id}.${pin}`)) out.push({ level: "warning", msg: `${p.label}.${pin} isn't connected, so it reads 0.`, at: p.id });
    }
  }
  if (!inputParts(c).length) out.push({ level: "warning", msg: "No inputs: add a switch, button or clock." });
  if (!outputParts(c).length) out.push({ level: "warning", msg: "No outputs: add an LED or a 7-segment display, so there is something to see and test." });
  if (!out.some((i) => i.level === "error")) {
    try { new GateSim(compile(c).net); } catch (e) { out.push({ level: "error", msg: (e as Error).message }); }
  }
  return out;
}

// ── Simulation helpers ───────────────────────────────────────────────────────

/** Every output's value at power-up and after each event (GateSim), as numbers (7-segment: bit 0 = segment a). */
export function expectedOutputs(c: Circuit, events: InputEvent[]): Record<string, number>[] {
  const sim = new GateSim(compile(c).net);
  const outs = outputParts(c);
  const read = () => Object.fromEntries(outs.map((p) => [p.label, toNumber(sim.get(p.label))]));
  const rows = [read()];
  for (const e of events) { sim.set(e.port, [e.value]); rows.push(read()); }
  return rows;
}

/** Deterministic pseudo-random numbers (testbenches must not change between clicks). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
}

export const MAX_EXHAUSTIVE_INPUTS = 10;

/**
 * Input changes for the testbench. Combinational circuits with at most 10 inputs:
 * a Gray-code walk (one input changes per step) through every combination.
 * Otherwise a random walk; with a clock, every other step toggles it.
 */
export function defaultEvents(c: Circuit, steps = 48, seed = 1): InputEvent[] {
  const ins = inputParts(c);
  if (!ins.length) return [];
  const sequential = c.parts.some((p) => p.kind === "dff");
  if (!sequential && ins.length <= MAX_EXHAUSTIVE_INPUTS) {
    const value = ins.map(() => 0);
    const events: InputEvent[] = [];
    for (let i = 1; i < 1 << ins.length; i++) {
      const bit = Math.log2(i & -i);                   // the Gray code flips the lowest set bit of i
      value[bit] ^= 1;
      events.push({ port: ins[bit].label, value: value[bit] });
    }
    return events;
  }
  const rand = rng(seed);
  const clock = ins.find((p) => p.kind === "clock");
  const data = ins.filter((p) => p !== clock);
  const state = new Map(ins.map((p) => [p.label, 0]));
  const events: InputEvent[] = [];
  for (let i = 0; i < steps; i++) {
    const pick = clock && (i % 2 === 1 || !data.length) ? clock : data[Math.floor(rand() * data.length)];
    const v = state.get(pick.label)! ^ 1;
    state.set(pick.label, v);
    events.push({ port: pick.label, value: v });
  }
  return events;
}

// ── Verilog ──────────────────────────────────────────────────────────────────

export function generateVerilog(c: Circuit): string {
  const byId = new Map(c.parts.map((p) => [p.id, p]));
  const driver = new Map(c.wires.map((w) => [key(w.to), w.from]));
  const src = (p: Part, pin: string) => {
    const d = driver.get(`${p.id}.${pin}`);
    const from = d && byId.get(d.part);
    if (!from) return "1'b0";
    return from.kind === "const0" ? "1'b0" : from.kind === "const1" ? "1'b1" : from.label;
  };
  const ports = [
    ...inputParts(c).map((p) => `    input  wire ${p.label}`),
    ...outputParts(c).map((p) => `    output wire ${p.kind === "seg7" ? "[6:0] " : ""}${p.label}`),
  ];
  const wires = c.parts.filter((p) => GATE_OPS[p.kind] || p.kind === "not" || p.kind === "mux2").map((p) => p.label);
  const regs = c.parts.filter((p) => p.kind === "dff");
  const body: string[] = [];
  for (const p of c.parts) {
    const g = GATE_OPS[p.kind];
    if (g) {
      const e = pins(p).inputs.map((pin) => src(p, pin)).join(` ${g.op} `);
      body.push(`    assign ${p.label} = ${g.invert ? `~(${e})` : e};`);
    } else if (p.kind === "not") body.push(`    assign ${p.label} = ~${src(p, "a")};`);
    else if (p.kind === "mux2") body.push(`    assign ${p.label} = ${src(p, "s")} ? ${src(p, "d1")} : ${src(p, "d0")};`);
    else if (p.kind === "dff") {
      body.push(p.reset
        ? `    always @(posedge ${src(p, "clk")} or posedge ${src(p, "rst")}) if (${src(p, "rst")}) ${p.label} <= 1'b0; else ${p.label} <= ${src(p, "d")};`
        : `    always @(posedge ${src(p, "clk")}) ${p.label} <= ${src(p, "d")};`);
    } else if (p.kind === "led") body.push(`    assign ${p.label} = ${src(p, "in")};`);
    else if (p.kind === "seg7") body.push(`    assign ${p.label} = {${[...pins(p).inputs].reverse().map((pin) => src(p, pin)).join(", ")}};   // {g..a}`);
  }
  const notes = (c.notes ?? []).map((n) => n.text.trim()).filter(Boolean).map((t) => `// Note: ${t.replace(/\s*\n\s*/g, " ")}\n`).join("");
  return `// Generated by BitFlow Studio from a drawn circuit (structural Verilog).
${notes}module ${c.module} (
${ports.join(",\n")}
);
${wires.length ? `    wire ${wires.join(", ")};\n` : ""}${regs.map((p) => `    reg  ${p.label} = 1'b0;`).join("\n")}${regs.length ? "\n" : ""}
${body.join("\n")}
endmodule
`;
}

/** A testbench that starts with every input at 0, applies `events` 5 ns apart, and checks every output after each. */
export function generateTestbench(c: Circuit, events: InputEvent[]): string {
  const tb = `tb_${c.module}`;
  const outs = outputParts(c);
  const expected = expectedOutputs(c, events);
  const width = (p: Part) => (p.kind === "seg7" ? 7 : 1);
  const checks = (row: Record<string, number>, at: string) => outs.map((p) =>
    `        if (${p.label} !== ${width(p)}'d${row[p.label]}) begin $display("FAIL: ${at}: ${p.label} expected ${row[p.label]}, got %0d", ${p.label}); errors = errors + 1; end`);
  const lines = ["        #5;", ...checks(expected[0], "at start")];
  events.forEach((e, i) => {
    lines.push(`        ${e.port} = 1'b${e.value}; #5;   // step ${i + 1}`);
    lines.push(...checks(expected[i + 1], `step ${i + 1} (${e.port}=${e.value})`));
  });
  const conns = [...inputParts(c), ...outs].map((p) => `.${p.label}(${p.label})`).join(", ");
  return `\`timescale 1ns / 1ps
// Generated by BitFlow Studio: every input starts at 0; ${events.length} single-input changes, each followed by a check of every output.
module ${tb};
${inputParts(c).map((p) => `    reg  ${p.label} = 1'b0;`).join("\n")}
${outs.map((p) => `    wire ${p.kind === "seg7" ? "[6:0] " : ""}${p.label};`).join("\n")}
    integer errors = 0;

    ${c.module} dut (${conns});

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, ${tb});
${lines.join("\n")}
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`;
}

// ── Examples ──────────────────────────────────────────────────────────────────

const part = (id: string, kind: PartKind, x: number, y: number, label: string, extra: Partial<Part> = {}): Part => ({ id, kind, x, y, label, ...extra });
const wire = (id: string, from: string, fromPin: string, to: string, toPin: string): Wire => ({ id, from: { part: from, pin: fromPin }, to: { part: to, pin: toPin } });

export const CIRCUIT_EXAMPLES: { label: string; circuit: Circuit }[] = [
  { label: "Half adder", circuit: { module: "half_adder", parts: [
    part("p1", "switch", 80, 120, "a"), part("p2", "switch", 80, 240, "b"),
    part("p3", "xor", 300, 120, "s_xor"), part("p4", "and", 300, 260, "c_and"),
    part("p5", "led", 520, 120, "sum"), part("p6", "led", 520, 260, "carry"),
  ], wires: [
    wire("w1", "p1", "out", "p3", "a"), wire("w2", "p2", "out", "p3", "b"),
    wire("w3", "p1", "out", "p4", "a"), wire("w4", "p2", "out", "p4", "b"),
    wire("w5", "p3", "y", "p5", "in"), wire("w6", "p4", "y", "p6", "in"),
  ] } },
  { label: "2:1 mux", circuit: { module: "mux2", parts: [
    part("p1", "switch", 80, 100, "d0"), part("p2", "switch", 80, 200, "d1"), part("p3", "switch", 80, 320, "sel"),
    part("p4", "mux2", 320, 180, "m"), part("p5", "led", 540, 180, "y"),
  ], wires: [
    wire("w1", "p1", "out", "p4", "d0"), wire("w2", "p2", "out", "p4", "d1"), wire("w3", "p3", "out", "p4", "s"),
    wire("w4", "p4", "y", "p5", "in"),
  ] } },
  { label: "2-bit counter", circuit: { module: "counter2", parts: [
    part("p1", "clock", 80, 300, "clk"), part("p2", "button", 80, 400, "rst"),
    part("p3", "not", 260, 120, "n0"), part("p4", "dff", 420, 140, "q0", { reset: true }),
    part("p5", "xor", 260, 260, "x1"), part("p6", "dff", 420, 300, "q1", { reset: true }),
    part("p7", "led", 640, 140, "led0"), part("p8", "led", 640, 300, "led1"),
  ], wires: [
    wire("w1", "p4", "q", "p3", "a"), wire("w2", "p3", "y", "p4", "d"), wire("w3", "p1", "out", "p4", "clk"), wire("w4", "p2", "out", "p4", "rst"),
    wire("w5", "p6", "q", "p5", "a"), wire("w6", "p4", "q", "p5", "b"), wire("w7", "p5", "y", "p6", "d"),
    wire("w8", "p1", "out", "p6", "clk"), wire("w9", "p2", "out", "p6", "rst"),
    wire("w10", "p4", "q", "p7", "in"), wire("w11", "p6", "q", "p8", "in"),
  ] } },
  { label: "Majority vote", circuit: { module: "majority", parts: [
    part("p1", "switch", 80, 100, "a"), part("p2", "switch", 80, 220, "b"), part("p3", "switch", 80, 340, "c"),
    part("p4", "and", 280, 80, "ab"), part("p5", "and", 280, 220, "bc"), part("p6", "and", 280, 360, "ac"),
    part("p7", "or", 480, 220, "maj", { n: 3 }), part("p8", "led", 660, 220, "y"),
  ], wires: [
    wire("w1", "p1", "out", "p4", "a"), wire("w2", "p2", "out", "p4", "b"),
    wire("w3", "p2", "out", "p5", "a"), wire("w4", "p3", "out", "p5", "b"),
    wire("w5", "p1", "out", "p6", "a"), wire("w6", "p3", "out", "p6", "b"),
    wire("w7", "p4", "y", "p7", "a"), wire("w8", "p5", "y", "p7", "b"), wire("w9", "p6", "y", "p7", "c"),
    wire("w10", "p7", "y", "p8", "in"),
  ] } },
];
