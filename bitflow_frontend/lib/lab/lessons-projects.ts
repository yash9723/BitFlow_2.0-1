/**
 * lib/lab/lessons-projects.ts — the Board Lab's practical projects (after the basics in
 * lib/lab/lessons.ts): serial, sound, displays and real-world interfaces. The add-on parts
 * (buzzer, servo, shift register, keypad) are simulated by lib/lab/peripherals.ts.
 */
import { KEY_FACES } from "./peripherals";
import type { LabLesson, Tester } from "./run";

const bin = (n: number, w: number) => n.toString(2).padStart(w, "0");
const near = (got: number, want: number, tol = 0.03) => Math.abs(got - want) <= Math.max(1, want * tol);
const SERIAL = { hz: 16_000, params: { CLK_HZ: 16_000, BAUD: 1000 } };
const SOUND = { hz: 32_000 };
const FAST = { hz: 16_000 };
/** Cycles per serial byte at 16 cycles a bit, with some slack. */
const BYTE = 16 * 10 + 20;

/** Rising edges of a 1-bit output over n cycles: its frequency in Hz at `hz`. */
function frequency(t: Tester, port: string, n: number, hz: number) {
  let edges = 0, last = t.get(port);
  t.run(n, () => { const v = t.get(port); if (v && !last) edges++; last = v; });
  return (edges * hz) / n;
}

const UART_TX = `module uart_tx #(parameter CLK_HZ = 27_000_000, BAUD = 115_200) (
  input        clk,
  input        send,       // pulse high for one cycle to send data
  input  [7:0] data,
  output       tx,
  output       busy
);
  localparam CYCLES = CLK_HZ / BAUD;
  reg [9:0]  frame = 0;
  reg [3:0]  bits = 0;
  reg [31:0] timer = 0;
  assign tx = busy ? frame[0] : 1'b1;
  assign busy = bits != 0;
  always @(posedge clk)
    if (!busy && send) begin frame <= {1'b1, data, 1'b0}; bits <= 10; timer <= 0; end
    else if (busy) begin
      if (timer == CYCLES - 1) begin timer <= 0; frame <= {1'b1, frame[9:1]}; bits <= bits - 1; end
      else timer <= timer + 1;
    end
endmodule
`;

const UART_RX = `module uart_rx #(parameter CLK_HZ = 27_000_000, BAUD = 115_200) (
  input            clk,
  input            rx,
  output reg [7:0] data = 0,
  output reg       ready = 0     // high for one cycle when data holds a new byte
);
  localparam CYCLES = CLK_HZ / BAUD;
  reg [31:0] timer = 0;
  reg [3:0]  bit_n = 0;
  reg        busy = 0;
  reg [1:0]  sync_n = 0;   // ~rx: all 0 at power-up reads as an idle (high) line
  always @(posedge clk) begin
    sync_n <= {sync_n[0], ~rx};
    ready <= 0;
    if (!busy) begin
      if (sync_n[1]) begin busy <= 1; timer <= CYCLES / 2; bit_n <= 0; end   // start bit: wait to its middle
    end else if (timer == CYCLES - 1) begin
      timer <= 0;
      if (bit_n == 0) bit_n <= 1;                                            // middle of the start bit
      else if (bit_n <= 8) begin data <= {~sync_n[1], data[7:1]}; bit_n <= bit_n + 1; end
      else begin busy <= 0; ready <= 1; end                                  // the stop bit
    end else timer <= timer + 1;
  end
endmodule
`;

