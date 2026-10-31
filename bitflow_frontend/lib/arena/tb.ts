/**
 * lib/arena/tb.ts — the frame shared by the hidden testbenches of the Combinational,
 * Sequential and Protocol sets: an error counter, the "ALL TESTS PASSED" sentinel and $finish.
 */

import type { ArenaTestcase } from "./types";

export const TIMESCALE = "`timescale 1ns / 1ps\n";
export const CLOCK = "reg clk; initial clk = 0; always #5 clk = ~clk;";

/** A check inside a testbench body: `bad` true counts an error; only the first few are printed. */
export const check = (bad: string, message: string, args = "") =>
  `if (${bad}) begin if (errors < 5) $display("FAIL ${message}"${args ? `, ${args}` : ""}); errors = errors + 1; end`;

export function hiddenTest(id: string, description: string, weight: number, decls: string, body: string): ArenaTestcase {
  return {
    id, description, weight, expected: "ALL TESTS PASSED",
    testbench: `${TIMESCALE}module tb_${id.replace(/-/g, "_")};
    integer errors;
    ${decls}
    initial begin
        errors = 0;
        ${body}
        if (errors == 0) $display("ALL TESTS PASSED");
        else $display("TESTS FAILED: %0d error(s)", errors);
        $finish;
    end
endmodule
`,
  };
}
