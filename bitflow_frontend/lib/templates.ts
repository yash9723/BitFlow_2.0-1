/**
 * lib/templates.ts — Verilog template library
 *
 * Pure data file — no React, no side effects.
 * Exported as a typed Record so TypeScript enforces the shape of every entry.
 *
 * ─── Adding a new template ────────────────────────────────────────────────────
 *  1. Add an entry to TEMPLATES below with a unique camelCase key.
 *  2. Fill in label, design, and testbench strings.
 *  3. The TemplateMenu component picks it up automatically — no other changes.
 *
 * ─── Sandbox-only note ────────────────────────────────────────────────────────
 *  This file is intentionally separate from any future problem-solving mode.
 *  Problem templates (with constraints, scoring, hidden tests) will live in a
 *  different module under lib/problems/ and will NOT import from here.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface VerilogTemplate {
  /** Human-readable display label shown in the dropdown. */
  label: string;
  /** Category for future grouping (not used in UI yet). */
  category: "combinational" | "sequential" | "fsm" | "languages" | "formal";
  /** Full contents of design.v. */
  design: string;
  /** Full contents of tb.v. */
  testbench: string;
  /** More design files, shown as tabs next to design.v (lib/project-files.ts). */
  files?: { name: string; content: string }[];
  /** Languages of the two editors; Verilog (incl. SystemVerilog) when omitted. */
  designLanguage?:    "verilog" | "vhdl";
  testbenchLanguage?: "verilog" | "vhdl" | "python";
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLATES: Record<string, VerilogTemplate> = {

  // ── Half Adder ─────────────────────────────────────────────────────────────
  halfAdder: {
    label    : "Half Adder",
    category : "combinational",
    design   : `\`timescale 1ns / 1ps

module half_adder (
    input  wire a,
    input  wire b,
    output wire sum,
    output wire carry
);
    assign sum   = a ^ b;
    assign carry = a & b;
endmodule
`,
    testbench: `\`timescale 1ns / 1ps

module tb_half_adder;
    reg  a, b;
    wire sum, carry;

    half_adder dut (.a(a), .b(b), .sum(sum), .carry(carry));

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_half_adder);
    end

    integer errors = 0;

    task check;
        input exp_sum, exp_carry;
        begin
            #1;
            if (sum !== exp_sum || carry !== exp_carry) begin
                $display("FAIL a=%b b=%b | sum=%b (exp %b) carry=%b (exp %b)",
                         a, b, sum, exp_sum, carry, exp_carry);
                errors = errors + 1;
            end else begin
                $display("PASS a=%b b=%b => sum=%b carry=%b", a, b, sum, carry);
            end
        end
    endtask

    initial begin
        $display("=== Half Adder Test ===");
        a=0; b=0; check(0, 0);
        a=0; b=1; check(1, 0);
        a=1; b=0; check(1, 0);
        a=1; b=1; check(0, 1);
        if (errors == 0) $display("ALL TESTS PASSED");
        else             $display("TESTS FAILED");
        $finish;
    end
endmodule
`,
  },

  // ── Full Adder ─────────────────────────────────────────────────────────────
  fullAdder: {
    label    : "Full Adder",
    category : "combinational",
    design   : `\`timescale 1ns / 1ps

module full_adder (
    input  wire a,
    input  wire b,
    input  wire cin,
    output wire sum,
    output wire cout
);
    assign {cout, sum} = a + b + cin;
endmodule
`,
    testbench: `\`timescale 1ns / 1ps

module tb_full_adder;
    reg  a, b, cin;
    wire sum, cout;

    full_adder dut (.a(a), .b(b), .cin(cin), .sum(sum), .cout(cout));

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_full_adder);
    end

    integer errors = 0;
    integer i;
    reg [1:0] expected;   // declared at module scope — Verilog-2001 compatible

    initial begin
        $display("=== Full Adder Test ===");
        for (i = 0; i < 8; i = i + 1) begin
            {a, b, cin} = i[2:0];
            #5;
            expected = a + b + cin;
            if ({cout, sum} !== expected) begin
                $display("FAIL a=%b b=%b cin=%b | got %b%b exp %b%b",
                         a, b, cin, cout, sum, expected[1], expected[0]);
                errors = errors + 1;
            end else
                $display("PASS a=%b b=%b cin=%b => cout=%b sum=%b", a, b, cin, cout, sum);
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        else             $display("TESTS FAILED");
        $finish;
    end
endmodule
`,
  },

  // ── D Flip-Flop ────────────────────────────────────────────────────────────
  dFlipFlop: {
    label    : "D Flip-Flop",
    category : "sequential",
    design   : `\`timescale 1ns / 1ps

module d_flip_flop (
    input  wire clk,
    input  wire rst,   // synchronous active-high reset
    input  wire d,
    output reg  q
);
    always @(posedge clk) begin
        if (rst)
            q <= 1'b0;
        else
            q <= d;
    end
endmodule
`,
    testbench: `\`timescale 1ns / 1ps

module tb_dff;
    reg  clk, rst, d;
    wire q;

    d_flip_flop dut (.clk(clk), .rst(rst), .d(d), .q(q));

    initial clk = 0;
    always  #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_dff);
    end

    integer errors = 0;

    initial begin
        $display("=== D Flip-Flop Test ===");
        rst = 1; d = 0;
        @(posedge clk); #1;
        if (q !== 0) begin $display("FAIL reset"); errors = errors + 1; end
        else              $display("PASS reset q=%b", q);

        rst = 0; d = 1;
        @(posedge clk); #1;
        if (q !== 1) begin $display("FAIL d=1 capture"); errors = errors + 1; end
        else              $display("PASS d=1 q=%b", q);

        d = 0;
        @(posedge clk); #1;
        if (q !== 0) begin $display("FAIL d=0 capture"); errors = errors + 1; end
        else              $display("PASS d=0 q=%b", q);

        if (errors == 0) $display("ALL TESTS PASSED");
        else             $display("TESTS FAILED");
        $finish;
    end
endmodule
`,
  },

  // ── 4-bit Counter ──────────────────────────────────────────────────────────
  counter4bit: {
    label    : "4-bit Counter",
    category : "sequential",
    design   : `\`timescale 1ns / 1ps

module counter #(
    parameter WIDTH = 4
)(
    input  wire             clk,
    input  wire             rst,
    input  wire             en,
    output reg  [WIDTH-1:0] count
);
    always @(posedge clk) begin
        if (rst)
            count <= {WIDTH{1'b0}};
        else if (en)
            count <= count + 1'b1;
    end
endmodule
`,
    testbench: `\`timescale 1ns / 1ps

module tb_counter;
    reg        clk;
    reg        rst;
    reg        en;
    wire [3:0] count;

    counter #(.WIDTH(4)) dut (
        .clk(clk), .rst(rst), .en(en), .count(count)
    );

    initial clk = 0;
    always  #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_counter);
    end

    initial begin
        $display("=== Counter Test Start ===");
        rst = 1; en = 0;
        repeat(3) @(posedge clk);

        rst = 0; en = 1;
        repeat(20) @(posedge clk);

        $display("Final count: %0d", count);
        $display("=== Test Complete ===");
        $finish;
    end
endmodule
`,
  },

  // ── FSM Skeleton ───────────────────────────────────────────────────────────
  fsmSkeleton: {
    label    : "FSM Skeleton",
    category : "fsm",
    design   : `\`timescale 1ns / 1ps

// Moore FSM skeleton — 4-state sequence detector
// Detects input sequence: 1 → 0 → 1 (overlapping), output depends on state only
// Extend by adding states and transitions.
module fsm (
    input  wire clk,
    input  wire rst,
    input  wire in,
    output reg  detected
);
    // ── State encoding ────────────────────────────────────────────────────
    localparam S_IDLE  = 2'b00;   // waiting for first '1'
    localparam S_GOT1  = 2'b01;   // saw '1', waiting for '0'
    localparam S_GOT10 = 2'b10;   // saw '10', waiting for '1'
    localparam S_FOUND = 2'b11;   // saw '101': detected

    reg [1:0] state, next_state;

    // ── State register ────────────────────────────────────────────────────
    always @(posedge clk) begin
        if (rst) state <= S_IDLE;
        else     state <= next_state;
    end

    // ── Next-state logic ──────────────────────────────────────────────────
    always @(*) begin
        case (state)
            S_IDLE : next_state = in ? S_GOT1  : S_IDLE;
            S_GOT1 : next_state = in ? S_GOT1  : S_GOT10;
            S_GOT10: next_state = in ? S_FOUND : S_IDLE;
            S_FOUND: next_state = in ? S_GOT1  : S_GOT10;   // the last '1' can start the next match
            default: next_state = S_IDLE;
        endcase
    end

    // ── Output logic (Moore: from the state alone) ────────────────────────
    always @(*) begin
        detected = (state == S_FOUND);
    end
endmodule
`,
    testbench: `\`timescale 1ns / 1ps

module tb_fsm;
    reg  clk, rst, in;
    wire detected;

    fsm dut (.clk(clk), .rst(rst), .in(in), .detected(detected));

    initial clk = 0;
    always  #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_fsm);
    end

    task send_bit;
        input b;
        begin
            in = b;
            @(posedge clk);
            #1;
            $display("in=%b state → detected=%b", b, detected);
        end
    endtask

    initial begin
        $display("=== FSM Sequence Detector 1-0-1 ===");
        rst = 1; in = 0;
        @(posedge clk); #1;
        rst = 0;

        // Send sequence 1-0-1 (should detect)
        send_bit(1);
        send_bit(0);
        send_bit(1);
        if (detected) $display("PASS sequence 1-0-1 detected");
        else          $display("FAIL sequence 1-0-1 not detected");

        // Send 1-1 (should NOT detect)
        send_bit(1);
        send_bit(1);
        if (!detected) $display("PASS 1-1 not detected");
        else           $display("FAIL 1-1 incorrectly detected");

        $finish;
    end
endmodule
`,
  },

  // ── Board demo ─────────────────────────────────────────────────────────────
  boardDemo: {
    label    : "Board demo: counter on 7-segment",
    category : "sequential",
    design   : `\`timescale 1ns / 1ps

// Board demo: click "Board" in the toolbar to run this on a virtual board.
//   clk      -> Step / Run       rst      -> reset button
//   btn_down -> hold to count down        sw[1:0]  -> step size 1..4
//   seg      -> 7-segment digit (seg[0]=a ... seg[6]=g, 1 = lit)
//   count, led -> LED rows
module board_demo (
    input  wire       clk,
    input  wire       rst,
    input  wire       btn_down,
    input  wire [1:0] sw,
    output reg  [3:0] count,
    output reg  [6:0] seg,
    output wire [7:0] led
);
    wire [3:0] step = {2'b00, sw} + 4'd1;

    always @(posedge clk) begin
        if (rst)           count <= 4'd0;
        else if (btn_down) count <= count - step;
        else               count <= count + step;
    end

    // Hex digit decoder, segments gfedcba
    always @* begin
        case (count)
            4'h0: seg = 7'b0111111;  4'h1: seg = 7'b0000110;
            4'h2: seg = 7'b1011011;  4'h3: seg = 7'b1001111;
            4'h4: seg = 7'b1100110;  4'h5: seg = 7'b1101101;
            4'h6: seg = 7'b1111101;  4'h7: seg = 7'b0000111;
            4'h8: seg = 7'b1111111;  4'h9: seg = 7'b1101111;
            4'hA: seg = 7'b1110111;  4'hB: seg = 7'b1111100;
            4'hC: seg = 7'b0111001;  4'hD: seg = 7'b1011110;
            4'hE: seg = 7'b1111001;  default: seg = 7'b1110001;
        endcase
    end

    // One light chasing along the row
    assign led = 8'b1 << count[2:0];
endmodule
`,
    testbench: `\`timescale 1ns / 1ps

module tb_board_demo;
    reg        clk = 0, rst = 1, btn_down = 0;
    reg  [1:0] sw = 2'd0;
    wire [3:0] count;
    wire [6:0] seg;
    wire [7:0] led;

    board_demo dut (.clk(clk), .rst(rst), .btn_down(btn_down), .sw(sw), .count(count), .seg(seg), .led(led));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_board_demo);
    end

    initial begin
        @(posedge clk); #1 rst = 0;
        repeat (3) begin @(posedge clk); #1 $display("count=%0d seg=%b led=%b", count, seg, led); end
        sw = 2'd1;                       // count by 2
        repeat (2) begin @(posedge clk); #1 $display("count=%0d (by 2)", count); end
        btn_down = 1;                    // and back down
        repeat (2) begin @(posedge clk); #1 $display("count=%0d (down)", count); end
        if (count == 4'd3) $display("PASS"); else $display("FAIL");
        $finish;
    end
endmodule
`,
  },

  // ── UART echo ──────────────────────────────────────────────────────────────
  uartEcho: {
    label    : "Board demo: UART echo (serial terminal)",
    category : "sequential",
    design   : `\`timescale 1ns / 1ps

// UART echo: every byte that arrives on rx is sent straight back on tx.
// Click "Board" and type in its terminal: the design echoes what you type.
//   8 data bits, no parity, 1 stop bit; one bit lasts CLKS_PER_BIT clocks
//   (on a real 12 MHz board, 104 clocks per bit gives 115200 baud).
//   led shows the low 5 bits of the last byte received.
module uart_echo #(parameter CLKS_PER_BIT = 16) (
    input  wire       clk,
    input  wire       rst,
    input  wire       rx,
    output wire       tx,
    output reg  [4:0] led
);
    // ── Receiver ─────────────────────────────────────────────────────────────
    reg [1:0] rx_sync;                     // two flip-flops against metastability
    always @(posedge clk) rx_sync <= {rx_sync[0], rx};
    wire rxd = rx_sync[1];

    reg       rx_busy;
    reg [7:0] rx_count;                    // clocks until the next sample
    reg [3:0] rx_bit;                      // 0 = start bit, 1-8 = data, 9 = stop
    reg [7:0] rx_shift;
    reg [7:0] rx_byte;
    reg       rx_done;                     // one-clock pulse per byte received

    always @(posedge clk) begin
        rx_done <= 1'b0;
        if (rst) begin
            rx_busy <= 1'b0;
        end else if (!rx_busy) begin
            if (!rxd) begin                // line fell: a start bit begins
                rx_busy  <= 1'b1;
                rx_count <= CLKS_PER_BIT / 2;    // sample in the middle of each bit
                rx_bit   <= 4'd0;
            end
        end else if (rx_count != 0) begin
            rx_count <= rx_count - 8'd1;
        end else begin
            rx_count <= CLKS_PER_BIT - 1;
            if (rx_bit == 4'd0) begin
                if (rxd) rx_busy <= 1'b0;  // high again already: only a glitch
                else     rx_bit  <= 4'd1;
            end else if (rx_bit <= 4'd8) begin
                rx_shift <= {rxd, rx_shift[7:1]};   // least significant bit first
                rx_bit   <= rx_bit + 4'd1;
            end else begin                 // stop bit
                rx_busy <= 1'b0;
                if (rxd) begin
                    rx_byte <= rx_shift;
                    rx_done <= 1'b1;
                end
            end
        end
    end

    always @(posedge clk) if (rx_done) led <= rx_byte[4:0];

    // ── Transmitter ──────────────────────────────────────────────────────────
    // The frame is kept inverted, so registers that power up at 0 mean
    // "idle": the line rests high.
    reg [9:0] tx_frame_n;                  // ~{stop, data, start}
    reg [3:0] tx_left;                     // bits still to send
    reg [7:0] tx_count;

    always @(posedge clk) begin
        if (rst) begin
            tx_frame_n <= 10'd0;
            tx_left    <= 4'd0;
        end else if (tx_left == 4'd0) begin
            if (rx_done) begin
                tx_frame_n <= ~{1'b1, rx_byte, 1'b0};
                tx_left    <= 4'd10;
                tx_count   <= CLKS_PER_BIT - 1;
            end
        end else if (tx_count != 0) begin
            tx_count <= tx_count - 8'd1;
        end else begin
            tx_frame_n <= {1'b0, tx_frame_n[9:1]};  // next bit; idle shifts in behind
            tx_left    <= tx_left - 4'd1;
            tx_count   <= CLKS_PER_BIT - 1;
        end
    end

    assign tx = ~tx_frame_n[0];
endmodule
`,
    testbench: `\`timescale 1ns / 1ps

module tb_uart_echo;
    localparam CPB = 16;
    reg clk = 0, rst = 1, rx = 1;
    wire tx;
    wire [4:0] led;
    uart_echo #(.CLKS_PER_BIT(CPB)) dut (.clk(clk), .rst(rst), .rx(rx), .tx(tx), .led(led));
    always #5 clk = ~clk;

    // Send one byte on rx: start bit, 8 data bits (LSB first), stop bit.
    task send(input [7:0] b);
        integer i;
        begin
            rx = 0; repeat (CPB) @(posedge clk);
            for (i = 0; i < 8; i = i + 1) begin rx = b[i]; repeat (CPB) @(posedge clk); end
            rx = 1; repeat (CPB) @(posedge clk);
        end
    endtask

    // Receive one byte from tx, sampling each bit in its middle.
    reg [7:0] got;
    integer j;
    task receive;
        begin
            @(negedge tx);
            repeat (CPB / 2) @(posedge clk);
            for (j = 0; j < 8; j = j + 1) begin repeat (CPB) @(posedge clk); got[j] = tx; end
            repeat (CPB) @(posedge clk);
        end
    endtask

    integer k, errors = 0;
    reg [8*5-1:0] msg = "Hello";
    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb_uart_echo);
        repeat (4) @(posedge clk);
        rst = 0;
        for (k = 4; k >= 0; k = k - 1) begin
            fork send(msg[8*k +: 8]); receive; join
            if (got === msg[8*k +: 8]) $display("echoed '%c'", got);
            else begin $display("FAIL: sent %h, got %h", msg[8*k +: 8], got); errors = errors + 1; end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ── Multi-file project ─────────────────────────────────────────────────────
  uartEchoFiles: {
    label    : "Project in several files: UART echo",
    category : "sequential",
    design   : `\`timescale 1ns / 1ps

// A project in several files: the UART echo, split into modules.
//   design.v   the top level: connects the receiver to the transmitter
//   uart_rx.v  serial line in  -> bytes
//   uart_tx.v  bytes           -> serial line out
// Every .v tab is compiled together; add your own with the + button.
module uart_echo #(parameter CLKS_PER_BIT = 16) (
    input  wire       clk,
    input  wire       rst,
    input  wire       rx,
    output wire       tx,
    output reg  [4:0] led
);
    wire [7:0] byte_in;
    wire       byte_valid;

    uart_rx #(.CLKS_PER_BIT(CLKS_PER_BIT)) receiver (
        .clk(clk), .rst(rst), .rx(rx), .data(byte_in), .valid(byte_valid)
    );

    uart_tx #(.CLKS_PER_BIT(CLKS_PER_BIT)) transmitter (
        .clk(clk), .rst(rst), .data(byte_in), .start(byte_valid), .tx(tx), .busy()
    );

    always @(posedge clk) if (byte_valid) led <= byte_in[4:0];
endmodule
`,
    files    : [
      { name: "uart_rx.v", content: `// UART receiver, 8N1: samples the middle of each bit and pulses \`valid\`
// for one clock with the byte in \`data\`.
module uart_rx #(parameter CLKS_PER_BIT = 16) (
    input  wire       clk,
    input  wire       rst,
    input  wire       rx,
    output reg  [7:0] data,
    output reg        valid
);
    reg [1:0] sync;                        // two flip-flops against metastability
    always @(posedge clk) sync <= {sync[0], rx};
    wire line = sync[1];

    reg       busy;
    reg [7:0] count;                       // clocks until the next sample
    reg [3:0] bit_n;                       // 0 = start bit, 1-8 = data, 9 = stop
    reg [7:0] shift;

    always @(posedge clk) begin
        valid <= 1'b0;
        if (rst) begin
            busy <= 1'b0;
        end else if (!busy) begin
            if (!line) begin               // line fell: a start bit begins
                busy  <= 1'b1;
                count <= CLKS_PER_BIT / 2;
                bit_n <= 4'd0;
            end
        end else if (count != 0) begin
            count <= count - 8'd1;
        end else begin
            count <= CLKS_PER_BIT - 1;
            if (bit_n == 4'd0) begin
                if (line) busy  <= 1'b0;   // high again already: only a glitch
                else      bit_n <= 4'd1;
            end else if (bit_n <= 4'd8) begin
                shift <= {line, shift[7:1]};    // least significant bit first
                bit_n <= bit_n + 4'd1;
            end else begin                 // stop bit
                busy <= 1'b0;
                if (line) begin
                    data  <= shift;
                    valid <= 1'b1;
                end
            end
        end
    end
endmodule
` },
      { name: "uart_tx.v", content: `// UART transmitter, 8N1: on \`start\` sends \`data\` (start bit, 8 bits LSB
// first, stop bit), one bit every CLKS_PER_BIT clocks. \`start\` is ignored
// while \`busy\`.
module uart_tx #(parameter CLKS_PER_BIT = 16) (
    input  wire       clk,
    input  wire       rst,
    input  wire [7:0] data,
    input  wire       start,
    output wire       tx,
    output wire       busy
);
    // The frame is kept inverted, so registers that power up at 0 mean
    // "idle": the line rests high.
    reg [9:0] frame_n;                     // ~{stop, data, start}
    reg [3:0] left;                        // bits still to send
    reg [7:0] count;

    always @(posedge clk) begin
        if (rst) begin
            frame_n <= 10'd0;
            left    <= 4'd0;
        end else if (left == 4'd0) begin
            if (start) begin
                frame_n <= ~{1'b1, data, 1'b0};
                left    <= 4'd10;
                count   <= CLKS_PER_BIT - 1;
            end
        end else if (count != 0) begin
            count <= count - 8'd1;
        end else begin
            frame_n <= {1'b0, frame_n[9:1]};    // next bit; idle shifts in behind
            left    <= left - 4'd1;
            count   <= CLKS_PER_BIT - 1;
        end
    end

    assign tx   = ~frame_n[0];
    assign busy = left != 4'd0;
endmodule
` },
    ],
    testbench: `\`timescale 1ns / 1ps

module tb_uart_echo;
    localparam CPB = 16;
    reg clk = 0, rst = 1, rx = 1;
    wire tx;
    wire [4:0] led;
    uart_echo #(.CLKS_PER_BIT(CPB)) dut (.clk(clk), .rst(rst), .rx(rx), .tx(tx), .led(led));
    always #5 clk = ~clk;

    // Send one byte on rx: start bit, 8 data bits (LSB first), stop bit.
    task send(input [7:0] b);
        integer i;
        begin
            rx = 0; repeat (CPB) @(posedge clk);
            for (i = 0; i < 8; i = i + 1) begin rx = b[i]; repeat (CPB) @(posedge clk); end
            rx = 1; repeat (CPB) @(posedge clk);
        end
    endtask

    // Receive one byte from tx, sampling each bit in its middle.
    reg [7:0] got;
    integer j;
    task receive;
        begin
            @(negedge tx);
            repeat (CPB / 2) @(posedge clk);
            for (j = 0; j < 8; j = j + 1) begin repeat (CPB) @(posedge clk); got[j] = tx; end
            repeat (CPB) @(posedge clk);
        end
    endtask

    integer k, errors = 0;
    reg [8*5-1:0] msg = "Hello";
    initial begin
        $dumpfile("dump.vcd");
        $dumpvars(0, tb_uart_echo);
        repeat (4) @(posedge clk);
        rst = 0;
        for (k = 4; k >= 0; k = k - 1) begin
            fork send(msg[8*k +: 8]); receive; join
            if (got === msg[8*k +: 8]) $display("echoed '%c'", got);
            else begin $display("FAIL: sent %h, got %h", msg[8*k +: 8], got); errors = errors + 1; end
        end
        if (errors == 0) $display("ALL TESTS PASSED");
        $finish;
    end
endmodule
`,
  },

  // ── SystemVerilog FSM ──────────────────────────────────────────────────────
  svTrafficLight: {
    label: "SystemVerilog: enum FSM",
    category: "languages",
    design: `\`timescale 1ns / 1ps

// Traffic light in SystemVerilog: logic, enum, always_ff / always_comb, unique case.
module traffic_light (
    input  logic       clk,
    input  logic       rst,
    output logic [2:0] lamps        // {red, yellow, green}
);
    typedef enum logic [1:0] { GREEN, YELLOW, RED } state_t;
    state_t     state, next;
    logic [2:0] timer;

    always_ff @(posedge clk) begin
        if (rst) begin
            state <= RED;
            timer <= '0;
        end else begin
            state <= next;
            timer <= (next == state) ? timer + 3'd1 : '0;
        end
    end

    always_comb begin
        next = state;
        unique case (state)
            GREEN:  if (timer == 3'd4) next = YELLOW;
            YELLOW: if (timer == 3'd1) next = RED;
            RED:    if (timer == 3'd3) next = GREEN;
            default: next = RED;
        endcase
    end

    assign lamps = (state == RED) ? 3'b100 : (state == YELLOW) ? 3'b010 : 3'b001;
endmodule
`,
    testbench: `\`timescale 1ns / 1ps

module tb_traffic_light;
    logic       clk = 0, rst = 1;
    logic [2:0] lamps;

    traffic_light dut (.clk(clk), .rst(rst), .lamps(lamps));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_traffic_light);
        @(negedge clk) rst = 0;
        repeat (16) @(negedge clk) $display("t=%0t lamps(RYG)=%b state=%s", $time, lamps, dut.state.name());
        $finish;
    end
endmodule
`,
  },

  // ── VHDL ───────────────────────────────────────────────────────────────────
  vhdlAlu: {
    label: "VHDL: 4-bit ALU",
    category: "languages",
    designLanguage: "vhdl",
    testbenchLanguage: "vhdl",
    design: `-- 4-bit ALU in VHDL. Run simulates it with GHDL; Synthesize converts it to gates.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity alu4 is
    port (
        a, b : in  std_logic_vector(3 downto 0);
        op   : in  std_logic_vector(1 downto 0);   -- 00 add, 01 sub, 10 and, 11 or
        y    : out std_logic_vector(3 downto 0);
        zero : out std_logic
    );
end entity;

architecture rtl of alu4 is
    signal r : std_logic_vector(3 downto 0);
begin
    with op select r <=
        std_logic_vector(unsigned(a) + unsigned(b)) when "00",
        std_logic_vector(unsigned(a) - unsigned(b)) when "01",
        a and b                                     when "10",
        a or b                                      when others;
    y    <= r;
    zero <= '1' when r = "0000" else '0';
end architecture;
`,
    testbench: `library ieee;
use ieee.std_logic_1164.all;

entity tb_alu4 is
end entity;

architecture sim of tb_alu4 is
    signal a, b, y : std_logic_vector(3 downto 0);
    signal op      : std_logic_vector(1 downto 0);
    signal zero    : std_logic;

    procedure check(got, expected : std_logic_vector; msg : string) is
    begin
        assert got = expected report "FAIL " & msg & ": got " & to_string(got) severity error;
    end procedure;
begin
    dut: entity work.alu4 port map (a => a, b => b, op => op, y => y, zero => zero);

    process begin
        a <= "0101"; b <= "0011";
        op <= "00"; wait for 10 ns; check(y, "1000", "5 + 3");
        op <= "01"; wait for 10 ns; check(y, "0010", "5 - 3");
        op <= "10"; wait for 10 ns; check(y, "0001", "5 and 3");
        op <= "11"; wait for 10 ns; check(y, "0111", "5 or 3");
        b <= "0101"; op <= "01"; wait for 10 ns;
        assert zero = '1' report "FAIL zero flag" severity error;
        report "Done: every check passed unless an error is reported above.";
        wait;                        -- no clock here, so the simulation simply ends
    end process;
end architecture;
`,
  },

  // ── cocotb ─────────────────────────────────────────────────────────────────
  cocotbAdder: {
    label: "cocotb: random adder test (Python)",
    category: "languages",
    testbenchLanguage: "python",
    design: `\`timescale 1ns / 1ps

// 8-bit adder, tested from Python with cocotb (see the testbench).
module adder8 (
    input  wire [7:0] a,
    input  wire [7:0] b,
    input  wire       cin,
    output wire [7:0] sum,
    output wire       cout
);
    assign {cout, sum} = a + b + cin;
endmodule
`,
    testbench: `# cocotb: drive the design from Python and check it against a Python model.
# Allowed imports: cocotb, random, math, itertools.
import random
import cocotb
from cocotb.triggers import Timer


@cocotb.test()
async def random_sums(dut):
    """200 random additions, compared with Python's +."""
    for _ in range(200):
        a, b, cin = random.randrange(256), random.randrange(256), random.randrange(2)
        dut.a.value = a
        dut.b.value = b
        dut.cin.value = cin
        await Timer(1, unit="ns")
        got = (int(dut.cout.value) << 8) | int(dut.sum.value)
        assert got == a + b + cin, f"{a} + {b} + {cin}: got {got}"


@cocotb.test()
async def corner_cases(dut):
    for a, b, cin in [(0, 0, 0), (255, 1, 0), (255, 255, 1), (128, 128, 0)]:
        dut.a.value = a
        dut.b.value = b
        dut.cin.value = cin
        await Timer(1, unit="ns")
        assert int(dut.sum.value) == (a + b + cin) % 256
        assert int(dut.cout.value) == (a + b + cin) // 256
`,
  },

  // ── Formal verification ────────────────────────────────────────────────────
  formalCounter: {
    label: "Formal: prove a BCD counter",
    category: "formal",
    design: `\`timescale 1ns / 1ps

// Decimal (BCD) digit counter. The properties at the bottom are checked by the
// "Prove" button: the solver tries every input sequence, not just your testbench.
module bcd_counter (
    input  wire       clk,
    input  wire       rst,
    input  wire       en,
    output reg  [3:0] digit,
    output wire       carry
);
    always @(posedge clk)
        if (rst)     digit <= 4'd0;
        else if (en) digit <= (digit == 4'd9) ? 4'd0 : digit + 4'd1;

    assign carry = en && (digit == 4'd9);

\`ifdef FORMAL
    // Only the formal tools define FORMAL; simulation skips this block.
    reg past_valid = 1'b0;
    always @(posedge clk) past_valid <= 1'b1;

    always @(*) if (!past_valid) assume(rst);          // start from reset

    always @(posedge clk) if (past_valid) begin
        assert(digit <= 4'd9);                          // never leaves 0..9
        if (!$past(rst) && $past(en) && $past(digit) == 4'd9)
            assert(digit == 4'd0);                      // 9 wraps to 0
        if (!$past(rst) && !$past(en))
            assert(digit == $past(digit));              // holds when disabled
    end

    always @(posedge clk) if (past_valid) cover(carry); // a carry can happen (after reset,
                                                        //  not from a random power-up value)
\`endif
endmodule
`,
    testbench: `\`timescale 1ns / 1ps

module tb_bcd_counter;
    reg clk = 0, rst = 1, en = 0;
    wire [3:0] digit;
    wire       carry;

    bcd_counter dut (.clk(clk), .rst(rst), .en(en), .digit(digit), .carry(carry));

    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_bcd_counter);
        @(negedge clk) begin rst = 0; en = 1; end
        repeat (12) @(negedge clk) $display("digit=%0d carry=%b", digit, carry);
        $display("Now click Prove: try changing 4'd9 to 4'd10 in the design and prove again.");
        $finish;
    end
endmodule
`,
  },

}; // end TEMPLATES

/**
 * Ordered list of template keys for the dropdown menu.
 * Controls display order independently of object key order.
 */
export const TEMPLATE_ORDER: string[] = [
  "halfAdder",
  "fullAdder",
  "dFlipFlop",
  "counter4bit",
  "fsmSkeleton",
  "boardDemo",
  "uartEcho",
  "uartEchoFiles",
  "svTrafficLight",
  "vhdlAlu",
  "cocotbAdder",
  "formalCounter",
];