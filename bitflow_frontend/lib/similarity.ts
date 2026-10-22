/**
 * lib/similarity.ts — how alike two Verilog designs are, for the classroom
 * analytics' copy check (app/api/classes/[id]/analytics). Comments, layout
 * and consistent renaming don't count: identifiers become v0, v1, ... in order
 * of first use, then designs are compared as sets of 5-token runs (Jaccard).
 * Runs that are already in the starter code are left out, so everyone's
 * shared skeleton doesn't look like copying. A score is a hint for a teacher
 * to look, not proof. Self-check: scripts/similarity.check.ts.
 */

const KEYWORDS = new Set(`module endmodule input output inout wire reg logic integer parameter localparam assign always
  always_ff always_comb initial begin end if else case casez casex endcase default for while posedge negedge or and not
  generate endgenerate genvar function endfunction task endtask signed unsigned`.split(/\s+/));

const SHINGLE = 5;
/** Below this many tokens a design is too short to compare meaningfully. */
export const MIN_TOKENS = 30;

/** Normalised tokens: no comments or whitespace; identifiers numbered by first use. */
export function tokens(src: string): string[] {
  const code = src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, " ");
  const names = new Map<string, string>();
  return (code.match(/[A-Za-z_$][\w$]*|\d+'[sS]?[bodhBODH][0-9a-fA-F_xzXZ]+|\d+|<=|>=|==|!=|&&|\|\||<<|>>|\S/g) ?? []).map((t) => {
    if (!/^[A-Za-z_]/.test(t) || KEYWORDS.has(t)) return t;
    if (!names.has(t)) names.set(t, `v${names.size}`);
    return names.get(t)!;
  });
}

function shingles(t: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + SHINGLE <= t.length; i++) out.add(t.slice(i, i + SHINGLE).join(" "));
  return out;
}

/** 0..1, or null when either design is too short (after removing the starter) to judge. */
export function similarity(a: string, b: string, starter = ""): number | null {
  const ta = tokens(a), tb = tokens(b);
  if (ta.length < MIN_TOKENS || tb.length < MIN_TOKENS) return null;
  const common = shingles(tokens(starter));
  const sa = new Set([...shingles(ta)].filter((s) => !common.has(s)));
  const sb = new Set([...shingles(tb)].filter((s) => !common.has(s)));
  if (sa.size < MIN_TOKENS / 2 || sb.size < MIN_TOKENS / 2) return null;
  let both = 0;
  for (const s of sa) if (sb.has(s)) both++;
  return both / (sa.size + sb.size - both);
}
