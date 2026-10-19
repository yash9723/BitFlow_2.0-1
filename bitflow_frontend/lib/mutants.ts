/**
 * lib/mutants.ts — single-change "mutants" of a Verilog design, for testbench
 * problems: a student's testbench is graded by how many of them it catches.
 *
 * Each mutant changes one thing on one line: an operator (& | ^ && || + - == !=
 * < > >=), a constant, an if-condition (inverted), the branches of a ?:, a clock
 * edge, or a dropped ~ / !. Comments, strings, declarations, port lists and
 * parameters are never touched. Generation is deterministic.
 *
 * Not every mutant is a real bug (some are equivalent to the original), so
 * verifyReferenceSolution keeps only those a model testbench catches.
 * Self-check: scripts/mutants.check.ts.
 */

export interface Mutant {
  id:          string;
  kind:        string;
  line:        number;
  /** Shown to students when their testbench misses it, e.g. "'+' became '-' on line 7". */
  description: string;
  code:        string;
}

/** Blank out comments and string contents (same length, newlines kept) so positions line up. */
function mask(src: string): string {
  return src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\\n]|\\.)*"/g, (m) => m.replace(/[^\n]/g, " "));
}

const SKIP = /^\s*(module|endmodule|parameter|localparam|input|output|inout|function|endfunction|task|endtask|genvar|`)\b/;
const DECL = /^\s*(wire|reg|logic|integer)\b/;
const eligible = (m: string) => !!m.trim() && !SKIP.test(m) && (!DECL.test(m) || m.includes("="));

function tweakSized(width: string, signed: string, base: string, digits: string): string | null {
  if (/[xXzZ]/.test(digits)) return null;
  const b = base.toLowerCase(), d = digits.replace(/_/g, "");
  let nd: string;
  if (b === "b") nd = d.slice(0, -1) + (d.endsWith("0") ? "1" : "0");
  else if (b === "d") nd = String(Number(d) + 1);
  else nd = d.slice(0, -1) + ((parseInt(d.slice(-1), 16) + 1) % 16).toString(16);
  return `${width}'${signed}${base}${nd}`;
}

interface Op { kind: string; re: RegExp; to: (m: RegExpExecArray) => string | null; what: (m: RegExpExecArray, to: string) => string }

const swap = (kind: string, re: RegExp, to: string): Op =>
  ({ kind, re, to: () => to, what: (m) => `'${m[0]}' became '${to}'` });

const OPS: Op[] = [
  swap("logic",   /&&/g, "||"),
  swap("logic",   /\|\|/g, "&&"),
  swap("bitwise", /(?<![&~|^])&(?![&=])/g, "|"),
  swap("bitwise", /(?<![|~&^])\|(?![|=])/g, "&"),
  swap("bitwise", /(?<!~)\^(?!~)/g, "|"),
  swap("arith",   /(?<=[\w)\]]\s*)\+(?![+=])/g, "-"),
  swap("arith",   /(?<=[\w)\]]\s*)-(?![-=>])/g, "+"),
  swap("compare", /(?<![=!<>])==(?!=)/g, "!="),
  swap("compare", /!=(?!=)/g, "=="),
  swap("compare", /(?<!<)<(?![<=])/g, "<="),
  swap("compare", /(?<![>=-])>(?![>=])/g, ">="),
  swap("compare", /(?<!>)>=/g, ">"),
  swap("clock",   /\bposedge\b/g, "negedge"),
  swap("clock",   /\bnegedge\b/g, "posedge"),
  { kind: "negation", re: /~(?=\s*[\w(])/g, to: () => "", what: () => "a '~' was removed" },
  { kind: "negation", re: /!(?!=)(?=\s*[\w(])/g, to: () => "", what: () => "a '!' was removed" },
  { kind: "constant", re: /\b(\d+)'([sS]?)([bBdDhH])([0-9a-fA-F_xXzZ]+)\b/g,
    to: (m) => tweakSized(m[1], m[2], m[3], m[4]), what: (m, to) => `the constant ${m[0]} became ${to}` },
  { kind: "constant", re: /(?<![\w'.$])(\d+)(?![\w'.])/g,
    to: (m) => String(Number(m[1]) + 1), what: (m, to) => `the number ${m[0]} became ${to}` },
];

/** All single-change mutants of `src`, in source order. */
export function generateMutants(src: string): Mutant[] {
  const lines = src.split("\n");
  const masked = mask(src).split("\n");
  const out: Mutant[] = [];
  const seen = new Set<string>([src]);
  const add = (kind: string, i: number, newLine: string, what: string) => {
    const code = [...lines.slice(0, i), newLine, ...lines.slice(i + 1)].join("\n");
    if (seen.has(code)) return;
    seen.add(code);
    out.push({ id: `m${out.length + 1}`, kind, line: i + 1, description: `${what} on line ${i + 1}`, code });
  };

  masked.forEach((m, i) => {
    if (!eligible(m)) return;
    const line = lines[i];
    // In "wire [3:0] s = a + b;" only the expression changes, never the declared width.
    const from = DECL.test(m) ? m.indexOf("=") + 1 : 0;
    for (const op of OPS) {
      op.re.lastIndex = 0;
      for (let x = op.re.exec(m); x; x = op.re.exec(m)) {
        const to = op.to(x);
        if (to === null || x.index < from) continue;
        add(op.kind, i, line.slice(0, x.index) + to + line.slice(x.index + x[0].length), op.what(x, to));
      }
    }
    // if (c) → if (!(c))
    for (const x of m.matchAll(/\bif\s*\(/g)) {
      const open = x.index! + x[0].length - 1;
      let depth = 0, close = -1;
      for (let j = open; j < m.length; j++) {
        if (m[j] === "(") depth++;
        else if (m[j] === ")" && --depth === 0) { close = j; break; }
      }
      if (close > open) add("condition", i, `${line.slice(0, open + 1)}!(${line.slice(open + 1, close)})${line.slice(close)}`, "an if-condition was inverted");
    }
    // c ? a : b; → c ? b : a;   (one ?: per line, no bit-selects)
    const q = m.indexOf("?"), c = m.indexOf(":", q), semi = m.lastIndexOf(";");
    if (q > 0 && m.indexOf("?", q + 1) < 0 && c > q && semi > c && !m.includes("[")) {
      const a = line.slice(q + 1, c).trim(), b = line.slice(c + 1, semi).trim();
      if (a && b && a !== b) add("ternary", i, `${line.slice(0, q + 1)} ${b} : ${a}${line.slice(semi)}`, "the two branches of a ?: were swapped");
    }
  });
  return out;
}

/** Pick up to `max` mutants, round-robin across kinds so one operator doesn't dominate. */
export function pickMutants(mutants: Mutant[], max: number): Mutant[] {
  const byKind = new Map<string, Mutant[]>();
  for (const m of mutants) byKind.set(m.kind, [...(byKind.get(m.kind) ?? []), m]);
  const queues = [...byKind.values()];
  const picked: Mutant[] = [];
  for (let round = 0; picked.length < max && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (q[round] && picked.length < max) picked.push(q[round]);
  }
  return picked.sort((a, b) => a.line - b.line || a.id.localeCompare(b.id));
}

export function parseMutants(json: string | null | undefined): Mutant[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((m) => m && typeof m.code === "string" && typeof m.id === "string") : [];
  } catch {
    return [];
  }
}
