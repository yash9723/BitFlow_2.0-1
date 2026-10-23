/** scripts/protocol-decode.check.ts — self-check for lib/protocol-decode.ts (npx tsx scripts/protocol-decode.check.ts). */
import assert from "node:assert/strict";
import type { VcdSignal } from "../lib/vcd-parser";
import { autoBitTime, bitAt, decodeI2c, decodeSpi, decodeUart, guessDecoder, runDecoder, type Frame } from "../lib/protocol-decode";

/** A 1-bit signal from (time, value) events; the last event at a time wins, repeats are dropped. */
function sig(name: string, evs: [number, string][]): VcdSignal {
  const at = new Map<number, string>();
  for (const [t, v] of evs) at.set(t, v);
  const changes: VcdSignal["changes"] = [];
  for (const t of [...at.keys()].sort((a, b) => a - b)) {
    if (!changes.length || changes[changes.length - 1].value !== at.get(t)) changes.push({ time: t, value: at.get(t)! });
  }
  return { id: name, name, width: 1, type: "wire", changes };
}
const data = (fs: Frame[]) => fs.filter((f) => f.kind === "data").map((f) => f.value);
const labels = (fs: Frame[]) => fs.map((f) => f.label);

// ── UART ──
function uart(bytes: number[], bt: number, o: { parity?: "even" | "odd"; badStop?: number; gap?: number } = {}) {
  const evs: [number, string][] = [[0, "1"]];
  let t = 3 * bt;
  bytes.forEach((b, i) => {
    const bits = [0, ...Array.from({ length: 8 }, (_, k) => (b >> k) & 1)];
    if (o.parity) { const ones = bits.reduce((a, x) => a + x, 0); bits.push(o.parity === "even" ? ones & 1 : 1 - (ones & 1)); }
    bits.push(i === o.badStop ? 0 : 1);
    for (const x of bits) { evs.push([t, String(x)]); t += bt; }
    evs.push([t, "1"]);
    t += o.gap ?? 0;
  });
  return sig("tx", evs);
}
const hi = [0x48, 0x69, 0x00, 0xff, 0x55];
const tx = uart(hi, 10, { gap: 7 });
assert.deepEqual(data(decodeUart(tx, { bitTime: 10 })), hi);
assert.equal(decodeUart(tx, { bitTime: 10 })[0].label, "0x48 'H'");
assert.equal(autoBitTime(tx), 10);
assert.equal(autoBitTime(sig("r", [[0, "x"], [5, "1"], ...tx.changes.slice(1).map((c): [number, string] => [c.time, c.value])])), 10, "x before reset is not a pulse");
assert.deepEqual(data(decodeUart(uart(hi, 10), { bitTime: 10 })), hi, "back-to-back frames");
assert.deepEqual(data(decodeUart(uart(hi, 10, { parity: "odd" }), { bitTime: 10, parity: "odd" })), hi);
{
  const fs = decodeUart(uart(hi, 10, { parity: "even" }), { bitTime: 10, parity: "odd" });
  assert.ok(fs.every((f) => f.error === "parity error"));
  const bad = decodeUart(uart([0x41, 0x42, 0x43], 10, { badStop: 1, gap: 30 }), { bitTime: 10 });
  assert.deepEqual(bad.map((f) => f.kind), ["data", "error", "data"]);
  assert.match(bad[1].error!, /framing/);
}
// a 2-unit glitch low is not a start bit
assert.deepEqual(decodeUart(sig("g", [[0, "1"], [50, "0"], [52, "1"]]), { bitTime: 10 }), []);
assert.deepEqual(decodeUart(tx, { bitTime: 0 }), []);
assert.equal(bitAt(tx, -1), "x");

// ── SPI ──
function spi(words: number[], cpol: 0 | 1, cpha: 0 | 1, h = 5, cutAfter?: number) {
  const sclk: [number, string][] = [[0, String(cpol)]], mosi: [number, string][] = [[0, "0"]], miso: [number, string][] = [[0, "0"]];
  const cs: [number, string][] = [[0, "1"]];
  let t = 10;
  cs.push([t, "0"]);
  const lead = String(1 - cpol), trail = String(cpol);
  words.forEach((w, wi) => {
    for (let i = 0; i < 8; i++) {
      const mo = String((w >> (7 - i)) & 1), mi = String(((~w) >> (7 - i)) & 1);
      if (wi === cutAfter && i === 3) { cs.push([t + 1, "1"]); return; }
      if (cpha === 0) { mosi.push([t, mo]); miso.push([t, mi]); }
      sclk.push([t + h, lead]);
      if (cpha === 1) { mosi.push([t + h, mo]); miso.push([t + h, mi]); }
      sclk.push([t + 2 * h, trail]);
      t += 2 * h;
    }
  });
  cs.push([t + h, "1"]);
  return { sclk: sig("sclk", sclk), mosi: sig("mosi", mosi), miso: sig("miso", miso), cs: sig("cs", cs) };
}
const words = [0xa5, 0x3c, 0x01, 0x80];
for (const cpol of [0, 1] as const) for (const cpha of [0, 1] as const) {
  const fs = decodeSpi(spi(words, cpol, cpha), { cpol, cpha });
  assert.deepEqual(data(fs), words, `SPI mode ${cpol * 2 + cpha}`);
  assert.equal(fs[0].label, "MOSI 0xA5 · MISO 0x5A");
}
assert.deepEqual(data(decodeSpi({ ...spi(words, 0, 0), mosi: undefined })), words.map((w) => ~w & 0xff), "MISO only");
assert.deepEqual(decodeSpi(spi([0xa5], 0, 0), { msbFirst: false }).map((f) => f.value), [0xa5], "0xA5 is a bit palindrome");
assert.deepEqual(decodeSpi(spi([0x01], 0, 0), { msbFirst: false }).map((f) => f.value), [0x80]);
{
  const fs = decodeSpi(spi([0x11, 0x22, 0x33], 0, 0, 5, 1));
  assert.deepEqual(fs.map((f) => f.kind), ["data", "error"]);
  assert.match(fs[1].error!, /CS rose/);
}

