/**
 * scripts/generators.check.ts — self-check for lib/studio/generators.ts (npx tsx scripts/generators.check.ts).
 * scripts/studio-sim.check.ts runs the generated designs against their testbenches on Icarus.
 */
import assert from "node:assert/strict";
import { GENERATORS, LFSR_TAPS, type Values, crcBits, defaults, lfsrNext, parseRomValues } from "../lib/studio/generators";

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
};
for (const gen of GENERATORS) {
  for (const v of [defaults(gen), ...(variants[gen.id] ?? []).map((x) => ({ ...defaults(gen), ...x }))]) {
    const r = gen.build(v);
    if (typeof r === "string") throw new Error(`${gen.id} ${JSON.stringify(v)}: ${r}`);
    assert.ok(r.design.includes(`module ${r.module} `), gen.id);
    assert.ok(r.testbench.includes(`${r.module} dut (`), gen.id);
    assert.match(r.testbench, /ALL TESTS PASSED/);
    assert.ok(r.testbench.split("\n").filter((l) => /expect_/.test(l) && !/task/.test(l)).length >= 3, `${gen.id}: has checks`);
  }
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
