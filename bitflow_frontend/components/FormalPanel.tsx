"use client";
/**
 * components/FormalPanel.tsx — "Prove": formal verification of the design's properties.
 *
 * Modal opened from the Sandbox toolbar. Sends the design (and tb.v when it holds
 * assert/assume/cover, i.e. it is a property harness) to POST /api/formal, which
 * runs Yosys + yosys-smtbmc + Z3, and shows the verdict, the failing assertion and
 * the solver's counterexample as a waveform.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import WaveformPanel from "@/components/WaveformPanel";
import { parseVcd } from "@/lib/vcd-parser";

type Mode = "bmc" | "prove" | "cover";

interface FormalResult {
  status:            "passed" | "failed" | "unproven" | "error";
  error?:            string;
  mode?:             Mode;
  depth?:            number;
  failed?:           { file: string; line: number; step: number | null } | null;
  inductionFailed?:  boolean;
  assumptionsUnsat?: boolean;
  covers?:           { file: string; line: number; reached: boolean; step: number | null }[];
  vcd_base64?:       string | null;
  log?:              string;
}

interface Props {
  isOpen:         boolean;
  onClose:        () => void;
  designCode:     string;
  testbenchCode?: string;
  language?:      "verilog" | "vhdl";
  /** Replace the editors with a design that has properties (the formal template). */
  onLoadExample?: () => void;
}

const MODES: [Mode, string, string][] = [
  ["bmc",   "Check",  "Can any assertion fail within N clock cycles of the start?"],
  ["prove", "Prove",  "Check, then prove the assertions hold forever (k-induction)."],
  ["cover", "Cover",  "Find an input sequence that reaches each cover statement."],
];

