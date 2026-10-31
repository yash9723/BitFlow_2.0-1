/**
 * lib/arena/protocol.ts — Protocol set for HDL Arena: handshakes, serial links, a register
 * bus and a clock-domain crossing. Reference solutions: private/arena-sets-refs.json.
 */

import type { ArenaProblem } from "./types";
import { CLOCK, check, hiddenTest, TIMESCALE } from "./tb";

const RESET = "reset = 1; @(posedge clk); @(posedge clk); #1; reset = 0;";

const VR_DUT = `reg reset, in_valid, out_ready; reg [7:0] in_data; wire in_ready, out_valid; wire [7:0] out_data;
    valid_ready_register dut (.clk(clk), .reset(reset), .in_valid(in_valid), .in_ready(in_ready), .in_data(in_data),
                              .out_valid(out_valid), .out_ready(out_ready), .out_data(out_data));`;
const UART_DUT = `reg reset, start; reg [7:0] data; wire tx, busy;`;
const APB_DUT = `reg presetn, psel, penable, pwrite; reg [7:0] paddr; reg [31:0] pwdata; wire [31:0] prdata; wire pready, pslverr;
    apb_slave_regs dut (.pclk(clk), .presetn(presetn), .psel(psel), .penable(penable), .pwrite(pwrite), .paddr(paddr),
                        .pwdata(pwdata), .prdata(prdata), .pready(pready), .pslverr(pslverr));
    task apb_idle; begin psel = 0; penable = 0; pwrite = 0; end endtask
    task apb_write(input [7:0] a, input [31:0] d); begin
        psel = 1; penable = 0; pwrite = 1; paddr = a; pwdata = d; @(posedge clk); #1;
        penable = 1; @(posedge clk); #1; apb_idle;
    end endtask`;
const SPI_DUT = `reg reset, sck, cs_n, mosi; reg [7:0] tx_data; wire miso, rx_valid; wire [7:0] rx_data; integer pulses; reg [7:0] last;
    spi_slave dut (.clk(clk), .reset(reset), .sck(sck), .cs_n(cs_n), .mosi(mosi), .miso(miso), .tx_data(tx_data), .rx_data(rx_data), .rx_valid(rx_valid));
    always @(posedge clk) if (rx_valid === 1'b1) begin pulses = pulses + 1; last = rx_data; end
    task half; begin repeat (6) @(posedge clk); #1; end endtask`;
const SPI_INIT = `pulses = 0; sck = 0; cs_n = 1; mosi = 0; tx_data = 8'h00;
        ${RESET}`;
// clk_b is offset by 0.3 ns so its edges never coincide with clk_a's.
const PULSE_DUT = (halfA: string, halfB: string) => `reg clk_a, clk_b, reset, in_pulse; wire out_pulse;
    integer since, seen, run, sent;
    pulse_sync dut (.clk_a(clk_a), .clk_b(clk_b), .reset(reset), .in_pulse(in_pulse), .out_pulse(out_pulse));
    initial clk_a = 0;
    always #${halfA} clk_a = ~clk_a;
    initial begin clk_b = 0; #0.3; forever #${halfB} clk_b = ~clk_b; end
    always @(posedge clk_b) begin
        since = since + 1;
        if (out_pulse === 1'b1) begin
            if (run == 0) begin
                seen = seen + 1;
                ${check("since < 3 || since > 5", "out_pulse came at clk_b edge %0d after the input, want 3 to 5", "since")}
            end
            run = run + 1;
            ${check("run > 1", "out_pulse stayed high for %0d clk_b cycles", "run")}
        end else run = 0;
    end
    task send; begin
        @(posedge clk_a); #0.1; in_pulse = 1;
        @(posedge clk_a); since = 0; sent = sent + 1; #0.1; in_pulse = 0;
    end endtask`;
const PULSE_INIT = `since = 0; seen = 0; run = 0; sent = 0; in_pulse = 0;
        reset = 1; #120; reset = 0;`;

