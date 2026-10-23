/** scripts/numbers.check.ts — self-check for lib/studio/numbers.ts (npx tsx scripts/numbers.check.ts). */
import assert from "node:assert/strict";
import {
  asSigned, bitsToFloat, digits, encode, fields, floatToBits, fromFixed, minWidth, negationSteps, neighbours, parseInteger, qName, range,
  toFixed, verilogLiteral,
} from "../lib/studio/numbers";

// Integers
assert.deepEqual(parseInteger("42"), { value: 42n });
assert.deepEqual(parseInteger("-0x2A"), { value: -42n });
assert.deepEqual(parseInteger("0b1010_1010"), { value: 170n });
assert.deepEqual(parseInteger("8'hFF"), { value: 255n, width: 8, signed: false });
assert.deepEqual(parseInteger("-8'sd5"), { value: -5n, width: 8, signed: true });
assert.deepEqual(parseInteger("'b101"), { value: 5n, width: undefined, signed: false });
assert.match(parseInteger("4'b1x01") as string, /x and z/);
assert.match(parseInteger("0b102") as string, /Not a number/);
assert.match(parseInteger("8'b102") as string, /isn't a base-2 digit/);
assert.deepEqual(range(8, true), [-128n, 127n]);
assert.equal(encode(-1n, 8, true), 255n);
assert.equal(encode(-128n, 8, true), 128n);
assert.match(encode(200n, 8, true) as string, /fits as unsigned/);
assert.match(encode(-3n, 8, false) as string, /fits as signed/);
assert.equal(asSigned(0xFFn, 8), -1n);
assert.equal(asSigned(0x7Fn, 8), 127n);
assert.equal(minWidth(127n, true), 8);
assert.equal(minWidth(128n, true), 9);
assert.equal(minWidth(-128n, true), 8);
assert.equal(digits(0xA5n, 8, 2, 4), "1010_0101");
assert.equal(digits(5n, 12, 16), "005");
assert.equal(verilogLiteral(0xA5n, 8, false), "8'hA5");
assert.equal(verilogLiteral(0xA5n, 8, true, 2), "8'sb1010_0101");
assert.equal(verilogLiteral(0xFFFFFFFFFFFFFFFFn, 64, false), "64'hFFFFFFFFFFFFFFFF");
assert.deepEqual(negationSteps(5n, 8), { magnitude: 5n, inverted: 0xFAn, result: 0xFBn });

// Fixed point (Q4.4 signed: steps of 1/16, -8 … 7.9375)
assert.equal(qName(8, 4, true), "Q4.4");
assert.deepEqual(toFixed(1.5, 8, 4, true), { bits: 0x18n, value: 1.5, saturated: false });
assert.deepEqual(toFixed(-1.5, 8, 4, true), { bits: 0xE8n, value: -1.5, saturated: false });
assert.deepEqual(toFixed(100, 8, 4, true), { bits: 0x7Fn, value: 7.9375, saturated: true });
assert.deepEqual(toFixed(-100, 8, 4, true), { bits: 0x80n, value: -8, saturated: true });
assert.equal(toFixed(0.03125, 8, 4, true).value, 0, "ties to even: 0.5 LSB rounds to 0");
assert.equal(toFixed(0.09375, 8, 4, true).value, 0.125, "1.5 LSB rounds to 2");
assert.equal(toFixed(-0.03, 8, 4, true, "floor").value, -0.0625);
assert.equal(toFixed(-0.03, 8, 4, true, "zero").value, 0);
assert.equal(fromFixed(0xFFn, 8, 4, false), 15.9375);

// IEEE-754: the generic encoder agrees with the hardware's single precision on random values, subnormals included
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
for (let i = 0; i < 20000; i++) {
  const x = (rnd() - 0.5) * 2 ** Math.floor(rnd() * 300 - 160);
  f32[0] = x;
  assert.equal(floatToBits(x, "single"), BigInt(u32[0]), `single ${x}`);
  assert.equal(bitsToFloat(BigInt(u32[0]), "single"), f32[0]);
}
for (const x of [0, -0, 1, -2.5, 65504, 1e-8, 6.1e-5, 5.96e-8, 3e-8, 2.98e-8, 1e10, Infinity, -Infinity]) {
  f32[0] = x;
  assert.equal(floatToBits(x, "single"), BigInt(u32[0]), `single ${x}`);
}
// Half precision: known patterns
const h = (x: number) => Number(floatToBits(x, "half")).toString(16).padStart(4, "0");
assert.equal(h(1), "3c00");
assert.equal(h(-2), "c000");
assert.equal(h(65504), "7bff", "largest half");
assert.equal(h(65520), "7c00", "rounds up to infinity");
assert.equal(h(2 ** -24), "0001", "smallest subnormal");
assert.equal(h(2 ** -25), "0000", "half of it ties to even: zero");
assert.equal(h(1 / 3), "3555");
assert.equal(h(NaN), "7e00");
assert.equal(bitsToFloat(0x3555n, "half"), 0.333251953125);
assert.equal(bitsToFloat(0x0001n, "half"), 2 ** -24);
assert.deepEqual(fields(0x3c00n, "half"), { sign: 0, exp: 15, mantissa: 0n, kind: "normal", unbiased: 0 });
assert.equal(fields(0x0001n, "half").kind, "subnormal");
assert.equal(fields(0xfc00n, "half").kind, "infinity");
// Double: through DataView, exact
assert.equal(floatToBits(0.1, "double"), 0x3FB999999999999An);
assert.equal(bitsToFloat(0x3FB999999999999An, "double"), 0.1);
// Neighbours: one ULP either side
assert.deepEqual(neighbours(floatToBits(1, "half"), "half"), { down: 1 - 2 ** -11, up: 1 + 2 ** -10 });
assert.deepEqual(neighbours(floatToBits(-1, "half"), "half"), { down: -1 - 2 ** -10, up: -1 + 2 ** -11 });
assert.deepEqual(neighbours(0n, "half"), { down: -(2 ** -24), up: 2 ** -24 });
console.log("numbers: all checks passed");
