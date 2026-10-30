/**
 * lib/studio/fsm.ts — the FSM designer's model (/studio/fsm): validation, a
 * cycle stepper that matches the generated Verilog, Verilog generation, a
 * self-checking testbench (from a guided random walk or the learner's own
 * steps), examples, and import from the Synth panel's extracted FSMs.
 *
 * Semantics (shared by step() and the Verilog): synchronous active-high `rst`
 * returns to the reset state; from a state the transitions are tried in list
 * order and the first true one is taken (an empty condition is always true);
 * with none true the machine stays. Outputs default to 0, then take the
 * state's values (Moore) and the taken transition's values (Mealy).
 * Self-check: scripts/fsm-gen.check.ts.
 */
import { type Values, type Widths, evaluate, evaluateIn, exprProblem, parseExpr, widthOf } from "./expr";
import { nameProblem } from "./logic-min";

export interface Port { name: string; width: number }
export interface FsmState { id: string; name: string; x: number; y: number; outputs: Record<string, string> }
export interface FsmTransition { id: string; from: string; to: string; cond: string; outputs: Record<string, string> }
export interface FsmModel {
  module: string;
  kind: "moore" | "mealy";
  encoding: "binary" | "onehot" | "gray";
  inputs: Port[];
  outputs: Port[];
  states: FsmState[];
  transitions: FsmTransition[];
  reset: string;                      // state id
}

export const MAX_PORT_WIDTH = 16;
/** Above this many input bits, overlap checks don't enumerate inputs. */
export const MAX_ENUM_BITS = 12;
const RESERVED = new Set(["clk", "rst", "state", "next_state", "errors"]);

export interface Issue { level: "error" | "warning"; msg: string; at?: string }

const widthsOf = (ports: Port[]): Widths => Object.fromEntries(ports.map((p) => [p.name, p.width]));
const bits = (w: number) => BigInt(1) << BigInt(w);

/** Everything wrong with the model; errors block code generation, warnings don't. */
export function validate(m: FsmModel): Issue[] {
  const out: Issue[] = [];
  const err = (msg: string, at?: string) => out.push({ level: "error", msg, at });
  const warn = (msg: string, at?: string) => out.push({ level: "warning", msg, at });

  const mp = nameProblem(m.module);
  if (mp) err(`Module name "${m.module}" ${mp}.`);
  const seen = new Set<string>();
  const checkName = (name: string, what: string, at?: string) => {
    const p = nameProblem(name);
    if (p) err(`${what} "${name}" ${p}.`, at);
    else if (RESERVED.has(name)) err(`${what} "${name}" is reserved (the module already has clk, rst and the state register).`, at);
    else if (seen.has(name)) err(`"${name}" is used twice.`, at);
    seen.add(name);
  };
  for (const p of [...m.inputs, ...m.outputs]) {
    checkName(p.name, "Port");
    if (!Number.isInteger(p.width) || p.width < 1 || p.width > MAX_PORT_WIDTH) err(`Port "${p.name}" needs a width from 1 to ${MAX_PORT_WIDTH}.`);
  }
  if (!m.outputs.length) warn("The machine has no outputs, so the testbench can only check that it compiles and runs.");
  if (!m.states.length) { err("Add at least one state (double-click the canvas)."); return out; }
  for (const s of m.states) checkName(s.name, "State", s.id);
  if (!m.states.some((s) => s.id === m.reset)) err("Pick a reset state.");

  const inW = widthsOf(m.inputs);
  const outW = widthsOf(m.outputs);
  const checkOutputs = (outs: Record<string, string>, where: string, at: string) => {
    for (const [name, src] of Object.entries(outs)) {
      if (!src.trim()) continue;
      if (outW[name] === undefined) { warn(`${where} sets "${name}", which isn't an output any more.`, at); continue; }
      const p = exprProblem(src, inW);
      if (p) { err(`${where}: ${name} = ${src}: ${p}.`, at); continue; }
      const e = parseExpr(src);
      if (e.k === "num") { if (e.v >= bits(outW[name])) warn(`${where}: ${src} doesn't fit in ${name} (${outW[name]} bits) and is cut short.`, at); }
      else if (widthOf(e, inW) > outW[name]) warn(`${where}: ${name} = ${src} is ${widthOf(e, inW)} bits wide; ${name} has ${outW[name]}, so it is cut short.`, at);
    }
  };
  const nameOf = (id: string) => m.states.find((s) => s.id === id)?.name ?? "?";
  for (const s of m.states) checkOutputs(s.outputs, `State ${s.name}`, s.id);
  for (const t of m.transitions) {
    const where = `${nameOf(t.from)} → ${nameOf(t.to)}`;
    if (!m.states.some((s) => s.id === t.from) || !m.states.some((s) => s.id === t.to)) { err(`${where} points at a deleted state.`, t.id); continue; }
    if (t.cond.trim()) { const p = exprProblem(t.cond, inW); if (p) err(`${where}: condition "${t.cond}": ${p}.`, t.id); }
    checkOutputs(t.outputs, where, t.id);
  }

  // Reachability from reset, ignoring conditions
  const reach = new Set([m.reset]);
  for (let grew = true; grew;) {
    grew = false;
    for (const t of m.transitions) if (reach.has(t.from) && !reach.has(t.to)) { reach.add(t.to); grew = true; }
  }
  for (const s of m.states) if (!reach.has(s.id)) warn(`State ${s.name} can't be reached from the reset state.`, s.id);

  // Priority problems, by trying every input combination (small machines only)
  if (out.some((i) => i.level === "error")) return out;
  if (m.inputs.reduce((n, p) => n + p.width, 0) > MAX_ENUM_BITS) return out;
  const combos = allInputs(m.inputs);
  for (const s of m.states) {
    const ts = m.transitions.filter((t) => t.from === s.id);
    const conds = ts.map((t) => (t.cond.trim() ? parseExpr(t.cond) : null));
    const firstWins = ts.map(() => 0), overlaps = ts.map(() => 0), everTrue = ts.map(() => 0);
    for (const v of combos) {
      let winner = -1;
      conds.forEach((c, i) => {
        if (c !== null && evaluate(c, inW, v) === BigInt(0)) return;
        everTrue[i]++;
        if (winner < 0) { winner = i; firstWins[i]++; } else overlaps[i]++;
      });
    }
    ts.forEach((t, i) => {
      const where = `${s.name} → ${nameOf(t.to)}`;
      if (!everTrue[i]) warn(`${where} is never taken: its condition is never true.`, t.id);
      else if (!firstWins[i]) warn(`${where} is never taken: an earlier transition from ${s.name} always wins.`, t.id);
      else if (overlaps[i]) warn(`${where} overlaps an earlier transition from ${s.name}; the earlier one wins when both are true.`, t.id);
    });
  }
  return out;
}

