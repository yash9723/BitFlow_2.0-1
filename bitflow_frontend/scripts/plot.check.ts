/**
 * scripts/plot.check.ts — self-check for lib/plot.ts (npx tsx scripts/plot.check.ts).
 */
import assert from "node:assert/strict";
import { busValue, series, toCsv, valueAt, xyPoints } from "../lib/plot";
import { parseVcd } from "../lib/vcd-parser";

assert.equal(busValue("1101", 4, false), 13);
assert.equal(busValue("1101", 4, true), -3);
assert.equal(busValue("101", 8, true), 5, "a short value was left-extended with 0");
assert.equal(busValue("1x01", 4, false), null);

const vcd = parseVcd(`$timescale 1ns $end
$scope module tb $end
$var wire 4 ! a [3:0] $end
$var wire 4 " b [3:0] $end
$upscope $end
$enddefinitions $end
#0
b0 !
bx "
#10
b1111 !
b10 "
#20
b111 !
#30
b1000 "
`);
const [a, b] = vcd.signals;
assert.deepEqual(series(a, false), { points: [{ t: 0, v: 0 }, { t: 10, v: 15 }, { t: 20, v: 7 }], min: 0, max: 15 });
assert.deepEqual(series(a, true), { points: [{ t: 0, v: 0 }, { t: 10, v: -1 }, { t: 20, v: 7 }], min: -1, max: 7 });
assert.equal(series(b, false).points[0].v, null, "x is a gap");

assert.equal(valueAt(a.changes, -1), null);
assert.equal(valueAt(a.changes, 15), "1111");
assert.equal(valueAt(a.changes, 99), "111");

// b is x at 0, so the first pair is at 10
assert.deepEqual(xyPoints(a, b, false, true), [[15, 2], [7, 2], [7, -8]]);

assert.equal(
  toCsv([a, b].map((s) => ({ name: s.name, changes: s.changes, fmt: (v: string) => v }))),
  "time,a,b\n0,0,x\n10,1111,10\n20,111,10\n30,111,1000\n",
);
assert.equal(
  toCsv([{ name: 'say "hi", x', changes: [{ time: 0, value: "1" }], fmt: () => "a,b" }]),
  'time,"say ""hi"", x"\n0,"a,b"\n',
  "commas and quotes are escaped",
);
console.log("plot: all checks passed");
