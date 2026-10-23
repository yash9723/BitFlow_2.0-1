/**
 * lib/studio/tbgen.ts — /studio/testbench: read a Verilog or SystemVerilog module header
 * (ANSI or non-ANSI ports, parameters, widths written as expressions) and write a
 * self-checking testbench for it: clock and reset, stimulus (every input combination for
 * small combinational blocks, random otherwise), a reference-model slot and X/Z checks.
 * Self-check: scripts/tbgen.check.ts; simulated in scripts/studio-sim.check.ts.
 */

export type Dir = "input" | "output" | "inout";
export interface Port { dir: Dir; name: string; signed: boolean; range: string | null; width: number }
export interface Param { name: string; value: string }
export interface ModuleInfo {
  name: string;
  params: Param[];
  ports: Port[];
  clock: string | null;
  reset: { name: string; activeLow: boolean } | null;
}
export interface TbOptions { style: "verilog" | "sv"; cycles: number; xcheck: boolean; period: number }
export const TB_DEFAULTS: TbOptions = { style: "verilog", cycles: 200, xcheck: true, period: 10 };
/** Combinational designs with at most this many input bits get every input combination. */
export const EXHAUSTIVE_BITS = 12;

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/`[a-z_]+[^\n]*/g, " ");
const MODULE = /\bmodule\s+(?:automatic\s+|static\s+)?([A-Za-z_]\w*)/g;

/** Module names in the source, in order. */
export function moduleNames(src: string): string[] {
  return [...strip(src).matchAll(MODULE)].map((m) => m[1]);
}

/** The text between the bracket at `open` and its partner, and the index after the partner. */
function balanced(s: string, open: number): [string, number] | null {
  const pair: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  for (let i = open; i < s.length; i++) {
    if (pair[s[i]]) stack.push(pair[s[i]]);
    else if (s[i] === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return [s.slice(open + 1, i), i + 1]; }
  }
  return null;
}
/** Split on commas that aren't inside brackets. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim());
}

// ── Constant expressions (parameter values and port ranges) ───────────────────

/** Evaluate an integer constant expression: numbers (8'hFF too), parameters, + - * / % ** << >>, $clog2. Null if it can't. */
export function evalConst(expr: string, env: Record<string, number>): number | null {
  const found = expr.match(/\d*\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-F_]+|\d[\d_]*|\$?[A-Za-z_]\w*|\*\*|<<|>>|[-+*/%()]/g);
  if (!found || found.join("").replace(/\s/g, "") !== expr.replace(/\s/g, "")) return null;
  const toks: string[] = found;
  let i = 0;
  const peek = () => toks[i];
  const num = (t: string): number | null => {
    const m = /^\d*\s*'[sS]?([bBoOdDhH])\s*([0-9a-fA-F_]+)$/.exec(t);
    if (m) {
      const v = parseInt(m[2].replace(/_/g, ""), { b: 2, o: 8, d: 10, h: 16 }[m[1].toLowerCase() as "b" | "o" | "d" | "h"]);
      return Number.isNaN(v) ? null : v;
    }
    if (/^\d/.test(t)) return Number(t.replace(/_/g, ""));
    return t in env ? env[t] : null;
  };
  const atom = (): number | null => {
    const t = toks[i++];
    if (t === undefined) return null;
    if (t === "(") { const v = shift(); return toks[i++] === ")" ? v : null; }
    if (t === "-") { const v = atom(); return v === null ? null : -v; }
    if (t === "+") return atom();
    if (t === "$clog2") {
      if (toks[i++] !== "(") return null;
      const v = shift();
      if (toks[i++] !== ")" || v === null) return null;
      return v <= 1 ? 0 : Math.ceil(Math.log2(v));
    }
    return num(t);
  };
  const pow = (): number | null => { const a = atom(); if (peek() !== "**") return a; i++; const b = pow(); return a === null || b === null ? null : a ** b; };
  const mul = (): number | null => {
    let a = pow();
    while (a !== null && ["*", "/", "%"].includes(peek())) {
      const op = toks[i++], b = pow();
      if (b === null || (op !== "*" && b === 0)) return null;
      a = op === "*" ? a * b : op === "/" ? Math.trunc(a / b) : a % b;
    }
    return a;
  };
  const add = (): number | null => {
    let a = mul();
    while (a !== null && ["+", "-"].includes(peek())) { const op = toks[i++], b = mul(); if (b === null) return null; a = op === "+" ? a + b : a - b; }
    return a;
  };
  function shift(): number | null {
    let a = add();
    while (a !== null && ["<<", ">>"].includes(peek())) { const op = toks[i++], b = add(); if (b === null) return null; a = op === "<<" ? a * 2 ** b : Math.floor(a / 2 ** b); }
    return a;
  }
  const v = shift();
  return i === toks.length && v !== null && Number.isFinite(v) ? v : null;
}

// ── Header parsing ───────────────────────────────────────────────────────────

const NET_TYPES = new Set(["wire", "reg", "logic", "bit", "tri", "var", "integer"]);

/** Read one port declaration ("input wire signed [W-1:0] a" or a continuation "b"). */
function declParts(text: string): { dir: Dir | null; signed: boolean; range: string | null; type: string | null; names: string[] } | string {
  let t = text.trim();
  let dir: Dir | null = null, signed = false, range: string | null = null, type: string | null = null;
  const d = /^(input|output|inout)\b/.exec(t);
  if (d) { dir = d[1] as Dir; t = t.slice(d[0].length).trim(); }
  for (;;) {
    const w = /^([A-Za-z_]\w*)\b/.exec(t);
    if (w && (NET_TYPES.has(w[1]) || w[1] === "signed" || w[1] === "unsigned")) {
      if (w[1] === "signed") signed = true; else if (w[1] !== "unsigned") type = w[1];
      t = t.slice(w[0].length).trim();
      continue;
    }
    if (t.startsWith("[")) {
      const b = balanced(t, 0);
      if (!b) return `Unbalanced [ in "${text.trim()}".`;
      if (range) return `"${text.trim()}" has more than one packed range, which this tool can't size.`;
      range = `[${b[0].trim()}]`;
      t = t.slice(b[1]).trim();
      continue;
    }
    break;
  }
  if (type === "integer") { range = "[31:0]"; signed = true; }
  const names = t.split(",").map((x) => x.trim()).filter(Boolean);
  for (const n of names) {
    if (/^[A-Za-z_]\w*$/.test(n)) continue;
    if (/^[A-Za-z_][\w:]*\s+[A-Za-z_]\w*$/.test(n)) return `Port "${n}" uses a type or interface this tool can't size: declare it with a packed range, like input logic [7:0] ${n.split(/\s+/)[1]}.`;
    if (/\[/.test(n)) return `Port "${n}" is an unpacked array, which this tool doesn't drive.`;
    return `Can't read the port declaration "${text.trim()}".`;
  }
  return { dir, signed, range, type, names };
}