/** Every combination of input values (only call when the total is small). */
export function allInputs(inputs: Port[]): Values[] {
  let combos: Values[] = [{}];
  for (const p of inputs) {
    const next: Values[] = [];
    for (const c of combos) for (let v = 0; v < 2 ** p.width; v++) next.push({ ...c, [p.name]: v });
    combos = next;
  }
  return combos;
}

export interface StepResult { next: string; taken: string | null; outputs: Record<string, bigint> }

/** One clock cycle from `state` with `inputs`: the outputs during the cycle and the state after the edge. */
export function step(m: FsmModel, state: string, inputs: Values): StepResult {
  const inW = widthsOf(m.inputs);
  const outputs: Record<string, bigint> = Object.fromEntries(m.outputs.map((o) => [o.name, BigInt(0)]));
  const assign = (outs: Record<string, string>) => {
    for (const o of m.outputs) {
      const src = outs[o.name];
      if (src?.trim()) outputs[o.name] = evaluateIn(parseExpr(src), o.width, inW, inputs);
    }
  };
  const s = m.states.find((x) => x.id === state);
  if (s) assign(s.outputs);
  const t = m.transitions.find((x) => x.from === state && (!x.cond.trim() || evaluate(parseExpr(x.cond), inW, inputs) !== BigInt(0)));
  if (t) assign(t.outputs);
  return { next: t ? t.to : state, taken: t?.id ?? null, outputs };
}

// ── Verilog ──────────────────────────────────────────────────────────────────

const range = (w: number) => (w > 1 ? `[${w - 1}:0] ` : "");

/** Each state's register value, by its place in the list: i, one bit set, or i's Gray code (neighbours differ in one bit). */
export function stateCodes(m: FsmModel): { width: number; value: (i: number) => bigint; code: (i: number) => string } {
  const n = m.states.length;
  if (m.encoding === "onehot") return { width: n, value: (i) => BigInt(1) << BigInt(i), code: (i) => `${n}'b${(BigInt(1) << BigInt(i)).toString(2).padStart(n, "0")}` };
  const width = Math.max(1, Math.ceil(Math.log2(n)));
  const value = (i: number) => BigInt(m.encoding === "gray" ? i ^ (i >> 1) : i);
  return { width, value, code: (i) => `${width}'d${value(i)}` };
}