export const PROJECT_LESSONS: LabLesson[] = [
  // ── Serial ───────────────────────────────────────────────────────────────
  {
    slug: "uart-echo",
    title: "Serial echo",
    summary: "Receive bytes on rx and send each one straight back.",
    intro: [
      "Receiving is sending in reverse: wait for the line to drop (the start bit), then read each bit in the middle of its time slot, `CLK_HZ / BAUD` cycles apart, starting with bit 0. After 8 bits comes the stop bit.",
      "Finish `uart_rx` so it raises `ready` for one cycle with the byte in `data`, then wire it to the `uart_tx` from the last serial lesson so every byte you type comes back.",
    ],
    goals: ["Every byte sent comes back", "They come back right, in order (bit 0 first)", "Nothing is sent when nothing arrives"],
    hints: ["Wait `CLK_HZ / BAUD / 2` cycles after the line drops: then you are in the middle of the start bit, and every `CLK_HZ / BAUD` after that is the middle of a data bit.", "Shift each bit in from the top: `data <= {rx, data[7:1]};` puts bit 0 at the bottom after 8 shifts.", "Connect `ready` to `send` and `data` to the transmitter's `data`."],
    ports: { clk: ["input", 1], rx: ["input", 1], tx: ["output", 1] },
    sim: SERIAL,
    starter: `${UART_TX}
module uart_rx #(parameter CLK_HZ = 27_000_000, BAUD = 115_200) (
  input            clk,
  input            rx,
  output reg [7:0] data = 0,
  output reg       ready = 0
);
  localparam CYCLES = CLK_HZ / BAUD;
  // Wait for rx to go low, then sample the middle of each of the 8 data bits.
endmodule

module lab #(parameter CLK_HZ = 27_000_000, BAUD = 115_200) (
  input  clk,
  input  rx,
  output tx
);
  wire [7:0] byte_in;
  wire       got, busy;
  uart_rx #(.CLK_HZ(CLK_HZ), .BAUD(BAUD)) in  (.clk(clk), .rx(rx), .data(byte_in), .ready(got));
  uart_tx #(.CLK_HZ(CLK_HZ), .BAUD(BAUD)) out (.clk(clk), .send(1'b0), .data(8'd0), .tx(tx), .busy(busy));
endmodule
`,
    check(t) {
      t.run(400);
      t.expect(2, t.serial === "", `It sent ${JSON.stringify(t.serial)} with nothing coming in.`);
      t.send("Hi!");
      t.run(BYTE * 5);
      t.expect(0, t.serial.length === 3, t.serial ? `3 bytes went in and ${t.serial.length} came back (${JSON.stringify(t.serial)}).` : "Nothing came back.");
      t.expect(1, t.serial === "Hi!", `"Hi!" came back as ${JSON.stringify(t.serial)}: check the bit order (bit 0 arrives first) and where you sample.`);
      t.run(BYTE * 3);
      t.expect(2, t.serial === "Hi!", `It kept sending: ${JSON.stringify(t.serial)}.`);
    },
  },
  {
    slug: "serial-leds",
    title: "Serial-controlled LEDs",
    summary: "Type a digit 0–5 to switch that LED on or off.",
    intro: [
      "Now the board takes orders. A byte is just a number: the character `'3'` arrives as 51, so subtract `\"0\"` (48) to get the digit.",
      "Each time a digit 0–5 arrives, flip that LED. Ignore anything else, so a newline or a letter does nothing. The receiver is done for you.",
    ],
    goals: ["A digit 0–5 switches its LED", "The same digit again switches it back", "Other characters are ignored"],
    hints: ["`if (got && byte_in >= \"0\" && byte_in <= \"5\") leds[byte_in - \"0\"] <= ~leds[byte_in - \"0\"];`", "Keep the LEDs in a `reg [5:0]` and assign it to `led`."],
    ports: { clk: ["input", 1], rx: ["input", 1], led: ["output", 6] },
    sim: SERIAL,
    starter: `${UART_RX}
module lab #(parameter CLK_HZ = 27_000_000, BAUD = 115_200) (
  input        clk,
  input        rx,
  output [5:0] led
);
  wire [7:0] byte_in;
  wire       got;
  uart_rx #(.CLK_HZ(CLK_HZ), .BAUD(BAUD)) in (.clk(clk), .rx(rx), .data(byte_in), .ready(got));

  reg [5:0] leds = 0;
  // When a digit 0-5 arrives, flip that LED.

  assign led = leds;
endmodule
`,
    check(t) {
      t.send("03"); t.run(BYTE * 3);
      t.expect(0, t.get("led") === 0b001001, `After "03" the LEDs are 6'b${bin(t.get("led"), 6)}; LEDs 0 and 3 should be on.`);
      t.send("3"); t.run(BYTE * 2);
      t.expect(1, t.get("led") === 0b000001, `After "03" then "3" the LEDs are 6'b${bin(t.get("led"), 6)}; only LED 0 should be on.`);
      t.send("x9\n5"); t.run(BYTE * 5);
      t.expect(2, t.get("led") === 0b100001, `After "x9\\n5" the LEDs are 6'b${bin(t.get("led"), 6)}; only "5" should change anything.`);
    },
  },
  {
    slug: "serial-calculator",
    title: "Serial calculator",
    summary: "Send 3+4 and a new line; the board replies 7.",
    intro: [
      "Put receiving and sending together. The board reads a sum like `3+4` followed by a new line, adds the two digits and sends the answer back as text with `\\r\\n`.",
      "The answer can be one digit or two (`9+9` is 18), so send the tens digit only when there is one. A small state machine works well: wait for the first digit, the plus, the second digit, the new line, then send.",
    ],
    goals: ["One-digit answers are right (3+4 → 7)", "Two-digit answers are right (9+8 → 17)", "Each answer ends with \\r\\n"],
    hints: ["Store `a` and `b` as numbers (`byte_in - \"0\"`) and compute `sum = a + b` (0–18).", "To send it: tens is `sum >= 10`, ones is `sum - (tens ? 10 : 0)`, and each digit goes out as `\"0\" + digit`.", "Send one character at a time: pulse `send` when `!busy`, as in Say hello."],
    ports: { clk: ["input", 1], rx: ["input", 1], tx: ["output", 1] },
    sim: SERIAL,
    starter: `${UART_TX}
${UART_RX}
module lab #(parameter CLK_HZ = 27_000_000, BAUD = 115_200) (
  input  clk,
  input  rx,
  output tx
);
  wire [7:0] byte_in;
  wire       got, busy;
  reg        send = 0;
  reg  [7:0] char = 0;
  uart_rx #(.CLK_HZ(CLK_HZ), .BAUD(BAUD)) in  (.clk(clk), .rx(rx), .data(byte_in), .ready(got));
  uart_tx #(.CLK_HZ(CLK_HZ), .BAUD(BAUD)) out (.clk(clk), .send(send), .data(char), .tx(tx), .busy(busy));

  // Read "a+b\\n", then send the sum and "\\r\\n".
endmodule
`,
    check(t) {
      t.send("3+4\n"); t.run(BYTE * 9);
      t.expect(0, t.serial.replace(/\r?\n$/, "") === "7", `"3+4" was answered ${JSON.stringify(t.serial)}.`);
      t.expect(2, /\r\n$/.test(t.serial), `The answer ${JSON.stringify(t.serial)} should end with "\\r\\n".`);
      t.serial = "";
      t.send("9+8\n"); t.run(BYTE * 10);
      t.expect(1, t.serial.replace(/\r?\n$/, "") === "17", `"9+8" was answered ${JSON.stringify(t.serial)}.`);
      t.serial = "";
      t.send("0+0\n"); t.run(BYTE * 9);
      t.expect(0, t.serial.replace(/\r?\n$/, "") === "0", `"0+0" was answered ${JSON.stringify(t.serial)}.`);
    },
  },

  // ── Sound ────────────────────────────────────────────────────────────────
  {
    slug: "beep",
    title: "Beep",
    summary: "A buzzer that plays a 440 Hz note while you hold a button.",
    intro: [
      "A buzzer makes a sound when you switch it on and off quickly; how quickly sets the pitch. The note A is 440 Hz: 440 on-off cycles a second, so the output flips every `CLK_HZ / 880` clock cycles.",
      "Make `buzz` play A while button 0 is held, and stay quiet otherwise. Turn the sound on under the board to hear it (the virtual clock runs at 32 kHz for sound lessons).",
    ],
    goals: ["Silent while the button is up", "440 Hz while button 0 is held"],
    hints: ["A counter that restarts at `CLK_HZ / 880 - 1` and flips a `tone` register each time.", "`assign buzz = btn[0] & tone;`"],
    ports: { clk: ["input", 1], btn: ["input", 2], buzz: ["output", 1] },
    sim: SOUND,
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  input  [1:0] btn,
  output       buzz
);
  reg [31:0] count = 0;
  reg        tone = 0;

  // Flip tone every CLK_HZ / 880 cycles (440 Hz), and only buzz while button 0 is held.

  assign buzz = 1'b0;
endmodule
`,
    check(t) {
      t.run(500);
      t.expect(0, frequency(t, "buzz", 16_000, 32_000) === 0, "The buzzer sounds with no button pressed.");
      t.set("btn", 1); t.run(200);
      const f = frequency(t, "buzz", 32_000, 32_000);
      t.expect(1, near(f, 440), `Holding button 0 plays ${f.toFixed(0)} Hz; it should be 440 Hz.`);
      t.set("btn", 0); t.run(200);
      t.expect(0, frequency(t, "buzz", 16_000, 32_000) === 0, "The buzzer keeps sounding after the button is released.");
    },
  },
  {
    slug: "piano",
    title: "Switch piano",
    summary: "Switches pick a note from C to the next C; the buzzer plays it.",
    intro: [
      "A scale is a list of frequencies: C 262, D 294, E 330, F 349, G 392, A 440, B 494 and the next C 523 Hz. With the switches as a number from 1 to 8, play that note; at 0, play nothing.",
      "Each note needs its own half-period, `CLK_HZ / (2 × frequency)`. A `case` statement that turns the switches into a half-period, feeding the counter from the beep lesson, is all it takes.",
    ],
    goals: ["sw = 0 is silent", "sw = 1–8 plays a note", "Notes are C D E F G A B C, in tune (within 3%)"],
    hints: ["`case (sw) 4'd1: half = CLK_HZ / 524; 4'd2: half = CLK_HZ / 588; ...`", "When the switches change, the counter may already be past the new half-period: restart it when it reaches or passes `half - 1`."],
    ports: { clk: ["input", 1], sw: ["input", 4], buzz: ["output", 1] },
    sim: SOUND,
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  input  [3:0] sw,
  output       buzz
);
  reg [31:0] count = 0;
  reg [31:0] half;
  reg        tone = 0;

  always @(*) begin
    case (sw)
      4'd1:    half = CLK_HZ / 524;   // C 262 Hz
      // 4'd2 ... 4'd8
      default: half = 0;              // silent
    endcase
  end

  // Flip tone every half cycles while half != 0.

  assign buzz = 1'b0;
endmodule
`,
    check(t) {
      const NOTES = [262, 294, 330, 349, 392, 440, 494, 523];
      t.run(200);
      t.expect(0, frequency(t, "buzz", 8000, 32_000) === 0, "sw = 0 should be silent.");
      NOTES.forEach((f0, i) => {
        t.set("sw", i + 1); t.run(400);
        const f = frequency(t, "buzz", 32_000, 32_000);
        t.expect(1, f > 0, `sw = ${i + 1} is silent; it should play ${f0} Hz.`);
        if (f > 0) t.expect(2, near(f, f0), `sw = ${i + 1} plays ${f.toFixed(0)} Hz; it should be ${f0} Hz.`);
      });
    },
  },
  {
    slug: "doorbell",
    title: "Doorbell",
    summary: "One press plays ding (high) then dong (low), then stops.",
    intro: [
      "A press of button 0 starts a little tune: 660 Hz for 0.4 s, then 440 Hz for 0.6 s, then silence until the next press.",
      "That is a state machine (quiet, ding, dong) where each state has a pitch and a length, the same pattern as the traffic light, with the beep's tone generator underneath.",
    ],
    goals: ["Silent until button 0 is pressed", "Ding: 660 Hz for 0.4 s, then dong: 440 Hz for 0.6 s", "It stops by itself after the dong"],
    hints: ["Three states and one timer; the state picks the half-period (`CLK_HZ / 1320` or `CLK_HZ / 880`).", "Start on the button going down, so holding it doesn't restart the tune."],
    ports: { clk: ["input", 1], btn: ["input", 2], buzz: ["output", 1] },
    sim: SOUND,
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  input  [1:0] btn,
  output       buzz
);
  localparam QUIET = 2'd0, DING = 2'd1, DONG = 2'd2;
  reg [1:0]  state = QUIET;
  reg [31:0] timer = 0;   // how long we've been in this state
  reg [31:0] count = 0;   // the tone generator
  reg        tone = 0;
  reg        last = 0;

  // On button 0 going down: DING for 0.4 s, DONG for 0.6 s, then QUIET.

  assign buzz = 1'b0;