const CLOCK = /^(clk|clock|aclk|sys_clk|clk_i|i_clk|clk_in|clkin|pclk|hclk)$/i;
const RESET = /^(rst|reset|rst_n|reset_n|rstn|resetn|nreset|n_rst|arst|arst_n|areset|aresetn|areset_n|rst_i|i_rst|rst_ni|i_rst_n|presetn|hresetn|srst|srst_n)$/i;

/** Parse a module's parameters and ports. `name` picks the module (default: the last one, usually the top). */
export function parseModule(source: string, name?: string): ModuleInfo | string {
  const src = strip(source);
  const all = [...src.matchAll(MODULE)];
  if (!all.length) return "No module found. Paste a Verilog or SystemVerilog module.";
  const m = name ? all.find((x) => x[1] === name) : all[all.length - 1];
  if (!m) return `No module called ${name}.`;
  const end = src.indexOf("endmodule", m.index!);
  let rest = src.slice(m.index! + m[0].length, end < 0 ? undefined : end).trimStart();
  while (/^import\b/.test(rest)) rest = rest.slice(rest.indexOf(";") + 1).trimStart();   // "import pkg::*;" before the header

  const params: Param[] = [];
  const env: Record<string, number> = {};
  const addParam = (decl: string, overridable: boolean): string | null => {
    const p = /^(?:(?:parameter|localparam)\s+)?(?:(?:int|integer|logic|bit|signed|unsigned|longint|shortint|byte)\s+)*(?:\[[^\]]*\]\s*)?([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(decl.trim());
    if (!p) return /^(parameter\s+)?type\b/.test(decl.trim()) ? "Type parameters aren't supported." : `Can't read the parameter "${decl.trim()}".`;
    const v = evalConst(p[2].trim(), env);
    if (v === null) return `Can't work out the value of parameter ${p[1]} (= ${p[2].trim()}): use a number or an expression of other parameters.`;
    env[p[1]] = v;
    if (overridable) params.push({ name: p[1], value: p[2].trim() });
    return null;
  };
  if (rest.startsWith("#")) {
    const open = rest.indexOf("(");
    const b = open < 0 ? null : balanced(rest, open);
    if (!b) return "Unbalanced #( … ) parameter list.";
    let local = false;
    for (const decl of splitTop(b[0])) {
      if (/^localparam\b/.test(decl)) local = true; else if (/^parameter\b/.test(decl)) local = false;
      const err = addParam(decl, !local);
      if (err) return err;
    }
    rest = rest.slice(b[1]).trimStart();
  }
  let header = "";
  if (rest.startsWith("(")) {
    const b = balanced(rest, 0);
    if (!b) return "Unbalanced ( … ) port list.";
    header = b[0];
    rest = rest.slice(b[1]).trimStart();
  }
  if (!rest.startsWith(";")) return "Expected ; after the module's port list.";
  const body = rest.slice(1);

  // Body parameters count too (overridable unless localparam): evaluate them before sizing ports.
  for (const st of body.split(";")) {
    const s = /^\s*(parameter|localparam)\b([\s\S]*)$/.exec(st);
    if (!s) continue;
    for (const decl of splitTop(s[2])) { const err = addParam(decl, s[1] === "parameter"); if (err) return err; }
  }

  const port = (dir: Dir, signed: boolean, range: string | null, n: string): Port | string => {
    if (!range) return { dir, name: n, signed, range, width: 1 };
    const r = /^\[([\s\S]+):([\s\S]+)\]$/.exec(range);
    const hi = r ? evalConst(r[1], env) : null, lo = r ? evalConst(r[2], env) : null;
    if (hi === null || lo === null) return `Can't work out the width of ${n} ${range}.`;
    return { dir, name: n, signed, range, width: Math.abs(hi - lo) + 1 };
  };
  const ports: Port[] = [];
  const items = splitTop(header);
  if (items.some((x) => /^(input|output|inout)\b/.test(x))) {
    // ANSI: each item declares its ports, or continues the previous declaration
    let cur: { dir: Dir; signed: boolean; range: string | null } | null = null;
    for (const item of items) {
      const d = declParts(item);
      if (typeof d === "string") return d;
      if (d.dir) cur = { dir: d.dir, signed: d.signed, range: d.range };
      else if (cur && (d.type || d.range)) cur = { dir: cur.dir, signed: d.signed, range: d.range };
      if (!cur) return `Port "${item}" has no direction.`;
      for (const n of d.names) { const p = port(cur.dir, cur.signed, cur.range, n); if (typeof p === "string") return p; ports.push(p); }
    }
  } else {
    // Non-ANSI: names in the header, directions in the body
    const found = new Map<string, Port>();
    for (const st of body.split(";")) {
      if (!/^\s*(input|output|inout)\b/.test(st)) continue;
      const d = declParts(st);
      if (typeof d === "string") return d;
      for (const n of d.names) { const p = port(d.dir!, d.signed, d.range, n); if (typeof p === "string") return p; found.set(n, p); }
    }
    for (const n of items) {
      if (!/^[A-Za-z_]\w*$/.test(n)) return `Can't read the port "${n}".`;
      const p = found.get(n);
      if (!p) return `Port ${n} is in the port list but has no input/output declaration.`;
      ports.push(p);
    }
  }
  if (!ports.length) return `Module ${m[1]} has no ports, so there is nothing to drive: it is probably a testbench itself.`;

  const ins = ports.filter((p) => p.dir === "input" && p.width === 1);
  const clock = ins.find((p) => CLOCK.test(p.name)) ?? ins.find((p) => /clk|clock/i.test(p.name));
  const rst = ins.find((p) => RESET.test(p.name)) ?? ins.find((p) => /(^|_)(rst|reset)/i.test(p.name));
  return {
    name: m[1], params, ports,
    clock: clock?.name ?? null,
    reset: rst ? { name: rst.name, activeLow: /(n|_ni)$/i.test(rst.name) || /^n_?(rst|reset)/i.test(rst.name) } : null,
  };
}

// ── Testbench ────────────────────────────────────────────────────────────────

/** Every input combination, or random? */
export function stimulusKind(m: ModuleInfo): "exhaustive" | "random" {
  const bits = m.ports.filter((p) => p.dir === "input").reduce((a, p) => a + p.width, 0);
  return !m.clock && bits <= EXHAUSTIVE_BITS ? "exhaustive" : "random";
}

export function generateTestbench(m: ModuleInfo, opts: Partial<TbOptions> = {}): string {
  const o = { ...TB_DEFAULTS, ...opts };
  const sv = o.style === "sv";
  const tb = `tb_${m.name}`;
  const half = Math.max(1, Math.round(o.period / 2));
  const reg = sv ? "logic" : "reg", wire = sv ? "logic" : "wire";
  const decl = (kind: string, p: Port, name = p.name) => `  ${kind}${p.signed ? " signed" : ""}${p.range ? ` ${p.range}` : ""} ${name};`;
  const clk = m.clock, rst = m.reset;
  const inputs = m.ports.filter((p) => p.dir === "input");
  const driven = inputs.filter((p) => p.name !== clk && p.name !== rst?.name);
  const outs = m.ports.filter((p) => p.dir === "output");
  const inouts = m.ports.filter((p) => p.dir === "inout");
  const kind = stimulusKind(m);
  const inBits = driven.reduce((a, p) => a + p.width, 0);
  const rand = (p: Port) => {
    const f = sv ? "$urandom" : "$random(tb_seed)";
    const n = Math.ceil(p.width / 32);
    return n === 1 ? f : `{${Array(n).fill(f).join(", ")}}`;
  };
  const show = driven.slice(0, 6);
  const fmt = show.map((p) => `${p.name}=%h`).join(" ");
  const args = show.map((p) => `, ${p.name}`).join("");
  const inc = (v: string) => (sv ? `${v}++` : `${v} = ${v} + 1`);
  const fail = (why: string, extra: string) =>
    `begin ${inc("tb_errors")}; $display("FAIL at %0t: ${why}${fmt ? ` (${fmt})` : ""}", $time${extra}${args}); end`;
  const loop = (n: number | string) => (sv ? `for (int tb_i = 0; tb_i < ${n}; tb_i++) begin` : `for (tb_i = 0; tb_i < ${n}; tb_i = tb_i + 1) begin`);
  const task = (n: string) => (sv ? `  task automatic ${n}();` : `  task ${n};`);
  const L: string[] = [];

  L.push("`timescale 1ns/1ps");
  L.push(`// Self-checking testbench for ${m.name}, from BitFlow Studio (/studio/testbench).`);
  L.push(kind === "exhaustive"
    ? `// Combinational, ${inBits} input bit${inBits === 1 ? "" : "s"}: tries all ${2 ** inBits} input combinations.`
    : clk ? `// Clocked by ${clk}${rst ? `, reset by ${rst.name} (active ${rst.activeLow ? "low" : "high"})` : ""}: ${o.cycles} cycles of random inputs.`
      : `// Combinational, ${inBits} input bits: ${o.cycles} random input vectors.`);
  const otherClocks = driven.filter((p) => p.width === 1 && /clk|clock/i.test(p.name)).map((p) => p.name);
  if (otherClocks.length) L.push(`// Note: ${otherClocks.join(", ")} look${otherClocks.length === 1 ? "s" : ""} like more clocks but get random values here; give a multi-clock design its own clock generators.`);
  L.push("// Fill in the reference model (search for TODO) so every output is checked against it;");
  L.push(o.xcheck ? "// until then only the X/Z checks run." : "// until then nothing is checked.");
  L.push(`module ${tb};`);
  if (m.params.length) {
    L.push("  // The module's parameters: change them here to test other sizes.");
    for (const p of m.params) L.push(`  localparam ${p.name} = ${p.value};`);
  }
  L.push("");
  L.push("  // Inputs");
  for (const p of inputs) L.push(p.name === clk ? `  ${reg} ${p.name} = 0;` : decl(reg, p));
  if (outs.length) {
    L.push("  // Outputs");
    for (const p of outs) L.push(decl(wire, p));
  }
  if (inouts.length) {
    L.push("  // Bidirectional: connected but not driven (drive them through a tri-state if your design needs it)");
    for (const p of inouts) L.push(decl("wire", p));
  }
  if (outs.length) {
    L.push("  // Expected outputs, set by the reference model; any x bit means \"don't check this output\"");
    for (const p of outs) L.push(decl(reg, p, `exp_${p.name}`));
  }
  L.push(sv ? "  int tb_errors = 0, tb_checks = 0;" : "  integer tb_errors = 0, tb_checks = 0, tb_i;");
  if (!sv && kind === "random") L.push("  integer tb_seed = 1;");
  if (clk) L.push(`  ${reg} tb_running = 0;`);
  L.push("");
  const paramList = m.params.length ? ` #(${m.params.map((p) => `.${p.name}(${p.name})`).join(", ")})` : "";
  L.push(`  ${m.name}${paramList} dut (`);
  L.push(m.ports.map((p) => `    .${p.name}(${p.name})`).join(",\n"));
  L.push("  );");
  L.push("");
  if (clk) { L.push(`  always #${half} ${clk} = ~${clk};`); L.push(""); }

  if (clk) {
    L.push("  // Reference model: runs at every rising clock edge after reset and sees the same inputs as the");
    L.push("  // design. Keep its state in regs declared here, and set exp_* to the outputs expected after");
    L.push("  // this edge: they are compared at the next falling edge.");
  } else {
    L.push("  // Reference model: set exp_* from the current inputs.");
  }
  L.push(task("model"));
  L.push("    begin");
  const example = outs[0] && driven[0] ? ` e.g. exp_${outs[0].name} = ${driven.map((p) => p.name).slice(0, 2).join(" + ")};` : "";
  L.push(`      // TODO: replace these with your model.${example}`);
  for (const p of outs) L.push(`      exp_${p.name} = 'bx;`);
  L.push("    end");
  L.push("  endtask");
  L.push("");
  L.push(task("check"));
  L.push("    begin");
  for (const p of outs) {
    if (o.xcheck) {
      L.push(sv
        ? `      assert (!$isunknown(${p.name})) else ${fail(`${p.name} = %b has X or Z bits`, `, ${p.name}`)}`
        : `      if (^${p.name} === 1'bx) ${fail(`${p.name} = %b has X or Z bits`, `, ${p.name}`)}`);
    }
    L.push(`      if (^exp_${p.name} !== 1'bx) begin`);
    L.push(`        ${inc("tb_checks")};`);
    L.push(sv
      ? `        assert (${p.name} === exp_${p.name}) else ${fail(`${p.name} = %h, expected %h`, `, ${p.name}, exp_${p.name}`)}`
      : `        if (${p.name} !== exp_${p.name}) ${fail(`${p.name} = %h, expected %h`, `, ${p.name}, exp_${p.name}`)}`);
    L.push("      end");
  }
  L.push("    end");
  L.push("  endtask");
  L.push("");
  if (clk) { L.push(`  always @(posedge ${clk}) if (tb_running) model;`); L.push(""); }

  L.push("  initial begin");
  L.push(`    $dumpfile("wave.vcd");`);
  L.push(`    $dumpvars(0, ${tb});`);
  for (const p of driven) L.push(`    ${p.name} = 0;`);
  for (const p of outs) L.push(`    exp_${p.name} = 'bx;`);
  if (clk) {
    if (rst) {
      L.push(`    ${rst.name} = ${rst.activeLow ? 0 : 1};   // reset for two cycles`);
      L.push(`    repeat (2) @(posedge ${clk});`);
      L.push(`    @(negedge ${clk});`);
      L.push(`    ${rst.name} = ${rst.activeLow ? 1 : 0};`);
    } else {
      L.push(`    @(negedge ${clk});`);
    }
    L.push("    tb_running = 1;");
    L.push(`    ${loop(o.cycles)}`);
    for (const p of driven) L.push(`      ${p.name} = ${rand(p)};`);
    L.push(`      @(negedge ${clk});`);
    L.push("      check;");
    L.push("    end");
  } else {
    L.push(`    ${loop(kind === "exhaustive" ? 2 ** inBits : o.cycles)}`);
    if (kind === "exhaustive" && driven.length) L.push(`      ${driven.length === 1 ? driven[0].name : `{${driven.map((p) => p.name).join(", ")}}`} = tb_i;`);
    if (kind === "random") for (const p of driven) L.push(`      ${p.name} = ${rand(p)};`);
    L.push(`      #${half};`);
    L.push("      model;");
    L.push("      check;");
    L.push(`      #${half};`);
    L.push("    end");
  }
  L.push("    if (tb_errors == 0) begin");
  L.push(`      $display("ALL TESTS PASSED (%0d output checks against the model)", tb_checks);`);
  L.push(`      if (tb_checks == 0) $display("note: the reference model is still empty, so only X/Z checks ran");`);
  L.push("    end else");
  L.push(`      $display("TESTS FAILED: %0d errors", tb_errors);`);
  L.push("    $finish;");
  L.push("  end");
  L.push("endmodule");
  return L.join("\n") + "\n";
}