export function generateVerilog(m: FsmModel): string {
  const { width, code } = stateCodes(m);
  const name = (id: string) => m.states.find((s) => s.id === id)!.name;
  const reset = name(m.reset);
  const ports = [
    "    input  wire clk",
    "    input  wire rst",
    ...m.inputs.map((p) => `    input  wire ${range(p.width)}${p.name}`),
    ...m.outputs.map((p) => `    output reg  ${range(p.width)}${p.name}`),
  ];
  const sets = (outs: Record<string, string>) =>
    m.outputs.filter((o) => outs[o.name]?.trim()).map((o) => `${o.name} = ${outs[o.name].trim()};`);

  const arms = m.states.map((s) => {
    const lines: string[] = [`            ${s.name}: begin`];
    lines.push(...sets(s.outputs).map((x) => `                ${x}`));
    const ts = m.transitions.filter((t) => t.from === s.id);
    const always = ts.findIndex((t) => !t.cond.trim());     // nothing after it can be taken (validate() warns)
    (always < 0 ? ts : ts.slice(0, always + 1)).forEach((t, i) => {
      const body = [`next_state = ${name(t.to)};`, ...sets(t.outputs)].join(" ");
      if (!t.cond.trim()) lines.push(`                ${i === 0 ? "" : "else "}begin ${body} end`);
      else lines.push(`                ${i === 0 ? "if" : "else if"} (${t.cond.trim()}) begin ${body} end`);
    });
    lines.push("            end");
    return lines.join("\n");
  });

  return `// Generated by BitFlow Studio: ${m.kind === "moore" ? "Moore" : "Mealy"} state machine, ${m.encoding === "onehot" ? "one-hot" : m.encoding === "gray" ? "Gray-code" : "binary"} state encoding.
// rst is synchronous and active high.
module ${m.module} (
${ports.join(",\n")}
);
    localparam ${range(width)}${m.states.map((s, i) => `${s.name} = ${code(i)}`).join(",\n               ")};

    reg ${range(width)}state, next_state;

    always @(posedge clk) begin
        if (rst) state <= ${reset};
        else     state <= next_state;
    end

    // Next state and outputs: transitions are tried in order; with none true the state stays
    always @(*) begin
        next_state = state;
${m.outputs.map((o) => `        ${o.name} = ${o.width}'d0;`).join("\n")}${m.outputs.length ? "\n" : ""}        case (state)
${arms.join("\n")}
            default: next_state = ${reset};
        endcase
    end
endmodule
`;
}

/** Deterministic pseudo-random numbers (testbenches must not change between clicks). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32);
}

/**
 * Inputs for `cycles` clock cycles from reset that try to take every transition:
 * each cycle tries a few random input vectors and prefers one that takes a
 * transition not taken yet.
 */
export function guidedWalk(m: FsmModel, cycles = 32, seed = 1): Values[] {
  const rand = rng(seed);
  const randomInputs = (): Values => Object.fromEntries(m.inputs.map((p) => [p.name, Math.floor(rand() * 2 ** p.width)]));
  const taken = new Set<string>();
  const steps: Values[] = [];
  let state = m.reset;
  for (let c = 0; c < cycles; c++) {
    const options = [Object.fromEntries(m.inputs.map((p) => [p.name, 0])), ...Array.from({ length: 24 }, randomInputs)];
    const pick = options.find((v) => { const r = step(m, state, v); return r.taken !== null && !taken.has(r.taken); })
      ?? options[1 + Math.floor(rand() * 24)];
    const r = step(m, state, pick);
    if (r.taken) taken.add(r.taken);
    steps.push(pick);
    state = r.next;
  }
  return steps;
}

/** A testbench that resets the machine, drives `steps` (one input vector per cycle) and checks every output each cycle. */
export function generateTestbench(m: FsmModel, steps: Values[]): string {
  const tb = `tb_${m.module}`;
  const name = (id: string) => m.states.find((s) => s.id === id)?.name ?? "?";
  const lines: string[] = [];
  let state = m.reset;
  steps.forEach((v, i) => {
    const r = step(m, state, v);
    const ins = m.inputs.map((p) => `${p.name}=${v[p.name] ?? 0}`).join(" ");
    const at = `cycle ${i + 1} (state ${name(state)}${ins ? ", " + ins : ""})`;
    lines.push(`        // ${at}`);
    if (m.inputs.length) lines.push(`        ${m.inputs.map((p) => `${p.name} = ${p.width}'d${v[p.name] ?? 0};`).join(" ")}`);
    lines.push("        #1;");
    for (const o of m.outputs) {
      const want = r.outputs[o.name];
      lines.push(`        if (${o.name} !== ${o.width}'d${want}) begin $display("FAIL: ${at}: ${o.name} expected ${want}, got %0d", ${o.name}); errors = errors + 1; end`);
    }
    lines.push("        @(negedge clk);");
    state = r.next;
  });
  const conns = ["clk", "rst", ...m.inputs.map((p) => p.name), ...m.outputs.map((p) => p.name)].map((p) => `.${p}(${p})`).join(", ");
  return `\`timescale 1ns / 1ps
// Generated by BitFlow Studio: resets the machine, drives ${steps.length} cycles of inputs and checks the outputs every cycle.
module ${tb};
    reg clk = 0, rst = 1;
${[...m.inputs.map((p) => `    reg  ${range(p.width)}${p.name};`), ...m.outputs.map((p) => `    wire ${range(p.width)}${p.name};`)].join("\n")}
    integer errors = 0;

    ${m.module} dut (${conns});

    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, ${tb});
${m.inputs.map((p) => `        ${p.name} = 0;`).join("\n")}
        @(negedge clk); @(negedge clk);
        rst = 0;
${lines.join("\n")}
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`;
}

