/** npx tsx scripts/layout-board.check.ts — lib/layout.ts layoutVerdict: only explicit passes rank. */
import assert from "node:assert/strict";
import { layoutVerdict } from "../lib/layout";

const clean = { area_um2: 333, slack_ns: 7.28, drc_violations: 0, drc_deck_violations: 0, lvs: true, lec: true, antenna_violations: 0 };
assert.deepEqual(layoutVerdict(clean), { area: 333, slack: 7.28, clean: true, message: null });
// a check that didn't run (older jobs, missing KLayout) never counts as a pass
const v = layoutVerdict({ ...clean, drc_deck_violations: null, lvs: undefined });
assert.equal(v.clean, false);
assert.match(v.message!, /rule-deck DRC didn't run.*LVS didn't run/);
assert.equal(layoutVerdict({ ...clean, drc_deck_violations: 3 }).clean, false);
assert.equal(layoutVerdict({ ...clean, lvs: false }).message, "Not ranked: LVS: the layout doesn't match the netlist.");
assert.equal(layoutVerdict({ ...clean, area_um2: null }).clean, false);
// slow-corner misses don't gate ranking; slack falls back to wns for old results
assert.equal(layoutVerdict({ ...clean, slack_ns: undefined, wns_ns: -0.5, corners: { ss: { setup: -8, hold: 1 } } }).slack, -0.5);
assert.equal(layoutVerdict(null).clean, false);
console.log("layout-board checks pass");
