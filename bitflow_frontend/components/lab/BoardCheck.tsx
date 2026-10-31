"use client";
/**
 * components/lab/BoardCheck.tsx — "Check on my board": talks to the flashed design over USB serial
 * (Web Serial, Chrome and Edge), runs the lesson's steps (lib/lab/hardware.ts) and saves a pass on
 * the account as the board it was verified on.
 */
import { useEffect, useRef, useState } from "react";
import { awaitReply, HW_CHECKS, labBaud, visible } from "@/lib/lab/hardware";
import { connectSerial, serialAvailable, type SerialConnection } from "@/lib/webserial";
import { BOARDS, type BoardId } from "@/lib/synth/boards";
import { fetchHwBoard, reportLesson } from "@/lib/lesson-sync";

const ACTION_MS = 30_000;   // a person pressing a button
const REPLY_MS = 3_000;
const SETTLE_MS = 150;

type Line = { text: string; ok: boolean | null };
type Run = "idle" | "running" | "passed" | "failed";
type Asking = { text: string; yesNo: boolean };
const encode = (text: string) => new TextEncoder().encode(text);

export default function BoardCheck({ slug, code, board, ports, signedIn }: { slug: string; code: string; board: BoardId; ports: string[]; signedIn: boolean }) {
  const steps = HW_CHECKS[slug];
  const [run, setRun] = useState<Run>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [asking, setAsking] = useState<Asking | null>(null);
  const [verified, setVerified] = useState<string | null>(null);
  const answer = useRef<((yes: boolean) => void) | null>(null);
  const conn = useRef<SerialConnection | null>(null);

  useEffect(() => {
    if (!steps || !signedIn) return;
    let live = true;
    void fetchHwBoard(slug).then((b) => { if (live && b) setVerified(b); });
    return () => { live = false; };
  }, [slug, steps, signedIn]);
  useEffect(() => () => { void conn.current?.close(); }, []);
  // Asked after mounting: the lesson page is pre-rendered, where there is no navigator.
  const [hasSerial, setHasSerial] = useState(true);
  useEffect(() => setHasSerial(serialAvailable()), []);

  if (!steps) return null;

  const b = BOARDS[board];
  const baud = labBaud(code);
  const noPort = (ports.includes("tx") && !b.uartTx) || (ports.includes("rx") && !b.uartRx);
  const label = (id: string) => BOARDS[id as BoardId]?.name ?? id;

  async function check() {
    setRun("running");
    const shown: Line[] = [];
    const add = (text: string, ok: boolean | null) => { shown.push({ text, ok }); setLines([...shown]); };
    setLines([]);
    let text = "", lost: string | undefined;
    const decoder = new TextDecoder();
    try {
      const c = await connectSerial(baud, (bytes) => { text += decoder.decode(bytes, { stream: true }); }, (e) => { lost = e; });
      if (!c) { setRun("idle"); return; }   // they closed the chooser
      conn.current = c;
      add(`Connected: ${c.info}`, null);
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      let failed = false;
      for (const step of steps) {
        text = "";
        let problem: string | null;
        if (step.kind === "look") {
          await c.write(encode(step.send));
          const yes = await new Promise<boolean>((resolve) => { answer.current = resolve; setAsking({ text: step.ask, yesNo: true }); });
          setAsking(null);
          problem = yes ? null : "The LEDs didn't match.";
          add(`Sent ${visible(step.send)}: ${step.ask}`, yes);
        } else if (step.kind === "action") {
          setAsking({ text: step.ask, yesNo: false });
          problem = await awaitReply(step.reply, false, () => text, { timeoutMs: ACTION_MS, settleMs: 0 });
          setAsking(null);
          add(problem ?? `Got ${visible(step.reply)}.`, !problem);
        } else {
          await c.write(encode(step.send));
          problem = await awaitReply(step.reply, true, () => text, { timeoutMs: REPLY_MS, settleMs: SETTLE_MS });
          add(problem ? `Sent ${visible(step.send)}. ${problem}` : `Sent ${visible(step.send)}, got ${visible(step.reply)}.`, !problem);
        }
        if (lost) add(lost, false);
        if (problem || lost) { failed = true; break; }
      }
      setRun(failed ? "failed" : "passed");
      if (failed) {
        add(`Check that this lesson is flashed, this is the board's data port, and BAUD is ${baud}.`, null);
      } else {
        setVerified(board);
        void reportLesson({ kind: "lab", slug, hwBoard: board });
      }
    } catch (e) {
      add(`Couldn't use that port (${(e as Error).message}). Is a serial monitor or another tab holding it?`, false);
      setRun("failed");
    } finally {
      setAsking(null);
      answer.current = null;
      const c = conn.current;
      conn.current = null;
      await c?.close();   // free the port for the serial monitor
    }
  }

  const reply = (yes: boolean) => answer.current?.(yes);
  const btn = "px-3 py-1.5 rounded border font-mono text-[11px] select-none disabled:opacity-40";
  const icon = (ok: boolean | null) => (ok === null ? "·" : ok ? "✓" : "✗");

  return (
    <div className="space-y-2 border-t border-rim pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-[10px] text-dim uppercase tracking-widest">Check on my board</h2>
        {verified && <span className="font-mono text-[10px] text-phosphor">✓ Verified on hardware: {label(verified)}</span>}
      </div>
      {!hasSerial ? (
        <p className="font-mono text-[10px] text-warn">This check talks to the board with Web Serial, which only Chrome and Edge have. Open this page in one of them.</p>
      ) : noPort ? (
        <p className="font-mono text-[10px] text-warn">The {b.name} has no USB serial port wired to these pins. Pick another board, or use a USB serial adapter on its header pins.</p>
      ) : (
        <>
          <p className="font-mono text-[10px] text-dim">Flash this lesson, then connect at {baud} baud. Your browser asks which port: on a Tang Nano, try the higher-numbered one if nothing comes back.</p>
          <button className={`${btn} border-phosphor/60 text-phosphor hover:bg-phosphor/10`} onClick={check} disabled={run === "running"}>
            {run === "running" ? "Checking…" : run === "idle" ? "Connect and check" : "Check again"}
          </button>
        </>
      )}
      {asking && (
        <div role="status" className="rounded border border-info/40 bg-info/5 p-2 space-y-2">
          <p className="text-[12px] text-pale">{asking.text}</p>
          {asking.yesNo && (
            <div className="flex gap-2">
              <button className={`${btn} border-phosphor/60 text-phosphor`} onClick={() => reply(true)}>Yes</button>
              <button className={`${btn} border-danger/60 text-danger`} onClick={() => reply(false)}>No</button>
            </div>
          )}
        </div>
      )}
      {lines.length > 0 && (
        <ul aria-live="polite" className="font-mono text-[10px] space-y-0.5">
          {lines.map((l, k) => <li key={k} className={l.ok === null ? "text-ghost" : l.ok ? "text-phosphor" : "text-danger"}>{icon(l.ok)} {l.text}</li>)}
        </ul>
      )}
      {run === "passed" && !signedIn && <p className="font-mono text-[10px] text-warn">It passed. Sign in and check again to keep this on your account.</p>}
    </div>
  );
}