// ── Examples ──────────────────────────────────────────────────────────────────

const st = (id: string, name: string, x: number, y: number, outputs: Record<string, string> = {}): FsmState => ({ id, name, x, y, outputs });
const tr = (id: string, from: string, to: string, cond: string, outputs: Record<string, string> = {}): FsmTransition => ({ id, from, to, cond, outputs });

export const FSM_EXAMPLES: { label: string; model: FsmModel }[] = [
  { label: "101 detector (Moore)", model: {
    module: "detect_101", kind: "moore", encoding: "binary", reset: "s0",
    inputs: [{ name: "din", width: 1 }], outputs: [{ name: "found", width: 1 }],
    states: [st("s0", "IDLE", 140, 220), st("s1", "GOT1", 340, 100), st("s2", "GOT10", 560, 220), st("s3", "GOT101", 340, 360, { found: "1" })],
    transitions: [tr("t0", "s0", "s1", "din"), tr("t1", "s1", "s2", "!din"), tr("t2", "s2", "s3", "din"), tr("t3", "s2", "s0", "!din"),
      tr("t4", "s3", "s1", "din"), tr("t5", "s3", "s2", "!din")],
  } },
  { label: "101 detector (Mealy)", model: {
    module: "detect_101_mealy", kind: "mealy", encoding: "binary", reset: "s0",
    inputs: [{ name: "din", width: 1 }], outputs: [{ name: "found", width: 1 }],
    states: [st("s0", "IDLE", 140, 220), st("s1", "GOT1", 360, 100), st("s2", "GOT10", 580, 260)],
    transitions: [tr("t0", "s0", "s1", "din"), tr("t1", "s1", "s2", "!din"), tr("t2", "s2", "s1", "din", { found: "1" }), tr("t3", "s2", "s0", "!din")],
  } },
  { label: "Traffic light", model: {
    module: "traffic_light", kind: "moore", encoding: "onehot", reset: "s0",
    inputs: [{ name: "car", width: 1 }], outputs: [{ name: "red", width: 1 }, { name: "yellow", width: 1 }, { name: "green", width: 1 }],
    states: [st("s0", "GREEN", 160, 220, { green: "1" }), st("s1", "YELLOW", 440, 110, { yellow: "1" }), st("s2", "RED", 440, 340, { red: "1" })],
    transitions: [tr("t0", "s0", "s1", "car"), tr("t1", "s1", "s2", ""), tr("t2", "s2", "s0", "!car")],
  } },
  // Seven states where five will do: minimizing merges E with G, and then D with F
  { label: "Reducible (7 states)", model: {
    module: "reducible", kind: "mealy", encoding: "binary", reset: "s0",
    inputs: [{ name: "x", width: 1 }], outputs: [{ name: "z", width: 1 }],
    states: [st("s0", "A", 120, 230), st("s1", "B", 280, 90), st("s2", "C", 280, 370), st("s3", "D", 460, 90), st("s4", "E", 460, 370), st("s5", "F", 640, 90), st("s6", "G", 640, 370)],
    transitions: [
      tr("t0", "s0", "s1", "x"),
      tr("t1", "s1", "s3", "x"), tr("t2", "s1", "s2", "!x"),
      tr("t3", "s2", "s3", "x"), tr("t4", "s2", "s0", "!x"),
      tr("t5", "s3", "s5", "x", { z: "1" }), tr("t6", "s3", "s4", "!x"),
      tr("t7", "s4", "s5", "x", { z: "1" }), tr("t8", "s4", "s0", "!x"),
      tr("t9", "s5", "s5", "x", { z: "1" }), tr("t10", "s5", "s6", "!x"),
      tr("t11", "s6", "s5", "x", { z: "1" }), tr("t12", "s6", "s0", "!x"),
    ],
  } },
  { label: "Vending (coins)", model: {
    module: "vending", kind: "mealy", encoding: "binary", reset: "s0",
    inputs: [{ name: "coin", width: 2 }], outputs: [{ name: "vend", width: 1 }, { name: "change", width: 2 }],
    states: [st("s0", "C0", 140, 240), st("s1", "C5", 380, 100), st("s2", "C10", 620, 240)],
    transitions: [
      tr("t0", "s0", "s1", "coin == 2'd1"), tr("t1", "s0", "s2", "coin == 2'd2"),
      tr("t2", "s1", "s2", "coin == 2'd1"), tr("t3", "s1", "s0", "coin == 2'd2", { vend: "1" }),
      tr("t4", "s2", "s0", "coin == 2'd1", { vend: "1" }), tr("t5", "s2", "s0", "coin == 2'd2", { vend: "1", change: "2'd1" }),
    ],
  } },
];

