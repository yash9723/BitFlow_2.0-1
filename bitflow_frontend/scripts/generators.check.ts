/**
 * scripts/generators.check.ts — self-check for lib/studio/generators.ts (npx tsx scripts/generators.check.ts).
 * scripts/studio-sim.check.ts runs the generated designs against their testbenches on Icarus.
 */
import assert from "node:assert/strict";
import {
  GENERATORS, LFSR_TAPS, SEG_HEX_ACTIVE_LOW, type Values, crcBits, defaults, lfsrNext, parseRomValues, sineTable, spiMasterModel, uartLine, uartRxModel,
} from "../lib/studio/generators";
import { toSystemVerilog } from "../lib/studio/sv";
import { decodeSpi } from "../lib/protocol-decode";
import type { VcdSignal } from "../lib/vcd-parser";

// Every tap set is maximal length: from 1, the LFSR visits all 2^n - 1 non-zero states before repeating
for (let w = 3; w <= 18; w++) {
  let q = 1n, n = 0;
  do { q = lfsrNext(q, w); n++; } while (q !== 1n && n <= 2 ** w);
  assert.equal(n, 2 ** w - 1, `LFSR ${w}`);
}
assert.deepEqual(Object.keys(LFSR_TAPS).map(Number), Array.from({ length: 30 }, (_, i) => i + 3));

