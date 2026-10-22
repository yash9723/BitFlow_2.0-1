/**
 * scripts/similarity.check.ts — self-check for lib/similarity.ts (npx tsx scripts/similarity.check.ts).
 */
import assert from "node:assert/strict";
import { similarity, tokens } from "../lib/similarity";

const starter = `module seq_detect (
    input  wire clk,
    input  wire rst,
    input  wire din,
    output reg  found
);
    // your code here
endmodule
`;

// A Moore detector for 1011.
const a = `module seq_detect (
    input  wire clk,
    input  wire rst,
    input  wire din,
    output reg  found
);
    localparam S0 = 3'd0, S1 = 3'd1, S10 = 3'd2, S101 = 3'd3, S1011 = 3'd4;
    reg [2:0] state;
    always @(posedge clk) begin
        if (rst) state <= S0;
        else case (state)
            S0:    state <= din ? S1 : S0;
            S1:    state <= din ? S1 : S10;
            S10:   state <= din ? S101 : S0;
            S101:  state <= din ? S1011 : S10;
            S1011: state <= din ? S1 : S10;
            default: state <= S0;
        endcase
    end
    always @(*) found = (state == S1011);
endmodule
`;

// The same design, renamed, reformatted and commented.
const copy = `module seq_detect(input wire clk, input wire rst, input wire din, output reg found);
  // my states
  localparam IDLE = 3'd0, GOT1 = 3'd1, GOT10 = 3'd2, GOT101 = 3'd3, DONE = 3'd4;
  reg [2:0] st;   /* current state */
  always @(posedge clk) begin
    if (rst) st <= IDLE;
    else case (st)
      IDLE:   st <= din ? GOT1 : IDLE;
      GOT1:   st <= din ? GOT1 : GOT10;
      GOT10:  st <= din ? GOT101 : IDLE;
      GOT101: st <= din ? DONE : GOT10;
      DONE:   st <= din ? GOT1 : GOT10;
      default: st <= IDLE;
    endcase
  end
  always @(*) found = (st == DONE);
endmodule
`;

// A different, correct approach: a shift register compared with the pattern.
const different = `module seq_detect (
    input  wire clk,
    input  wire rst,
    input  wire din,
    output reg  found
);
    reg [3:0] last;
    reg [2:0] count;
    always @(posedge clk) begin
        if (rst) begin
            last  <= 4'b0000;
            count <= 3'd0;
        end else begin
            last <= {last[2:0], din};
            if (count != 3'd4) count <= count + 3'd1;
        end
    end
    always @(*) found = (count == 3'd4) && (last == 4'b1011);
endmodule
`;

assert.deepEqual(tokens("wire x; // c\nassign  x = y;"), tokens("wire a;\n/* other */ assign a=b;"), "comments, layout and names don't matter");
assert.notDeepEqual(tokens("assign x = y & z;"), tokens("assign x = y | z;"), "operators do");

const s1 = similarity(a, copy, starter)!;
const s2 = similarity(a, different, starter)!;
assert.ok(s1 >= 0.9, `renamed copy scores ${s1}`);
assert.ok(s2 < 0.5, `different approach scores ${s2}`);
assert.equal(similarity(a, a, starter), 1);
assert.equal(similarity("module m(input a, output y); assign y = a; endmodule", "module m(input a, output y); assign y = a; endmodule"), null,
  "tiny designs are too short to judge");
assert.equal(similarity(starter + "\n", starter, starter), null, "the starter alone is not evidence");
console.log(`similarity: all checks passed (copy ${s1.toFixed(2)}, different ${s2.toFixed(2)})`);
