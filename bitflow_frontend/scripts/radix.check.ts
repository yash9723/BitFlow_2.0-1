/**
 * scripts/radix.check.ts — self-check for lib/radix.ts (npx tsx scripts/radix.check.ts).
 */
import assert from "node:assert/strict";
import { formatWithRadix as f, nextRadix } from "../lib/radix";

assert.equal(f("1101", 4, "bin"), "1101");
assert.equal(f("1101", 4, "dec"), "13");
assert.equal(f("1101", 4, "sdec"), "-3");
assert.equal(f("1101", 4, "hex"), "hD");
assert.equal(f("101", 8, "sdec"), "5", "VCD drops leading zeros, so a short value is positive");
assert.equal(f("10000000", 8, "sdec"), "-128");
assert.equal(f("1".repeat(64), 64, "dec"), "18446744073709551615", "wide buses stay exact");
assert.equal(f("1".repeat(64), 64, "sdec"), "-1");
assert.equal(f("1", 1, "sdec"), "1", "1-bit signals show the raw value");
assert.equal(f("xxxx", 4, "dec"), "x");
assert.equal(f("1x01", 4, "sdec"), "X");
assert.deepEqual(["bin", "dec", "sdec", "hex"].map((r) => nextRadix(r as never)), ["dec", "sdec", "hex", "bin"]);
console.log("radix: all checks passed");
