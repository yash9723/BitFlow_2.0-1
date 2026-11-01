/**
 * scripts/institutions.check.ts — self-check for lib/institution-plan.ts
 * (npx tsx scripts/institutions.check.ts): the admin form, last days, and plan status.
 */
import assert from "node:assert/strict";
import { lastDay, lastDayString, planStatus, readInstitution, slugProblem } from "../lib/institution-plan";

// Addresses.
assert.equal(slugProblem("eit-ece"), null);
assert.equal(slugProblem("a1"), null);
assert.ok(slugProblem("a"));
assert.ok(slugProblem("-ece"));
assert.ok(slugProblem("EIT"));
assert.ok(slugProblem("eit ece"));
assert.ok(slugProblem("x".repeat(61)));

// A plan's last day is the end of that day in India, and impossible dates are refused.
assert.equal(lastDay("2027-05-31")?.toISOString(), "2027-05-31T18:29:59.999Z");
assert.equal(lastDay("2027-02-30"), null);
assert.equal(lastDay("31-05-2027"), null);
assert.equal(lastDayString(lastDay("2027-05-31")), "2027-05-31");
assert.equal(lastDayString(null), "");

// The admin form.
const full = readInstitution({ name: " EIT — ECE ", slug: "EIT-ECE", plan: "department", seatLimit: 240, validUntil: "2028-03-31", notes: " PO 4411 " });
assert.ok("data" in full);
if ("data" in full) {
  assert.equal(full.data.name, "EIT — ECE");
  assert.equal(full.data.slug, "eit-ece");
  assert.equal(full.data.plan, "department");
  assert.equal(full.data.seatLimit, 240);
  assert.equal(full.data.notes, "PO 4411");
}
const minimal = readInstitution({ name: "X College", slug: "x-college" });
assert.ok("data" in minimal && minimal.data.plan === "pilot" && minimal.data.seatLimit === null && minimal.data.validUntil === null && minimal.data.notes === null);
assert.ok("error" in readInstitution({ slug: "x-college" }));
assert.ok("error" in readInstitution({ name: "X", slug: "x-college", plan: "gold" }));
assert.ok("error" in readInstitution({ name: "X", slug: "x-college", seatLimit: 0 }));
assert.ok("error" in readInstitution({ name: "X", slug: "x-college", seatLimit: "240" }));
assert.ok("error" in readInstitution({ name: "X", slug: "x-college", validUntil: "soon" }));
// Edits only touch the fields sent; "" clears a limit or date.
const edit = readInstitution({ seatLimit: "", validUntil: "" }, true);
assert.deepEqual("data" in edit && edit.data, { seatLimit: null, validUntil: null });
assert.deepEqual("data" in readInstitution({}, true) && readInstitution({}, true), { data: {} });

// Plan status.
const now = new Date("2027-03-01T06:30:00Z");
const open = planStatus({ plan: "pilot", validUntil: null, seatLimit: null }, 500, now);
assert.deepEqual(open, { state: "active", daysLeft: null, overSeats: false, message: null });
const fine = planStatus({ plan: "department", validUntil: lastDay("2027-12-31"), seatLimit: 240 }, 240, now);
assert.equal(fine.state, "active");
assert.equal(fine.message, null);
const ending = planStatus({ plan: "pilot", validUntil: lastDay("2027-03-15"), seatLimit: null }, 10, now);
assert.equal(ending.state, "ending");
assert.equal(ending.daysLeft, 15);
assert.ok(ending.message?.includes("free pilot ends on 15 March 2027 (15 days left)"), ending.message ?? "");
const lapsed = planStatus({ plan: "department", validUntil: lastDay("2027-02-28"), seatLimit: 100 }, 130, now);
assert.equal(lapsed.state, "lapsed");
assert.equal(lapsed.overSeats, true);
assert.ok(lapsed.message?.includes("ended on 28 February 2027"), lapsed.message ?? "");
assert.ok(lapsed.message?.includes("130 students are using 100 seats"));
assert.ok(lapsed.message?.includes("Everything keeps working"));
// The last day itself still counts as active.
assert.equal(planStatus({ plan: "pilot", validUntil: lastDay("2027-03-01"), seatLimit: null }, 0, now).state, "ending");

console.log("institutions: ok");