export const PROTOCOL_PROBLEMS: ArenaProblem[] = [
  {
    id: "arena-proto-001", slug: "valid-ready-register", title: "Valid/Ready Pipeline Register",
    category: "Protocol", difficulty: "Easy", tags: ["valid-ready", "handshake", "AXI-stream", "interview"],
    estimatedMin: 15, xpReward: 150,
    statement: `## Valid/Ready Pipeline Register

Put one register stage in a valid/ready stream without losing or repeating data, and without losing throughput.

A word moves on a rising edge when both \`valid\` and \`ready\` are 1 on that interface.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`clk\`, \`reset\` | input | 1 | Rising edge; synchronous reset empties the register |
| \`in_valid\`, \`in_data\` | input | 1, 8 | Upstream offers a word |
| \`in_ready\` | output | 1 | This stage can take it |
| \`out_valid\`, \`out_data\` | output | 1, 8 | This stage offers a word |
| \`out_ready\` | input | 1 | Downstream can take it |

- While \`out_valid\` is 1 and \`out_ready\` is 0, \`out_data\` must not change.
- A full register that is being emptied can load on the same edge, so a steady stream moves one word per clock. This means \`in_ready\` depends on \`out_ready\` combinationally.
- After reset \`out_valid\` is 0.`,
    constraints: ["Never drop, repeat or reorder a word.", "One word per clock when nothing stalls."],
    examples: [
      { input: "in_valid = 1, out_ready = 1 throughout", output: "A new word every clock, one cycle later" },
      { input: "out_ready = 0 with a word held", output: "in_ready = 0 and out_data holds" },
    ],
    starterCode: `${TIMESCALE}
module valid_ready_register (
    input  wire       clk,
    input  wire       reset,
    input  wire       in_valid,
    output wire       in_ready,
    input  wire [7:0] in_data,
    output reg        out_valid,
    input  wire       out_ready,
    output reg  [7:0] out_data
);

    // TODO: in_ready must also go low when the register is full and stalled
    assign in_ready = 1'b1;

    always @(posedge clk) begin
        if (reset) begin
            out_valid <= 1'b0;
            out_data  <= 8'd0;
        end else begin
            // TODO: load on an input handshake; clear out_valid when the word leaves
        end
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_valid_ready_register;
    reg clk, reset, in_valid, out_ready;
    reg [7:0] in_data;
    wire in_ready, out_valid;
    wire [7:0] out_data;

    valid_ready_register dut (.clk(clk), .reset(reset), .in_valid(in_valid), .in_ready(in_ready), .in_data(in_data),
                              .out_valid(out_valid), .out_ready(out_ready), .out_data(out_data));

    initial clk = 0;
    always #5 clk = ~clk;

    always @(posedge clk) if (out_valid && out_ready) $display("out %h", out_data);

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_valid_ready_register);
        reset = 1; in_valid = 0; in_data = 0; out_ready = 1;
        repeat (2) @(posedge clk);
        #1; reset = 0; in_valid = 1; in_data = 8'hA5;
        @(posedge clk); #1; in_data = 8'h5A;
        // TODO: stall out_ready and check nothing is lost
        @(posedge clk); #1; in_valid = 0;
        repeat (3) @(posedge clk);
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-proto-001-01", "Full throughput with no stalls", 25,
        `${CLOCK} ${VR_DUT} integer got; reg [7:0] want;
    always @(posedge clk) if (!reset && out_valid === 1'b1 && out_ready) begin
        ${check("out_data !== want", "got %h want %h", "out_data, want")}
        want = want + 1; got = got + 1;
    end
    always @(posedge clk) if (!reset && in_valid && in_ready === 1'b1) in_data <= #1 in_data + 1;`,
        `got = 0; want = 8'd0; in_valid = 0; in_data = 8'd0; out_ready = 1;
        ${RESET}
        in_valid = 1;
        repeat (40) @(posedge clk);
        #1; ${check("got < 38", "only %0d words in 40 clocks, want one per clock", "got")}`),
      hiddenTest("tc-proto-001-02", "Random stalls: nothing lost, repeated or changed", 55,
        `${CLOCK} ${VR_DUT} reg [7:0] q [0:4095]; integer wr, rd, seed; reg held, took; reg [7:0] held_data;
    always @(posedge clk) if (!reset) begin
        took = in_valid && in_ready === 1'b1;
        if (took) begin q[wr] = in_data; wr = wr + 1; end
        if (out_valid === 1'b1 && out_ready) begin
            ${check("rd >= wr", "a word came out that never went in: %h", "out_data")}
            ${check("out_data !== q[rd]", "word %0d got %h want %h", "rd, out_data, q[rd]")}
            rd = rd + 1;
        end
        if (held) ${check("out_valid !== 1'b1 || out_data !== held_data", "out_data changed during a stall: %h to %h", "held_data, out_data")}
        held = out_valid === 1'b1 && !out_ready; held_data = out_data;
    end`,
        `wr = 0; rd = 0; seed = 7; held = 0; took = 0; held_data = 0; in_valid = 0; in_data = 0; out_ready = 0;
        ${RESET}
        repeat (1500) begin
            @(posedge clk); #1;
            if (!in_valid || took) begin   // an upstream holds its word until it is taken
                in_valid = ($random(seed) & 3) != 0;
                in_data  = $random(seed);
            end
            out_ready = ($random(seed) & 3) != 0;
        end
        in_valid = 0; out_ready = 1;
        repeat (4) @(posedge clk);
        #1; ${check("rd != wr", "%0d words went in and %0d came out", "wr, rd")}
        ${check("wr < 400", "only %0d words moved in 1500 clocks", "wr")}`),
      hiddenTest("tc-proto-001-03", "Reset empties a full register", 20,
        `${CLOCK} ${VR_DUT}`,
        `in_valid = 0; in_data = 8'h3C; out_ready = 0;
        ${RESET}
        ${check("out_valid !== 1'b0", "out_valid=%b after reset", "out_valid")}
        ${check("in_ready !== 1'b1", "an empty register must accept: in_ready=%b", "in_ready")}
        in_valid = 1; @(posedge clk); #1; in_valid = 0;
        ${check("out_valid !== 1'b1 || out_data !== 8'h3C", "word not held: valid=%b data=%h", "out_valid, out_data")}
        ${check("in_ready !== 1'b0", "full and stalled, in_ready=%b", "in_ready")}
        out_ready = 1; #1;
        ${check("in_ready !== 1'b1", "in_ready must follow out_ready when full: %b", "in_ready")}
        out_ready = 0; reset = 1; @(posedge clk); #1; reset = 0;
        ${check("out_valid !== 1'b0", "reset left a word: out_valid=%b", "out_valid")}`),
    ],
  },

  {
    id: "arena-proto-002", slug: "uart-tx-8n1", title: "UART Transmitter (8N1)",
    category: "Protocol", difficulty: "Medium", tags: ["UART", "serial", "FSM", "protocol", "interview"],
    estimatedMin: 25, xpReward: 300,
    statement: `## UART Transmitter (8N1)

Send one byte: a start bit (0), eight data bits least significant first, and a stop bit (1). Every bit lasts \`CLKS_PER_BIT\` clocks.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`CLKS_PER_BIT\` | parameter | | Default 4 |
| \`clk\`, \`reset\` | input | 1 | Rising edge; synchronous reset goes idle |
| \`start\` | input | 1 | 1 for at least one clock starts a frame when idle |
| \`data\` | input | 8 | Sampled on the edge that accepts \`start\` |
| \`tx\` | output | 1 | The line; 1 when idle |
| \`busy\` | output | 1 | 1 during the frame |

**Timing.** On the edge that sees \`start\` while idle, \`tx\` goes to 0 and \`busy\` to 1. Exactly \`10 * CLKS_PER_BIT\` clocks later \`busy\` returns to 0. A \`start\` on any edge after that begins the next frame.

\`start\` while \`busy\` is ignored, and changing \`data\` mid-frame has no effect.`,
    constraints: ["tx and busy must be flip-flop outputs (no glitches on the line).", "Honour the parameter: the tests override it."],
    examples: [
      { input: "data = 8'hA5", output: "tx = 0 | 1 0 1 0 0 1 0 1 | 1", explanation: "A5 is 10100101, sent LSB first." },
    ],
    starterCode: `${TIMESCALE}
module uart_tx #(
    parameter CLKS_PER_BIT = 4
) (
    input  wire       clk,
    input  wire       reset,
    input  wire       start,
    input  wire [7:0] data,
    output reg        tx,
    output reg        busy
);

    always @(posedge clk) begin
        if (reset) begin
            tx   <= 1'b1;
            busy <= 1'b0;
        end else begin
            // TODO: shift out start, 8 data bits (LSB first) and stop,
            // holding each for CLKS_PER_BIT clocks
        end
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_uart_tx;
    reg clk, reset, start;
    reg [7:0] data;
    wire tx, busy;

    uart_tx #(.CLKS_PER_BIT(4)) dut (.clk(clk), .reset(reset), .start(start), .data(data), .tx(tx), .busy(busy));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_uart_tx);
        reset = 1; start = 0; data = 8'hA5;
        @(posedge clk); #1; reset = 0; start = 1;
        @(posedge clk); #1; start = 0;
        repeat (40) begin
            $display("tx=%b busy=%b", tx, busy);
            @(posedge clk); #1;
        end
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-proto-002-01", "Frame shape, every clock, default parameter", 40,
        `${CLOCK} ${UART_DUT} reg [9:0] frame; integer b, c;
    uart_tx dut (.clk(clk), .reset(reset), .start(start), .data(data), .tx(tx), .busy(busy));`,
        `start = 0; data = 8'hA5;
        ${RESET}
        ${check("tx !== 1'b1 || busy !== 1'b0", "idle tx=%b busy=%b", "tx, busy")}
        frame = {1'b1, data, 1'b0};
        start = 1; @(posedge clk); #1; start = 0;
        for (b = 0; b < 10; b = b + 1) for (c = 0; c < 4; c = c + 1) begin
            ${check("tx !== frame[b]", "bit %0d clock %0d: tx=%b want %b", "b, c, tx, frame[b]")}
            ${check("busy !== 1'b1", "busy=%b during bit %0d", "busy, b")}
            @(posedge clk); #1;
        end
        ${check("tx !== 1'b1 || busy !== 1'b0", "after the frame tx=%b busy=%b", "tx, busy")}`),
      hiddenTest("tc-proto-002-02", "start and data are ignored while busy; the next frame starts cleanly", 30,
        `${CLOCK} ${UART_DUT} reg [9:0] frame; integer b, c;
    uart_tx dut (.clk(clk), .reset(reset), .start(start), .data(data), .tx(tx), .busy(busy));`,
        `start = 0; data = 8'h3C;
        ${RESET}
        frame = {1'b1, 8'h3C, 1'b0};
        start = 1; @(posedge clk); #1; start = 0; data = 8'hFF;
        for (b = 0; b < 10; b = b + 1) for (c = 0; c < 4; c = c + 1) begin
            ${check("tx !== frame[b]", "first frame bit %0d: tx=%b want %b", "b, tx, frame[b]")}
            if (b == 3 || b == 7) start = 1; else start = 0;
            data = 8'hFF ^ b[7:0];
            @(posedge clk); #1;
        end
        start = 1; data = 8'h81; frame = {1'b1, 8'h81, 1'b0};
        @(posedge clk); #1; start = 0; data = 8'h00;
        for (b = 0; b < 10; b = b + 1) for (c = 0; c < 4; c = c + 1) begin
            ${check("tx !== frame[b]", "second frame bit %0d: tx=%b want %b", "b, tx, frame[b]")}
            @(posedge clk); #1;
        end
        ${check("busy !== 1'b0", "stuck busy after two frames")}`),
      hiddenTest("tc-proto-002-03", "Honours CLKS_PER_BIT = 7 across data values", 30,
        `${CLOCK} ${UART_DUT} reg [9:0] frame; integer b, c, v;
    uart_tx #(.CLKS_PER_BIT(7)) dut (.clk(clk), .reset(reset), .start(start), .data(data), .tx(tx), .busy(busy));`,
        `start = 0; data = 8'h00;
        ${RESET}
        for (v = 0; v < 256; v = v + 37) begin
            data = v[7:0]; frame = {1'b1, data, 1'b0};
            start = 1; @(posedge clk); #1; start = 0;
            for (b = 0; b < 10; b = b + 1) for (c = 0; c < 7; c = c + 1) begin
                ${check("tx !== frame[b]", "value %h bit %0d clock %0d: tx=%b", "v, b, c, tx")}
                @(posedge clk); #1;
            end
            ${check("busy !== 1'b0", "busy after value %h", "v")}
        end`),
    ],
  },

  {
    id: "arena-proto-003", slug: "apb-slave-regs", title: "APB Register Slave",
    category: "Protocol", difficulty: "Medium", tags: ["APB", "AMBA", "bus", "registers", "protocol", "interview"],
    estimatedMin: 25, xpReward: 300,
    statement: `## APB Register Slave

Build an AMBA APB slave with four 32-bit read/write registers at addresses \`0x00\`, \`0x04\`, \`0x08\` and \`0x0C\`.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`pclk\` | input | 1 | Rising edge |
| \`presetn\` | input | 1 | Active low, sampled on \`pclk\`; clears all registers |
| \`psel\`, \`penable\` | input | 1 | Setup phase: \`psel=1, penable=0\`. Access phase: \`psel=1, penable=1\` |
| \`pwrite\` | input | 1 | 1 write, 0 read |
| \`paddr\` | input | 8 | Byte address |
| \`pwdata\` | input | 32 | Write data |
| \`prdata\` | output | 32 | Read data, valid in the access phase |
| \`pready\` | output | 1 | Always 1: no wait states |
| \`pslverr\` | output | 1 | 1 in the access phase of a bad address |

- A write takes effect only on the rising edge that ends the **access** phase. A setup phase on its own changes nothing.
- A bad address is one above \`0x0C\` or not a multiple of 4. It raises \`pslverr\`, writes nothing, and reads as 0.
- \`pslverr\` is 0 outside the access phase.`,
    constraints: ["Writes only in the access phase.", "pready is always 1."],
    examples: [
      { input: "Write 0xDEADBEEF to 0x08, then read 0x08", output: "prdata = 0xDEADBEEF, pslverr = 0" },
      { input: "Read 0x10", output: "prdata = 0, pslverr = 1" },
      { input: "Write to 0x06", output: "pslverr = 1, and no register changes" },
    ],
    starterCode: `${TIMESCALE}
module apb_slave_regs (
    input  wire        pclk,
    input  wire        presetn,
    input  wire        psel,
    input  wire        penable,
    input  wire        pwrite,
    input  wire [7:0]  paddr,
    input  wire [31:0] pwdata,
    output wire [31:0] prdata,
    output wire        pready,
    output wire        pslverr
);

    reg [31:0] regs [0:3];

    assign pready = 1'b1;

    // TODO: decode paddr, write in the access phase, read, and flag bad addresses
    assign prdata  = 32'd0;
    assign pslverr = 1'b0;

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_apb_slave_regs;
    reg clk, presetn, psel, penable, pwrite;
    reg [7:0] paddr;
    reg [31:0] pwdata;
    wire [31:0] prdata;
    wire pready, pslverr;

    apb_slave_regs dut (.pclk(clk), .presetn(presetn), .psel(psel), .penable(penable), .pwrite(pwrite),
                        .paddr(paddr), .pwdata(pwdata), .prdata(prdata), .pready(pready), .pslverr(pslverr));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_apb_slave_regs);
        presetn = 0; psel = 0; penable = 0; pwrite = 0; paddr = 0; pwdata = 0;
        @(posedge clk); #1; presetn = 1;
        // Write 0xDEADBEEF to 0x08: a setup phase, then an access phase
        psel = 1; pwrite = 1; paddr = 8'h08; pwdata = 32'hDEADBEEF;
        @(posedge clk); #1; penable = 1;
        @(posedge clk); #1; psel = 0; penable = 0;
        // TODO: read it back the same way with pwrite = 0
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-proto-003-01", "Writes and reads all four registers", 35,
        `${CLOCK} ${APB_DUT} integer i; reg [31:0] v;`,
        `apb_idle; paddr = 0; pwdata = 0;
        presetn = 0; @(posedge clk); #1; presetn = 1;
        for (i = 0; i < 4; i = i + 1) apb_write(i * 4, 32'hA5A50000 + i);
        for (i = 3; i >= 0; i = i - 1) begin
            v = 32'hA5A50000 + i;
            psel = 1; penable = 0; pwrite = 0; paddr = i * 4; @(posedge clk); #1;
            penable = 1; #1;
            ${check("pready !== 1'b1", "pready=%b", "pready")}
            ${check("prdata !== v", "read %h got %h want %h", "paddr, prdata, v")}
            ${check("pslverr !== 1'b0", "pslverr=%b on a good read", "pslverr")}
            @(posedge clk); #1; apb_idle;
        end`),
      hiddenTest("tc-proto-003-02", "A setup phase alone writes nothing", 25,
        `${CLOCK} ${APB_DUT}`,
        `apb_idle; paddr = 0; pwdata = 0;
        presetn = 0; @(posedge clk); #1; presetn = 1;
        apb_write(8'h04, 32'h11111111);
        psel = 1; penable = 0; pwrite = 1; paddr = 8'h04; pwdata = 32'h22222222; @(posedge clk); #1; apb_idle; @(posedge clk); #1;
        psel = 0; penable = 1; pwrite = 1; paddr = 8'h04; pwdata = 32'h33333333; @(posedge clk); #1; apb_idle;
        psel = 1; penable = 0; pwrite = 0; paddr = 8'h04; @(posedge clk); #1; penable = 1; #1;
        ${check("prdata !== 32'h11111111", "got %h: a write happened outside the access phase", "prdata")}
        @(posedge clk); #1; apb_idle;`),
      hiddenTest("tc-proto-003-03", "Bad addresses, pslverr and reset", 40,
        `${CLOCK} ${APB_DUT} integer i, a; reg [31:0] rd;`,
        `apb_idle; paddr = 0; pwdata = 0;
        presetn = 0; @(posedge clk); #1; presetn = 1;
        apb_write(8'h00, 32'hCAFE0000);
        for (a = 0; a < 256; a = a + 1) begin
            psel = 1; penable = 0; pwrite = 0; paddr = a[7:0]; @(posedge clk); #1;
            ${check("pslverr !== 1'b0", "pslverr=%b in the setup phase of %h", "pslverr, paddr")}
            penable = 1; #1;
            if (a <= 12 && a % 4 == 0) begin
                ${check("pslverr !== 1'b0", "good address %h flagged", "paddr")}
            end else begin
                ${check("pslverr !== 1'b1", "bad address %h not flagged", "paddr")}
                ${check("prdata !== 32'd0", "bad address %h read %h", "paddr, prdata")}
            end
            @(posedge clk); #1; apb_idle;
        end
        apb_write(8'h02, 32'hBAD0BAD0);
        apb_write(8'h40, 32'hBAD1BAD1);
        for (i = 0; i < 4; i = i + 1) begin
            psel = 1; penable = 0; pwrite = 0; paddr = i * 4; @(posedge clk); #1; penable = 1; #1;
            rd = prdata;
            ${check("rd === 32'hBAD0BAD0 || rd === 32'hBAD1BAD1", "a bad address wrote register %0d", "i")}
            @(posedge clk); #1; apb_idle;
        end
        for (i = 0; i < 4; i = i + 1) apb_write(i * 4, 32'hFFFF0000 + i);
        presetn = 0; @(posedge clk); #1; presetn = 1;
        for (i = 0; i < 4; i = i + 1) begin
            psel = 1; penable = 0; pwrite = 0; paddr = i * 4; @(posedge clk); #1; penable = 1; #1;
            ${check("prdata !== 32'd0", "reset left register %0d at %h", "i, prdata")}
            @(posedge clk); #1; apb_idle;
        end`),
    ],
  },

  {
    id: "arena-proto-004", slug: "spi-slave-mode0", title: "SPI Slave (Mode 0)",
    category: "Protocol", difficulty: "Medium", tags: ["SPI", "serial", "edge-detect", "protocol", "interview"],
    estimatedMin: 30, xpReward: 300,
    statement: `## SPI Slave (Mode 0)

Build an SPI mode 0 slave that runs on a fast system clock and watches \`sck\` as an ordinary input. Bytes go most significant bit first.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`clk\`, \`reset\` | input | 1 | System clock (rising edge); synchronous reset |
| \`sck\` | input | 1 | SPI clock, idle low; each phase lasts at least 6 \`clk\` cycles |
| \`cs_n\` | input | 1 | Active-low select |
| \`mosi\` | input | 1 | Data in; sampled at \`sck\` rising |
| \`miso\` | output | 1 | Data out; changes after \`sck\` falling |
| \`tx_data\` | input | 8 | Byte to send; loaded when \`cs_n\` falls and after each full byte |
| \`rx_data\` | output | 8 | Last byte received |
| \`rx_valid\` | output | 1 | One \`clk\` pulse per byte, with \`rx_data\` valid during it |

- \`miso\` must show bit 7 within 5 \`clk\` cycles of \`cs_n\` falling, and each later bit within 5 \`clk\` cycles of \`sck\` falling.
- \`rx_valid\` must pulse within 5 \`clk\` cycles of the 8th \`sck\` rising edge.
- \`cs_n\` rising mid-byte throws away the partial byte; the next select starts from bit 7 again.

Don't clock flip-flops with \`sck\`. Detect its edges from \`clk\`; a two-flop synchroniser on the inputs is the right habit and the timing above allows for it.`,
    constraints: ["Everything is clocked by clk.", "Exactly one rx_valid pulse per complete byte."],
    examples: [
      { input: "cs_n low, mosi sends 0xA5 over 8 sck cycles", output: "rx_data = 0xA5 with one rx_valid pulse" },
    ],
    starterCode: `${TIMESCALE}
module spi_slave (
    input  wire       clk,
    input  wire       reset,
    input  wire       sck,
    input  wire       cs_n,
    input  wire       mosi,
    output wire       miso,
    input  wire [7:0] tx_data,
    output reg  [7:0] rx_data,
    output reg        rx_valid
);

    // TODO: synchronise sck, cs_n and mosi; detect sck edges;
    // shift mosi in on rising and tx out on falling

    assign miso = 1'b0;

    always @(posedge clk) begin
        if (reset) begin
            rx_data  <= 8'd0;
            rx_valid <= 1'b0;
        end
    end

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_spi_slave;
    reg clk, reset, sck, cs_n, mosi;
    reg [7:0] tx_data, send;
    wire miso, rx_valid;
    wire [7:0] rx_data;
    integer i;

    spi_slave dut (.clk(clk), .reset(reset), .sck(sck), .cs_n(cs_n), .mosi(mosi), .miso(miso),
                   .tx_data(tx_data), .rx_data(rx_data), .rx_valid(rx_valid));

    initial clk = 0;
    always #5 clk = ~clk;

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_spi_slave);
        reset = 1; sck = 0; cs_n = 1; mosi = 0; tx_data = 8'h3C; send = 8'hA5;
        repeat (2) @(posedge clk);
        #1; reset = 0; cs_n = 0;
        repeat (6) @(posedge clk);
        for (i = 7; i >= 0; i = i - 1) begin
            #1; mosi = send[i]; $display("miso=%b", miso);
            repeat (6) @(posedge clk);
            #1; sck = 1;
            repeat (6) @(posedge clk);
            #1; sck = 0;
            repeat (6) @(posedge clk);
        end
        $display("rx_data=%h rx_valid=%b", rx_data, rx_valid);
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-proto-004-01", "Receives bytes MSB first, one pulse each", 40,
        `${CLOCK} ${SPI_DUT} integer i, k; reg [7:0] send;`,
        `${SPI_INIT}
        cs_n = 0; half;
        for (k = 0; k < 8; k = k + 1) begin
            send = 8'h5A + k * 8'h1B;
            for (i = 7; i >= 0; i = i - 1) begin
                mosi = send[i]; half;
                sck = 1; half;
                sck = 0; half;
            end
            ${check("pulses !== k + 1", "byte %0d: %0d rx_valid pulses so far", "k, pulses")}
            ${check("last !== send", "byte %0d: rx_data=%h want %h", "k, last, send")}
        end
        cs_n = 1; half;`),
      hiddenTest("tc-proto-004-02", "Transmits MSB first with correct timing", 35,
        `${CLOCK} ${SPI_DUT} integer i, k; reg [7:0] send;`,
        `${SPI_INIT}
        for (k = 0; k < 4; k = k + 1) begin
            send = 8'hC3 ^ (k * 8'h29);
            tx_data = send; #1;
            cs_n = 0; half;
            for (i = 7; i >= 0; i = i - 1) begin
                ${check("miso !== send[i]", "byte %h bit %0d: miso=%b", "send, i, miso")}
                sck = 1; half;
                ${check("miso !== send[i]", "byte %h bit %0d moved on sck rising: miso=%b", "send, i, miso")}
                sck = 0; half;
            end
            cs_n = 1; half;
        end`),
      hiddenTest("tc-proto-004-03", "A deselect mid-byte throws away the partial byte", 25,
        `${CLOCK} ${SPI_DUT} integer i; reg [7:0] send;`,
        `${SPI_INIT}
        cs_n = 0; half;
        for (i = 0; i < 5; i = i + 1) begin mosi = 1; half; sck = 1; half; sck = 0; half; end
        cs_n = 1; half; half;
        ${check("pulses !== 0", "%0d rx_valid pulses for a partial byte", "pulses")}
        send = 8'h96; tx_data = 8'hE1; #1;
        cs_n = 0; half;
        ${check("miso !== 1'b1", "new select did not restart from bit 7: miso=%b", "miso")}
        for (i = 7; i >= 0; i = i - 1) begin mosi = send[i]; half; sck = 1; half; sck = 0; half; end
        ${check("pulses !== 1", "%0d pulses, want 1", "pulses")}
        ${check("last !== send", "rx_data=%h want %h: the partial bits leaked in", "last, send")}
        cs_n = 1; half;`),
    ],
  },

  {
    id: "arena-proto-005", slug: "pulse-sync-toggle", title: "Pulse Across Clock Domains",
    category: "Protocol", difficulty: "Hard", tags: ["CDC", "synchronizer", "toggle", "metastability", "interview"],
    estimatedMin: 25, xpReward: 450,
    statement: `## Pulse Across Clock Domains

