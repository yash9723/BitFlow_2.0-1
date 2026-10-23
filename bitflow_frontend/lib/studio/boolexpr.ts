/**
 * lib/studio/boolexpr.ts — Boolean expressions for the Boolean algebra tool (/studio/boolean):
 * textbook and Verilog notation, evaluation, truth tables and equivalence. Minimisation is
 * lib/studio/logic-min.ts. Self-check: scripts/boolexpr.check.ts.
 *
 * Syntax: NOT is a' (postfix), ~a, !a or ¬a; AND is a·b, a*b, a&b, a∧b or just ab / a(b+c);
 * XOR is a^b or a⊕b; OR is a+b, a|b or a∨b; constants 0 and 1. Precedence (as in Verilog):
 * NOT, then AND, then XOR, then OR. With singleLetter, "AB" is A·B; otherwise names are
 * whole words and juxtaposed operands need a space ("a b").
 */

export type Expr =
  | { k: "var"; name: string }
  | { k: "const"; v: 0 | 1 }
  | { k: "not"; a: Expr }
  | { k: "and" | "or" | "xor"; a: Expr; b: Expr };

export interface Parsed { expr: Expr; vars: string[] }
export const MAX_VARS = 16;

type Tok = { t: "id" | "num" | "op" | "(" | ")" | "'"; v: string; at: number };

const OPS: Record<string, string> = {
  "~": "not", "!": "not", "¬": "not", "&": "and", "*": "and", "·": "and", "∧": "and", ".": "and",
  "|": "or", "+": "or", "∨": "or", "^": "xor", "⊕": "xor",
};

function lex(src: string, singleLetter: boolean): Tok[] | string {
  const out: Tok[] = [];
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[A-Za-z_]/.test(c)) {
      const m = (singleLetter ? /^[A-Za-z_][0-9]*/ : /^[A-Za-z_][A-Za-z0-9_]*/).exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], at: i }); i += m[0].length; continue;
    }
    if (c === "0" || c === "1") { out.push({ t: "num", v: c, at: i }); i++; continue; }
    if (c === "(" || c === ")") { out.push({ t: c, v: c, at: i }); i++; continue; }
    if (c === "'" || c === "’" || c === "′") { out.push({ t: "'", v: "'", at: i }); i++; continue; }
    const op = OPS[c];
    if (!op) return `Unexpected "${c}" at position ${i + 1}.`;
    out.push({ t: "op", v: op, at: i });
    i += (c === "&" || c === "|") && src[i + 1] === c ? 2 : 1;           // && and || read like & and |
  }
  return out;
}

/** Parse an expression; variables come out in alphabetical order (truth tables list them that way). */
export function parseBool(src: string, singleLetter = true): Parsed | string {
  const toks = lex(src, singleLetter);
  if (typeof toks === "string") return toks;
  if (!toks.length) return "Type an expression, such as A'B + AB'.";
  let i = 0;
  const peek = (): Tok | undefined => toks[i];
  const fail = (what: string) => `${what} at position ${(peek()?.at ?? src.length) + 1}.`;
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const startsOperand = (t?: Tok) => !!t && (t.t === "id" || t.t === "num" || t.t === "(" || (t.t === "op" && t.v === "not"));

  const binary = (op: "or" | "xor" | "and", next: () => Expr | string) => (): Expr | string => {
    let a = next();
    if (typeof a === "string") return a;
    for (;;) {
      if (isOp(op)) i++;
      else if (!(op === "and" && startsOperand(peek()))) break;      // juxtaposition is AND: AB, A(B+C)
      const b = next();
      if (typeof b === "string") return b;
      a = { k: op, a, b };
    }
    return a;
  };
  const primary = (): Expr | string => {
    const t = peek();
    if (!t) return fail("The expression ends too soon");
    if (t.t === "id") { i++; return { k: "var", name: t.v }; }
    if (t.t === "num") { i++; return { k: "const", v: t.v === "1" ? 1 : 0 }; }
    if (t.t === "(") {
      i++;
      const a = or();
      if (typeof a === "string") return a;
      if (peek()?.t !== ")") return fail("Missing )");
      i++;
      return a;
    }
    return fail(`Unexpected "${t.v === "not" ? "~" : t.v}"`);
  };
  const unary = (): Expr | string => {
    if (isOp("not")) { i++; const a = unary(); return typeof a === "string" ? a : { k: "not", a }; }
    let a = primary();
    if (typeof a === "string") return a;
    while (peek()?.t === "'") { i++; a = { k: "not", a }; }
    return a;
  };
  const and = binary("and", unary), xor = binary("xor", and);
  const or: () => Expr | string = binary("or", xor);

  const expr = or();
  if (typeof expr === "string") return expr;
  if (i < toks.length) return fail(`Unexpected "${toks[i].v}"`);
  const vars = [...new Set(varsOf(expr))].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }) || a.localeCompare(b));
  if (vars.length > MAX_VARS) return `${vars.length} variables; up to ${MAX_VARS}.`;
  return { expr, vars };
}

