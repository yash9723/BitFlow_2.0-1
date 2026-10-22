/**
 * lib/studio/logic-min.ts — the truth table / K-map tool (/studio/logic):
 * two-level minimisation (Quine–McCluskey, then an exact minimum cover),
 * K-map layout and grouping, and Verilog + exhaustive testbench generation.
 *
 * Bit order: input 0 is the most significant bit of a row index, so row 5 of
 * (a, b, c) is a=1 b=0 c=1, as truth tables are usually written.
 * Self-check: scripts/logic-min.check.ts.
 */
import { GateSim, type BoardNetlist } from "../gate-sim";

export type Cell = 0 | 1 | "x";

export interface TruthTable {
  inputs: string[];
  outputs: { name: string; cells: Cell[] }[];   // cells[row], row = input bits (input 0 = MSB)
}

/** A product term: bits set in `mask` are left out; the others must equal `value`. */
export interface Implicant { value: number; mask: number }

export const MAX_INPUTS = 6;

export const covers = (imp: Implicant, m: number) => (m & ~imp.mask) === imp.value;
const bitCount = (n: number) => { let c = 0; for (; n; n &= n - 1) c++; return c; };
/** Literals in the term: one per variable that isn't left out. */
export const literals = (imp: Implicant, n: number) => n - bitCount(imp.mask);

/** Every prime implicant of the function (ones plus don't-cares), by repeated merging. */
export function primeImplicants(ones: number[], dontCares: number[]): Implicant[] {
  let level = new Map<string, Implicant>();
  for (const m of [...ones, ...dontCares]) level.set(`${m},0`, { value: m, mask: 0 });
  const primes: Implicant[] = [];
  while (level.size) {
    const terms = [...level.values()];
    const merged = new Set<string>();
    const next = new Map<string, Implicant>();
    for (let i = 0; i < terms.length; i++) {
      for (let j = i + 1; j < terms.length; j++) {
        const a = terms[i], b = terms[j], diff = a.value ^ b.value;
        if (a.mask !== b.mask || bitCount(diff) !== 1) continue;
        const m: Implicant = { value: a.value & ~diff, mask: a.mask | diff };
        next.set(`${m.value},${m.mask}`, m);
        merged.add(`${a.value},${a.mask}`).add(`${b.value},${b.mask}`);
      }
    }
    for (const t of terms) if (!merged.has(`${t.value},${t.mask}`)) primes.push(t);
    level = next;
  }
  return primes;
}

/**
 * The fewest primes covering every one (ties: fewest literals). Exact branch and
 * bound: always branch on the uncovered one with the fewest candidate primes.
 */
export function minimumCover(n: number, ones: number[], primes: Implicant[]): Implicant[] {
  const useful = primes.filter((p) => ones.some((m) => covers(p, m)));
  let best = null as Implicant[] | null;   // assigned inside search(), so TS must not narrow it to null
  let bestCost = [Infinity, Infinity];
  const cost = (sel: Implicant[]) => [sel.length, sel.reduce((s, p) => s + literals(p, n), 0)];
  const better = (c: number[]) => c[0] < bestCost[0] || (c[0] === bestCost[0] && c[1] < bestCost[1]);
  let nodes = 0;
  // ponytail: a node cap keeps the worst 6-input cases instant; past it the best cover found so far is used.
  const search = (sel: Implicant[], left: number[]) => {
    if (++nodes > 200_000) return;
    if (!left.length) { const c = cost(sel); if (better(c)) { best = [...sel]; bestCost = c; } return; }
    if (sel.length + 1 > bestCost[0]) return;
    let pick = left[0], options = useful.filter((p) => covers(p, pick));
    for (const m of left) {
      const o = useful.filter((p) => covers(p, m));
      if (o.length < options.length) { pick = m; options = o; }
    }
    options.sort((a, b) => left.filter((m) => covers(b, m)).length - left.filter((m) => covers(a, m)).length);
    for (const p of options) search([...sel, p], left.filter((m) => !covers(p, m)));
  };
  search([], [...ones]);
  return (best ?? []).sort((a, b) => a.value - b.value || b.mask - a.mask);   // rows in table order
}

/** Minimal sum of products for the output's ones (don't-cares used freely). */
export function minimizeSop(n: number, cells: Cell[]): Implicant[] {
  const ones = cells.flatMap((c, m) => (c === 1 ? [m] : []));
  const dcs = cells.flatMap((c, m) => (c === "x" ? [m] : []));
  return minimumCover(n, ones, primeImplicants(ones, dcs));
}

/** Minimal product of sums: the minimal SOP of the zeros, each term becoming a negated sum. */
export function minimizePos(n: number, cells: Cell[]): Implicant[] {
  return minimizeSop(n, cells.map((c) => (c === 0 ? 1 : c === 1 ? 0 : "x")));
}

