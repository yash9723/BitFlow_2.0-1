"use client";
/**
 * components/studio/BooleanTool.tsx — /studio/boolean: type a Boolean expression (textbook
 * or Verilog notation) and get its truth table, canonical forms, the minimal sum of products
 * and product of sums, an equivalence check against a second expression, and Verilog with an
 * exhaustive testbench. Parsing in lib/studio/boolexpr.ts, minimisation in lib/studio/logic-min.ts.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import GeneratedCode from "@/components/studio/GeneratedCode";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { counterexample, gateCount, parseBool, table, toVerilog } from "@/lib/studio/boolexpr";
import { MAX_INPUTS, type TruthTable, generateVerilog, literals, minimizePos, minimizeSop, nameProblem, posText, sopText } from "@/lib/studio/logic-min";

interface Draft { f: string; g: string; single: boolean }
const START: Draft = { f: "AB + A'C + BC", g: "", single: true };
const EXAMPLES: [string, string, boolean][] = [
  ["XOR", "A'B + AB'", true], ["Consensus", "AB + A'C + BC", true], ["Majority", "AB + BC + AC", true],
  ["De Morgan", "(A + B)'", true], ["Mux", "sel & a | ~sel & b", false], ["Full adder sum", "a ^ b ^ cin", false],
];
const LAWS: [string, string][] = [
  ["Identity", "A + 0 = A,  A·1 = A"], ["Null", "A + 1 = 1,  A·0 = 0"], ["Idempotent", "A + A = A,  A·A = A"],
  ["Complement", "A + A' = 1,  A·A' = 0"], ["Involution", "(A')' = A"], ["Commutative", "A + B = B + A,  AB = BA"],
  ["Distributive", "A(B + C) = AB + AC,  A + BC = (A + B)(A + C)"], ["Absorption", "A + AB = A,  A(A + B) = A"],
  ["Simplification", "A + A'B = A + B"], ["De Morgan", "(A + B)' = A'B',  (AB)' = A' + B'"],
  ["Consensus", "AB + A'C + BC = AB + A'C"], ["XOR", "A ⊕ B = A'B + AB'"],
];

const field = "w-full bg-pit border border-rim/60 rounded px-3 py-2 text-[14px] text-pale font-mono";
const box = "rounded-xl border border-rim/60 bg-surface/30 p-4 space-y-2";

export default function BooleanTool() {
  const router = useRouter();
  const [stored, setDraft] = useLocalStorage<Draft>("bitflow_studio_boolean", START);
  const d: Draft = { ...START, ...stored };
  const set = (patch: Partial<Draft>) => setDraft({ ...d, ...patch });

  const f = useMemo(() => parseBool(d.f, d.single), [d.f, d.single]);
  const g = useMemo(() => (d.g.trim() ? parseBool(d.g, d.single) : null), [d.g, d.single]);
  const parsed = typeof f === "string" ? null : f;
  const n = parsed?.vars.length ?? 0;
  const derived = useMemo(() => {
    if (!parsed || n > MAX_INPUTS) return null;
    const cells = table(parsed.expr, parsed.vars);
    const sop = minimizeSop(n, cells), pos = minimizePos(n, cells);
    const out = ["f", "y", "out", "result"].find((o) => !parsed.vars.includes(o))!;
    const truth: TruthTable = { inputs: parsed.vars, outputs: [{ name: out, cells }] };
    const badName = parsed.vars.map((v) => [v, nameProblem(v)] as const).find(([, p]) => p);
    return {
      cells, sop, pos, truth, badName,
      sopLits: sop.reduce((s, t) => s + literals(t, n), 0), posLits: pos.reduce((s, t) => s + literals(t, n), 0),
      code: !badName && n > 0 ? generateVerilog(truth, "sop", "bool_fn") : null,
    };
  }, [parsed, n]);
  const diff = parsed && g && typeof g !== "string" ? counterexample(parsed, g) : null;

  const toKmap = () => {
    if (!derived) return;
    try { localStorage.setItem("bitflow_studio_logic", JSON.stringify(derived.truth)); } catch { window.alert("Your browser blocked local storage."); return; }
    router.push("/studio/logic");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold">Boolean algebra</h1>
        <p className="text-[12px] text-ghost max-w-3xl">
          Type an expression in textbook notation (A&apos;B + AB&apos;, (A+B)&apos;) or Verilog (~a &amp; b | a &amp; ~b). Get its truth table, canonical
          forms and the simplest sum of products and product of sums, check it against another expression, and export Verilog.
        </p>
      </div>

      <div className="space-y-3 font-mono text-[12px]">
        <label className="block space-y-1"><span className="text-[10px] uppercase tracking-wider text-dim">Expression F</span>
          <input value={d.f} onChange={(e) => set({ f: e.target.value })} aria-label="Expression F" className={field} spellCheck={false} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {EXAMPLES.map(([label, expr, single]) => (
            <button key={label} onClick={() => set({ f: expr, single })} className="px-2 py-1 rounded border border-rim/60 text-ghost hover:text-bright text-[11px]">{label}</button>
          ))}
          <label className="flex items-center gap-1.5 text-ghost ml-2">
            <input type="checkbox" checked={d.single} onChange={(e) => set({ single: e.target.checked })} /> one-letter names (AB means A·B)
          </label>
        </div>
        <label className="block space-y-1"><span className="text-[10px] uppercase tracking-wider text-dim">Compare with G (optional)</span>
          <input value={d.g} onChange={(e) => set({ g: e.target.value })} aria-label="Expression G" placeholder="e.g. AB + A'C" className={field} spellCheck={false} />
        </label>
        <p className="text-[11px] text-dim">
          NOT: A&apos; ~A !A ¬A · AND: AB A·B A*B A&amp;B · XOR: A^B A⊕B · OR: A+B A|B · precedence: NOT, AND, XOR, OR.
        </p>
      </div>

      {!parsed ? <p className="font-mono text-[12px] text-danger">F: {f as string}</p> : (
        <div className="grid gap-4 lg:grid-cols-2 font-mono text-[12px]">
          <div className={box}>
            <div className="text-[10px] uppercase tracking-wider text-dim">F has {n} variable{n === 1 ? "" : "s"}: {parsed.vars.join(", ") || "none"}</div>
            <Line k="as Verilog" v={toVerilog(parsed.expr)} />
            <Line k="as written" v={costText(gateCount(parsed.expr))} />
            {derived && (
              <>
                <Line k="minterms" v={`Σm(${derived.cells.flatMap((c, i) => (c ? [i] : [])).join(", ")})`} />
                <Line k="maxterms" v={`ΠM(${derived.cells.flatMap((c, i) => (c ? [] : [i])).join(", ")})`} />
              </>
            )}
            {typeof g === "string" && <p className="text-danger">G: {g}</p>}
            {g && typeof g !== "string" && (diff
              ? <p className="text-warn">F ≠ G: at {Object.entries(diff.env).map(([k, v]) => `${k}=${v}`).join(" ")}, F = {diff.a} but G = {diff.b}.</p>
              : <p className="text-phosphor">✓ F and G are equivalent: they agree on all {2 ** new Set([...parsed.vars, ...g.vars]).size} input combinations.</p>)}
          </div>
          {derived ? (
            <div className={box}>
              <div className="text-[10px] uppercase tracking-wider text-dim">Simplest two-level forms</div>
              <Line k="sum of products" v={sopText(derived.sop, parsed.vars, "math")} />
              <Line k="" v={sopText(derived.sop, parsed.vars, "verilog")} dim />
              <Line k="" v={`${derived.sop.length} term${derived.sop.length === 1 ? "" : "s"}, ${derived.sopLits} literal${derived.sopLits === 1 ? "" : "s"}`} dim />
              <Line k="product of sums" v={posText(derived.pos, parsed.vars, "math")} />
              <Line k="" v={posText(derived.pos, parsed.vars, "verilog")} dim />
              <Line k="" v={`${derived.pos.length} term${derived.pos.length === 1 ? "" : "s"}, ${derived.posLits} literal${derived.posLits === 1 ? "" : "s"}`} dim />
              {n >= 2 && <button onClick={toKmap} className="text-info hover:underline">See the K-map groups →</button>}
            </div>
          ) : (
            <div className={box}><p className="text-dim">Simplifying handles up to {MAX_INPUTS} variables; F has {n}. The equivalence check works up to 16.</p></div>
          )}
        </div>
      )}

      {parsed && derived && n > 0 && (
        <div className="overflow-x-auto">
          <table className="font-mono text-[12px] border-collapse">
            <thead><tr>{[...parsed.vars, "F", ""].map((h, i) => <th key={i} className={`px-2 py-1 border-b border-rim/60 ${i === n ? "text-phosphor" : "text-dim"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {derived.cells.map((c, m) => (
                <tr key={m} className={c ? "bg-phosphor/5" : ""}>
                  {parsed.vars.map((v, i) => <td key={v} className="px-2 py-0.5 text-center text-ghost">{(m >> (n - 1 - i)) & 1}</td>)}
                  <td className={`px-2 py-0.5 text-center font-bold ${c ? "text-phosphor" : "text-dim"}`}>{c}</td>
                  <td className="px-2 text-[10px] text-dim">m{m}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {derived?.badName && <p className="font-mono text-[12px] text-warn">Verilog: &quot;{derived.badName[0]}&quot; {derived.badName[1]}; rename it to export.</p>}
      {derived?.code && (
        <section className="space-y-3 border-t border-rim/40 pt-5">
          <h2 className="font-display text-[15px] font-semibold">Verilog (minimal sum of products, exhaustive testbench)</h2>
          <GeneratedCode module="bool_fn" design={derived.code.design} testbench={derived.code.testbench} />
        </section>
      )}

      <details className="border-t border-rim/40 pt-4 font-mono text-[12px]">
        <summary className="cursor-pointer font-display text-[15px] font-semibold">Laws of Boolean algebra</summary>
        <table className="mt-3"><tbody>
          {LAWS.map(([k, v]) => <tr key={k}><td className="pr-4 py-0.5 text-dim">{k}</td><td className="text-pale">{v}</td></tr>)}
        </tbody></table>
        <p className="mt-2 text-[11px] text-dim">Type both sides of a law into F and G to watch the equivalence check confirm it.</p>
      </details>
    </div>
  );
}

function Line({ k, v, dim }: { k: string; v: string; dim?: boolean }) {
  return <div className="flex gap-3"><span className="w-32 shrink-0 text-dim">{k}</span><span className={`break-all ${dim ? "text-dim" : "text-pale"}`}>{v}</span></div>;
}

function costText(c: ReturnType<typeof gateCount>): string {
  const parts = ([["and", "AND"], ["or", "OR"], ["xor", "XOR"], ["not", "NOT"]] as const).filter(([k]) => c[k]).map(([k, label]) => `${c[k]} ${label}`);
  return parts.length ? `${parts.join(", ")} (2-input gates)` : "no gates";
}
