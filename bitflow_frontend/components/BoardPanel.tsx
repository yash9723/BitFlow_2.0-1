"use client";
/**
 * components/BoardPanel.tsx — virtual FPGA board, opened from the Sandbox toolbar.
 *
 * Synthesizes the design to gates (POST /api/synthesize {board: true}) and runs
 * it in the browser with lib/gate-sim. Ports are wired up by name:
 *   clk / clock            → the board clock: Step, or Run at 1–50 Hz
 *   rst / reset / rst_n …  → reset button (a trailing n means active low)
 *   btn* / key*            → push buttons (active while held)
 *   Buttons latch on click, so they can be held down across a Step.
 *   other inputs           → switches
 *   7- or 8-bit seg* / hex* outputs → a 7-segment digit, seg[0]=a … seg[6]=g, seg[7]=dp
 *   other outputs          → LEDs
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GateSim, toNumber, type BoardNetlist } from "@/lib/gate-sim";

const CLOCK  = /^(clk|clock)$/i;
const RESET  = /^(rst|reset|rst_n|reset_n|rstn|resetn|areset|arst|arst_n|aresetn)$/i;
const BUTTON = /^(btn|key|button)/i;
const SEVEN  = /^(seg|hex|sseg|seven)/i;
const RATES  = [1, 2, 5, 10, 50];

const activeLow = (name: string) => RESET.test(name) && /n$/i.test(name);
const idle      = (name: string) => (activeLow(name) ? 1 : 0);
const isDigit   = (p: { name: string; width: number }) => SEVEN.test(p.name) && (p.width === 7 || p.width === 8);

interface Props {
  isOpen:     boolean;
  onClose:    () => void;
  designCode: string;
  language?:  "verilog" | "vhdl";
}

// ── Display pieces ──────────────────────────────────────────────────────────

/** Segment shapes in a 40×70 box, in seg[0..6] order: a b c d e f g. */
const SEGMENTS = [
  "M8 4h20l-3 5H11z", "M30 6l-1 25-4 3 1-24z", "M29 37l-1 25-5-4 1-21z", "M7 66h20l-3-5H10z",
  "M6 36l-1 22 4 4 1-23z", "M7 6l4 4-1 21-4 3z", "M9 34l3-3h14l3 3-3 3H12z",
];

function SevenSeg({ bits }: { bits: number[] }) {
  return (
    <svg viewBox="0 0 40 70" className="w-12 h-20" role="img" aria-label={`7-segment display, segments a–g = ${bits.slice(0, 7).join("")}`}>
      {SEGMENTS.map((d, i) => <path key={i} d={d} className={bits[i] ? "fill-phosphor" : "fill-rim"} />)}
      {bits.length > 7 && <circle cx="35" cy="64" r="2.5" className={bits[7] ? "fill-phosphor" : "fill-rim"} />}
    </svg>
  );
}