/** Do the terms produce `cells` (don't-cares free)? For "pos" the terms are minimizePos's. */
export function realizes(cells: Cell[], terms: Implicant[], form: "sop" | "pos" = "sop"): boolean {
  return cells.every((c, m) => {
    if (c === "x") return true;
    const hit = terms.some((t) => covers(t, m));
    return form === "sop" ? hit === (c === 1) : hit === (c === 0);
  });
}

type Style = "verilog" | "math";
const lit = (name: string, positive: boolean, style: Style) =>
  positive ? name : style === "verilog" ? `~${name}` : `${name}'`;
/** Math-style AND: juxtaposition ("ab'") only when every name is one letter, else "·". */
const mathAnd = (names: string[]) => (names.every((nm) => nm.length === 1) ? "" : "·");

/** "a & ~b | c" (verilog) or "ab' + c" (math). */
export function sopText(terms: Implicant[], names: string[], style: Style = "verilog"): string {
  const n = names.length;
  if (!terms.length) return style === "verilog" ? "1'b0" : "0";
  if (terms.some((t) => literals(t, n) === 0)) return style === "verilog" ? "1'b1" : "1";
  const and = style === "verilog" ? " & " : mathAnd(names);
  return terms.map((t) => {
    const ls = names.flatMap((nm, i) => {
      const bit = 1 << (n - 1 - i);
      return t.mask & bit ? [] : [lit(nm, !!(t.value & bit), style)];
    });
    return style === "verilog" && ls.length > 1 && terms.length > 1 ? `(${ls.join(and)})` : ls.join(and);
  }).join(style === "verilog" ? " | " : " + ");
}

/** "(a | ~b) & c" (verilog) or "(a + b')c" (math), from minimizePos terms. */
export function posText(terms: Implicant[], names: string[], style: Style = "verilog"): string {
  const n = names.length;
  if (!terms.length) return style === "verilog" ? "1'b1" : "1";
  if (terms.some((t) => literals(t, n) === 0)) return style === "verilog" ? "1'b0" : "0";
  const sums = terms.map((t) => {
    const ls = names.flatMap((nm, i) => {
      const bit = 1 << (n - 1 - i);
      return t.mask & bit ? [] : [lit(nm, !(t.value & bit), style)];
    });
    const s = ls.join(style === "verilog" ? " | " : " + ");
    return ls.length > 1 && (terms.length > 1 || style === "math") ? `(${s})` : s;
  });
  return sums.join(style === "verilog" ? " & " : mathAnd(names));
}

// ── K-map ─────────────────────────────────────────────────────────────────────

const GRAY: Record<number, number[]> = { 0: [0], 1: [0, 1], 2: [0, 1, 3, 2] };

export interface KmapLayout {
  rowVars: string[]; colVars: string[];
  rows: number[]; cols: number[];        // Gray-code order of the row / column bits
  minterm: (r: number, c: number) => number;
}

/** 2–4 inputs: the first half of the inputs label the rows, the rest the columns. */
export function kmapLayout(names: string[]): KmapLayout {
  const rb = Math.floor(names.length / 2), cb = names.length - rb;
  const rows = GRAY[rb], cols = GRAY[cb];
  return {
    rowVars: names.slice(0, rb), colVars: names.slice(rb), rows, cols,
    minterm: (r, c) => (rows[r] << cb) | cols[c],
  };
}

/** Contiguous runs (start, length) of the set positions; a group that wraps around comes out as two runs. */
function runs(hit: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < hit.length; i++) {
    if (!hit[i] || (i > 0 && hit[i - 1])) continue;
    let j = i;
    while (j + 1 < hit.length && hit[j + 1]) j++;
    out.push([i, j - i + 1]);
  }
  return out;
}

/** The rectangles (row, col, height, width in cells) to draw for one term; wrap-around groups give several. */
export function groupRects(t: Implicant, k: KmapLayout): { r: number; c: number; h: number; w: number }[] {
  const cb = k.colVars.length;
  const rowHit = k.rows.map((rv) => k.cols.some((cv) => covers(t, (rv << cb) | cv)));
  const colHit = k.cols.map((cv) => k.rows.some((rv) => covers(t, (rv << cb) | cv)));
  return runs(rowHit).flatMap(([r, h]) => runs(colHit).map(([c, w]) => ({ r, c, h, w })));
}

// ── From a design ────────────────────────────────────────────────────────────

/**
 * The truth table of a combinational netlist (lib/synth BOARD_SCRIPT output), by
 * driving every input row through GateSim. Bus bits become separate columns
 * (a_1, a_0). Returns a reason when the design can't be tabulated.
 */