Carry a one-cycle pulse from \`clk_a\` to \`clk_b\`. The clocks are unrelated and either can be the faster one.

A plain two-flop synchroniser fails here: a pulse from a fast clock can fall between the edges of a slow one and vanish, and a pulse from a slow clock turns into many cycles at the other end.

| Port | Direction | Width | Description |
|------|-----------|-------|-------------|
| \`clk_a\`, \`clk_b\` | input | 1 | Rising edges of each domain |
| \`reset\` | input | 1 | Synchronous in both domains; held long enough for both to see it |
| \`in_pulse\` | input | 1 | One \`clk_a\` cycle high |
| \`out_pulse\` | output | 1 | One \`clk_b\` cycle high per input pulse |

**Toggle synchroniser.** A flop in domain A flips on each \`in_pulse\`, so the event becomes a level that can't be missed. Two flops in domain B synchronise that level, and a third compares old and new to make one pulse.

The level must pass through at least two \`clk_b\` flops before it is used: \`out_pulse\` must first read high at the 3rd, 4th or 5th \`clk_b\` rising edge after the \`clk_a\` edge that took \`in_pulse\`.

Pulses are at least 8 cycles of the slower clock apart.`,
    constraints: ["One out_pulse per in_pulse, one clk_b cycle wide, whichever clock is faster.", "At least two clk_b flip-flops before the level is used."],
    examples: [
      { input: "clk_a 10 times faster than clk_b, in_pulse for one clk_a cycle", output: "One out_pulse, one clk_b cycle wide, about three clk_b edges later" },
    ],
    starterCode: `${TIMESCALE}
module pulse_sync (
    input  wire clk_a,
    input  wire clk_b,
    input  wire reset,
    input  wire in_pulse,
    output wire out_pulse
);

    reg toggle_a;
    reg sync1_b, sync2_b, sync3_b;

    // TODO: flip toggle_a on in_pulse (clk_a), pass it through the clk_b flops,
    // and make out_pulse from two of them

    assign out_pulse = 1'b0;

endmodule
`,
    testbenchSkeleton: `${TIMESCALE}module tb_pulse_sync;
    reg clk_a, clk_b, reset, in_pulse;
    wire out_pulse;

    pulse_sync dut (.clk_a(clk_a), .clk_b(clk_b), .reset(reset), .in_pulse(in_pulse), .out_pulse(out_pulse));

    initial clk_a = 0;
    always #2 clk_a = ~clk_a;
    initial clk_b = 0;
    always #11 clk_b = ~clk_b;

    always @(posedge clk_b) if (out_pulse) $display("%0t out_pulse", $time);

    initial begin
        $dumpfile("wave.vcd");
        $dumpvars(0, tb_pulse_sync);
        reset = 1; in_pulse = 0;
        repeat (4) @(posedge clk_b);
        #1; reset = 0;
        @(posedge clk_a); #0.1; in_pulse = 1;
        @(posedge clk_a); #0.1; in_pulse = 0;
        repeat (8) @(posedge clk_b);
        $finish;
    end
endmodule
`,
    hiddenTestcases: [
      hiddenTest("tc-proto-005-01", "Fast to slow: short pulses are not lost", 40,
        PULSE_DUT("2", "11.5"),
        `${PULSE_INIT}
        repeat (12) begin send; repeat (8) @(posedge clk_b); end
        ${check("seen !== sent", "%0d pulses in and %0d out", "sent, seen")}`),
      hiddenTest("tc-proto-005-02", "Slow to fast: one output cycle for one input", 40,
        PULSE_DUT("11.5", "2"),
        `${PULSE_INIT}
        repeat (12) begin send; repeat (8) @(posedge clk_a); end
        ${check("seen !== sent", "%0d pulses in and %0d out", "sent, seen")}`),
      hiddenTest("tc-proto-005-03", "Similar clocks, no spurious output, reset is quiet", 20,
        PULSE_DUT("5", "6.5"),
        `${PULSE_INIT}
        repeat (12) @(posedge clk_b);
        ${check("seen !== 0", "%0d pulses with no input", "seen")}
        repeat (9) begin send; repeat (8) @(posedge clk_b); end
        ${check("seen !== sent", "%0d pulses in and %0d out", "sent, seen")}`),
    ],
  },
];