function Leds({ bits }: { bits: number[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {[...bits].reverse().map((b, i) => (
        <span key={i} title={`bit ${bits.length - 1 - i}`}
              className={`w-3 h-3 rounded-full border border-rim ${b ? "bg-phosphor shadow-[0_0_6px_#00e87a]" : "bg-pit"}`} />
      ))}
    </div>
  );
}

function Label({ name, width, value }: { name: string; width: number; value: number }) {
  return (
    <div className="font-mono text-[10px] text-ghost mb-1">
      {name}
      {width > 1 && <span className="text-dim">[{width - 1}:0] = {value} (0x{value.toString(16)})</span>}
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────────────

export default function BoardPanel({ isOpen, onClose, designCode, language = "verilog" }: Props) {
  const [sim,     setSim]     = useState<GateSim | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputs,  setInputs]  = useState<Record<string, number[]>>({});
  const [cycles,  setCycles]  = useState(0);
  const [rate,    setRate]    = useState(5);
  const [running, setRunning] = useState(false);
  const [segLow,  setSegLow]  = useState(false);
  const [, redraw]            = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const ports = useMemo(() => {
    const all   = Object.entries(sim?.ports ?? {}).map(([name, p]) => ({ name, width: p.bits.length, dir: p.direction }));
    const ins   = all.filter((p) => p.dir === "input");
    const outs  = all.filter((p) => p.dir !== "input");
    const clock = ins.find((p) => CLOCK.test(p.name) && p.width === 1)?.name ?? null;
    const rest  = ins.filter((p) => p.name !== clock);
    return {
      clock,
      buttons:  rest.filter((p) => RESET.test(p.name) || BUTTON.test(p.name)),
      switches: rest.filter((p) => !RESET.test(p.name) && !BUTTON.test(p.name)),
      digits:   outs.filter(isDigit),
      leds:     outs.filter((p) => !isDigit(p)),
    };
  }, [sim]);

  /** Run a simulator action; a runaway clock stops the board with a message. */
  const act = useCallback((f: () => void) => {
    try { f(); } catch (e) { setRunning(false); setError((e as Error).message); }
    redraw((n) => n + 1);
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setRunning(false); setError(null); setSim(null); setCycles(0);
    try {
      const res  = await fetch("/api/synthesize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designCode, language, board: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      const s = new GateSim(data as BoardNetlist);
      // Inputs start released: 0, or 1 for an active-low reset.
      const start: Record<string, number[]> = {};
      for (const [name, p] of Object.entries(s.ports)) {
        if (p.direction !== "input") continue;
        start[name] = p.bits.map(() => idle(name));
        s.set(name, start[name]);
      }
      setInputs(start);
      setSim(s);
    } catch (e) {
      setError((e as Error).message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, [designCode, language]);

  const drive = useCallback((name: string, bits: number[]) => {
    if (!sim) return;
    setInputs((cur) => ({ ...cur, [name]: bits }));
    act(() => sim.set(name, bits));
  }, [sim, act]);

  const step = useCallback(() => {
    if (!sim || !ports.clock) return;
    act(() => { sim.set(ports.clock!, [1]); sim.set(ports.clock!, [0]); });
    setCycles((c) => c + 1);
  }, [sim, ports.clock, act]);

  useEffect(() => {
    if (isOpen) load();
    else setRunning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(step, 1000 / rate);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running, rate, step]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDown = (name: string) => inputs[name]?.[0] !== idle(name);
  const press  = (name: string, width: number, down: boolean) => drive(name, Array(width).fill(down ? 1 - idle(name) : idle(name)));
  const btn    = "px-3 py-1.5 rounded border font-mono text-[11px] select-none";

  return (
    <div className="fixed inset-0 z-50 bg-void/80 flex items-center justify-center p-2 sm:p-4" onClick={onClose}
         role="dialog" aria-modal="true" aria-label="Virtual board">
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-pit border border-rim rounded" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-rim">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-bright uppercase tracking-widest">Board</span>
            <span className="font-mono text-[9px] text-dim">
              {sim ? `${sim.gateCount} gates · runs in your browser` : "gate-level simulation"}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <button className="text-info hover:underline disabled:opacity-40" disabled={loading} onClick={load}>
              {loading ? "Synthesizing…" : "Reload design"}
            </button>
            <button className="text-ghost hover:text-bright" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-4">
          {error && <pre className="whitespace-pre-wrap font-mono text-[11px] text-danger">{error}</pre>}
          {loading && !sim && <p className="font-mono text-[11px] text-dim">Synthesizing to gates…</p>}

          {sim && (
            <>
              {/* Clock */}
              <section className="flex flex-wrap items-center gap-2">
                {ports.clock ? (
                  <>
                    <span className="font-mono text-[10px] text-ghost">{ports.clock}</span>
                    <button className={`${btn} border-rim text-pale hover:text-bright disabled:opacity-40`} onClick={step} disabled={running}>Step</button>
                    <button className={`${btn} ${running ? "border-warn/50 text-warn" : "border-phosphor/40 text-phosphor"}`}
                            onClick={() => setRunning((r) => !r)}>{running ? "Pause" : "Run"}</button>
                    <select className="bg-pit border border-rim rounded font-mono text-[11px] text-pale px-1 py-1"
                            value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Clock rate">
                      {RATES.map((r) => <option key={r} value={r}>{r} Hz</option>)}
                    </select>
                    <span className="font-mono text-[10px] text-dim">cycle {cycles}</span>
                  </>
                ) : (
                  <span className="font-mono text-[10px] text-dim">No clock input (name it clk), so outputs simply follow the inputs.</span>
                )}
              </section>

              {/* Reset and push buttons latch (click to hold, click to release), so a
                  synchronous reset can be held down across a Step */}
              {ports.buttons.length > 0 && (
                <section className="flex flex-wrap items-center gap-2">
                  {ports.buttons.map((p) => (
                    <button key={p.name} aria-pressed={isDown(p.name)}
                            onClick={() => press(p.name, p.width, !isDown(p.name))}
                            className={`${btn} ${isDown(p.name) ? "border-phosphor bg-phosphor/20 text-phosphor" : "border-rim text-pale"}`}
                            title={activeLow(p.name) ? "Active low: drives 0 while held" : "Drives 1 while held"}>
                      {p.name}{isDown(p.name) ? " (held)" : ""}
                    </button>
                  ))}
                  <span className="font-mono text-[9px] text-dim">click to hold, click again to release</span>
                </section>
              )}

              {/* Switches, MSB on the left */}
              {ports.switches.map((p) => {
                const bits = inputs[p.name] ?? [];
                return (
                  <section key={p.name}>
                    <Label name={p.name} width={p.width} value={toNumber(bits)} />
                    <div className="flex flex-wrap gap-1">
                      {bits.map((_, j) => {
                        const i  = p.width - 1 - j;
                        const on = bits[i] === 1;
                        return (
                          <button key={i} title={`${p.name}[${i}]`} aria-label={`${p.name}[${i}]`} aria-pressed={on}
                                  onClick={() => drive(p.name, bits.map((b, k) => (k === i ? b ^ 1 : b)))}
                                  className={`w-6 h-9 rounded border font-mono text-[9px] flex flex-col items-center justify-between py-0.5 ${on ? "border-phosphor/60 text-phosphor" : "border-rim text-dim"}`}>
                            <span className={`w-3 h-3 rounded-sm ${on ? "bg-phosphor" : "bg-rim mt-auto"}`} />
                            <span>{on ? 1 : 0}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {/* Outputs */}
              {ports.digits.length > 0 && (
                <section>
                  <div className="flex flex-wrap items-end gap-4">
                    {ports.digits.map((p) => (
                      <div key={p.name} className="flex flex-col items-center">
                        <SevenSeg bits={sim.get(p.name).map((b) => (segLow ? b ^ 1 : b))} />
                        <span className="font-mono text-[10px] text-ghost">{p.name}</span>
                      </div>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-dim">
                    <input type="checkbox" checked={segLow} onChange={(e) => setSegLow(e.target.checked)} />
                    segments are active low (0 = lit)
                  </label>
                </section>
              )}
              {ports.leds.map((p) => {
                const bits = sim.get(p.name);
                return (
                  <section key={p.name}>
                    <Label name={p.name} width={p.width} value={toNumber(bits)} />
                    <Leds bits={bits} />
                  </section>
                );
              })}

              <p className="font-mono text-[9px] text-dim">
                Wired by port name: clk = clock, rst/reset and btn* = buttons, other inputs = switches;
                7/8-bit seg*/hex* outputs = 7-segment digit (seg[0]=a … seg[6]=g), other outputs = LEDs. Registers start at 0.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