endmodule
`,
    check(t) {
      t.run(1000);
      t.expect(0, frequency(t, "buzz", 8000, 32_000) === 0, "It sounds before the button is pressed.");
      t.set("btn", 1); t.run(100); t.set("btn", 0);
      const ding = frequency(t, "buzz", 9600, 32_000);    // 0.003–0.30 s after the press
      t.run(6400);                                        // to 0.50 s
      const dong = frequency(t, "buzz", 8000, 32_000);    // 0.50–0.75 s
      t.run(16_000);                                      // to 1.25 s
      t.expect(1, ding > 0 && near(ding, 660, 0.05), `The first note is ${ding.toFixed(0)} Hz; it should be 660 Hz (ding).`);
      t.expect(1, dong > 0 && near(dong, 440, 0.05), `The second note is ${dong.toFixed(0)} Hz; it should be 440 Hz (dong).`);
      t.expect(2, frequency(t, "buzz", 16_000, 32_000) === 0, "It is still sounding 1.25 s after the press.");
    },
  },

  // ── Displays ─────────────────────────────────────────────────────────────
  {
    slug: "scrolling-text",
    title: "Scrolling text",
    summary: "HELLO marches across the 4-digit display.",
    intro: [
      "The display is only four characters wide, so longer text has to move. Keep the message `HELLO ` (with a space) as six segment patterns and show four of them, starting one further along every quarter second, wrapping round at the end.",
      "This time you drive the segments yourself: `seg3` is the leftmost digit and `seg0` the rightmost, each `[6:0]` with bit 0 the top segment (a). H is `7'h76`, E `7'h79`, L `7'h38`, O `7'h3F`.",
    ],
    goals: ["It shows HELL, then ELLO, LLO␣, …", "It moves on every 0.25 s and wraps around"],
    hints: ["A position counter 0–5 and a function `glyph(i)` returning the pattern for letter `i` of the message.", "`seg3 = glyph(pos)`, `seg2 = glyph(pos + 1 mod 6)`, and so on."],
    ports: { clk: ["input", 1], seg3: ["output", 7], seg2: ["output", 7], seg1: ["output", 7], seg0: ["output", 7] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  output [6:0] seg3, seg2, seg1, seg0   // seg3 is the leftmost digit
);
  reg [31:0] count = 0;
  reg [2:0]  pos = 0;   // which letter is on the left, 0-5

  function [6:0] glyph(input [2:0] i);   // "HELLO "
    case (i)
      3'd0: glyph = 7'h76;   // H
      3'd1: glyph = 7'h79;   // E
      // L, L, O, space
      default: glyph = 7'h00;
    endcase
  endfunction

  // Every CLK_HZ / 4 cycles, move pos on (0..5, then back to 0).

  assign seg3 = glyph(pos);
  assign seg2 = 7'h00;
  assign seg1 = 7'h00;
  assign seg0 = 7'h00;
endmodule
`,
    check(t) {
      const G = [0x76, 0x79, 0x38, 0x38, 0x3f, 0x00];
      const frame = () => ["seg3", "seg2", "seg1", "seg0"].map((p) => t.get(p));
      const want = (k: number) => [0, 1, 2, 3].map((i) => G[(k + i) % 6]);
      const same = (a: number[], b: number[]) => a.every((x, i) => x === b[i]);
      t.run(5);
      const first = frame();
      const k0 = [0, 1, 2, 3, 4, 5].find((k) => same(first, want(k)));
      t.expect(0, k0 !== undefined, `The display shows ${first.map((x) => x.toString(16).padStart(2, "0")).join(" ")}, which isn't four letters of "HELLO ".`);
      if (k0 === undefined) return;
      let last = first, at = 0, k = k0, steps = 0;
      t.run(3200, (c) => {
        const f = frame();
        if (same(f, last)) return;
        k = (k + 1) % 6; steps++;
        t.expect(0, same(f, want(k)), "It jumped to the wrong letters: each step should move the text one letter to the left.");
        if (at) t.expect(1, near(c - at, 250), `A step took ${((c - at) / 1000).toFixed(3)} s; it should take 0.25 s.`);
        last = f; at = c;
      });
      t.expect(1, steps >= 6, `The text moved ${steps} times in 3.2 s; it should move every 0.25 s and keep going round.`);
    },
  },
  {
    slug: "digital-clock",
    title: "Digital clock",
    summary: "Minutes and seconds on the display, with a button to set the minutes.",
    intro: [
      "A clock is the stopwatch counting seconds instead of tenths: `hex3 hex2` are minutes 00–59 and `hex1 hex0` seconds 00–59, carrying from seconds into minutes and wrapping from 59:59 to 00:00.",
      "Clocks need setting: each press of button 0 adds a minute, and button 1 resets to 00:00.",
    ],
    goals: ["Seconds count once a second and carry into minutes", "Button 0 adds a minute", "Button 1 resets to 00:00", "59 minutes wraps back to 00"],
    hints: ["Four digit registers and a one-second timer, like the stopwatch.", "Adding a minute is the same carry as a minute passing: write it once and use it for both."],
    ports: { clk: ["input", 1], btn: ["input", 2], hex3: ["output", 4], hex2: ["output", 4], hex1: ["output", 4], hex0: ["output", 4] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  input  [1:0] btn,     // [0] +1 minute, [1] reset
  output [3:0] hex3, hex2, hex1, hex0   // m m : s s
);
  reg [3:0]  m1 = 0, m0 = 0, s1 = 0, s0 = 0;
  reg [31:0] timer = 0;
  reg [1:0]  last = 0;

  always @(posedge clk) begin
    last <= btn;
    // Count seconds (carry 59 -> 00 into minutes); button 0 adds a minute; button 1 resets.
  end

  assign hex3 = m1; assign hex2 = m0; assign hex1 = s1; assign hex0 = s0;
endmodule
`,
    check(t) {
      const shown = () => `${t.get("hex3")}${t.get("hex2")}:${t.get("hex1")}${t.get("hex0")}`;
      t.run(61_050);
      t.expect(0, shown() === "01:01", `After 61 s the clock shows ${shown()}; it should show 01:01.`);
      t.press("btn", 1);
      t.expect(1, shown().startsWith("02:"), `Button 0 should add a minute, but the clock shows ${shown()}.`);
      t.press("btn", 2);
      t.expect(2, shown() === "00:00", `After button 1 the clock shows ${shown()}; it should show 00:00.`);
      for (let i = 0; i < 59; i++) t.press("btn", 1);
      t.expect(3, shown().startsWith("59:"), `59 presses of button 0 show ${shown()}.`);
      t.press("btn", 1);
      t.expect(3, shown().startsWith("00:"), `One more minute after 59 shows ${shown()}; it should wrap to 00.`);
    },
  },
  {
    slug: "scoreboard",
    title: "Scoreboard",
    summary: "Two players, two buttons, the score in decimal on the display.",
    intro: [
      "Button 0 scores a point for home (`hex3 hex2`), button 1 for away (`hex1 hex0`), each counting 00 to 99 in decimal. Switch 0 resets both to 00.",
      "Two of the same thing is a good reason for a module: write a two-digit decimal counter once and use it twice.",
    ],
    goals: ["Button 0 adds a point for home", "Button 1 adds a point for away", "Scores are shown in decimal and switch 0 resets them"],
    hints: ["A `bcd2` module with `inc`, `reset` and two 4-bit digit outputs.", "Each counter's `inc` is its button going from 0 to 1."],
    ports: { clk: ["input", 1], btn: ["input", 2], sw: ["input", 4], hex3: ["output", 4], hex2: ["output", 4], hex1: ["output", 4], hex0: ["output", 4] },
    starter: `module lab (
  input        clk,
  input  [1:0] btn,      // [0] home scores, [1] away scores
  input  [3:0] sw,       // sw[0] resets both
  output [3:0] hex3, hex2, hex1, hex0   // home (2 digits), away (2 digits)
);
  // Your design here.
  assign {hex3, hex2, hex1, hex0} = 16'h0000;
endmodule
`,
    check(t) {
      const home = () => t.get("hex3") * 10 + t.get("hex2"), away = () => t.get("hex1") * 10 + t.get("hex0");
      t.run(10);
      for (let i = 0; i < 12; i++) t.press("btn", 1);
      t.expect(0, home() === 12, `12 presses of button 0 give home ${home()}.`);
      t.expect(2, t.get("hex3") === 1 && t.get("hex2") === 2, `Home 12 shows as ${t.get("hex3")}${t.get("hex2")}.`);
      for (let i = 0; i < 3; i++) t.press("btn", 2);
      t.expect(1, away() === 3 && home() === 12, `3 presses of button 1 give ${home()} - ${away()}; it should be 12 - 3.`);
      t.set("sw", 1); t.run(5); t.set("sw", 0); t.run(5);
      t.expect(2, home() === 0 && away() === 0, `After switch 0 the score is ${home()} - ${away()}.`);
    },
  },

  // ── Real-world interfaces ───────────────────────────────────────────────
  {
    slug: "breathing-led",
    title: "Breathing LED",
    summary: "An LED that slowly fades up and down, like a sleeping laptop.",
    intro: [
      "PWM sets brightness; changing the PWM's duty slowly makes the light breathe. Run a 6-bit PWM (64 levels) on LED 0, and step its level up one notch at a time to full, then back down to off, so a whole breath takes 2 seconds.",
      "That is 128 steps in 2 s, one every `CLK_HZ / 64` cycles, with a flag that says whether you are going up or down.",
    ],
    goals: ["LED 0 fades from off to full brightness and back", "One breath takes about 2 s"],
    hints: ["`phase` counts 0–63 every cycle; LED 0 is on while `phase < level`.", "Every `CLK_HZ / 64` cycles, move `level` one step in its direction, and turn round at 63 and at 0."],
    ports: { clk: ["input", 1], led: ["output", 6] },
    sim: FAST,
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  output [5:0] led
);
  reg [5:0]  phase = 0;     // the PWM counter
  reg [5:0]  level = 0;     // brightness, 0-63
  reg        up = 1;        // getting brighter?
  reg [31:0] timer = 0;

  always @(posedge clk) begin
    phase <= phase + 1;
    // Every CLK_HZ / 64 cycles, move level one step up or down.
  end

  assign led = {5'b0, phase < level};
endmodule
`,
    check(t) {
      const duty: number[] = [];
      for (let w = 0; w < 50; w++) {   // 50 windows of 0.1 s
        let on = 0;
        t.run(1600, () => { on += t.get("led") & 1; });
        duty.push(on / 1600);
      }
      const max = Math.max(...duty), min = Math.min(...duty);
      t.expect(0, max > 0.85, `LED 0 never got above ${Math.round(max * 100)}% brightness.`);
      t.expect(0, min < 0.1, `LED 0 never went below ${Math.round(min * 100)}% brightness.`);
      // Peaks of brightness, 2 s apart.
      const peaks = duty.map((d, i) => (i > 0 && i < duty.length - 1 && d >= duty[i - 1] && d > duty[i + 1] && d > 0.8 ? i : -1)).filter((i) => i >= 0);
      t.expect(1, peaks.length >= 2, "LED 0 didn't breathe twice in 5 seconds.");
      for (let i = 1; i < peaks.length; i++) t.expect(1, Math.abs(peaks[i] - peaks[i - 1] - 20) <= 2, `A breath took ${((peaks[i] - peaks[i - 1]) / 10).toFixed(1)} s; it should take 2 s.`);
    },
  },
  {
    slug: "servo",
    title: "Drive a servo",
    summary: "Point a hobby servo with the switches.",
    intro: [
      "A hobby servo reads its angle from a pulse sent 50 times a second: 1 ms high means one end, 2 ms the other, 1.5 ms the middle. Between pulses the line is low.",
      "Make `servo` pulse every 20 ms, high for 1 ms plus `sw / 15` of a millisecond, so the switches (0–15) sweep the arm from 0° to 180°. On a real board, wire the servo's signal to the pin `servo` lands on.",
    ],
    goals: ["A pulse every 20 ms", "sw = 0 gives 1 ms, sw = 15 gives 2 ms, in between in steps"],
    hints: ["A counter that restarts every `CLK_HZ / 50` cycles.", "High while the counter is below `CLK_HZ / 1000 + sw * (CLK_HZ / 15000)`."],
    ports: { clk: ["input", 1], sw: ["input", 4], servo: ["output", 1] },
    sim: FAST,
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  input  [3:0] sw,
  output       servo
);
  reg [31:0] count = 0;

  // Count 0 .. CLK_HZ/50 - 1 (20 ms), and keep servo high for 1 ms + sw/15 ms of it.

  assign servo = 1'b0;