const HAS_PROPERTIES = /\b(assert|assume|cover)\s*(property\s*)?\(/;

export default function FormalPanel({ isOpen, onClose, designCode, testbenchCode = "", language = "verilog", onLoadExample }: Props) {
  const [mode,    setMode]    = useState<Mode>("prove");
  const [depth,   setDepth]   = useState(20);
  const [result,  setResult]  = useState<FormalResult | null>(null);
  const [loading, setLoading] = useState(false);

  // tb.v is used as the property harness only when it states properties itself.
  const harness = HAS_PROPERTIES.test(testbenchCode) ? testbenchCode : null;
  // Nothing to check until the design (or a tb.v harness) states assert/assume/cover:
  // say so up front instead of sending it to the solver and showing an error.
  const hasProperties = !!harness || (language === "verilog" && HAS_PROPERTIES.test(designCode));

  const run = useCallback(async (m: Mode = mode) => {
    if (!hasProperties) return;
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch("/api/formal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designCode, harnessCode: harness, mode: m, depth, language }),
      });
      const data = await res.json().catch(() => ({}));
      setResult(res.ok ? data : { status: "error", error: data.error ?? `Request failed (${res.status})` });
    } catch {
      setResult({ status: "error", error: "Network error." });
    } finally {
      setLoading(false);
    }
  }, [mode, designCode, harness, depth, language, hasProperties]);

  useEffect(() => {
    if (isOpen && hasProperties) run();
    if (!hasProperties) setResult(null);
    // Re-runs when the panel opens, and when properties appear (e.g. the example was loaded).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hasProperties]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const trace = useMemo(() => {
    if (!result?.vcd_base64) return null;
    try { return parseVcd(atob(result.vcd_base64)); } catch { return null; }
  }, [result]);

  if (!isOpen) return null;

  const where = result?.failed ? `${result.failed.file}:${result.failed.line}` : "";
  const verdict = (() => {
    if (!result || result.status === "error") return null;
    const n = result.depth;
    if (result.mode === "cover") {
      const reached = result.covers?.filter((c) => c.reached).length ?? 0;
      return { ok: result.status === "passed", title: `${reached} of ${result.covers?.length ?? 0} cover statements reached`,
               text: result.status === "passed" ? "Each cover can happen; the waveform shows one way to get there."
                                                : `Unreached covers can't happen within ${n} cycles: maybe an assumption or a bug forbids them.` };
    }
    if (result.status === "passed") {
      return result.mode === "prove"
        ? { ok: true, title: "Proved", text: "Every assertion holds in every reachable state, for all time (k-induction)." }
        : { ok: true, title: `No failure in ${n} cycles`, text: `No input sequence of up to ${n} cycles breaks an assertion. Use Prove for a proof that holds forever.` };
    }
    if (result.status === "unproven") {
      return { ok: null, title: "Not proved (no bug found)", text:
        `No failure from the start, but induction failed: the assertion at ${where} could break from a state the design never actually reaches. ` +
        "Add assertions that rule such states out, or raise the depth." };
    }
    return { ok: false, title: `Assertion failed at ${where}`, text:
      `The solver found the shortest input sequence (${result.failed?.step ?? "?"} steps) that breaks it. The waveform is that counterexample.` };
  })();

  return (
    <div className="fixed inset-0 z-50 bg-void/80 flex items-center justify-center p-2 sm:p-4" onClick={onClose}
         role="dialog" aria-modal="true" aria-label="Formal verification">
      <div className="w-full max-w-5xl h-[88vh] flex flex-col bg-pit border border-rim rounded" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-rim">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-bright uppercase tracking-widest">Formal verification</span>
            <span className="font-mono text-[9px] text-dim">Yosys + Z3 · properties from {harness ? "design + tb (harness)" : "the design"}</span>
          </div>
          <button className="font-mono text-[10px] text-bright hover:underline" onClick={onClose}>Close</button>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-rim/50 font-mono text-[10px]">
          <div className="flex gap-1" role="radiogroup" aria-label="Check type">
            {MODES.map(([id, label, hint]) => (
              <button key={id} role="radio" aria-checked={mode === id} title={hint} onClick={() => { setMode(id); run(id); }}
                className={`px-3 py-1 rounded border ${mode === id ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim text-dim hover:text-ghost"}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 text-dim">
            Depth
            <input type="number" min={1} max={40} value={depth} onChange={(e) => setDepth(Math.min(40, Math.max(1, Number(e.target.value) || 1)))}
                   className="w-14 bg-surface border border-rim rounded px-1 py-0.5 text-pale" aria-label="Depth in clock cycles" />
            cycles
          </label>
          <button className="text-info hover:underline disabled:opacity-40" disabled={loading || !hasProperties} onClick={() => run()}>
            {loading ? "Solving…" : "Run again"}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3 font-mono text-[11px] text-pale">
          {!hasProperties && (
            <div className="border border-info/40 bg-info/5 rounded p-3 space-y-2 max-w-2xl">
              <div className="font-bold text-info">Your design has no properties yet</div>
              <p className="text-[10px] text-ghost">
                Formal verification doesn&apos;t run a testbench: it proves statements you write about the design, such as
                {" "}<code>assert(count &lt;= 9)</code>, for every possible input sequence, or shows the exact sequence that breaks one.
                {language === "vhdl"
                  ? " For a VHDL design, write them in tb.v (Testbench: Verilog) as a harness module that instantiates your design."
                  : " Add assert / assume / cover statements to the design inside `ifdef FORMAL, or write a harness module in tb.v."}
              </p>
              {onLoadExample && (
                <button onClick={onLoadExample}
                  className="px-3 py-1 rounded border border-phosphor/50 text-phosphor bg-phosphor/10 hover:bg-phosphor/20 text-[10px]">
                  Load a working example (BCD counter with properties)
                </button>
              )}
              <HowTo open />
            </div>
          )}

          {loading && <p className="text-dim">Solving… (usually a second or two)</p>}

          {result?.status === "error" && (
            <div className="space-y-2">
              <p className="text-danger">The check could not run.</p>
              <pre className="text-[10px] whitespace-pre-wrap bg-void/60 border border-rim/50 rounded p-2">{result.error}</pre>
              <HowTo />
            </div>
          )}

          {verdict && (
            <div className={`border rounded p-3 space-y-1 ${verdict.ok === true ? "border-phosphor/40 bg-phosphor/5" : verdict.ok === false ? "border-danger/40 bg-danger/5" : "border-warn/40 bg-warn/5"}`}>
              <div className={`font-bold ${verdict.ok === true ? "text-phosphor" : verdict.ok === false ? "text-danger" : "text-warn"}`}>{verdict.title}</div>
              <p className="text-[10px] text-ghost">{verdict.text}</p>
              {result?.assumptionsUnsat && (
                <p className="text-[10px] text-warn">Your assumptions contradict each other, so nothing was really checked.</p>
              )}
            </div>
          )}

          {!!result?.covers?.length && result.mode === "cover" && (
            <ul className="text-[10px] space-y-0.5">
              {result.covers.map((c) => (
                <li key={`${c.file}:${c.line}`} className={c.reached ? "text-phosphor" : "text-warn"}>
                  {c.reached ? "✓" : "✗"} {c.file}:{c.line} {c.reached ? `reached in ${c.step} steps` : "unreachable"}
                </li>
              ))}
            </ul>
          )}

          {trace && (
            <div className="h-[260px] border border-rim/50 rounded overflow-hidden">
              <WaveformPanel parsedVcd={trace} />
            </div>
          )}

          {result?.log && (
            <details>
              <summary className="text-[10px] text-dim cursor-pointer">Solver log</summary>
              <pre className="text-[10px] text-ghost whitespace-pre-wrap mt-1">{result.log}</pre>
            </details>
          )}
          {result && result.status !== "error" && <HowTo />}
        </div>
      </div>
    </div>
  );
}

function HowTo({ open = false }: { open?: boolean }) {
  return (
    <details className="text-[10px] text-dim" open={open}>
      <summary className="cursor-pointer">How to write properties</summary>
      <div className="mt-1 space-y-1 max-w-2xl">
        <p>Put them in the design inside <code>`ifdef FORMAL … `endif</code> (simulation skips that block), or write a
          harness in tb.v: a top module with free inputs that instantiates your design and asserts on its outputs.</p>
        <pre className="bg-void/60 border border-rim/50 rounded p-2 text-ghost">{`\`ifdef FORMAL
  reg past_valid = 0;
  always @(posedge clk) past_valid <= 1;
  always @(*) if (!past_valid) assume(rst);      // start in reset
  always @(posedge clk) if (past_valid) begin
    assert(count <= 9);                          // must always hold
    if ($past(en) && !$past(rst)) assert(count != $past(count));
  end
  always @(posedge clk) cover(count == 9);       // should be reachable
\`endif`}</pre>
        <p><code>assume</code> limits the inputs the solver may choose; <code>$past(x)</code> is x one clock earlier.</p>
      </div>
    </details>
  );
}