// ── I2C ──
function i2c(bytes: number[][], o: { ackLast?: boolean; stopEarly?: boolean } = {}) {
  const q = 4, scl: [number, string][] = [[0, "1"]], sda: [number, string][] = [[0, "1"]];
  let t = 10;
  const bit = (b: number) => { t += q; sda.push([t, String(b)]); t += q; scl.push([t, "1"]); t += q; scl.push([t, "0"]); };
  bytes.forEach((txn, ti) => {
    if (ti > 0) { t += q; sda.push([t, "1"]); t += q; scl.push([t, "1"]); }   // released for a repeated START
    t += q; sda.push([t, "0"]); t += q; scl.push([t, "0"]);                   // START
    txn.forEach((b, bi) => {
      for (let k = 7; k >= 0; k--) {
        if (o.stopEarly && bi === 1 && k === 3) { t += q; sda.push([t, "0"]); t += q; scl.push([t, "1"]); t += q; sda.push([t, "1"]); return; }
        bit((b >> k) & 1);
      }
      bit(bi === txn.length - 1 && !o.ackLast ? 1 : 0);                      // NACK the last byte
    });
  });
  t += q; sda.push([t, "0"]); t += q; scl.push([t, "1"]); t += q; sda.push([t, "1"]); // STOP
  return { scl: sig("scl", scl), sda: sig("sda", sda) };
}
assert.deepEqual(labels(decodeI2c(i2c([[0x50 << 1, 0x12, 0x34]]))), ["S", "Addr 0x50 W ACK", "0x12 ACK", "0x34 NACK", "P"]);
assert.deepEqual(labels(decodeI2c(i2c([[0x50 << 1, 0x00], [(0x50 << 1) | 1, 0xab]]))),
  ["S", "Addr 0x50 W ACK", "0x00 NACK", "Sr", "Addr 0x50 R ACK", "0xAB NACK", "P"]);
{
  const fs = decodeI2c(i2c([[0x3c << 1, 0xff, 0x01]], { stopEarly: true }));
  assert.deepEqual(fs.map((f) => f.kind).slice(0, 4), ["start", "data", "error", "stop"]);
  assert.match(fs[2].error!, /STOP in the middle/);
}

// ── runDecoder (as the viewer calls it) ──
{
  const byKey = (k: string) => ({ tx, ...spi(words, 0, 0) } as Record<string, VcdSignal>)[k];
  assert.deepEqual(data(runDecoder({ id: "a", kind: "uart", signals: { line: "tx" } }, byKey) as Frame[]), hi, "auto bit time");
  assert.equal(runDecoder({ id: "b", kind: "spi", signals: { sclk: "sclk" } }, byKey), "Choose MOSI, MISO or both.");
  assert.equal(runDecoder({ id: "c", kind: "i2c", signals: { scl: "sclk" } }, byKey), "Choose the SDA signal.");
  assert.deepEqual(data(runDecoder({ id: "d", kind: "spi", signals: { sclk: "sclk", mosi: "mosi", cs: "cs" } }, byKey) as Frame[]), words);
}

assert.deepEqual(guessDecoder("spi", ["clk", "spi_sclk", "mosi", "dut.miso", "cs_n"]).signals, { sclk: "spi_sclk", mosi: "mosi", miso: "dut.miso", cs: "cs_n" });
assert.deepEqual(guessDecoder("uart", ["clk", "tx_busy", "tx"]).signals, { line: "tx" });
assert.deepEqual(guessDecoder("i2c", ["scl", "sda#1"]).signals, { scl: "scl", sda: "sda#1" });
assert.deepEqual(data(runDecoder({ ...guessDecoder("uart", ["tx"]) }, (k) => (k === "tx" ? tx : undefined)) as Frame[]), hi, "bit time 0 = auto");

console.log("protocol-decode check: OK");