function varsOf(e: Expr): string[] {
  return e.k === "var" ? [e.name] : e.k === "const" ? [] : e.k === "not" ? varsOf(e.a) : [...varsOf(e.a), ...varsOf(e.b)];
}

export function evaluate(e: Expr, env: Record<string, number>): 0 | 1 {
  switch (e.k) {
    case "var": return env[e.name] ? 1 : 0;
    case "const": return e.v;
    case "not": return evaluate(e.a, env) ? 0 : 1;
    case "and": return (evaluate(e.a, env) & evaluate(e.b, env)) as 0 | 1;
    case "or": return (evaluate(e.a, env) | evaluate(e.b, env)) as 0 | 1;
    case "xor": return (evaluate(e.a, env) ^ evaluate(e.b, env)) as 0 | 1;
  }
}

/** The value in every row; the first variable is the row's MSB, as in lib/studio/logic-min.ts. */
export function table(e: Expr, vars: string[]): (0 | 1)[] {
  const n = vars.length, out: (0 | 1)[] = [];
  for (let m = 0; m < 1 << n; m++) out.push(evaluate(e, Object.fromEntries(vars.map((v, i) => [v, (m >> (n - 1 - i)) & 1]))));
  return out;
}

/** null if a and b agree on every input (over both sets of variables), else the first row where they differ. */
export function counterexample(a: Parsed, b: Parsed): { env: Record<string, 0 | 1>; a: 0 | 1; b: 0 | 1 } | null {
  const vars = [...new Set([...a.vars, ...b.vars])].sort();
  const n = vars.length;
  for (let m = 0; m < 1 << n; m++) {
    const env = Object.fromEntries(vars.map((v, i) => [v, ((m >> (n - 1 - i)) & 1) as 0 | 1]));
    const x = evaluate(a.expr, env), y = evaluate(b.expr, env);
    if (x !== y) return { env, a: x, b: y };
  }
  return null;
}

const PREC = { or: 1, xor: 2, and: 3, not: 4, var: 5, const: 5 } as const;
/** The expression as Verilog (~ & ^ |), with only the parentheses it needs. */
export function toVerilog(e: Expr, outer = 0): string {
  const p = PREC[e.k];
  const s = e.k === "var" ? e.name : e.k === "const" ? `1'b${e.v}`
    : e.k === "not" ? `~${toVerilog(e.a, PREC.not)}`
    : `${toVerilog(e.a, p)} ${e.k === "and" ? "&" : e.k === "or" ? "|" : "^"} ${toVerilog(e.b, p + 1)}`;
  return p < outer ? `(${s})` : s;
}

/** Operator counts: the cost of building it as written with 2-input gates and inverters. */
export function gateCount(e: Expr): { and: number; or: number; xor: number; not: number } {
  const c = { and: 0, or: 0, xor: 0, not: 0 };
  const walk = (x: Expr) => { if (x.k === "var" || x.k === "const") return; c[x.k]++; walk(x.a); if (x.k !== "not") walk(x.b); };
  walk(e);
  return c;
}
