module top(input clk, input rst, input [3:0] a, input [3:0] b, output reg [3:0] q, output [3:0] s, output p);
  wire [3:0] t = a & b;
  assign s = t ^ b;
  assign p = ^a;
  always @(posedge clk)
    if (rst) q <= 0;
    else q <= q + a;
endmodule