// CRC catalogue check values (the CRC of "123456789")
const msg = [..."123456789"].map((c) => c.charCodeAt(0));
const crc = (w: number, poly: bigint, init: bigint, xorout: bigint) => crcBits(msg, w, poly, init).at(-1)! ^ xorout;
assert.equal(crc(8, 0x07n, 0n, 0n), 0xF4n, "CRC-8/SMBUS");
assert.equal(crc(16, 0x1021n, 0xFFFFn, 0n), 0x29B1n, "CRC-16/CCITT-FALSE");
assert.equal(crc(16, 0x1021n, 0n, 0n), 0x31C3n, "CRC-16/XMODEM");
assert.equal(crc(32, 0x04C11DB7n, 0xFFFFFFFFn, 0n), 0x0376E6E7n, "CRC-32/MPEG-2");
assert.equal(crc(32, 0x04C11DB7n, 0xFFFFFFFFn, 0xFFFFFFFFn), 0xFC891918n, "CRC-32/BZIP2");
const g = (id: string) => GENERATORS.find((x) => x.id === id)!;
for (const p of g("crc").presets!) {
  const r = g("crc").build({ ...defaults(g("crc")), ...p.values });
  assert.equal(typeof r, "object", p.label);
}
assert.match((g("crc").build({ ...defaults(g("crc")), width: 32, poly: "04C11DB7", init: "FFFFFFFF", xorout: "FFFFFFFF" }) as { notes: string[] }).notes[0], /32'hfc891918/);

// Every generator builds with its defaults and gives a module, a design and a self-checking testbench
const variants: Record<string, Values[]> = {
  lfsr: [{ width: 3, seed: "5" }, { width: 32, seed: "DEADBEEF" }], crc: [{ width: 5, poly: "05", init: "1F", xorout: "0" }],
  clkdiv: [{ n: 2 }, { n: 7 }, { n: 100000 }], pwm: [{ width: 2 }, { width: 10 }], debounce: [{ n: 1 }, { n: 20 }],
  fifo: [{ width: 1, depth: 2 }, { width: 16, depth: 16 }], gray: [{ width: 2 }, { width: 10 }], rom: [{ width: 4, values: "1 2 3" }, { width: 8, values: "0xFF" }],
  edge: [{}], shift: [{ width: 2 }, { width: 33 }], bin2bcd: [{ width: 4 }, { width: 14 }],
  uart_rx: [{ cpb: 4 }, { cpb: 5 }], spi_master: [{ mode: 3, width: 16, div: 1 }], rr_arbiter: [{ n: 3 }, { n: 16 }],
  async_fifo: [{ width: 1, depth: 4 }], cdc_sync: [{ stages: 4 }], vga: [{ h_active: 800, sync_neg: 0 }], sevenseg: [{ digits: 2 }, { digits: 8 }],
  sine: [{ entries: 8, width: 4 }, { entries: 1024, width: 16 }],
};
const CUSTOM_TB = ["async_fifo", "cdc_sync"];                      // two clocks: their own testbenches, with a scoreboard
for (const gen of GENERATORS) {
  for (const v of [defaults(gen), ...(variants[gen.id] ?? []).map((x) => ({ ...defaults(gen), ...x }))]) {
    const r = gen.build(v);
    if (typeof r === "string") throw new Error(`${gen.id} ${JSON.stringify(v)}: ${r}`);
    assert.ok(r.design.includes(`module ${r.module} `), gen.id);
    assert.match(r.testbench, new RegExp(`\\b${r.module}( #\\(.*\\))? dut \\(`), gen.id);
    assert.match(r.testbench, /ALL TESTS PASSED/);
    if (CUSTOM_TB.includes(gen.id)) assert.match(r.testbench, /FAIL/, `${gen.id}: has checks`);
    else assert.ok(r.testbench.split("\n").filter((l) => /expect_/.test(l) && !/task/.test(l)).length >= 3, `${gen.id}: has checks`);
  }
}
assert.equal(new Set(GENERATORS.map((x) => x.id)).size, GENERATORS.length, "unique ids");

// UART receiver: its model decodes a line built by an independent encoder
{
  const bytes = [0x48, 0x69, 0x00, 0xff, 0xa5];
  for (const cpb of [4, 7, 16]) {
    const line = [1, 1, ...uartLine(bytes, cpb, [3])];
    const out = uartRxModel(cpb, line.map((rx, i) => ({ rst: i < 2 ? 1 : 0, rx })));
    const got = out.filter((o) => o.valid);
    assert.deepEqual(got.map((o) => o.data), bytes, `uart_rx at ${cpb} clocks per bit`);
    assert.deepEqual(got.map((o) => o.frameErr), [0, 0, 0, 1, 0]);
  }
}
// SPI master: the wires it drives decode (lib/protocol-decode.ts) to the words sent, in every mode; loopback returns them
{
  const sig = (name: string, vals: number[]) => {
    const changes: VcdSignal["changes"] = [];
    vals.forEach((x, t) => { if (!changes.length || changes[changes.length - 1].value !== String(x)) changes.push({ time: t, value: String(x) }); });
    return { id: name, name, width: 1, type: "wire", changes };
  };
  const words = [0xa5n, 0x3cn, 0x01n, 0x80n];
  for (const mode of [0, 1, 2, 3]) for (const div of [1, 3]) {
    const cfg = { width: 8, cpol: mode >> 1, cpha: mode & 1, div };
    const stim: { rst: number; start: number; din: bigint; miso: number }[] = [{ rst: 1, start: 0, din: 0n, miso: 0 }];
    for (const w of words) { stim.push({ rst: 0, start: 1, din: w, miso: 0 }); for (let c = 0; c < 17 * div + 4; c++) stim.push({ rst: 0, start: 0, din: 0n, miso: 0 }); }
    for (let i = 1; i < stim.length; i++) stim[i].miso = spiMasterModel(cfg, stim.slice(0, i)).at(-1)!.mosi;   // MISO wired to MOSI
    const out = spiMasterModel(cfg, stim);
    const decoded = decodeSpi({ sclk: sig("sclk", out.map((o) => o.sclk)), mosi: sig("mosi", out.map((o) => o.mosi)), cs: sig("cs", out.map((o) => o.csN)) },
      { cpol: cfg.cpol as 0 | 1, cpha: cfg.cpha as 0 | 1 });
    assert.deepEqual(decoded.map((f) => BigInt(f.value!)), words, `SPI mode ${mode}, div ${div}: the wire`);
    assert.deepEqual(out.filter((o) => o.done).map((o) => o.dout), words, `SPI mode ${mode}, div ${div}: loopback`);
  }
}
assert.equal(sineTable(64, 8)[16], 127n);
assert.equal(sineTable(64, 8)[48], 129n, "-127 as 8 bits");
assert.equal(sineTable(64, 8)[0], 0n);
// active-low 7-segment digits are the ROM's default active-high font, inverted
const font = parseRomValues(String(defaults(g("rom")).values)) as bigint[];
font.forEach((f, d) => assert.equal(SEG_HEX_ACTIVE_LOW[d], Number(~f & 0x7fn), `digit ${d}`));
assert.match(g("async_fifo").build({ width: 8, depth: 2 }) as string, /power of two from 4/);
assert.match(g("spi_master").build({ width: 8, mode: 4, div: 1 }) as string, /0, 1, 2 or 3/);

// SystemVerilog spelling of generated code (simulated on Icarus by studio-sim)
{
  const sv = toSystemVerilog((g("lfsr").build(defaults(g("lfsr"))) as { design: string }).design);
  assert.match(sv, /input {2}logic {7}clk,/, "columns kept");
  assert.match(sv, /output logic \[7:0\] q/);
  assert.match(sv, /always_ff @\(posedge clk\)/);
  assert.match(sv, /^ {4}wire feedback = /m, "a wire with an initial value stays a net");
  assert.doesNotMatch(sv, /\breg\b|always @/);
  const bcdSv = toSystemVerilog((g("bin2bcd").build(defaults(g("bin2bcd"))) as { design: string }).design);
  assert.match(bcdSv, /always_comb begin/);
  const fsmSv = toSystemVerilog("module m (\n    input  wire clk\n);\n    localparam [1:0] A = 2'd0,\n               B = 2'd1;\n\n    reg [1:0] state, next_state;\nendmodule\n");
  assert.match(fsmSv, /typedef enum logic \[1:0\] \{\n {8}A = 2'd0,\n {8}B = 2'd1\n {4}\} state_t;\n\n {4}state_t state, next_state;/);
}
// Bad parameters are explained, not generated
assert.match(g("lfsr").build({ width: 8, seed: "0" }) as string, /non-zero/);
assert.match(g("lfsr").build({ width: 40, seed: "1" }) as string, /3 to 32/);
assert.match(g("fifo").build({ width: 8, depth: 6 }) as string, /power of two/);
assert.match(g("crc").build({ ...defaults(g("crc")), poly: "xyz" }) as string, /hex/);
assert.match(g("rom").build({ width: 4, values: "1 2 99" }) as string, /99 doesn't fit in 4 bits/);
assert.deepEqual(parseRomValues("1, 0x2, 0b11; 4"), [1n, 2n, 3n, 4n]);
assert.match(parseRomValues("1 two") as string, /"two" isn't a number/);
console.log("generators: all checks passed");
