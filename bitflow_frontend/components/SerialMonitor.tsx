"use client";
/**
 * components/SerialMonitor.tsx — a serial terminal for a real board's UART over Web Serial
 * (lib/webserial.ts): pick the port and speed, see what the design sends as text or hex
 * (with optional timestamps), send lines or hex bytes, save the log.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BAUD_RATES, Lines, connectSerial, lineEnding, parseHex, serialAvailable, toHex, type LineEnding, type SerialConnection } from "@/lib/webserial";
import { downloadBlob as download } from "@/lib/api";

const HEX_KEEP = 64 * 1024;   // bytes kept for the hex view

export default function SerialMonitor() {
  const [available, setAvailable] = useState(true);
  const [conn, setConn] = useState<SerialConnection | null>(null);
  const [baud, setBaud] = useState(115200);
  const [view, setView] = useState<"text" | "hex">("text");
  const [stamps, setStamps] = useState(false);
  const [text, setText] = useState("");
  const [counts, setCounts] = useState({ rx: 0, tx: 0 });
  const [typed, setTyped] = useState("");
  const [sendHex, setSendHex] = useState(false);
  const [ending, setEnding] = useState<LineEnding>("lf");
  const [error, setError] = useState<string | null>(null);
  const lines = useRef(new Lines());
  const raw = useRef<Uint8Array>(new Uint8Array(0));
  const out = useRef<HTMLPreElement>(null);

  // 16 bytes a row, built only while the hex view is showing.
  const hex = useMemo(() => {
    if (view !== "hex") return "";
    const rows: string[] = [];
    for (let i = 0; i < raw.current.length; i += 16) rows.push(toHex(raw.current.subarray(i, i + 16)));
    return rows.join("\n");
  }, [view, counts.rx]);   // eslint-disable-line react-hooks/exhaustive-deps -- raw is a ref; counts.rx changes with it

  useEffect(() => { setAvailable(serialAvailable()); }, []);
  useEffect(() => { lines.current.stamps = stamps; }, [stamps]);
  useEffect(() => { out.current?.scrollTo(0, out.current.scrollHeight); }, [text, hex]);
  useEffect(() => () => { conn?.close(); }, [conn]);   // leaving the page closes the port

  const received = (bytes: Uint8Array) => {
    const joined = new Uint8Array(raw.current.length + bytes.length);
    joined.set(raw.current);
    joined.set(bytes, raw.current.length);
    raw.current = joined.slice(-HEX_KEEP);
    setText(lines.current.push(bytes));
    setCounts((c) => ({ ...c, rx: c.rx + bytes.length }));
  };

  const connect = async () => {
    setError(null);
    try {
      const c = await connectSerial(baud, received, (err) => { setConn(null); if (err) setError(err); });
      if (c) setConn(c);
    } catch (err) {
      setError(`Couldn't open the port: ${(err as Error).message}. Is another program (or tab) using it?`);
    }
  };
  const disconnect = async () => { await conn?.close(); setConn(null); };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conn) return;
    const bytes = sendHex ? parseHex(typed) : new TextEncoder().encode(typed + lineEnding(ending));
    if (!(bytes instanceof Uint8Array)) return setError(bytes.error);
    setError(null);
    try {
      await conn.write(bytes);
      setCounts((c) => ({ ...c, tx: c.tx + bytes.length }));
      setTyped("");
    } catch (err) {
      setError(`Couldn't send: ${(err as Error).message}`);
    }
  };
  const clear = () => { lines.current.clear(); raw.current = new Uint8Array(0); setText(""); setCounts({ rx: 0, tx: 0 }); };

  const toggle = (on: boolean, label: string, set: (v: boolean) => void) => (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)}
      className={`px-2 py-0.5 rounded border ${on ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim text-dim hover:text-ghost"}`}>{label}</button>
  );

  if (!available) {
    return <p className="font-mono text-[11px] text-dim">The serial monitor needs Chrome, Edge or another Chromium browser on a computer (Web Serial).</p>;
  }

  return (
    <div className="space-y-3 font-mono text-[11px] text-pale">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[10px] text-dim">
          Speed
          <select value={baud} onChange={(e) => setBaud(Number(e.target.value))} disabled={!!conn} aria-label="Baud rate"
            className="bg-void border border-rim rounded px-2 py-1 text-[11px] text-pale outline-none focus:border-phosphor/60 disabled:opacity-50">
            {BAUD_RATES.map((b) => <option key={b} value={b}>{b.toLocaleString("en")} baud</option>)}
          </select>
        </label>
        {conn
          ? <button onClick={disconnect} className="px-3 py-1 rounded border border-rim text-ghost hover:text-bright text-[10px]">Disconnect</button>
          : <button onClick={connect} className="px-3 py-1 rounded border border-info/60 text-info hover:bg-info/10 text-[10px]">Connect a serial port…</button>}
        <span className="text-[10px] text-dim">{conn ? <>Connected: <span className="text-ghost">{conn.info}</span>, 8N1</> : "8 data bits, no parity, 1 stop bit"}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        {toggle(view === "hex", "Hex", (v) => setView(v ? "hex" : "text"))}
        {view === "text" && toggle(stamps, "Timestamps", setStamps)}
        <span className="text-dim">received {counts.rx.toLocaleString("en")} B · sent {counts.tx.toLocaleString("en")} B</span>
        <button onClick={clear} className="ml-auto text-info hover:underline">Clear</button>
        <button onClick={() => download("serial-log.txt", view === "hex" ? hex : text, "text/plain")} disabled={!text}
          className="text-info hover:underline disabled:opacity-40 disabled:no-underline">Save log</button>
      </div>

      <pre ref={out} aria-label="Received" aria-live="polite"
        className="h-56 overflow-auto bg-void border border-rim rounded p-2 text-[11px] text-phosphor whitespace-pre-wrap break-all">
        {(view === "hex" ? hex : text) || <span className="text-dim">{conn ? "Waiting for the board to send something…" : "Connect the board's serial port to see what your design sends on tx."}</span>}
      </pre>

      <form onSubmit={send} className="flex flex-wrap gap-2">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} disabled={!conn} aria-label="Send"
          placeholder={sendHex ? "Hex bytes, e.g. 48 69 0A" : "Type, then Enter to send"}
          className="flex-1 min-w-[12rem] bg-pit border border-rim rounded px-2 py-1 text-[11px] text-pale outline-none focus:border-phosphor/60 disabled:opacity-50" />
        {!sendHex && (
          <select value={ending} onChange={(e) => setEnding(e.target.value as LineEnding)} aria-label="Line ending"
            className="bg-void border border-rim rounded px-1 py-1 text-[10px] text-pale outline-none">
            <option value="lf">+ \n</option><option value="crlf">+ \r\n</option><option value="none">no ending</option>
          </select>
        )}
        {toggle(sendHex, "Send hex", setSendHex)}
        <button disabled={!conn} className="px-3 py-1 rounded border border-info/50 text-info text-[10px] disabled:opacity-40">Send</button>
      </form>
      {error && <p className="text-[10px] text-danger" role="alert">{error}</p>}
      <p className="text-[10px] text-dim">
        On FTDI boards (iCEstick, iCEBreaker, Digilent) the serial port is the board&apos;s second interface: it keeps its normal driver
        even after you give interface 0 the WinUSB driver for programming. The speed must match the design (e.g. CLKS_PER_BIT = clock ÷ baud).
      </p>
    </div>
  );
}
