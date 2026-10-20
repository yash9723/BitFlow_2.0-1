"use client";
/**
 * components/BoardPanel.tsx — virtual FPGA board, opened from the Sandbox toolbar.
 *
 * Synthesizes the design to gates (lib/synth/client: in the browser, or the server) and runs
 * it in the browser with lib/gate-sim. Ports are wired up by name:
 *   clk / clock            → the board clock: Step, or Run at 1 Hz – 10 kHz
 *   rst / reset / rst_n …  → reset button (a trailing n means active low)
 *   btn* / key*            → push buttons; they latch on click, so they can be held across a Step
 *   other inputs           → switches (buses also get a number box)
 *   7- or 8-bit seg* / hex* outputs → a 7-segment digit, seg[0]=a … seg[6]=g, seg[7]=dp
 *   4-bit hex* / digit* outputs     → a 7-segment digit showing the value 0–F
 *   3-bit rgb* outputs     → an RGB LED, bit 2 = red, bit 1 = green, bit 0 = blue
 *   other outputs          → LEDs
 *   1-bit rx input / tx output → a serial terminal (UART 8N1, lib/uart.ts)
 * A logic analyzer shows the 1-bit signals over the last 128 cycles.
 * Keys: Space = Step, P = Run/Pause, Esc = close.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GateSim, toNumber, type BoardNetlist } from "@/lib/gate-sim";
import { synthesizeDesign, synthToolsLoaded } from "@/lib/synth/client";
import { UartReceiver, UartTransmitter } from "@/lib/uart";

const CLOCK  = /^(clk|clock)$/i;
const RESET  = /^(rst|reset|rst_n|reset_n|rstn|resetn|areset|arst|arst_n|aresetn)$/i;
const BUTTON = /^(btn|key|button)/i;
const SEVEN  = /^(seg|hex|sseg|seven)/i;
const HEX    = /^(hex|digit)/i;
const RGB    = /^rgb/i;
const RATES  = [1, 2, 5, 10, 50, 100, 1000, 10000];
/** Cap on clock cycles simulated per animation frame; past it the board runs slower than asked. */
const MAX_PER_FRAME = 2000;

/** Logic analyzer depth (cycles) and how many 1-bit signals it shows. */
const TRACE_DEPTH = 128;
const TRACE_ROWS  = 8;

const activeLow = (name: string) => RESET.test(name) && /n$/i.test(name);
const isRx      = (name: string) => /^rx$/i.test(name);
const idle      = (name: string) => (activeLow(name) || isRx(name) ? 1 : 0);   // a serial line rests high
type Port = { name: string; width: number };
const isSeg   = (p: Port) => SEVEN.test(p.name) && (p.width === 7 || p.width === 8);
const isHex   = (p: Port) => HEX.test(p.name) && p.width === 4;
const isRgb   = (p: Port) => RGB.test(p.name) && p.width === 3;
const hz      = (r: number) => (r >= 1000 ? `${r / 1000} kHz` : `${r} Hz`);
const toBits  = (n: number, width: number) => Array.from({ length: width }, (_, i) => Math.floor(n / 2 ** i) % 2);

/** The last netlist synthesized, so reopening the board on unchanged code skips the server. */
let cached: { key: string; net: BoardNetlist } | null = null;

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
/** Segments (bit 0 = a … bit 6 = g) lit for the hex digits 0–F. */
const HEX_SEGS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];

