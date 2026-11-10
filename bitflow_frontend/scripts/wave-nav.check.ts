/** scripts/wave-nav.check.ts — lib/wave-nav.ts on a parsed dump shaped like Icarus' (tb with a dut inside). */
import assert from "node:assert/strict";
import { parseVcd } from "../lib/vcd-parser";
import { diffRuns, inScope, matchRanges, nextAnyChange, nextChange, nextMatch, parseQuery, scopesOf, signalFor, splitBus, holds } from "../lib/wave-nav";

const vcd = (counts: string[]) => `$timescale 1ns $end
$scope module tb $end
$var reg 1 ! clk $end
$var wire 4 " count [3:0] $end
$scope module dut $end
$var wire 1 # clk $end
$var reg 4 $ count [3:0] $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
0!
0#
bx "
bx $
${counts.map((c, i) => `#${(i + 1) * 10}\n1!\n1#\nb${c} "\nb${c} $\n#${(i + 1) * 10 + 5}\n0!\n0#`).join("\n")}
#100
`;
const run = parseVcd(vcd(["0", "1", "10", "11", "100"]));
const [clk, count, , dcount] = run.signals;

// Scopes recorded by the parser, and listed parents first.
assert.deepEqual(run.signals.map((s) => s.scope), ["tb", "tb", "tb.dut", "tb.dut"]);
assert.deepEqual(scopesOf(run.signals), ["tb", "tb.dut"]);
assert.deepEqual(inScope(run.signals, "tb.dut").map((s) => s.id), ["#", "$"]);
assert.equal(inScope(run.signals, null).length, 4);

// Bus into bits, MSB first; x stays x; leading zeros the VCD dropped come back.
const bits = splitBus(count);
assert.deepEqual(bits.map((b) => b.name), ["count[3]", "count[2]", "count[1]", "count[0]"]);
assert.deepEqual(bits[3].changes.map((c) => `${c.time}:${c.value}`), ["0:x", "10:0", "20:1", "30:0", "40:1", "50:0"]);
assert.deepEqual(bits[1].changes.map((c) => `${c.time}:${c.value}`), ["0:x", "10:0", "50:1"]);
assert.deepEqual(splitBus(clk), [clk]);

// Edges: strictly after / before; the time-0 value isn't an edge.
assert.equal(nextChange(clk, 0, 1), 10);
assert.equal(nextChange(clk, 10, 1), 15);
assert.equal(nextChange(clk, 15, -1), 10);
assert.equal(nextChange(clk, 10, -1), null);
assert.equal(nextChange(count, 50, 1), null);
assert.equal(nextAnyChange([count, clk], 12, 1), 15);
assert.equal(nextAnyChange([count, clk], 12, -1), 10);

// Queries.
assert.deepEqual(parseQuery("count == 3"), { name: "count", op: "==", value: 3n });
assert.deepEqual(parseQuery("count=0x3"), { name: "count", op: "==", value: 3n });
assert.deepEqual(parseQuery("dut.count >= 4'b0010"), { name: "dut.count", op: ">=", value: 2n });
assert.deepEqual(parseQuery("count != x"), { name: "count", op: "!=", value: "x" });
assert.deepEqual(parseQuery("clk"), { name: "clk", op: "==", value: 1n });
assert.match(parseQuery("count < x") as string, /only work with == and !=/);
assert.match(parseQuery("count == banana") as string, /isn't a value/);
assert.match(parseQuery("== 3") as string, /Write a signal/);
assert.equal(holds("0011", { name: "c", op: "==", value: 3n }), true);
assert.equal(holds("x1", { name: "c", op: "==", value: 1n }), false, "an unknown never equals a number");
assert.equal(holds("x1", { name: "c", op: "!=", value: 1n }), true);
assert.equal(signalFor(run.signals, "count"), count, "the exact name first");
assert.equal(signalFor([{ ...dcount, name: "dut.count" }], "count")?.id, "$", "else a name inside a scope");

// Matches: count == 3 holds from 40 to 50; count >= 2 from 30 to the end; clk high at every posedge.
const q = (t: string) => parseQuery(t) as Exclude<ReturnType<typeof parseQuery>, string>;
assert.deepEqual(matchRanges(count, q("count == 3"), run.maxTime), [{ from: 40, to: 50 }]);
assert.deepEqual(matchRanges(count, q("count >= 2"), run.maxTime), [{ from: 30, to: 100 }]);
assert.deepEqual(matchRanges(count, q("count == x"), run.maxTime), [{ from: 0, to: 10 }]);
const highs = matchRanges(clk, q("clk"), run.maxTime);
assert.equal(highs.length, 5);
assert.equal(nextMatch(highs, 10, 1), 20);
assert.equal(nextMatch(highs, 20, -1), 10);
assert.equal(nextMatch(highs, 50, 1), null);

// Two runs: the second counts 0,1,3,… — differs from 30 to 40, in tb and dut alike.
const other = parseVcd(vcd(["0", "1", "11", "11", "100"]));
const d = diffRuns(run, other);
assert.deepEqual(d.ranges, [{ from: 30, to: 40 }]);
assert.deepEqual(d.signals, ["count", "count"]);
assert.deepEqual(diffRuns(run, parseVcd(vcd(["0", "1", "10", "11", "100"]))), { ranges: [], signals: [] }, "the same run doesn't differ");
// A longer run with the same start: nothing differs in the time both ran.
const longer = parseVcd(vcd(["0", "1", "10", "11", "100", "101", "110", "111", "1000", "1001", "1010"]).replace("#100\n", "#200\n"));
const shorter = parseVcd(vcd(["0", "1", "10", "11", "100"]).replace("#100\n", ""));   // ends at its last change ($finish)
assert.ok(longer.maxTime > shorter.maxTime);
assert.deepEqual(diffRuns(longer, shorter), { ranges: [], signals: [] }, "only the common time is compared");

console.log("wave-nav: all checks passed");
