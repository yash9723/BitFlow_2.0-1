/**
 * scripts/class-marks.check.ts — self-check for lib/class-marks.ts and lib/pilot.ts
 * and lib/signup-source.ts (npx tsx scripts/class-marks.check.ts): roll numbers, marks,
 * the CSV, pilot requests and sign-up source tags.
 */
import assert from "node:assert/strict";
import {
  byRollNumber, marksFor, maxMarksProblem, normalizeRoll, progressCsv, rollNumberProblem, type ClassProgress,
} from "../lib/class-marks";
import { pilotMessage, pilotProblem, readPilot } from "../lib/pilot";
import { normalizeRef } from "../lib/signup-source";

// Roll numbers: trimmed, upper-cased, single spaces; checked for length and characters.
assert.equal(normalizeRoll("  21bec 0042 "), "21BEC 0042");
assert.equal(normalizeRoll("a\t  b"), "A B");
assert.equal(normalizeRoll(42), "");
assert.equal(rollNumberProblem(""), null);
assert.equal(rollNumberProblem("21BEC0042"), null);
assert.equal(rollNumberProblem("ECE/2021/07"), null);
assert.ok(rollNumberProblem("=CMD()"));
assert.ok(rollNumberProblem("-1"));
assert.ok(rollNumberProblem("X".repeat(31)));

// Marks setting: null or a whole number 1..1000.
assert.equal(maxMarksProblem(null), null);
assert.equal(maxMarksProblem(25), null);
assert.ok(maxMarksProblem(0));
assert.ok(maxMarksProblem(2.5));
assert.ok(maxMarksProblem("25"));
assert.ok(maxMarksProblem(1001));

// Order: roll numbers first, numbers compared as numbers; the rest keep join order.
const order = byRollNumber([
  { name: "c", rollNumber: null }, { name: "r10", rollNumber: "21BEC10" }, { name: "d", rollNumber: null },
  { name: "r2", rollNumber: "21BEC2" }, { name: "r9", rollNumber: "21BEC9" },
]).map((s) => s.name);
assert.deepEqual(order, ["r2", "r9", "r10", "c", "d"]);

// Marks: on time is full credit, late half, to one decimal.
assert.equal(marksFor([], 20), 0);
assert.equal(marksFor(["on_time", "on_time"], 20), 20);
assert.equal(marksFor(["on_time", "late", "missing", "pending"], 20), 7.5);
assert.equal(marksFor(["late", "missing", "missing"], 10), 1.7);

// CSV: roll number column, roll order, marks column only when set, formula-safe cells.
const progress: ClassProgress = {
  assignments: [{ id: "a1", title: "Lab 1", dueAt: new Date(0).toISOString(), problems: [
    { slug: "and", title: "AND gate", difficulty: "Easy", href: "/p/and" },
    { slug: "mux", title: "Mux", difficulty: "Easy", href: "/p/mux" },
  ] }],
  students: [
    { id: "u1", username: "asha", rollNumber: "21BEC2" },
    { id: "u2", username: "=evil", rollNumber: null },
  ],
  status: { u1: { a1: { and: "on_time", mux: "late" } }, u2: { a1: { and: "missing" } } },
};
const plain = progressCsv(progress).trimEnd().split("\r\n");
assert.equal(plain[0], "Roll number,Student,Lab 1 / AND gate,Lab 1 / Mux,On time,Late,Missing");
assert.equal(plain[1], "21BEC2,asha,on time,late,1,1,0");
assert.equal(plain[2], ",'=evil,missing,not yet,0,0,1");
const marked = progressCsv(progress, 10).trimEnd().split("\r\n");
assert.ok(marked[0].endsWith(",Marks (out of 10)"));
assert.ok(marked[1].endsWith(",7.5"));
assert.ok(marked[2].endsWith(",0"));

// Pilot requests (lib/pilot.ts).
const good = readPilot({
  name: "Dr. Rao", email: "rao@college.edu.in", phone: "+91 98765 43210", role: "HOD",
  college: "Example Institute of Technology", department: "ECE", university: "JNTU", city: "Hyderabad",
  students: 120, semester: "Jan–May 2027 (even semester)", notes: "Digital design lab, 4th semester.",
});
assert.equal(pilotProblem(good), null);
assert.equal(pilotProblem({ ...good, phone: "" }), null);
assert.ok(pilotProblem({ ...good, email: "nope" }));
assert.ok(pilotProblem({ ...good, phone: "12345" }));
assert.ok(pilotProblem({ ...good, role: "Wizard" }));
assert.ok(pilotProblem({ ...good, college: "" }));
assert.ok(pilotProblem({ ...good, students: 0 }));
assert.ok(pilotProblem({ ...good, students: 12.5 }));
assert.ok(pilotProblem({ ...good, semester: "someday" }));
assert.ok(pilotProblem(readPilot({})));
const msg = pilotMessage(good);
assert.equal(msg.subject, "Pilot: Example Institute of Technology — ECE");
assert.ok(msg.message.includes("Students:    120"));
assert.ok(msg.message.endsWith("Digital design lab, 4th semester."));
assert.ok(pilotMessage({ ...good, college: "X".repeat(300) }).subject.length <= 150);

// Sign-up source tags (lib/signup-source.ts).
assert.equal(normalizeRef(" ABC-College "), "abc-college");
assert.equal(normalizeRef("linkedin_dec"), "linkedin_dec");
assert.equal(normalizeRef(""), "");
assert.equal(normalizeRef("-x"), "");
assert.equal(normalizeRef("a b"), "");
assert.equal(normalizeRef("<script>"), "");
assert.equal(normalizeRef("x".repeat(41)), "");
assert.equal(normalizeRef(7), "");

console.log("class-marks: ok");