endmodule
`,
    check(t) {
      for (const s of [0, 8, 15]) {
        t.set("sw", s); t.run(700);
        const highs: number[] = [], starts: number[] = [];
        let last = t.get("servo"), high = 0, counting = false;
        t.run(1700, (c) => {
          const v = t.get("servo");
          if (v && !last) { starts.push(c); counting = true; high = 0; }
          if (v && counting) high++;
          if (!v && last && counting) { highs.push(high); counting = false; }
          last = v;
        });
        t.expect(0, starts.length >= 4, `With sw = ${s} there were ${starts.length} pulses in 0.106 s; there should be one every 20 ms.`);
        for (let i = 1; i < starts.length; i++) t.expect(0, near(starts[i] - starts[i - 1], 320, 0.02), `With sw = ${s}, pulses came ${((starts[i] - starts[i - 1]) / 16).toFixed(2)} ms apart; they should be 20 ms apart.`);
        const want = 16 + (s * 16) / 15;   // cycles at 16 kHz
        t.expect(1, highs.length > 0, `With sw = ${s} the servo line never pulsed.`);
        for (const h of highs) t.expect(1, Math.abs(h - want) <= 1.5, `With sw = ${s} the pulse is ${(h / 16).toFixed(2)} ms; it should be ${(want / 16).toFixed(2)} ms.`);
      }
    },
  },
  {
    slug: "shift-register",
    title: "Shift register",
    summary: "Drive 8 more LEDs from three pins through a 74HC595.",
    intro: [
      "Pins run out fast. A 74HC595 shift register turns three pins into eight outputs: put a bit on `sr_data` and pulse `sr_clk` to shift it in, eight times, then pulse `sr_latch` to show all eight at once. The first bit you send ends up on the far end, Q7.",
      "Show an 8-bit counter on the register's LEDs, going up by one every quarter second.",
    ],
    goals: ["The register's LEDs show a number that counts up by one", "Four steps a second"],
    hints: ["Send the most significant bit first, so it travels all the way to Q7.", "A small state machine: for each of 8 bits, set `sr_data`, raise `sr_clk`, lower it; then raise and lower `sr_latch`."],
    ports: { clk: ["input", 1], sr_data: ["output", 1], sr_clk: ["output", 1], sr_latch: ["output", 1] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input  clk,
  output sr_data,
  output sr_clk,
  output sr_latch
);
  reg [7:0]  value = 0;
  reg [31:0] timer = 0;
  reg [4:0]  step = 0;     // where we are in sending value
  reg        data = 0, sclk = 0, latch = 0;

  // Every CLK_HZ / 4 cycles: value + 1, then shift it out MSB first and latch.

  assign sr_data = data; assign sr_clk = sclk; assign sr_latch = latch;
endmodule
`,
    check(t) {
      const seen: { at: number; value: number }[] = [];
      let last = t.sr.out;
      t.run(3200, (c) => { if (t.sr.out !== last) { seen.push({ at: c, value: t.sr.out }); last = t.sr.out; } });
      t.expect(0, seen.length >= 3, "The register's LEDs never changed: check you pulse sr_latch after the 8 bits.");
      for (let i = 1; i < seen.length; i++) {
        t.expect(0, seen[i].value === ((seen[i - 1].value + 1) & 0xff), `The register went from 8'b${bin(seen[i - 1].value, 8)} to 8'b${bin(seen[i].value, 8)}: send the most significant bit first.`);
        t.expect(1, near(seen[i].at - seen[i - 1].at, 250), `A step took ${((seen[i].at - seen[i - 1].at) / 1000).toFixed(3)} s; it should take 0.25 s.`);
      }
    },
  },
  {
    slug: "keypad",
    title: "Keypad scanner",
    summary: "Read a 4×4 keypad and show the key on the display.",
    intro: [
      "A keypad is a grid of 4 row wires and 4 column wires; a key joins its row to its column. The columns are pulled high, so drive one row low at a time and see which column goes low: that is the key at that row and column.",
      "Scan the rows over and over, and when a key is down, show it on `hex0`: digits as themselves, A–D as A–D, `*` as E and `#` as F.",
    ],
    goals: ["Digit keys show their digit", "A–D, * and # show A–D, E and F", "Only one row is driven low at a time"],
    hints: ["`row` cycles 4'b1110, 4'b1101, 4'b1011, 4'b0111; a 2-bit counter picks which.", "Look at `col` while a row is driven; a 0 bit is a pressed key. A 16-entry `case` turns row and column into the key's value."],
    ports: { clk: ["input", 1], col: ["input", 4], row: ["output", 4], hex0: ["output", 4] },
    starter: `module lab (
  input        clk,
  input  [3:0] col,      // pulled high; low = a key in the driven row is pressed
  output [3:0] row,      // drive one row low at a time
  output [3:0] hex0
);
  reg [1:0] r = 0;       // the row being scanned
  reg [3:0] key = 0;

  // Keys:  1 2 3 A  (row 0)
  //        4 5 6 B  (row 1)
  //        7 8 9 C  (row 2)
  //        * 0 # D  (row 3, * = E, # = F)
  always @(posedge clk) begin
    // Scan: move r on, and if a column is low, remember the key at (r, that column).
  end

  assign row = 4'b1111;
  assign hex0 = key;
endmodule
`,
    check(t) {
      const value = (face: string) => (face === "*" ? 14 : face === "#" ? 15 : parseInt(face, 16));
      t.run(20);
      let rowsOk = true;
      t.run(40, () => { const r = t.get("row"); if (r !== 0xf && [0xe, 0xd, 0xb, 0x7].indexOf(r) < 0) rowsOk = false; });
      t.expect(2, rowsOk, `row = 4'b${bin(t.get("row"), 4)}: drive exactly one row low at a time.`);
      for (const face of ["5", "1", "9", "0", "A", "D", "*", "#"]) {
        const k = KEY_FACES.indexOf(face);
        t.keypad.pressed.add(k); t.run(60); t.keypad.pressed.delete(k); t.run(10);
        t.expect(/[0-9]/.test(face) ? 0 : 1, t.get("hex0") === value(face), `Pressing ${face} shows ${t.get("hex0").toString(16).toUpperCase()}; it should show ${value(face).toString(16).toUpperCase()}.`);
      }
    },
  },
];