// ── Import from the Synth panel (lib/synth/yosys.ts parseFsmInfo) ─────────────

export interface ExtractedFsm {
  module: string;
  states: { id: number; code: number | null; name: string | null; reset: boolean }[];
  reset: string | null;                                    // e.g. "rst=1", already factored out
  transitions: { from: number; to: number; conditions: string[] }[];
}

/**
 * A model from Yosys's view of an FSM. Conditions like "a=1 & b [2]=0" become
 * "a && !b[2]"; conditions on internal nets ("…") can't be expressed and are
 * dropped (counted in `skipped`). Yosys doesn't report outputs: add them.
 */
export function fromExtracted(f: ExtractedFsm): { model: FsmModel; skipped: number } {
  const resetName = f.reset?.split("=")[0].trim() ?? null;
  const widths = new Map<string, number>();
  const ref = (term: string) => {
    const m = /^(\S+?)\s*(?:\[(\d+)\])?=([01])$/.exec(term.trim());
    if (!m) return null;
    const [, base, idx, v] = m;
    widths.set(base, Math.max(widths.get(base) ?? 1, idx !== undefined ? Number(idx) + 1 : 1));
    const r = idx !== undefined ? `${base}[${idx}]` : base;
    return v === "1" ? r : `!${r}`;
  };
  const used = new Set<string>();
  const stateName = (s: ExtractedFsm["states"][number]) => {
    let n = s.name && !nameProblem(s.name) && !RESERVED.has(s.name) ? s.name : `S${s.code ?? s.id}`;
    while (used.has(n)) n += "_";
    used.add(n);
    return n;
  };
  const ordered = [...f.states].sort((a, b) => Number(b.reset) - Number(a.reset));
  const states = ordered.map((s, i) => {
    const angle = (2 * Math.PI * i) / ordered.length - Math.PI / 2;
    return st(`s${s.id}`, stateName(s), Math.round(380 + 240 * Math.cos(angle)), Math.round(240 + 170 * Math.sin(angle)));
  });
  let skipped = 0;
  const transitions: FsmTransition[] = [];
  for (const t of f.transitions) {
    if (t.from === t.to) continue;                         // staying is the default
    const conds = t.conditions.filter((c) => !c.includes("…"));
    skipped += t.conditions.length - conds.length;
    if (!conds.length) continue;
    const exprs = conds.map((c) => (c.trim() ? c.split("&").map(ref).filter((x): x is string => !!x).join(" && ") : ""));
    const cond = exprs.includes("") ? "" : exprs.length === 1 ? exprs[0] : exprs.map((e) => (e.includes("&&") ? `(${e})` : e)).join(" || ");
    transitions.push(tr(`t${transitions.length}`, `s${t.from}`, `s${t.to}`, cond));
  }
  const inputs = [...widths].filter(([n]) => n !== resetName && n !== "clk").map(([name, width]) => ({ name, width }));
  const reset = ordered.find((s) => s.reset) ?? ordered[0];
  return {
    model: {
      module: nameProblem(f.module) ? "fsm" : f.module, kind: "moore", encoding: "binary",
      inputs, outputs: [], states, transitions, reset: reset ? `s${reset.id}` : "",
    },
    skipped,
  };
}
