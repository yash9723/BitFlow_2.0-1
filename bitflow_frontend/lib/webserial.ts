/**
 * lib/webserial.ts — talk to a real board's UART from the browser (Web Serial, Chrome / Edge):
 * open a port, read in a loop, write, close. Plus the pure helpers the serial monitor
 * (components/SerialMonitor.tsx) uses: hex in and out, line endings, timestamped lines.
 * Self-check: scripts/webserial.check.ts.
 */

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000, 3000000];
export type LineEnding = "none" | "lf" | "crlf";
export const lineEnding = (e: LineEnding) => ({ none: "", lf: "\n", crlf: "\r\n" }[e]);

/** "48 69 0A" for the bytes. */
export const toHex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");

/** Bytes from "48 69 0a", "0x48,0x69" or "48690A"; an error names what isn't hex. */
export function parseHex(text: string): Uint8Array | { error: string } {
  const clean = text.replace(/0x/gi, " ").replace(/[,;]/g, " ").trim();
  if (!clean) return new Uint8Array(0);
  const tokens = clean.split(/\s+/).flatMap((t) => (t.length > 2 && t.length % 2 === 0 ? t.match(/../g)! : [t]));
  const bad = tokens.find((t) => !/^[0-9a-f]{1,2}$/i.test(t));
  return bad !== undefined ? { error: `"${bad}" isn't a hex byte (00-FF).` } : Uint8Array.from(tokens, (t) => parseInt(t, 16));
}

/**
 * Received text as lines, optionally stamped with the time each line started. Keeps the
 * last `max` characters so a chatty board can't grow the page without limit.
 */
export class Lines {
  text = "";
  private atLineStart = true;
  private decoder = new TextDecoder();
  constructor(public stamps = false, private max = 200_000) {}
  push(bytes: Uint8Array, now = new Date()): string {
    const chunk = this.decoder.decode(bytes, { stream: true }).replace(/\r\n?/g, "\n");
    let out = "";
    for (const ch of chunk) {
      if (this.atLineStart && this.stamps) out += `[${now.toTimeString().slice(0, 8)}.${String(now.getMilliseconds()).padStart(3, "0")}] `;
      out += ch;
      this.atLineStart = ch === "\n";
    }
    this.text = (this.text + out).slice(-this.max);
    return this.text;
  }
  clear() { this.text = ""; this.atLineStart = true; }
}

// ── The port itself ──────────────────────────────────────────────────────────

interface Port {
  open(o: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; bufferSize?: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}
type Serial = { requestPort(o?: object): Promise<Port> };
const serial = (): Serial | undefined => (typeof navigator === "undefined" ? undefined : (navigator as unknown as { serial?: Serial }).serial);
export const serialAvailable = () => !!serial();

export interface SerialConnection { info: string; write(bytes: Uint8Array): Promise<void>; close(): Promise<void> }

/**
 * Ask the user for a port (call it from a click), open it at `baudRate` 8N1 and read until it
 * closes. `onClose` gets an error message if the board went away. Null if they closed the chooser.
 */
export async function connectSerial(baudRate: number, onData: (bytes: Uint8Array) => void, onClose: (error?: string) => void): Promise<SerialConnection | null> {
  let port: Port;
  try {
    port = await serial()!.requestPort();
  } catch (err) {
    if ((err as Error)?.name === "NotFoundError") return null;   // chooser closed
    throw err;
  }
  await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: "none", bufferSize: 65536 });
  const reader = port.readable!.getReader();
  let closing = false;
  const loop = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value?.length) onData(value);
      }
      onClose();
    } catch (err) {
      onClose(closing ? undefined : `The connection was lost (${(err as Error).message}). Was the board unplugged?`);
    } finally {
      reader.releaseLock();
    }
  })();
  const { usbVendorId: vid, usbProductId: pid } = port.getInfo();
  const hex4 = (n?: number) => (n === undefined ? "?" : n.toString(16).padStart(4, "0"));
  return {
    info: vid !== undefined ? `USB ${hex4(vid)}:${hex4(pid)} at ${baudRate} baud` : `serial port at ${baudRate} baud`,
    async write(bytes) {
      const w = port.writable!.getWriter();
      try { await w.write(bytes); } finally { w.releaseLock(); }
    },
    async close() {
      closing = true;
      await reader.cancel().catch(() => {});
      await loop;
      await port.close().catch(() => {});
    },
  };
}
