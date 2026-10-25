/**
 * scripts/policy.check.ts — self-check for the graded-design policy in lib/grading.ts
 * (npx tsx scripts/policy.check.ts). Comment markers inside strings, and quotes inside
 * comments, must not hide a statement from the check.
 */
import assert from "node:assert/strict";
import { designPolicyViolation as violation } from "../lib/grading";

const tb = ["module tb_x_hidden; endmodule"];
const ok = (code: string) => assert.equal(violation(code, tb), null, code);
const bad = (code: string) => assert.notEqual(violation(code, tb), null, code);

ok("module m(input a, output y); assign y = a; endmodule");
ok('module m; // $display("x") in a comment is fine\nendmodule');
ok('module m; /* $display */ endmodule');
ok('module m; reg [8*8:1] s = "$display"; endmodule');
ok('module m; reg [8*4:1] s = "a\\"b"; endmodule');                     // escaped quote stays inside the string

bad('module m; initial $display("x"); endmodule');
bad('module m; reg [15:0] s = "//"; initial $display("x"); endmodule');    // "//" in a string isn't a comment
bad('module m; reg [15:0] s = "/*"; initial $display("x"); reg [15:0] t = "*/"; endmodule');
bad('module m; // "\ninitial $display("x"); endmodule');                   // a quote in a comment isn't a string
bad("module m; tb_x_hidden t(); endmodule");
bad("module m; initial force y = 1; endmodule");
bad("`include \"tb.v\"\nmodule m; endmodule");

console.log("policy: all checks passed");
