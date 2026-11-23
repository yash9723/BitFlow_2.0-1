// Spike: SDF-annotated gate-level simulation of the routed counter. -DHALF=<ns> sets half the clock period,
// -DW=<bits> the counter width. Inputs change on the falling edge so the testbench itself never races the flops.
`timescale 1ns/1ps
module tb;
  reg clk = 0, rst = 1, en = 0;
  wire [`W-1:0] count;
  counter dut (.clk(clk), .rst(rst), .en(en), .count(count));
  always #(`HALF) clk = ~clk;
  integer changes = 0, xs = 0;
  real last_edge = 0;
  always @(posedge clk) last_edge = $realtime;
  always @(count) begin
    changes = changes + 1;
    if (^count === 1'bx) xs = xs + 1;
    if (changes <= 6) $display("t=%0.3f ns count=%b  (%0.3f ns after the clock edge)", $realtime, count, $realtime - last_edge);
  end
  initial begin
    $sdf_annotate("6_final.sdf", dut);
    @(negedge clk); @(negedge clk); rst = 0; en = 1;
    repeat (20) @(negedge clk);
    $display("RESULT final count=%0d expected=20 changes=%0d x_values=%0d", count, changes, xs);
    $finish;
  end
endmodule
