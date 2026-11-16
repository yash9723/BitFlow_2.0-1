/** scripts/problem-faq.check.ts — the guest problem-page FAQ (npx tsx scripts/problem-faq.check.ts). */
import assert from "node:assert/strict";
import { problemFaq } from "../lib/problem-faq";

const base = { title: "Mux", statement: "Build a 2:1 mux.", category: "Combinational", tags: ["mux", "combinational"] };

// nothing specific to say: no FAQ
assert.deepEqual(problemFaq({ ...base, constraints: [], examples: [] }), []);

const f = problemFaq({ ...base, constraints: ["No always blocks"], examples: [{ input: "a=1 b=0 s=1", output: "y=0" }] });
assert.equal(f.length, 4);
assert.equal(f[0].a, "Build a 2:1 mux.");
assert.equal(f[1].a, "No always blocks");
assert.equal(f[2].a, "Input a=1 b=0 s=1 gives output y=0.");
assert.equal(f[3].a, "Combinational, mux.");   // the category isn't repeated from the tags

// long statements are cut at a sentence end
const long = problemFaq({ ...base, statement: "A".repeat(150) + ". " + "B".repeat(300), constraints: ["x"], examples: [] });
assert.equal(long[0].a, "A".repeat(150) + ".");

console.log("problem-faq: ok");
