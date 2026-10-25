/**
 * scripts/webserial.check.ts — self-check for lib/webserial.ts: the hex and line helpers, and
 * connectSerial against a stand-in port built from real Web Streams (read loop, write, a clean
 * close, and a board unplugged mid-read).
 *   npx tsx scripts/webserial.check.ts
 */
import assert from "node:assert/strict";
import { Lines, connectSerial, lineEnding, parseHex, toHex } from "@/lib/webserial";

const bytes = (s: string) => new TextEncoder().encode(s);

assert.equal(toHex(Uint8Array.from([0x48, 0x69, 0x0a, 0])), "48 69 0A 00");
assert.deepEqual([...parseHex("48 69 0a") as Uint8Array], [0x48, 0x69, 0x0a]);
assert.deepEqual([...parseHex("0x48,0x69") as Uint8Array], [0x48, 0x69]);
assert.deepEqual([...parseHex("48690A") as Uint8Array], [0x48, 0x69, 0x0a]);
assert.deepEqual(parseHex("48 zz"), { error: "\"zz\" isn't a hex byte (00-FF)." });
assert.deepEqual([...parseHex("  ") as Uint8Array], []);
assert.equal(lineEnding("crlf"), "\r\n");

let lines = new Lines();
lines.push(bytes("hel"));
assert.equal(lines.push(bytes("lo\r\nwor")), "hello\nwor", "chunks join; CRLF becomes a newline");
lines = new Lines();
lines.push(Uint8Array.from([0xe2, 0x82]));                     // "€" split across two reads
assert.equal(lines.push(Uint8Array.from([0xac])), "€", "UTF-8 split across reads");
lines = new Lines(true);
const at = new Date(2026, 0, 1, 9, 5, 7, 42);
assert.equal(lines.push(bytes("a\nb"), at), "[09:05:07.042] a\n[09:05:07.042] b", "each line is stamped once");
assert.equal(lines.push(bytes("c\n"), at), "[09:05:07.042] a\n[09:05:07.042] bc\n");
lines = new Lines(false, 5);
assert.equal(lines.push(bytes("1234567")), "34567", "keeps the last characters");
console.log("helpers: ok");

/** A port whose reads we feed and whose writes we record. */
function standIn() {
  let feed!: ReadableStreamDefaultController<Uint8Array>;
  const sent: number[] = [];
  const port = {
    opened: 0, closed: 0,
    async open(o: { baudRate: number }) { assert.equal(o.baudRate, 115200); port.opened++; },
    async close() { port.closed++; },
    readable: new ReadableStream<Uint8Array>({ start(c) { feed = c; } }),
    writable: new WritableStream<Uint8Array>({ write(chunk) { sent.push(...chunk); } }),
    getInfo: () => ({ usbVendorId: 0x0403, usbProductId: 0x6010 }),
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serial: { requestPort: async () => port } } });
  return { port, sent, feed: () => feed };
}
const tick = () => new Promise((r) => setTimeout(r, 10));

(async () => {
  // Read, write, close.
  let s = standIn();
  const got: string[] = [];
  let closedWith: string | undefined | null = null;
  let conn = await connectSerial(115200, (b) => got.push(new TextDecoder().decode(b)), (e) => { closedWith = e; });
  assert.ok(conn && conn.info === "USB 0403:6010 at 115200 baud", conn?.info);
  s.feed().enqueue(bytes("hi"));
  s.feed().enqueue(bytes("!"));
  await tick();
  assert.deepEqual(got, ["hi", "!"]);
  await conn!.write(bytes("ok\n"));
  assert.deepEqual(s.sent, [...bytes("ok\n")]);
  await conn!.close();
  assert.equal(closedWith, undefined, "a clean close has no error");
  assert.equal(s.port.closed, 1);

  // The board goes away mid-read.
  s = standIn();
  closedWith = null;
  conn = await connectSerial(115200, () => {}, (e) => { closedWith = e; });
  s.feed().error(new Error("The device has been lost."));
  await tick();
  assert.match(String(closedWith), /connection was lost \(The device has been lost\.\)/);
  await conn!.close();

  // The user closes the chooser.
  Object.defineProperty(globalThis, "navigator", { configurable: true,
    value: { serial: { requestPort: async () => { throw Object.assign(new Error("No port selected"), { name: "NotFoundError" }); } } } });
  assert.equal(await connectSerial(115200, () => {}, () => {}), null);
  console.log("connectSerial: ok");
  console.log("webserial: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });
