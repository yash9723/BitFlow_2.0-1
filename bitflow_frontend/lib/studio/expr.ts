/**
 * lib/studio/expr.ts — a small Verilog expression language for the FSM designer's
 * transition conditions and output values: identifiers, a[i] / a[h:l], numbers
 * (5, 4'b1010, 8'hff, 3'd5), ! ~ + - & | ^ && || == != < <= > >= and parentheses.
 *
 * Evaluation follows Verilog's unsigned width rules (operands of + - & | ^ ~ are
 * extended to the context width; == and < compare at the wider operand's width),
 * so the in-browser stepper agrees with the simulator on the generated code.
 * Self-check: scripts/fsm-gen.check.ts.
 */

export type Expr =
  | { k: "num"; v: bigint; w: number | null }            // w null: unsized (32 bits)
  | { k: "id"; name: string }
  | { k: "sel"; name: string; hi: number; lo: number }
  | { k: "un"; op: "!" | "~"; e: Expr }
  | { k: "bin"; op: string; l: Expr; r: Expr };

/** name -> width, for evaluation and checking. */
export type Widths = Record<string, number>;
export type Values = Record<string, bigint | number>;

const TOKEN = /\s*(?:(\d*'[sS]?[bodhBODH][0-9a-fA-F_xXzZ]+)|(\d[\d_]*)|([A-Za-z_][A-Za-z0-9_$]*)|(&&|\|\||==|!=|<=|>=|[()[\]:!~&|^<>+-]))/y;

/** Binding power of each binary operator (Verilog order). */
const BP: Record<string, number> = { "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, "<=": 7, ">": 7, ">=": 7, "+": 8, "-": 8 };

function parseNumber(t: string): { k: "num"; v: bigint; w: number | null } {
  const m = /^(\d*)'[sS]?([bodhBODH])(.+)$/.exec(t);
  if (!m) return { k: "num", v: BigInt(t.replace(/_/g, "")), w: null };
  const digits = m[3].replace(/_/g, "");
  if (/[xXzZ]/.test(digits)) throw new Error(`x/z values aren't allowed here: ${t}`);
  const base = { b: 2, o: 8, d: 10, h: 16 }[m[2].toLowerCase() as "b" | "o" | "d" | "h"];
  const v = [...digits.toLowerCase()].reduce((acc, ch) => {
    const d = parseInt(ch, base);
    if (Number.isNaN(d)) throw new Error(`bad digit "${ch}" in ${t}`);
    return acc * BigInt(base) + BigInt(d);
  }, BigInt(0));
  const w = m[1] ? Number(m[1]) : null;
  if (w !== null && (w < 1 || w > 64)) throw new Error(`width ${w} in ${t} is out of range`);
  return { k: "num", v: w === null ? v : v & mask(w), w };
}

/** Parse; throws an Error with a readable message. An empty string is not an expression. */
export function parseExpr(src: string): Expr {
  const toks: string[] = [];
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`can't read "${src.slice(pos).trim().slice(0, 12)}"`);
    toks.push(m[1] ?? m[2] ?? m[3] ?? m[4]);
    pos = TOKEN.lastIndex;
  }
  if (!toks.length) throw new Error("empty expression");
  let i = 0;
  const peek = () => toks[i];
  const take = (t?: string) => {
    const got = toks[i++];
    if (t !== undefined && got !== t) throw new Error(got === undefined ? `expected "${t}" at the end` : `expected "${t}", found "${got}"`);
    return got;
  };
  const int = () => {
    const t = take();
    if (t === undefined || !/^\d+$/.test(t)) throw new Error(`expected a bit number, found "${t ?? "end"}"`);
    return Number(t);
  };
  const primary = (): Expr => {
    const t = take();
    if (t === undefined) throw new Error("the expression ends too early");
    if (t === "(") { const e = expr(0); take(")"); return e; }
    if (t === "!" || t === "~") return { k: "un", op: t, e: primary() };
    if (/^\d/.test(t) || t.startsWith("'")) return parseNumber(t);
    if (/^[A-Za-z_]/.test(t)) {
      if (peek() !== "[") return { k: "id", name: t };
      take("[");
      const hi = int();
      const lo = peek() === ":" ? (take(":"), int()) : hi;
      take("]");
      if (lo > hi) throw new Error(`write ${t}[${lo}:${hi}] high bit first`);
      return { k: "sel", name: t, hi, lo };
    }
    throw new Error(`unexpected "${t}"`);
  };
  const expr = (minBp: number): Expr => {
    let l = primary();
    while (peek() !== undefined && BP[peek()] !== undefined && BP[peek()] > minBp) {
      const op = take();
      l = { k: "bin", op, l, r: expr(BP[op]) };
    }
    return l;
  };
  const e = expr(0);
  if (i < toks.length) throw new Error(`unexpected "${toks[i]}"`);
  return e;
}

/** Every identifier the expression reads. */
export function identifiers(e: Expr): string[] {
  switch (e.k) {
    case "num": return [];
    case "id": case "sel": return [e.name];
    case "un": return identifiers(e.e);
    case "bin": return [...new Set([...identifiers(e.l), ...identifiers(e.r)])];
  }
}

function mask(w: number): bigint { return (BigInt(1) << BigInt(w)) - BigInt(1); }

/** Self-determined width (Verilog rules for this subset). */
export function widthOf(e: Expr, widths: Widths): number {
  switch (e.k) {
    case "num": return e.w ?? 32;
    case "id": {
      const w = widths[e.name];
      if (w === undefined) throw new Error(`"${e.name}" isn't an input`);
      return w;
    }
    case "sel": {
      const w = widths[e.name];
      if (w === undefined) throw new Error(`"${e.name}" isn't an input`);
      if (e.hi >= w) throw new Error(`${e.name}[${e.hi}] is past its width (${w} bits)`);
      return e.hi - e.lo + 1;
    }
    case "un": return e.op === "!" ? 1 : widthOf(e.e, widths);
    case "bin":
      return ["+", "-", "&", "|", "^"].includes(e.op) ? Math.max(widthOf(e.l, widths), widthOf(e.r, widths)) : 1;
  }
}

/** Value of e at width ctx (>= its own width), as Verilog computes it. */
function ev(e: Expr, ctx: number, widths: Widths, values: Values): bigint {
  const val = (name: string) => BigInt(values[name] ?? 0) & mask(widths[name]);
  switch (e.k) {
    case "num": return e.v & mask(Math.max(ctx, e.w ?? 32));
    case "id": return val(e.name);
    case "sel": return (val(e.name) >> BigInt(e.lo)) & mask(e.hi - e.lo + 1);
    case "un": {
      if (e.op === "!") return ev(e.e, widthOf(e.e, widths), widths, values) === BigInt(0) ? BigInt(1) : BigInt(0);
      const w = Math.max(ctx, widthOf(e.e, widths));
      return ~ev(e.e, w, widths, values) & mask(w);
    }
    case "bin": {
      const { op, l, r } = e;
      if (op === "&&" || op === "||") {
        const a = ev(l, widthOf(l, widths), widths, values) !== BigInt(0);
        const b = ev(r, widthOf(r, widths), widths, values) !== BigInt(0);
        return (op === "&&" ? a && b : a || b) ? BigInt(1) : BigInt(0);
      }
      if (["==", "!=", "<", "<=", ">", ">="].includes(op)) {
        const w = Math.max(widthOf(l, widths), widthOf(r, widths));
        const a = ev(l, w, widths, values), b = ev(r, w, widths, values);
        const res = op === "==" ? a === b : op === "!=" ? a !== b : op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : a >= b;
        return res ? BigInt(1) : BigInt(0);
      }
      const w = Math.max(ctx, widthOf(e, widths));
      const a = ev(l, w, widths, values), b = ev(r, w, widths, values);
      const m = mask(w);
      switch (op) {
        case "+": return (a + b) & m;
        case "-": return (a - b) & m;
        case "&": return a & b;
        case "|": return a | b;
        case "^": return a ^ b;
      }
      throw new Error(`unknown operator ${op}`);
    }
  }
}

/** The expression's value at its own width. */
export function evaluate(e: Expr, widths: Widths, values: Values): bigint {
  return ev(e, widthOf(e, widths), widths, values);
}

/** The value assigned to a `width`-bit target: evaluated at max(width, own width), then truncated. */
export function evaluateIn(e: Expr, width: number, widths: Widths, values: Values): bigint {
  return ev(e, Math.max(width, widthOf(e, widths)), widths, values) & mask(width);
}

/** Why `src` isn't a usable expression over `widths` (null when it is). */
export function exprProblem(src: string, widths: Widths): string | null {
  try {
    widthOf(parseExpr(src), widths);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}
