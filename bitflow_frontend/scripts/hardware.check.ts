/**
 * scripts/hardware.check.ts — self-check for lib/lab/hardware.ts (npx tsx scripts/hardware.check.ts).
 * The steps themselves are held against the reference solutions in scripts/lab.check.ts.
 */
import assert from "node:assert/strict";
import { awaitReply, HW_CHECKS, labBaud } from "../lib/lab/hardware";
import { LESSONS } from "../lib/lab/lessons";
import { lessonProblem } from "../lib/lessons";

// Every check belongs to a lesson with a serial port.
for (const [slug, steps] of Object.entries(HW_CHECKS)) {
  const lesson = LESSONS.find((l) => l.slug === slug);
  assert.ok(lesson, `${slug} is a lesson`);
  assert.ok("rx" in lesson.ports || "tx" in lesson.ports, `${slug} has a serial port`);
  assert.ok(steps.length > 0);
  for (const s of steps) {
    if (s.kind !== "action") assert.ok("rx" in lesson.ports, `${slug} sends text, so it needs rx`);
    if (s.kind !== "look") assert.ok("tx" in lesson.ports, `${slug} reads a reply, so it needs tx`);
  }
}
// Every lesson that can answer on serial has a check.
for (const l of LESSONS) if ("tx" in l.ports || "rx" in l.ports) assert.ok(HW_CHECKS[l.slug], `${l.slug} has no board check`);

// The baud a flashed design really runs at: its top module's BAUD, whatever the lesson simulates at.
assert.equal(labBaud("module lab #(parameter CLK_HZ = 27_000_000, BAUD = 115_200) (); endmodule"), 115200);
assert.equal(labBaud("module uart_tx #(parameter BAUD = 9600) (); endmodule\nmodule lab #(parameter BAUD = 57_600) (); uart_tx #(.BAUD(BAUD)) u(); endmodule"), 57600);
assert.equal(labBaud("module lab (); endmodule"), 115200);
for (const slug of Object.keys(HW_CHECKS)) assert.equal(labBaud(LESSONS.find((l) => l.slug === slug)!.starter), 115200, slug);

// Only saved for a real board on a lesson with a check.
assert.equal(lessonProblem({ kind: "lab", slug: "uart-echo", hwBoard: "tangnano9k" }), null);
assert.ok(lessonProblem({ kind: "lab", slug: "uart-echo", hwBoard: "no-such-board" }));
assert.ok(lessonProblem({ kind: "lab", slug: "uart-echo", hwBoard: 7 }));
assert.ok(lessonProblem({ kind: "lab", slug: "blink", hwBoard: "tangnano9k" }), "no check on this lesson");
assert.ok(lessonProblem({ kind: "academy", slug: "gates", hwBoard: "tangnano9k" }));

// Waiting for replies, with time faked so this runs instantly.
async function replies() {
  let clock = 0;
  const sleep = async (ms: number) => { clock += ms; };
  const options = { timeoutMs: 1000, settleMs: 100, sleep };
  /** What has arrived by now: each [ms, text] once its time comes. */
  const arriving = (...parts: [number, string][]) => () => parts.filter(([t]) => t <= clock).map(([, s]) => s).join("");
  const run = (want: string, exact: boolean, read: () => string) => { clock = 0; return awaitReply(want, exact, read, options); };

  assert.equal(await run("7\r\n", true, arriving([50, "7"], [90, "\r\n"])), null, "split across reads");
  assert.match((await run("7\r\n", true, () => ""))!, /nothing came back/);
  assert.equal(clock, 1100, "gives up at the timeout");
  assert.match((await run("Hi", true, arriving([10, "Ho"])))!, /Expected "Hi" and got "Ho"/);
  assert.match((await run("Hi", true, arriving([10, "Hi"], [60, "Hi"])))!, /got "HiHi"/, "extra bytes are caught");
  assert.match((await run("17", true, arriving([10, "1"])))!, /got "1"/, "too short");
  assert.equal(await run("Hello", false, arriving([500, "Hello\r\nHello\r\n"])), null, "a bouncing button may send it twice");
  assert.match((await run("Hello", false, arriving([500, "Help"])))!, /got "Help"/);
  console.log("hardware: OK");
}
replies().catch((e) => { console.error(e); process.exit(1); });
