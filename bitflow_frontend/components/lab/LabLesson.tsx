"use client";
/**
 * components/lab/LabLesson.tsx — one Board Lab lesson: the editor, the design running live on
 * the 3D board (synthesized in the browser, lib/gate-sim at the lesson's clock rate), grading
 * against the lesson's goals (lib/lab/run.ts grade), and building it for a real board for /flash.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { GateSim, toNumber, type BoardNetlist } from "@/lib/gate-sim";
import { synthesizeDesign, synthToolsLoaded, bitstreamToolsLoaded, buildBitstreamInBrowser } from "@/lib/synth/client";
import { UartReceiver, UartTransmitter } from "@/lib/uart";
import { isHex, isSeg, segmentsOf } from "@/lib/board-io";
import { BOARDS, buildsInBrowser, type BoardId } from "@/lib/synth/boards";
import { FLASH } from "@/lib/flash";
import { putBitstream } from "@/lib/bitstream-handoff";
import { LESSONS, lessonBySlug, lessonIndex } from "@/lib/lab/lessons";
import { UART_CYCLES, boardDesign, grade, missingParts, simHz, simParams, withParams, type GoalResult } from "@/lib/lab/run";
import { doneLessons, loadDraft, markDone, saveDraft } from "@/lib/lab/progress";
import { EMPTY_VIEW, type BoardHandle, type BoardView } from "./Board3D";
import { VIEWS, viewFor, type ViewId } from "@/lib/lab/boards3d";
import { rich } from "./rich";

const Editor = dynamic(() => import("@/components/Editor"), { ssr: false, loading: () => <div className="h-full bg-pit" /> });
const ModelShelf = dynamic(() => import("./ModelShelf"), { ssr: false });
const Board3D = dynamic(() => import("./Board3D"), { ssr: false, loading: () => <div className="h-full grid place-items-center font-mono text-[11px] text-dim">Loading the board…</div> });

const FLASH_BOARDS = (Object.keys(FLASH) as BoardId[]).filter((id) => buildsInBrowser(BOARDS[id]));
const LOG_LINES = 60;
const LOG_GAP_MS = 150;   // a port that changes faster than this is logged at most this often

type Status = { kind: "idle" } | { kind: "building" } | { kind: "error"; text: string };
type Flash = { kind: "idle" } | { kind: "building" } | { kind: "error"; text: string } | { kind: "ready"; name: string; bytes: Uint8Array; notes: string[] };

const fmt = (name: string, width: number, v: number) =>
  /^hex/.test(name) ? v.toString(16).toUpperCase() : width > 1 ? `${width}'b${v.toString(2).padStart(width, "0")}` : String(v);
const hzText = (hz: number) => (hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`);

export default function LabLesson({ slug }: { slug: string }) {
  const lesson = lessonBySlug(slug)!;
  const hz = simHz(lesson);
  const [code, setCode] = useState(lesson.starter);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(true);
  const [results, setResults] = useState<GoalResult[] | null>(null);
  const [done, setDone] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [serial, setSerial] = useState("");
  const [inputs, setInputs] = useState({ btn: [0, 0], sw: [0, 0, 0, 0] });
  const [board, setBoard] = useState<BoardId>("tangnano9k");
  const [view, setView] = useState<ViewId>("lab");
  const [boardStatus, setBoardStatus] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>({ kind: "idle" });

  const boardRef = useRef<BoardHandle>(null);
  const net = useRef<{ code: string; net: BoardNetlist } | null>(null);
  const sim = useRef<GateSim | null>(null);
  const inputsRef = useRef(inputs);
  const clock = useRef(0);
  const timeRef = useRef<HTMLSpanElement>(null);
  const io = useRef({ toDesign: new UartTransmitter(UART_CYCLES), fromDesign: new UartReceiver(UART_CYCLES) });
  const logged = useRef<Record<string, { value: number; at: number }>>({});

  useEffect(() => {
    const draft = loadDraft(slug);
    if (draft) setCode(draft);
    setDone(doneLessons().includes(slug));
  }, [slug]);

  const edit = (text: string) => {
    setCode(text);
    setResults(null);
    saveDraft(slug, text === lesson.starter ? null : text);
  };

  /** The netlist for the current code, synthesized once per version (Yosys in the browser). */
  const synthesize = useCallback(async (): Promise<BoardNetlist | null> => {
    if (net.current?.code === code) return net.current.net;
    setStatus({ kind: "building" });
    const r = await synthesizeDesign("board", withParams(code, simParams(lesson)));
    if (!r?.ok) { setStatus({ kind: "error", text: r?.error ?? "Synthesis failed." }); return null; }
    net.current = { code, net: r as BoardNetlist };
    setStatus({ kind: "idle" });
    return net.current.net;
  }, [code, lesson]);

  const drive = (s: GateSim, name: string, value: number[]) => { if (name in s.ports) s.set(name, value); };

  /** Load the design onto the board: registers at 0, inputs as they are now. */
  const power = useCallback(async () => {
    const n = await synthesize();
    if (!n) return;
    try {
      const s = new GateSim(n);
      drive(s, "rx", [1]);
      drive(s, "btn", inputsRef.current.btn);
      drive(s, "sw", inputsRef.current.sw);
      sim.current = s;
      clock.current = 0;
      io.current = { toDesign: new UartTransmitter(UART_CYCLES), fromDesign: new UartReceiver(UART_CYCLES) };
      logged.current = {};
      setLog([]); setSerial("");
      setReady(true); setRunning(true);
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
    }
  }, [synthesize]);

  // Run: the cycles owed since the last frame, with lights shown at the share of cycles they were on.
  useEffect(() => {
    if (!ready) return;
    let raf = 0, last = performance.now(), owed = 0;
    const tick = (now: number) => {
      const s = sim.current;
      if (!s) return;
      const clocked = running && "clk" in s.ports;
      let n = 0;
      if (clocked) { owed += ((now - last) * hz) / 1000; n = Math.min(Math.floor(owed), Math.ceil(hz / 15)); owed = Math.min(owed - n, hz / 15); }
      last = now;
      const outs = Object.entries(s.ports).filter(([, p]) => p.direction !== "input");
      const digitPorts = outs.filter(([name, p]) => isSeg({ name, width: p.bits.length }) || isHex({ name, width: p.bits.length }));
      const leds = Array(6).fill(0), rgb = [0, 0, 0], digits = EMPTY_VIEW.digits.map((d) => d.map(() => 0));
      let received = "";
      const sample = () => {
        if ("led" in s.ports) s.get("led").forEach((b, i) => { if (i < 6) leds[i] += b; });
        if ("rgb" in s.ports) { const [b, g, r] = s.get("rgb"); rgb[0] += r; rgb[1] += g; rgb[2] += b; }
        for (const [name, p] of digitPorts) {
          const d = Number(/(\d+)$/.exec(name)?.[1] ?? 0);
          if (d < 4) segmentsOf({ name, width: p.bits.length }, s.get(name)).forEach((b, k) => { if (k < 8) digits[d][k] += b; });
        }
      };
      try {
        for (let i = 0; i < n; i++) {
          drive(s, "rx", [io.current.toDesign.next()]);
          s.set("clk", [1]); s.set("clk", [0]);
          if ("tx" in s.ports) {
            const r = io.current.fromDesign.sample(s.get("tx")[0]);
            if (r !== null) received += r === "error" ? "�" : String.fromCharCode(r);
          }
          sample();
        }
        if (n === 0) sample();
      } catch (e) {
        setRunning(false);
        setStatus({ kind: "error", text: (e as Error).message });
        return;
      }
      clock.current += n;
      const k = Math.max(n, 1);
      const v: BoardView = { leds: leds.map((x) => x / k), rgb: rgb.map((x) => x / k), digits: digits.map((d) => d.map((x) => x / k)), ...inputsRef.current };
      boardRef.current?.update(v);
      if (timeRef.current) timeRef.current.textContent = `${(clock.current / hz).toFixed(1)} s`;
      if (received) setSerial((t) => (t + received.replace(/\r/g, "")).slice(-2000));

      // The pin log: each output's value as it changes.
      const lines: string[] = [];
      for (const [name, p] of outs) {
        if (name === "tx") continue;
        const value = toNumber(s.get(name)), prev = logged.current[name];
        if (prev && (prev.value === value || now - prev.at < LOG_GAP_MS)) continue;
        logged.current[name] = { value, at: now };
        if (prev) lines.push(`${(clock.current / hz).toFixed(2).padStart(7)} s  ${name} = ${fmt(name, p.bits.length, value)}`);
      }
      if (lines.length) setLog((l) => [...l, ...lines].slice(-LOG_LINES));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, running, hz]);

  const setInput = useCallback((name: "btn" | "sw", i: number, value: number) => {
    const next = { ...inputsRef.current, [name]: inputsRef.current[name].map((b, k) => (k === i ? value : b)) };
    inputsRef.current = next;
    setInputs(next);
    if (!sim.current) boardRef.current?.update({ ...EMPTY_VIEW, ...next });
    try { if (sim.current) drive(sim.current, name, next[name]); } catch (e) { setStatus({ kind: "error", text: (e as Error).message }); }
  }, []);
  const onButton = useCallback((i: number, down: boolean) => setInput("btn", i, down ? 1 : 0), [setInput]);
  const onSwitch = useCallback((i: number) => setInput("sw", i, 1 - inputsRef.current.sw[i]), [setInput]);

  const check = async () => {
    const n = await synthesize();
    if (!n) return;
    const r = grade(lesson, n);
    setResults(r);
    if (r.every((g) => g.ok)) { markDone(slug); setDone(true); }
  };

  const buildForBoard = async () => {
    setFlash({ kind: "building" });
    let design: string;
    try { design = boardDesign(code, lesson.ports, board); } catch (e) { return setFlash({ kind: "error", text: (e as Error).message }); }
    const r = await buildBitstreamInBrowser(board, design);
    if (!r.ok) return setFlash({ kind: "error", text: r.error });
    setFlash({ kind: "ready", name: `${slug}-${board}${r.file.slice(r.file.lastIndexOf("."))}`, bytes: r.bin, notes: r.notes.filter((n) => !/active low/.test(n)) });   // boardDesign already flipped them
  };
  const openFlasher = async () => {
    if (flash.kind !== "ready") return;
    try { await putBitstream({ name: flash.name, board, bytes: flash.bytes }); } catch { /* /flash still takes a file */ }
    window.open("/flash", "_blank", "noopener");
  };

  const passed = results?.every((g) => g.ok) ?? false;
  const next = LESSONS[lessonIndex(slug) + 1];
  const missing = missingParts(lesson.ports, board);
  const shown = VIEWS.find((v) => v.id === view)!;
  const notShown = shown.flash ? missingParts(lesson.ports, shown.flash).filter((m) => m !== "a USB serial port") : [];
  // The board on screen and the board to build for follow each other where a view exists.
  const pickView = (id: ViewId) => {
    setView(id);
    const v = VIEWS.find((x) => x.id === id)!;
    if (v.flash && viewFor(board) !== id) { setBoard(v.flash); setFlash({ kind: "idle" }); }
  };
  const pickBoard = (id: BoardId) => {
    setBoard(id);
    setFlash({ kind: "idle" });
    const v = viewFor(id);
    if (v) setView(v);
  };
  const hasClock = "clk" in lesson.ports;
  const flipped = BOARDS[board].ledsActiveLow || BOARDS[board].buttons.some((b) => b.activeLow);
  const btnCls = "px-3 py-1.5 rounded border font-mono text-[11px] select-none disabled:opacity-40";
  const heading = "font-mono text-[10px] text-dim uppercase tracking-widest";

  return (
    <div className="space-y-4">
      {lesson.models && <ModelShelf ids={lesson.models} />}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Editor */}
        <section className="flex flex-col rounded-lg border border-rim bg-pit/40 overflow-hidden min-w-0" aria-label="Your Verilog">
          <div className="flex items-center justify-between gap-2 px-3 h-11 border-b border-rim">
            <span className={heading}>lab.v</span>
            <button className="font-mono text-[10px] text-ghost hover:text-bright" onClick={() => edit(lesson.starter)} title="Throw away your changes">Start over</button>
          </div>
          <div className="h-[380px] lg:h-[470px]">
            <Editor value={code} onChange={edit} language="verilog" lint />
          </div>
        </section>

        {/* Board */}
        <section className="flex flex-col rounded-lg border border-rim bg-pit/40 overflow-hidden min-w-0" aria-label="Lab board">
          <div className="flex flex-wrap items-center gap-2 px-3 min-h-11 py-1.5 border-b border-rim">
            <button className={`${btnCls} border-phosphor/50 text-phosphor hover:bg-phosphor/10`} onClick={power} disabled={status.kind === "building"}>
              {status.kind === "building" ? "Synthesizing…" : ready ? "Reload the design" : "Run on the board"}
            </button>
            {ready && hasClock && (
              <button className={`${btnCls} ${running ? "border-warn/50 text-warn" : "border-rim text-pale"}`} onClick={() => setRunning((r) => !r)}>
                {running ? "Pause" : "Resume"}
              </button>
            )}
            <span className="ml-auto font-mono text-[10px] text-dim">
              {ready ? <>{hasClock ? `clock ${hzText(hz)} · ` : ""}<span ref={timeRef}>0.0 s</span></> : "drag to turn · scroll to zoom"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 border-b border-rim" role="radiogroup" aria-label="Board to show">
            {VIEWS.map((v) => (
              <button key={v.id} role="radio" aria-checked={view === v.id} onClick={() => pickView(v.id)}
                      className={`px-2 py-1 rounded font-mono text-[10px] ${view === v.id ? "bg-phosphor/10 text-phosphor border border-phosphor/40" : "text-dim hover:text-ghost border border-transparent"}`}>
                {v.name}
              </button>
            ))}
          </div>
          <div className="relative h-[300px] sm:h-[360px] lg:h-[400px]">
            <Board3D handle={boardRef} onButton={onButton} onSwitch={onSwitch} view={view} onStatus={setBoardStatus}
                     ledColors={view === "lab" ? lesson.ledColors : undefined} />
            {boardStatus && <p className="absolute top-2 left-3 font-mono text-[10px] text-info pointer-events-none">{boardStatus}</p>}
            {notShown.length > 0 && (
              <p className="absolute top-2 right-3 max-w-[60%] text-right font-mono text-[10px] text-warn pointer-events-none">
                The {shown.name} has no {notShown.join(" or ")}: switch to the Lab board to see them.
              </p>
            )}
            {!ready && status.kind !== "building" && (
              <p className="absolute bottom-2 left-3 right-3 font-mono text-[10px] text-ghost pointer-events-none">
                Press Run on the board: your Verilog is turned into gates in this browser and runs here, cycle by cycle.
              </p>
            )}
            {status.kind === "building" && (
              <p className="absolute bottom-2 left-3 font-mono text-[10px] text-info pointer-events-none">
                {synthToolsLoaded() ? "Synthesizing to gates…" : "Loading the synthesis tools (about 6 MB, first time only)…"}
              </p>
            )}
          </div>
          {/* The same controls as plain buttons: keyboard, screen readers, no WebGL */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-rim">
            {[3, 2, 1, 0].map((k) => (
              <button key={`sw${k}`} aria-pressed={!!inputs.sw[k]} onClick={() => onSwitch(k)}
                      className={`${btnCls} ${inputs.sw[k] ? "border-info/60 text-info" : "border-rim text-ghost"}`}>SW{k} {inputs.sw[k] ? "on" : "off"}</button>
            ))}
            <span className="w-2" aria-hidden />
            {[1, 0].map((k) => (
              <button key={`btn${k}`} aria-pressed={!!inputs.btn[k]}
                      onPointerDown={() => onButton(k, true)} onPointerUp={() => onButton(k, false)} onPointerLeave={() => { if (inputs.btn[k]) onButton(k, false); }}
                      onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); onButton(k, true); } }}
                      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") onButton(k, false); }}
                      className={`${btnCls} ${inputs.btn[k] ? "border-phosphor/60 text-phosphor" : "border-rim text-ghost"}`}>BTN{k} (hold)</button>
            ))}
          </div>
          {shown.credit && (
            <p className="px-3 pb-2 font-mono text-[9px] text-dim">3D model: {shown.credit}. <Link href="/lab/credits" className="hover:text-ghost underline">Credits</Link></p>
          )}
        </section>
      </div>

      {status.kind === "error" && (
        <pre role="alert" className="whitespace-pre-wrap rounded border border-danger/40 bg-danger/5 p-3 font-mono text-[11px] text-danger">{status.text}</pre>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Goals */}
        <section className="rounded-lg border border-rim bg-pit/40 p-4 space-y-3" aria-labelledby="goals">
          <div className="flex items-center justify-between gap-2">
            <h2 id="goals" className={heading}>Goals</h2>
            {done && <span className="font-mono text-[10px] text-phosphor">✓ lesson complete</span>}
          </div>
          <ul className="space-y-2" aria-live="polite">
            {lesson.goals.map((g, k) => {
              const r = results?.[k];
              return (
                <li key={k} className="flex gap-2 text-[13px] leading-snug">
                  <span className={`w-4 shrink-0 font-mono text-[12px] ${r ? (r.ok ? "text-phosphor" : "text-danger") : "text-dim"}`} aria-label={r ? (r.ok ? "passed" : "failed") : "not checked"}>{r ? (r.ok ? "✓" : "✗") : "○"}</span>
                  <span className="min-w-0">
                    <span className={r?.ok ? "text-bright" : "text-pale"}>{rich(g)}</span>
                    {r && !r.ok && r.message && <span className="block font-mono text-[11px] text-danger/90 mt-0.5">{r.message}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button className={`${btnCls} border-phosphor/60 text-phosphor hover:bg-phosphor/10`} onClick={check} disabled={status.kind === "building"}>Check my design</button>
            {passed && next && <Link href={`/lab/${next.slug}`} className="font-mono text-[11px] text-info hover:underline">Next: {next.title} →</Link>}
            {passed && !next && <Link href="/lab" className="font-mono text-[11px] text-info hover:underline">You finished the track. Back to the Lab →</Link>}
          </div>
          <details className="text-[12px] text-ghost">
            <summary className="cursor-pointer font-mono text-[11px] text-dim hover:text-ghost">Hints</summary>
            <ol className="list-decimal pl-5 pt-2 space-y-1">{lesson.hints.map((h, k) => <li key={k}>{rich(h)}</li>)}</ol>
          </details>
        </section>

        {/* Pin log, serial, real board */}
        <section className="rounded-lg border border-rim bg-pit/40 p-4 space-y-4 min-w-0">
          <div className="space-y-1">
            <h2 className={heading}>Pin log</h2>
            <pre className="h-28 overflow-auto rounded bg-void border border-rim p-2 font-mono text-[10px] text-ghost">
              {log.length ? log.join("\n") : ready ? "Outputs show here as they change." : "Run the design to see its outputs change."}
            </pre>
          </div>
          {"tx" in lesson.ports && (
            <div className="space-y-1">
              <h2 className={heading}>Serial terminal (tx)</h2>
              <pre className="h-20 overflow-auto rounded bg-void border border-rim p-2 font-mono text-[11px] text-phosphor whitespace-pre-wrap">{serial || " "}</pre>
            </div>
          )}
          <div className="space-y-2">
            <h2 className={heading}>Put it on a real board</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select value={board} onChange={(e) => pickBoard(e.target.value as BoardId)} aria-label="Board"
                      className="bg-void border border-rim rounded px-2 py-1.5 font-mono text-[11px] text-pale max-w-full">
                {FLASH_BOARDS.map((id) => <option key={id} value={id}>{BOARDS[id].name}</option>)}
              </select>
              <button className={`${btnCls} border-info/50 text-info hover:bg-info/10`} onClick={buildForBoard} disabled={flash.kind === "building"}>
                {flash.kind === "building" ? "Building…" : "Build for this board"}
              </button>
              {flash.kind === "ready" && (
                <button className={`${btnCls} border-phosphor/60 text-phosphor hover:bg-phosphor/10`} onClick={openFlasher}>Open the flasher →</button>
              )}
            </div>
            {flash.kind === "building" && (
              <p className="font-mono text-[10px] text-dim">
                {bitstreamToolsLoaded(board) ? "Placing and routing…" : `Downloading the tools for this board (about ${BOARDS[board].downloadMb} MB, first time only), then placing and routing…`}
              </p>
            )}
            {flash.kind === "error" && <pre className="whitespace-pre-wrap font-mono text-[10px] text-danger">{flash.text}</pre>}
            {flash.kind === "ready" && <p className="font-mono text-[10px] text-phosphor">Built {flash.name}. The flasher opens with it loaded.</p>}
            <ul className="font-mono text-[10px] text-dim space-y-0.5">
              {missing.length > 0 && <li>The {BOARDS[board].name} has no {missing.join(" or ")}: those ports go to header pins, where you can wire them.</li>}
              <li>The clock is set to the board&apos;s {BOARDS[board].clockMhz} MHz{flipped ? ", and its active-low buttons and LEDs are flipped for you" : ""}.</li>
              {flash.kind === "ready" && flash.notes.map((n, k) => <li key={k}>{n}</li>)}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
