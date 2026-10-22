/**
 * scripts/report.check.ts — self-check for lib/waveform-svg.ts (npx tsx scripts/report.check.ts):
 * the waveform panel's row rules and the static SVG the lab report and share card draw.
 */
import assert from "node:assert/strict";
import { parseVcd } from "../lib/vcd-parser";
import { rowKeys, visibleRows, waveformSvg } from "../lib/waveform-svg";

const vcd = parseVcd(`$timescale 1ns $end
$scope module tb $end
$var reg 1 ! clk $end
$var reg 8 " count $end
$var wire 4 # bus4 $end
$scope module dut $end
$var wire 8 $ count $end
$var wire 1 % <img src=x onerror=alert(1)> $end
$upscope $end
$upscope $end
$enddefinitions $end
#0
0!
b0 "
bxxxx #
b0 $
1%
#5
1!
b11111111 "
#10
0!
b1010 #
b11111111 $
#20
1!
`);
const names = vcd.signals.map((s) => s.name);
assert.equal(vcd.signals.length, 5, names.join(","));

// Row keys: repeated names get "#n", like the waveform panel
const keys = rowKeys(vcd.signals);
assert.deepEqual([...keys.values()].filter((k) => k.startsWith("count")), ["count", "count#1"]);

// Hidden rows go, ordered rows come first, the rest keep VCD order
const rows = visibleRows(vcd.signals, ["clk"], ["count#1", "bus4"], keys).map((s) => keys.get(s.id));
assert.deepEqual(rows.slice(0, 2), ["count#1", "bus4"]);
assert.ok(!rows.includes("clk"));
assert.equal(rows.length, 4);

// The SVG
const all = waveformSvg(vcd);
assert.equal(all.shown, 5);
assert.equal(all.total, 5);
assert.match(all.svg, /^<svg [^>]*width="900"[^>]*>[\s\S]*<\/svg>$/);
assert.ok(!/NaN|undefined/.test(all.svg), "no NaN/undefined in the markup");
assert.equal((all.svg.match(/<svg/g) ?? []).length, 1);
// Names are escaped: a hostile signal name can't become markup
assert.ok(!all.svg.includes("<img"), "names are escaped");
assert.ok(all.svg.includes("&lt;img"), "the escaped name is still shown");
// Buses: hex by default, the panel's radix when set; x values drawn in the "bad" colour
assert.ok(all.svg.includes(">hFF<"), "hex label");
const signed = waveformSvg(vcd, { radixMap: { count: "sdec" } });
assert.ok(signed.svg.includes(">-1<"), "signed decimal label from the view's radix");
assert.ok(all.svg.includes('stroke="#dc2626"'), "x/z drawn in red (light theme)");
assert.ok(waveformSvg(vcd, {}, { theme: "dark" }).svg.includes('fill="#0d0e11"'), "dark theme background");

// The view: hidden rows and order follow the panel; markers and their delta
const v = waveformSvg(vcd, { hidden: ["clk"], order: ["count#1"], markers: { a: 5, b: 20 } });
assert.equal(v.shown, 4);
assert.ok(!v.svg.includes(">clk<"), "hidden row left out");
assert.ok(v.svg.indexOf(">count[7:0]<") > 0);
assert.ok(v.svg.includes(">A=5<") && v.svg.includes(">B=20<") && v.svg.includes("Δ = 15"), "markers and delta");
// Row cap
const capped = waveformSvg(vcd, {}, { maxSignals: 2 });
assert.equal(capped.shown, 2);
assert.equal(capped.total, 5);
assert.equal(capped.height, 20 + 2 * 24 + 4);
console.log("report: all checks passed");
