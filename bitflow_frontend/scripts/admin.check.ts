/** scripts/admin.check.ts — self-check for lib/admin-rules.ts (npx tsx scripts/admin.check.ts). */
import assert from "node:assert/strict";
import { problemEdit, userActionProblem } from "../lib/admin-rules";

const errorOf = (body: unknown) => { const r = problemEdit(body); return "error" in r ? r.error : null; };
const editOf = (body: unknown) => { const r = problemEdit(body); assert.ok(!("error" in r), JSON.stringify(r)); return r as Exclude<typeof r, { error: string }>; };

// Text edits don't need the simulator; anything that decides passing does.
assert.equal(editOf({ title: "New" }).gradingChanged, false);
assert.equal(editOf({ statement: "x", tags: [" a ", "", "b"], xpReward: 10, archived: true }).gradingChanged, false);
assert.equal(editOf({ tags: [" a ", "", "b"] }).data.tags, '["a","b"]');
for (const body of [{ starterCode: "module m; endmodule" }, { publicTestbench: "" }, { hiddenTestbench: "tb" }, { hiddenTestbench: null }, { hiddenTestcases: [{ testbench: "tb" }] }]) {
  assert.equal(editOf(body).gradingChanged, true, JSON.stringify(body));
}
assert.equal(editOf({ hiddenTestbench: "" }).data.hiddenTestbench, null, "an empty hidden testbench means none");
assert.equal(editOf({ hiddenTestcases: '[{"testbench":"tb"}]' }).data.hiddenTestcases, '[{"testbench":"tb"}]', "the editor sends JSON text");

// Refused.
assert.ok(errorOf(null));
assert.ok(errorOf({}), "nothing to change");
assert.ok(errorOf({ unknownField: 1 }), "unknown fields don't count as a change");
assert.ok(errorOf({ title: "  " }));
assert.ok(errorOf({ title: "x".repeat(201) }));
assert.ok(errorOf({ statement: 5 }));
assert.ok(errorOf({ tags: "a,b" }));
assert.ok(errorOf({ xpReward: -1 }));
assert.ok(errorOf({ xpReward: 1.5 }));
assert.ok(errorOf({ xpReward: 5001 }));
assert.ok(errorOf({ archived: "yes" }));
assert.ok(errorOf({ starterCode: " " }));
assert.ok(errorOf({ hiddenTestcases: "not json" }));
assert.ok(errorOf({ hiddenTestcases: [{ id: "t1" }] }), "a test case needs a testbench");
assert.ok(errorOf({ hiddenTestcases: { testbench: "tb" } }), "must be a list");

// Accounts: never yourself, never the last admin.
const me = "me";
const student = { id: "s", role: "STUDENT", minor: false };
const admin = { id: "a", role: "ADMIN", minor: false };
for (const action of ["promote", "demote", "ban", "unban", "delete"]) {
  assert.ok(userActionProblem(action, me, { ...admin, id: me }, 5), `${action} on yourself`);
}
assert.equal(userActionProblem("promote", me, student, 1), null);
assert.ok(userActionProblem("promote", me, { ...student, minor: true }, 1), "a minor can't be an admin");
assert.ok(userActionProblem("promote", me, admin, 2));
assert.ok(userActionProblem("demote", me, student, 2));
assert.equal(userActionProblem("demote", me, admin, 2), null);
for (const action of ["demote", "ban", "delete"]) assert.ok(userActionProblem(action, me, admin, 1), `${action} on the last admin`);
assert.equal(userActionProblem("ban", me, student, 1), null);
assert.equal(userActionProblem("unban", me, student, 1), null);
assert.equal(userActionProblem("delete", me, student, 1), null);
assert.ok(userActionProblem("explode", me, student, 1));

console.log("admin: all checks passed");