export function tableFromNetlist(net: BoardNetlist, maxOutputs = 4): TruthTable | string {
  if (net.cells.some((c) => c.type.startsWith("$_DFF"))) {
    return "This design has flip-flops (it's sequential), so it has no truth table. Use a combinational module.";
  }
  const ports = Object.entries(net.ports);
  const bitNames = (name: string, width: number) =>
    width === 1 ? [name] : Array.from({ length: width }, (_, i) => `${name}_${width - 1 - i}`);   // MSB first
  const ins = ports.filter(([, p]) => p.direction === "input");
  const outs = ports.filter(([, p]) => p.direction === "output");
  const inputs = ins.flatMap(([n, p]) => bitNames(n, p.bits.length));
  const outNames = outs.flatMap(([n, p]) => bitNames(n, p.bits.length));
  if (!inputs.length || !outNames.length) return "The module needs at least one input and one output.";
  if (inputs.length > MAX_INPUTS) return `The module has ${inputs.length} input bits; the table handles up to ${MAX_INPUTS}.`;
  if (outNames.length > maxOutputs) return `The module has ${outNames.length} output bits; the table handles up to ${maxOutputs}.`;

  const sim = new GateSim(net);
  const n = inputs.length;
  const cells: Cell[][] = outNames.map(() => []);
  for (let m = 0; m < 1 << n; m++) {
    let bit = n - 1;                                  // row bits, MSB = first input bit
    for (const [name, p] of ins) {
      const v = Array.from({ length: p.bits.length }, () => 0);
      for (let i = p.bits.length - 1; i >= 0; i--, bit--) v[i] = (m >> bit) & 1;   // bits[] is LSB first
      sim.set(name, v);
    }
    let o = 0;
    for (const [name, p] of outs) {
      const v = sim.get(name);
      for (let i = p.bits.length - 1; i >= 0; i--) cells[o++][m] = v[i] ? 1 : 0;
    }
  }
  return { inputs, outputs: outNames.map((name, i) => ({ name, cells: cells[i] })) };
}

// ── Verilog ──────────────────────────────────────────────────────────────────

const KEYWORDS = new Set(`module endmodule input output inout wire reg logic assign always begin end if else case
  endcase default for while initial integer parameter localparam posedge negedge or and not xor nand nor xnor buf`.split(/\s+/));

/** Why `name` can't be a port name, or null when it can. */
export function nameProblem(name: string): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return "use letters, digits and _, starting with a letter";
  if (KEYWORDS.has(name)) return "is a Verilog keyword";
  return null;
}

export function generateVerilog(t: TruthTable, form: "sop" | "pos" = "sop", moduleName = "logic_fn"): { design: string; testbench: string } {
  const n = t.inputs.length;
  const exprs = t.outputs.map((o) => form === "sop" ? sopText(minimizeSop(n, o.cells), t.inputs) : posText(minimizePos(n, o.cells), t.inputs));
  const ports = [...t.inputs.map((i) => `    input  wire ${i}`), ...t.outputs.map((o) => `    output wire ${o.name}`)];
  const design = `// Generated by BitFlow Studio (truth table → ${form === "sop" ? "sum of products" : "product of sums"})
module ${moduleName} (
${ports.join(",\n")}
);
${t.outputs.map((o, i) => `    assign ${o.name} = ${exprs[i]};`).join("\n")}
endmodule
`;
  const tb = `tb_${moduleName}`;
  const checks: string[] = [];
  for (let m = 0; m < 1 << n; m++) {
    const bits = m.toString(2).padStart(n, "0");
    const expect = t.outputs.filter((o) => o.cells[m] !== "x");
    if (!expect.length) continue;
    const at = t.inputs.map((nm, i) => `${nm}=${bits[i]}`).join(" ");
    checks.push(`        {${t.inputs.join(", ")}} = ${n}'b${bits}; #10;`);
    for (const o of expect) {
      checks.push(`        if (${o.name} !== 1'b${o.cells[m]}) begin $display("FAIL: ${at}: ${o.name} expected ${o.cells[m]}, got %b", ${o.name}); errors = errors + 1; end`);
    }
  }
  const testbench = `\`timescale 1ns / 1ps
// Generated by BitFlow Studio: checks every row of the truth table (don't-care rows are skipped).
module ${tb};
    reg ${t.inputs.join(", ")};
    wire ${t.outputs.map((o) => o.name).join(", ")};
    integer errors = 0;

    ${moduleName} dut (${[...t.inputs, ...t.outputs.map((o) => o.name)].map((p) => `.${p}(${p})`).join(", ")});

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, ${tb});
${checks.join("\n")}
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`;
  return { design, testbench };
}