function SevenSeg({ bits, label }: { bits: number[]; label: string }) {
  return (
    <svg viewBox="0 0 40 70" className="w-12 h-20" role="img" aria-label={label}>
      {SEGMENTS.map((d, i) => <path key={i} d={d} className={bits[i] ? "fill-phosphor" : "fill-rim/60"} />)}
      {bits.length > 7 && <circle cx="35" cy="64" r="2.5" className={bits[7] ? "fill-phosphor" : "fill-rim/60"} />}
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

function RgbLed({ bits }: { bits: number[] }) {
  const [b, g, r] = bits;
  const color = `rgb(${r ? 255 : 0},${g ? 255 : 0},${b ? 255 : 0})`;
  const lit = r || g || b;
  return <span className="inline-block w-6 h-6 rounded-full border border-rim"
               style={{ background: lit ? color : undefined, boxShadow: lit ? `0 0 10px ${color}` : undefined }}
               title={`R${r} G${g} B${b}`} />;
}

function Label({ name, width, value }: { name: string; width: number; value: number }) {
  return (
    <div className="font-mono text-[10px] text-ghost mb-1">
      {name}
      {width > 1 && <span className="text-dim">[{width - 1}:0] = {value} (0x{value.toString(16)})</span>}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-rim/60 bg-surface/30 p-3 space-y-3 min-w-0">
      <h3 className="font-mono text-[9px] text-dim uppercase tracking-widest">{title}</h3>
      {children}
    </section>
  );
}

/** One row per 1-bit signal, oldest cycle on the left. */
function LogicAnalyzer({ names, trace }: { names: string[]; trace: { rows: Record<string, Uint8Array>; head: number; filled: number } }) {
  const STEP = 4, H = 12;
  const order = Array.from({ length: trace.filled }, (_, i) => (trace.head - trace.filled + i + TRACE_DEPTH) % TRACE_DEPTH);
  return (
    <div className="overflow-x-auto">
      {names.map((name) => {
        const row = trace.rows[name];
        if (!row) return null;
        const points = order.flatMap((k, i) => { const y = row[k] ? 1 : H - 1; return [`${i * STEP},${y}`, `${(i + 1) * STEP},${y}`]; }).join(" ");
        return (
          <div key={name} className="flex items-center gap-2">
            <span className="w-16 shrink-0 font-mono text-[10px] text-ghost truncate" title={name}>{name}</span>
            <svg width={TRACE_DEPTH * STEP} height={H} aria-label={`${name} over the last ${trace.filled} cycles`}>
              <polyline points={points} fill="none" className="stroke-phosphor" strokeWidth={1.5} />
            </svg>
          </div>
        );
      })}
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
  const [term,    setTerm]    = useState("");          // text the design sent on tx
  const [typed,   setTyped]   = useState("");
  const [bitCycles, setBitCycles] = useState(16);      // UART cycles per bit
  const serial = useRef({ toDesign: new UartTransmitter(16), fromDesign: new UartReceiver(16), rxLevel: 1 });
  const trace  = useRef<{ rows: Record<string, Uint8Array>; head: number; filled: number }>({ rows: {}, head: 0, filled: 0 });

  const ports = useMemo(() => {
    const all   = Object.entries(sim?.ports ?? {}).map(([name, p]) => ({ name, width: p.bits.length, dir: p.direction }));
    const ins   = all.filter((p) => p.dir === "input");
    const outs  = all.filter((p) => p.dir !== "input");
    const clock  = ins.find((p) => CLOCK.test(p.name) && p.width === 1)?.name ?? null;
    const uartRx = ins.find((p) => isRx(p.name) && p.width === 1)?.name ?? null;
    const uartTx = outs.find((p) => /^tx$/i.test(p.name) && p.width === 1)?.name ?? null;
    const rest   = ins.filter((p) => p.name !== clock && p.name !== uartRx);
    const lights = outs.filter((p) => p.name !== uartTx);
    return {
      clock, uartRx, uartTx,
      buttons:  rest.filter((p) => RESET.test(p.name) || BUTTON.test(p.name)),
      switches: rest.filter((p) => !RESET.test(p.name) && !BUTTON.test(p.name)),
      digits:   lights.filter((p) => isSeg(p) || isHex(p)),
      rgbs:     lights.filter(isRgb),
      leds:     lights.filter((p) => !isSeg(p) && !isHex(p) && !isRgb(p)),
      traced:   all.filter((p) => p.width === 1 && p.name !== clock).map((p) => p.name).slice(0, TRACE_ROWS),
    };
  }, [sim]);

  /** Run a simulator action; a runaway clock stops the board with a message. */
  const act = useCallback((f: () => void) => {
    try { f(); } catch (e) { setRunning(false); setError((e as Error).message); }
    redraw((n) => n + 1);
  }, []);

  /** Build the board from the netlist: registers at 0, inputs released. */
  const power = useCallback((net: BoardNetlist) => {
    const s = new GateSim(net);
    const start: Record<string, number[]> = {};
    for (const [name, p] of Object.entries(s.ports)) {
      if (p.direction !== "input") continue;
      start[name] = p.bits.map(() => idle(name));
      s.set(name, start[name]);
    }
    setInputs(start);
    setCycles(0);
    setTerm("");
    serial.current = { toDesign: new UartTransmitter(bitCycles), fromDesign: new UartReceiver(bitCycles), rxLevel: 1 };
    trace.current = { rows: {}, head: 0, filled: 0 };
    setSim(s);
  }, [bitCycles]);

  const load = useCallback(async () => {
    setLoading(true); setRunning(false); setError(null); setSim(null);
    const key = `${language}\n${designCode}`;
    try {
      if (cached?.key !== key) {
        const data = await synthesizeDesign("board", designCode, language);
        if (!data.ok) throw new Error(data.error ?? "Synthesis failed.");
        cached = { key, net: data as BoardNetlist };
      }
      power(cached.net);
    } catch (e) {
      setError((e as Error).message || "Network error.");
    } finally {
      setLoading(false);
    }
  }, [designCode, language, power]);

  const drive = useCallback((name: string, bits: number[]) => {
    if (!sim) return;
    setInputs((cur) => ({ ...cur, [name]: bits }));
    act(() => sim.set(name, bits));
  }, [sim, act]);

  /** n full clock cycles: the serial line and the analyzer see every one of them. */
  const pulse = useCallback((n: number) => {
    if (!sim || !ports.clock) return;
    const { clock: clk, uartRx, uartTx, traced } = ports;
    const io = serial.current, t = trace.current;
    for (const name of traced) t.rows[name] ??= new Uint8Array(TRACE_DEPTH);
    let received = "";
    act(() => {
      for (let i = 0; i < n; i++) {
        if (uartRx) {
          const level = io.toDesign.next();
          if (level !== io.rxLevel) { io.rxLevel = level; sim.set(uartRx, [level]); }
        }
        sim.set(clk, [1]); sim.set(clk, [0]);
        if (uartTx) {
          const r = io.fromDesign.sample(sim.get(uartTx)[0]);
          if (r !== null) received += r === "error" ? "�" : String.fromCharCode(r);
        }
        for (const name of traced) t.rows[name][t.head] = sim.get(name)[0];
        t.head = (t.head + 1) % TRACE_DEPTH;
        t.filled = Math.min(t.filled + 1, TRACE_DEPTH);
      }
    });
    if (received) setTerm((s) => (s + received.replace(/\r/g, "")).slice(-4000));
    setCycles((c) => c + n);
  }, [sim, ports, act]);

  // The cycles-per-bit setting applies to the next frame either way.
  useEffect(() => { serial.current.toDesign.cyclesPerBit = bitCycles; serial.current.fromDesign.cyclesPerBit = bitCycles; }, [bitCycles]);

  useEffect(() => {
    if (isOpen) load();
    else setRunning(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Run: cycles owed since the last frame, simulated in one batch and drawn once.
  useEffect(() => {
    if (!running) return;
    let frame = 0, last = performance.now(), owed = 0;
    const tick = (now: number) => {
      owed += ((now - last) * rate) / 1000;
      last = now;
      const n = Math.floor(owed);
      owed -= n;                                    // a backlog past the cap is dropped, not queued
      if (n) pulse(Math.min(n, MAX_PER_FRAME));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, rate, pulse]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if ((e.target as HTMLElement).closest?.("input, select, textarea")) return;
      if (e.key === " " && !running) { e.preventDefault(); pulse(1); }
      if (e.key === "p" || e.key === "P") setRunning((r) => !r);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, running, pulse]);

  if (!isOpen) return null;

  const isDown = (name: string) => inputs[name]?.[0] !== idle(name);
  const press  = (name: string, width: number, down: boolean) => drive(name, Array(width).fill(down ? 1 - idle(name) : idle(name)));
  const btn    = "px-3 py-1.5 rounded border font-mono text-[11px] select-none";
  const noInputs = !ports.clock && ports.buttons.length === 0 && ports.switches.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-void/80 flex items-center justify-center p-2 sm:p-4" onClick={onClose}
         role="dialog" aria-modal="true" aria-label="Virtual board">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-pit border border-rim rounded" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-rim">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-bright uppercase tracking-widest">Board</span>
            <span className="font-mono text-[9px] text-dim">
              {sim ? `${sim.gateCount} gates · runs in your browser` : "gate-level simulation"}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <button className="text-info hover:underline disabled:opacity-40" disabled={loading} onClick={load}
                    title="Clear every register and release every input">
              {loading ? "Synthesizing…" : "Power cycle"}
            </button>
            <button className="text-ghost hover:text-bright" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {error && <pre className="whitespace-pre-wrap font-mono text-[11px] text-danger">{error}</pre>}
          {loading && !sim && <p className="font-mono text-[11px] text-dim">{synthToolsLoaded() || language === "vhdl" ? "Synthesizing to gates…" : "Loading the synthesis tools (about 6 MB, first time only)…"}</p>}

          {sim && (
            <>
              {/* Clock */}
              <section className="flex flex-wrap items-center gap-2">
                {ports.clock ? (
                  <>
                    <span className="font-mono text-[10px] text-ghost">{ports.clock}</span>
                    <button className={`${btn} border-rim text-pale hover:text-bright disabled:opacity-40`} onClick={() => pulse(1)} disabled={running}
                            title="One clock cycle (Space)">Step</button>
                    <button className={`${btn} ${running ? "border-warn/50 text-warn" : "border-phosphor/40 text-phosphor"}`}
                            onClick={() => setRunning((r) => !r)} title="P">{running ? "Pause" : "Run"}</button>
                    <select className="bg-pit border border-rim rounded font-mono text-[11px] text-pale px-1 py-1"
                            value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="Clock rate">
                      {RATES.map((r) => <option key={r} value={r}>{hz(r)}</option>)}
                    </select>
                    <span className="font-mono text-[10px] text-dim tabular-nums">cycle {cycles}</span>
                  </>
                ) : (
                  <span className="font-mono text-[10px] text-dim">No clock input (name it clk), so outputs simply follow the inputs.</span>
                )}
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Group title="Inputs">
                  {noInputs && <p className="font-mono text-[10px] text-dim">This design has no inputs.</p>}
                  {/* Reset and push buttons latch, so a synchronous reset can be held across a Step */}
                  {ports.buttons.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {ports.buttons.map((p) => (
                        <button key={p.name} aria-pressed={isDown(p.name)}
                                onClick={() => press(p.name, p.width, !isDown(p.name))}
                                className={`${btn} ${isDown(p.name) ? "border-phosphor bg-phosphor/20 text-phosphor" : "border-rim text-pale"}`}
                                title={activeLow(p.name) ? "Active low: drives 0 while held" : "Drives 1 while held"}>
                          {p.name}{isDown(p.name) ? " (held)" : ""}
                        </button>
                      ))}
                      <span className="font-mono text-[9px] text-dim">click to hold, again to release</span>
                    </div>
                  )}

                  {/* Switches, MSB on the left; buses also take a number */}
                  {ports.switches.map((p) => {
                    const bits = inputs[p.name] ?? [];
                    const max  = 2 ** Math.min(p.width, 32) - 1;
                    return (
                      <div key={p.name}>
                        <div className="flex items-center justify-between gap-2">
                          <Label name={p.name} width={p.width} value={toNumber(bits)} />
                          {p.width > 1 && (
                            <input type="number" min={0} max={max} value={toNumber(bits)} aria-label={`${p.name} value`}
                                   onChange={(e) => drive(p.name, toBits(Math.max(0, Math.min(max, Number(e.target.value) || 0)), p.width))}
                                   className="w-24 mb-1 bg-pit border border-rim rounded px-1 py-0.5 font-mono text-[10px] text-pale" />
                          )}
                        </div>
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
                      </div>
                    );
                  })}
                </Group>

                <Group title="Outputs">
                  {ports.digits.length > 0 && (
                    <div>
                      <div className="flex flex-wrap items-end gap-4">
                        {ports.digits.map((p) => {
                          const raw  = sim.get(p.name);
                          const bits = isHex(p) ? toBits(HEX_SEGS[toNumber(raw)], 7) : raw.map((b) => (segLow ? b ^ 1 : b));
                          return (
                            <div key={p.name} className="flex flex-col items-center">
                              <SevenSeg bits={bits} label={isHex(p) ? `${p.name} = ${toNumber(raw).toString(16).toUpperCase()}` : `${p.name}, segments a–g = ${bits.slice(0, 7).join("")}`} />
                              <span className="font-mono text-[10px] text-ghost">{p.name}</span>
                            </div>
                          );
                        })}
                      </div>
                      {ports.digits.some(isSeg) && (
                        <label className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-dim">
                          <input type="checkbox" checked={segLow} onChange={(e) => setSegLow(e.target.checked)} />
                          segments are active low (0 = lit)
                        </label>
                      )}
                    </div>
                  )}
                  {ports.rgbs.length > 0 && (
                    <div className="flex flex-wrap gap-4">
                      {ports.rgbs.map((p) => (
                        <div key={p.name} className="flex flex-col items-center gap-1">
                          <RgbLed bits={sim.get(p.name)} />
                          <span className="font-mono text-[10px] text-ghost">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {ports.leds.map((p) => {
                    const bits = sim.get(p.name);
                    return (
                      <div key={p.name}>
                        <Label name={p.name} width={p.width} value={toNumber(bits)} />
                        <Leds bits={bits} />
                      </div>
                    );
                  })}
                </Group>
              </div>

              {(ports.uartRx || ports.uartTx) && (
                <Group title="Serial terminal (UART 8N1)">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-dim">
                    <label className="flex items-center gap-1">
                      cycles per bit
                      <input type="number" min={2} max={10000} value={bitCycles} aria-label="UART cycles per bit"
                             onChange={(e) => setBitCycles(Math.max(2, Number(e.target.value) || 16))}
                             className="w-16 bg-pit border border-rim rounded px-1 py-0.5 text-pale" />
                    </label>
                    <span>match the design&apos;s CLKS_PER_BIT; run the clock fast (1–10 kHz) to send and receive</span>
                    <button onClick={() => setTerm("")} className="ml-auto text-info hover:underline">Clear</button>
                  </div>
                  {ports.uartTx && (
                    <pre aria-label="Received on tx" aria-live="polite"
                         className="h-28 overflow-auto bg-void border border-rim rounded p-2 font-mono text-[11px] text-phosphor whitespace-pre-wrap">
                      {term || <span className="text-dim">Bytes the design sends on {ports.uartTx} appear here.</span>}
                    </pre>
                  )}
                  {ports.uartRx && (
                    <form className="flex gap-2" onSubmit={(e) => {
                      e.preventDefault();
                      serial.current.toDesign.send(new TextEncoder().encode(typed + "\n"));
                      setTyped("");
                    }}>
                      <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type, then Enter to send on ${ports.uartRx}`}
                             aria-label="Send on rx" className="flex-1 bg-pit border border-rim rounded px-2 py-1 font-mono text-[11px] text-pale" />
                      <button className="px-3 py-1 rounded border border-info/50 text-info font-mono text-[10px]">Send</button>
                    </form>
                  )}
                </Group>
              )}

              {ports.traced.length > 0 && trace.current.filled > 0 && (
                <Group title={`Logic analyzer (last ${trace.current.filled} cycles)`}>
                  <LogicAnalyzer names={ports.traced} trace={trace.current} />
                </Group>
              )}

              <details className="font-mono text-[9px] text-dim">
                <summary className="cursor-pointer hover:text-ghost">How ports map to the board</summary>
                <p className="mt-1 leading-relaxed">
                  clk = clock (Space steps, P runs). rst/reset and btn*/key* = buttons; other inputs = switches.
                  7/8-bit seg*/hex* outputs = raw 7-segment digit (seg[0]=a … seg[6]=g, seg[7]=dp); 4-bit hex*/digit* = digit showing 0–F;
                  3-bit rgb* = RGB LED (bit 2 red, 1 green, 0 blue); 1-bit rx/tx = serial terminal; other outputs = LEDs. Registers start at 0.
                </p>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
