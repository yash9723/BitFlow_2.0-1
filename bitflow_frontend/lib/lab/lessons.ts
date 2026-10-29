/**
 * lib/lab/lessons.ts — the Board Lab track: 17 hands-on lessons on the virtual lab board
 * (6 LEDs, 2 buttons, 4 switches, a 4-digit 7-segment display, an RGB LED, a serial port).
 * Each has a starter, goals and a check run on the gate simulator (lib/lab/run.ts).
 * Reference solutions are kept with scripts/lab.check.ts and never ship to the browser.
 * Lessons are written active high (btn = 1 while pressed, led = 1 lights); lib/lab/run.ts
 * boardDesign() flips them for boards that are wired the other way.
 */
import { HEX_SEGS } from "../board-io";
import type { LabLesson, Tester } from "./run";

const bin = (n: number, w: number) => n.toString(2).padStart(w, "0");
const bit = (n: number, i: number) => (n >> i) & 1;
const tenths = (t: Tester) => t.get("hex3") * 600 + t.get("hex2") * 100 + t.get("hex1") * 10 + t.get("hex0");
/** Cycle numbers at which a port's value changed while running n cycles. */
function changes(t: Tester, port: string, n: number, mask = ~0) {
  const out: { at: number; value: number }[] = [];
  let last = t.get(port) & mask;
  t.run(n, (c) => { const v = t.get(port) & mask; if (v !== last) { out.push({ at: c, value: v }); last = v; } });
  return out;
}
const near = (got: number, want: number, tol = 0.03) => Math.abs(got - want) <= Math.max(2, want * tol);

export const LESSONS: LabLesson[] = [
  {
    slug: "light-an-led",
    title: "Light an LED",
    summary: "Your first circuit: drive an output pin high and an LED lights.",
    intro: [
      "An FPGA is a chip full of logic you wire up with code. Each `output` of your module is connected to a pin, and on the lab board pins `led[0]` to `led[5]` drive six LEDs.",
      "`assign` connects an output to a value for good: it is a wire, not a step that runs once. `6'b000001` is a 6-bit number written in binary, and bit 0 is the rightmost.",
    ],
    goals: ["LED 0 is on", "LEDs 1–5 are off"],
    hints: ["Change the value in the `assign` so only the last bit is 1.", "`assign led = 6'b000001;`"],
    ports: { led: ["output", 6] },
    starter: `module lab (
  output [5:0] led
);
  // Turn on LED 0 and leave the others off.
  assign led = 6'b000000;
endmodule
`,
    check(t) {
      t.run(1);
      const l = t.get("led");
      t.expect(0, bit(l, 0) === 1, "LED 0 is off: led[0] should be 1.");
      t.expect(1, l >> 1 === 0, `Only LED 0 should be on, but led = 6'b${bin(l, 6)}.`);
    },
  },
  {
    slug: "button-led",
    title: "Button to LED",
    summary: "Read an input: an LED that lights while you hold a button.",
    intro: [
      "Inputs work the same way the other way round: `btn[0]` is 1 while you press button 0 on the board. Wire it straight to an LED and the LED follows your finger.",
      "`~` flips a bit. Use it to make LED 1 do the opposite of button 1. Click and hold the buttons on the 3D board to try it.",
    ],
    goals: ["LED 0 lights while button 0 is held", "LED 1 lights while button 1 is not held"],
    hints: ["`assign led[0] = btn[0];`", "For LED 1, invert button 1 with `~btn[1]`.", "Give the unused LEDs a value too: `assign led[5:2] = 0;`"],
    ports: { btn: ["input", 2], led: ["output", 6] },
    starter: `module lab (
  input  [1:0] btn,
  output [5:0] led
);
  // LED 0 follows button 0; LED 1 is the opposite of button 1.
  assign led = 6'b000000;
endmodule
`,
    check(t) {
      for (let b = 0; b < 4; b++) {
        t.set("btn", b); t.run(1);
        const l = t.get("led");
        t.expect(0, bit(l, 0) === bit(b, 0), `With button 0 ${bit(b, 0) ? "held" : "released"}, LED 0 is ${bit(l, 0) ? "on" : "off"}.`);
        t.expect(1, bit(l, 1) === 1 - bit(b, 1), `With button 1 ${bit(b, 1) ? "held" : "released"}, LED 1 is ${bit(l, 1) ? "on" : "off"}.`);
      }
    },
  },
  {
    slug: "logic-gates",
    title: "Logic gates on switches",
    summary: "AND, OR, XOR and NOT, one per LED, driven by two switches.",
    intro: [
      "Every digital circuit is built from a few gates. In Verilog they are operators: `&` (AND), `|` (OR), `^` (XOR) and `~` (NOT).",
      "Use switches 0 and 1 as the inputs and put one gate on each of LEDs 0–3. Flip the switches on the board and check each LED against the truth table.",
    ],
    goals: ["LED 0 = sw0 AND sw1", "LED 1 = sw0 OR sw1", "LED 2 = sw0 XOR sw1", "LED 3 = NOT sw0"],
    hints: ["`assign led[0] = sw[0] & sw[1];`", "XOR is 1 when the two inputs differ."],
    ports: { sw: ["input", 4], led: ["output", 6] },
    starter: `module lab (
  input  [3:0] sw,
  output [5:0] led
);
  assign led[0] = 1'b0;   // sw[0] AND sw[1]
  assign led[1] = 1'b0;   // sw[0] OR sw[1]
  assign led[2] = 1'b0;   // sw[0] XOR sw[1]
  assign led[3] = 1'b0;   // NOT sw[0]
  assign led[5:4] = 2'b00;
endmodule
`,
    check(t) {
      const names = ["AND", "OR", "XOR", "NOT"];
      for (let s = 0; s < 4; s++) {
        t.set("sw", s); t.run(1);
        const a = bit(s, 0), b = bit(s, 1), l = t.get("led");
        const want = [a & b, a | b, a ^ b, 1 - a];
        want.forEach((w, g) => t.expect(g, bit(l, g) === w, `${names[g]}: with sw0 = ${a}, sw1 = ${b}, LED ${g} should be ${w}.`));
      }
    },
  },
  {
    slug: "blink",
    title: "Blink",
    summary: "Count clock cycles to make an LED blink twice a second.",
    intro: [
      "The board's clock ticks `CLK_HZ` times a second (27 million on a Tang Nano 9K). A register that counts the ticks can measure time: after `CLK_HZ / 2` ticks, half a second has passed.",
      "`always @(posedge clk)` runs on every tick. Count up, and when the counter reaches the end, start again from 0 and flip the LED.",
      "On the virtual board the clock runs at 1 kHz so you can watch it; on a real board `CLK_HZ` is set to its oscillator.",
    ],
    goals: ["LED 0 blinks", "It changes every half second"],
    hints: ["Use a counter wide enough for `CLK_HZ / 2`: 32 bits is plenty.", "When the counter reaches `CLK_HZ / 2 - 1`, set it to 0 and do `on <= ~on;`."],
    ports: { clk: ["input", 1], led: ["output", 6] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  output [5:0] led
);
  reg [31:0] count = 0;
  reg        on = 0;

  always @(posedge clk) begin
    // Count up; every CLK_HZ / 2 cycles, start again and flip on.
  end

  assign led = {5'b0, on};
endmodule
`,
    check(t) {
      const c = changes(t, "led", 3100, 1);
      t.expect(0, c.length >= 2, "LED 0 never changed in 3 seconds.");
      for (let i = 1; i < c.length; i++) {
        const gap = c[i].at - c[i - 1].at;
        t.expect(1, near(gap, 500), `LED 0 changed after ${(gap / 1000).toFixed(3)} s; it should change every 0.5 s.`);
      }
    },
  },
  {
    slug: "fpga-vs-microcontroller",
    title: "FPGA vs microcontroller",
    summary: "Two LEDs blinking at their own pace: what a circuit does that a processor can't.",
    intro: [
      "An Arduino or an ESP32 is a microcontroller: one processor running your program one instruction after another. To blink two LEDs at different rates it has to take turns, checking one timer, then the other, in a loop.",
      "An FPGA has no program counter. What you write becomes hardware, and every `always` block is its own circuit, running at the same time as all the others. Two blinkers are just two counters side by side, and adding a third doesn't slow the first two down.",
      "The starter already blinks LED 0 twice a second. Add a second, separate counter that makes LED 1 change every 0.15 s.",
    ],
    goals: ["LED 0 still changes every 0.5 s", "LED 1 changes every 0.15 s, on its own"],
    hints: ["Copy the first counter and its `always` block, with new names (`count1`, `on1`).", "`CLK_HZ * 15 / 100` cycles is 0.15 s."],
    ports: { clk: ["input", 1], led: ["output", 6] },
    models: ["mcu-arduino-uno", "mcu-esp32", "mcu-nodemcu"],
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  output [5:0] led
);
  reg [31:0] count0 = 0;
  reg        on0 = 0;
  always @(posedge clk)
    if (count0 == CLK_HZ / 2 - 1) begin count0 <= 0; on0 <= ~on0; end
    else count0 <= count0 + 1;

  // A second counter for LED 1, every 0.15 s: it runs alongside the first.
  reg on1 = 0;

  assign led = {4'b0, on1, on0};
endmodule
`,
    check(t) {
      const c0: number[] = [], c1: number[] = [];
      let last = t.get("led");
      t.run(3200, (c) => { const v = t.get("led"); if ((v ^ last) & 1) c0.push(c); if ((v ^ last) & 2) c1.push(c); last = v; });
      t.expect(0, c0.length >= 2, "LED 0 stopped blinking.");
      for (let i = 1; i < c0.length; i++) t.expect(0, near(c0[i] - c0[i - 1], 500), `LED 0 changed after ${((c0[i] - c0[i - 1]) / 1000).toFixed(3)} s; it should still change every 0.5 s.`);
      t.expect(1, c1.length >= 2, "LED 1 never changed.");
      for (let i = 1; i < c1.length; i++) t.expect(1, near(c1[i] - c1[i - 1], 150), `LED 1 changed after ${((c1[i] - c1[i - 1]) / 1000).toFixed(3)} s; it should change every 0.15 s.`);
    },
  },
  {
    slug: "binary-counter",
    title: "Binary counter",
    summary: "Show a number counting up on six LEDs, four steps a second.",
    intro: [
      "Six LEDs can show any number from 0 to 63 in binary. Keep a 6-bit register, add one to it four times a second and drive the LEDs from it.",
      "When a 6-bit register holding 63 adds one, it wraps around to 0 by itself: the carry falls off the top.",
    ],
    goals: ["The LEDs count up by one each step", "Four steps a second", "It wraps from 63 back to 0"],
    hints: ["Reuse the timer from Blink with `CLK_HZ / 4`.", "`value <= value + 1;` when the timer ends."],
    ports: { clk: ["input", 1], led: ["output", 6] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  output [5:0] led
);
  reg [31:0] count = 0;
  reg [5:0]  value = 0;

  always @(posedge clk) begin
    // Every CLK_HZ / 4 cycles, add one to value.
  end

  assign led = value;
endmodule
`,
    check(t) {
      const c = changes(t, "led", 16_400);
      t.expect(0, c.length > 2, "The LEDs never changed.");
      let prev = 0, wrapped = false;
      c.forEach((x, i) => {
        t.expect(0, x.value === ((prev + 1) & 63), `The LEDs went from ${prev} to ${x.value}; each step should add one.`);
        if (prev === 63 && x.value === 0) wrapped = true;
        if (i > 0) t.expect(1, near(x.at - c[i - 1].at, 250), `A step took ${((x.at - c[i - 1].at) / 1000).toFixed(3)} s; it should take 0.25 s.`);
        prev = x.value;
      });
      t.expect(2, wrapped, "The count never went from 63 back to 0.");
    },
  },
  {
    slug: "seven-segment",
    title: "7-segment decoder",
    summary: "Turn a 4-bit number from the switches into a digit on the display.",
    intro: [
      "A 7-segment digit is seven LEDs named a to g. `seg0[0]` is segment a (the top), going clockwise to f, and `seg0[6]` is g, the middle bar.",
      "A decoder maps each value 0–15 to the segments that draw it. A `case` statement inside `always @(*)` is the natural way to write a lookup table like this. Show 10–15 as A, b, C, d, E and F.",
    ],
    goals: ["Digits 0–9 are drawn right", "A–F are drawn right"],
    hints: ["The digit 1 lights segments b and c: `7'b0000110`.", "0 is `7'b0111111`, 8 is `7'b1111111`.", "Declare the output as `output reg [6:0] seg0` so you can set it in `always @(*)`."],
    ports: { sw: ["input", 4], seg0: ["output", 7] },
    starter: `module lab (
  input      [3:0] sw,
  output reg [6:0] seg0   // bit 0 = a (top) ... bit 6 = g (middle)
);
  always @(*) begin
    case (sw)
      4'h0: seg0 = 7'b0111111;
      // 4'h1 ... 4'hF
      default: seg0 = 7'b0000000;
    endcase
  end
endmodule
`,
    check(t) {
      for (let v = 0; v < 16; v++) {
        t.set("sw", v); t.run(1);
        const s = t.get("seg0");
        t.expect(v < 10 ? 0 : 1, s === HEX_SEGS[v], `For ${v.toString(16).toUpperCase()} the segments are 7'b${bin(s, 7)}; expected 7'b${bin(HEX_SEGS[v], 7)}.`);
      }
    },
  },
  {
    slug: "debounce",
    title: "Debounce a button",
    summary: "Count button presses without the contacts' bounce counting twice.",
    intro: [
      "A real button doesn't close cleanly: its contacts bounce for a few milliseconds, and the FPGA, fast enough to see every bounce, counts one press as several.",
      "The starter counts presses on the LEDs, and it works for a clean press. Fix it so a press only counts once the button has stayed the same for 10 ms (`CLK_HZ / 100` cycles).",
    ],
    goals: ["A clean press adds one", "A bouncy press still adds one", "Holding the button down adds only one"],
    hints: ["Keep a `stable` copy of the button and a timer. While the raw button differs from `stable`, count; when the count reaches `CLK_HZ / 100`, copy it into `stable`.", "Detect the press on `stable` going from 0 to 1, not on the raw button."],
    ports: { clk: ["input", 1], btn: ["input", 2], led: ["output", 6] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  input  [1:0] btn,
  output [5:0] led
);
  reg [5:0] presses = 0;
  reg       last = 0;

  // Counts every rising edge of the raw button: bounces count too.
  always @(posedge clk) begin
    last <= btn[0];
    if (btn[0] && !last) presses <= presses + 1;
  end

  assign led = presses;
endmodule
`,
    check(t) {
      const bounce = (to: number) => { for (let i = 0; i < 7; i++) { t.set("btn", i % 2 === 0 ? to : 1 - to); t.run(1); } t.set("btn", to); };
      let s = t.get("led");
      t.press("btn", 1, 60);
      t.expect(0, t.get("led") === ((s + 1) & 63), `A clean press added ${(t.get("led") - s) & 63}.`);
      s = t.get("led");
      bounce(1); t.run(60); bounce(0); t.run(60);
      t.expect(1, t.get("led") === ((s + 1) & 63), `A bouncy press added ${(t.get("led") - s) & 63}.`);
      s = t.get("led");
      t.set("btn", 1); t.run(600); t.set("btn", 0); t.run(60);
      t.expect(2, t.get("led") === ((s + 1) & 63), `Holding the button added ${(t.get("led") - s) & 63}.`);
    },
  },
  {
    slug: "running-light",
    title: "Running light",
    summary: "One lit LED that runs along the row and wraps around.",
    intro: [
      "Keep the position of the lit LED, 0 to 5, in a register, move it on ten times a second, and decode it: `led = 6'b000001 << pos`.",
      "Registers start at 0 here and on a real FPGA, so starting with a position rather than a pattern means the light is there from the first moment.",
    ],
    goals: ["Exactly one LED is on", "The light moves on every 0.1 s", "It wraps from LED 5 back to LED 0"],
    hints: ["`pos <= (pos == 5) ? 0 : pos + 1;`", "A 3-bit `pos` holds 0–5."],
    ports: { clk: ["input", 1], led: ["output", 6] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  output [5:0] led
);
  reg [31:0] count = 0;
  reg [2:0]  pos = 0;

  always @(posedge clk) begin
    // Every CLK_HZ / 10 cycles, move pos on (0, 1, ... 5, 0, ...).
  end

  assign led = 6'b000001 << pos;
endmodule
`,
    check(t) {
      t.run(1);
      let prev = t.get("led"), last = 0, wrapped = false;
      t.expect(0, prev !== 0 && (prev & (prev - 1)) === 0, `led = 6'b${bin(prev, 6)}: exactly one LED should be on.`);
      t.run(1400, (c) => {
        const l = t.get("led");
        if (l === prev) return;
        t.expect(0, l !== 0 && (l & (l - 1)) === 0, `led = 6'b${bin(l, 6)}: exactly one LED should be on.`);
        t.expect(1, l === (prev === 32 ? 1 : prev << 1), `The light jumped from 6'b${bin(prev, 6)} to 6'b${bin(l, 6)}; it should move to the next LED.`);
        if (last) t.expect(1, near(c - last, 100), `The light moved after ${((c - last) / 1000).toFixed(3)} s; it should move every 0.1 s.`);
        if (prev === 32 && l === 1) wrapped = true;
        prev = l; last = c;
      });
      t.expect(1, last > 0, "The light never moved.");
      t.expect(2, wrapped, "The light never went from LED 5 back to LED 0.");
    },
  },
  {
    slug: "pwm",
    title: "Dim an LED (PWM)",
    summary: "Switch an LED on and off fast to set its brightness from the switches.",
    intro: [
      "An LED can't be half on, but it can be on half the time. Switch it fast enough and your eye sees a dimmer light: that's pulse-width modulation (PWM).",
      "Run a 4-bit counter that goes round and round, and light LED 0 while the counter is below the switches' value. `sw = 0` is off, `sw = 8` is half brightness, `sw = 15` is nearly full.",
    ],
    goals: ["LED 0 is on for sw / 16 of the time", "The pattern repeats every 16 cycles (fast enough not to flicker)"],
    hints: ["`always @(posedge clk) phase <= phase + 1;` with a 4-bit `phase`.", "`assign led[0] = phase < sw;`"],
    ports: { clk: ["input", 1], sw: ["input", 4], led: ["output", 6] },
    sim: { hz: 4000 },
    starter: `module lab (
  input        clk,
  input  [3:0] sw,
  output [5:0] led
);
  reg [3:0] phase = 0;

  // phase counts 0..15 over and over; LED 0 is on while phase < sw.

  assign led = 6'b000000;
endmodule
`,
    check(t) {
      for (const s of [0, 1, 4, 8, 12, 15]) {
        t.set("sw", s); t.run(32);
        let on = 0, run = 0, longest = 0, last = -1;
        t.run(160, () => {
          const b = bit(t.get("led"), 0);
          on += b; run = b === last ? run + 1 : 1; last = b; longest = Math.max(longest, run);
        });
        t.expect(0, Math.abs(on - s * 10) <= 10, `With sw = ${s}, LED 0 was on ${Math.round((on / 160) * 100)}% of the time; it should be ${Math.round((s / 16) * 100)}%.`);
        if (s > 0 && s < 15) t.expect(1, longest <= 16, `With sw = ${s}, LED 0 stayed the same for ${longest} cycles; it should repeat every 16.`);
      }
    },
  },
  {
    slug: "colour-mixer",
    title: "Colour mixer",
    summary: "Mix red, green and blue on an RGB LED, then make it cycle by itself.",
    intro: [
      "An RGB LED is three LEDs in one: `rgb[2]` red, `rgb[1]` green, `rgb[0]` blue. Red and green together look yellow, all three look white.",
      "With switch 3 off, let switches 0–2 pick the colour. With switch 3 on, step through the seven colours by itself, one every quarter second, skipping 0 (off).",
    ],
    goals: ["Switches 0–2 pick the colour", "With switch 3 on, it steps through all 7 colours every 0.25 s"],
    hints: ["Registers start at 0, so count `colour` 0..6 and show `colour + 1`: `colour <= (colour == 6) ? 0 : colour + 1;`", "`assign rgb = sw[3] ? colour + 1 : sw[2:0];`"],
    ports: { clk: ["input", 1], sw: ["input", 4], rgb: ["output", 3] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  input  [3:0] sw,
  output [2:0] rgb     // [2] red, [1] green, [0] blue
);
  reg [31:0] count = 0;
  reg [2:0]  colour = 0;   // 0..6, shown as colour + 1

  // Every CLK_HZ / 4 cycles, step colour through 0..6.

  assign rgb = sw[2:0];
endmodule
`,
    check(t) {
      for (let c = 0; c < 8; c++) {
        t.set("sw", c); t.run(2);
        t.expect(0, t.get("rgb") === c, `With switches 2–0 = ${bin(c, 3)}, rgb is ${bin(t.get("rgb"), 3)}.`);
      }
      t.set("sw", 8); t.run(2);
      const seen = new Set([t.get("rgb")]);
      const c = changes(t, "rgb", 2100);
      c.forEach((x) => seen.add(x.value));
      t.expect(1, !seen.has(0), "The LED went off while cycling; skip colour 0.");
      t.expect(1, seen.size >= 7, `Only ${seen.size} colours turned up in 2 seconds; it should step through all 7.`);
      for (let i = 1; i < c.length; i++) t.expect(1, near(c[i].at - c[i - 1].at, 250), `A colour lasted ${((c[i].at - c[i - 1].at) / 1000).toFixed(3)} s; each should last 0.25 s.`);
    },
  },
  {
    slug: "traffic-light",
    title: "Traffic light",
    summary: "A state machine: green, yellow, red, with a timer for each.",
    intro: [
      "A state machine is a register holding which state you're in, plus rules for moving on. Here the states are GREEN, YELLOW and RED, and each moves on when its time is up: green 3 s, yellow 1 s, red 3 s.",
      "LED 0 is green, LED 1 yellow and LED 2 red. Name your states with `localparam` so the code reads like the rules.",
    ],
    goals: ["One light is on at a time", "Green, then yellow, then red, then green again", "Green 3 s, yellow 1 s, red 3 s"],
    hints: ["A 2-bit `state` and a timer that restarts on every change.", "`case (state) GREEN: if (timer == 3*CLK_HZ - 1) begin state <= YELLOW; timer <= 0; end ...`"],
    ports: { clk: ["input", 1], led: ["output", 6] },
    ledColors: ["#2bff6a", "#ffd23c", "#ff4b3c"],
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  output [5:0] led    // [0] green, [1] yellow, [2] red
);
  localparam GREEN = 2'd0, YELLOW = 2'd1, RED = 2'd2;
  reg [1:0]  state = GREEN;
  reg [31:0] timer = 0;

  always @(posedge clk) begin
    // Move on when the state's time is up: green 3 s, yellow 1 s, red 3 s.
  end

  assign led = {3'b000, state == RED, state == YELLOW, state == GREEN};
endmodule
`,
    check(t) {
      t.run(1);
      const one = (v: number) => [1, 2, 4].includes(v & 7) && v >> 3 === 0;
      t.expect(0, one(t.get("led")), `led = 6'b${bin(t.get("led"), 6)}: exactly one of LEDs 0–2 should be on.`);
      let prev = t.get("led") & 7;
      const c = changes(t, "led", 16_000);
      const next: Record<number, number> = { 1: 2, 2: 4, 4: 1 };
      const want: Record<number, number> = { 1: 3000, 2: 1000, 4: 3000 };
      const name: Record<number, string> = { 1: "Green", 2: "Yellow", 4: "Red" };
      t.expect(1, c.length >= 3, "The lights never changed.");
      c.forEach((x, i) => {
        t.expect(0, one(x.value), `led = 6'b${bin(x.value, 6)}: exactly one of LEDs 0–2 should be on.`);
        t.expect(1, x.value === next[prev], `The lights went from ${name[prev] ?? bin(prev, 3)} to ${name[x.value & 7] ?? bin(x.value, 3)}.`);
        if (i > 0 && want[prev]) t.expect(2, near(x.at - c[i - 1].at, want[prev], 0.01), `${name[prev]} lasted ${((x.at - c[i - 1].at) / 1000).toFixed(2)} s; it should last ${want[prev] / 1000} s.`);
        prev = x.value & 7;
      });
    },
  },
  {
    slug: "stopwatch",
    title: "Stopwatch",
    summary: "Tenths of a second on the display, with start/stop and reset buttons.",
    intro: [
      "Count tenths of a second as decimal digits, one register per digit: `hex0` tenths, `hex1` seconds, `hex2` tens of seconds, `hex3` minutes. When a digit passes 9 (or 5 for tens of seconds), set it to 0 and add one to the next: that's the carry.",
      "Button 0 starts and stops the watch, button 1 resets it to 0000. A button should act once when it goes down, so look for it changing from 0 to 1.",
    ],
    goals: ["Button 0 starts and stops it", "It counts in tenths of a second", "Digits roll over and carry (9 → 0, 59 s → 1 min)", "Button 1 resets it to 0000"],
    hints: ["`wire start = btn[0] && !last[0];` with `last <= btn;` every cycle.", "A timer counts to `CLK_HZ / 10 - 1` while running, then the tenths go up."],
    ports: { clk: ["input", 1], btn: ["input", 2], hex0: ["output", 4], hex1: ["output", 4], hex2: ["output", 4], hex3: ["output", 4] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  input  [1:0] btn,      // [0] start/stop, [1] reset
  output [3:0] hex0,     // tenths
  output [3:0] hex1,     // seconds
  output [3:0] hex2,     // tens of seconds
  output [3:0] hex3      // minutes
);
  reg [3:0]  d0 = 0, d1 = 0, d2 = 0, d3 = 0;
  reg        running = 0;
  reg [1:0]  last = 0;
  reg [31:0] timer = 0;

  always @(posedge clk) begin
    last <= btn;
    // start/stop on button 0 going down, reset on button 1,
    // and count tenths with carries while running.
  end

  assign hex0 = d0; assign hex1 = d1; assign hex2 = d2; assign hex3 = d3;
endmodule
`,
    check(t) {
      t.run(300);
      t.expect(0, tenths(t) === 0, "It counted before button 0 was pressed.");
      t.press("btn", 1);
      t.run(1000);
      const a = tenths(t);
      t.expect(0, a > 0, "Pressing button 0 didn't start it.");
      t.expect(1, a >= 10 && a <= 12, `After 1.1 s it shows ${(a / 10).toFixed(1)} s.`);
      t.press("btn", 1);
      const stopped = tenths(t);
      t.run(500);
      t.expect(0, tenths(t) === stopped, "Pressing button 0 again didn't stop it.");
      t.press("btn", 1);
      let prev = tenths(t);
      t.run(70_000, (c) => {
        if (c % 100) return;
        const digits = ["hex0", "hex1", "hex2", "hex3"].map((d) => t.get(d));
        t.expect(2, digits.every((d) => d <= 9) && digits[2] <= 5, `The display shows ${[...digits].reverse().join("")}: each digit should stay 0–9 (tens of seconds 0–5).`);
        const now = tenths(t);
        t.expect(1, now >= prev, `The time went back from ${prev / 10} s to ${now / 10} s.`);
        prev = now;
      });
      t.expect(2, t.get("hex3") >= 1, "It never reached one minute (59.9 s should carry into hex3).");
      t.press("btn", 1);
      t.press("btn", 2);
      t.expect(3, tenths(t) === 0, `After button 1 it shows ${["hex3", "hex2", "hex1", "hex0"].map((d) => t.get(d)).join("")}; it should show 0000.`);
    },
  },
  {
    slug: "reaction-game",
    title: "Reaction game",
    summary: "Wait for the light, hit the button, see your reaction time.",
    intro: [
      "Press button 0 to start a round: the LEDs go dark, and 2 seconds later LED 5 lights. Hit button 1 as fast as you can, and the display shows how long you took in hundredths of a second (hex2 hex1 hex0, so 034 is 0.34 s).",
      "This is a state machine (waiting, light on, showing the time) with a timer in each state and a decimal counter like the stopwatch's.",
    ],
    goals: ["Button 0 starts a round: LED 5 lights 2 s later", "Button 1 shows the reaction time in hundredths of a second", "The time stays on the display until the next round"],
    hints: ["Three states: IDLE, WAIT (count 2 s), GO (count hundredths until button 1).", "Clear the digits when a round starts."],
    ports: { clk: ["input", 1], btn: ["input", 2], led: ["output", 6], hex0: ["output", 4], hex1: ["output", 4], hex2: ["output", 4] },
    starter: `module lab #(parameter CLK_HZ = 27_000_000) (
  input        clk,
  input  [1:0] btn,      // [0] start, [1] stop
  output [5:0] led,
  output [3:0] hex0, hex1, hex2   // reaction time in hundredths
);
  localparam IDLE = 2'd0, WAIT = 2'd1, GO = 2'd2;
  reg [1:0]  state = IDLE;
  reg [31:0] timer = 0;
  reg [3:0]  d0 = 0, d1 = 0, d2 = 0;
  reg [1:0]  last = 0;

  always @(posedge clk) begin
    last <= btn;
    // IDLE --btn0--> WAIT (2 s) --> GO (count hundredths) --btn1--> IDLE
  end

  assign led = {state == GO, 5'b0};
  assign hex0 = d0; assign hex1 = d1; assign hex2 = d2;
endmodule
`,
    check(t) {
      const shown = () => t.get("hex2") * 100 + t.get("hex1") * 10 + t.get("hex0");
      t.set("btn", 1); t.run(50); t.set("btn", 0); t.run(1900);
      t.expect(0, bit(t.get("led"), 5) === 0, "LED 5 lit before 2 s had passed.");
      t.run(100);
      t.expect(0, bit(t.get("led"), 5) === 1, "LED 5 didn't light 2 s after button 0.");
      t.run(300);
      t.set("btn", 2); t.run(50); t.set("btn", 0); t.run(50);
      const ms = shown();
      t.expect(1, ms >= 33 && ms <= 37, `A 0.35 s reaction shows as ${String(ms).padStart(3, "0")}; it should be about 035.`);
      t.run(1000);
      t.expect(2, shown() === ms, "The time changed after button 1.");
    },
  },
  {
    slug: "dice",
    title: "Dice roller",
    summary: "Roll while you hold the button, land on 1–6 when you let go.",
    intro: [
      "A clock running millions of times a second is a good source of chance: count 1, 2, … 6, 1, … on every cycle while button 0 is held. Nobody can time their release to the cycle, so where it stops is random.",
      "Show the face on `hex0` and keep it still once the button is up.",
    ],
    goals: ["After a roll, hex0 shows 1–6", "All six faces turn up", "The face stays put until the next roll"],
    hints: ["`if (btn[0]) face <= (face == 6) ? 1 : face + 1;`", "Registers start at 0, so the display shows 0 until the first roll. That's fine."],
    ports: { clk: ["input", 1], btn: ["input", 2], hex0: ["output", 4] },
    starter: `module lab (
  input        clk,
  input  [1:0] btn,
  output [3:0] hex0
);
  reg [2:0] face = 0;

  always @(posedge clk) begin
    // While button 0 is held, step face through 1..6.
  end

  assign hex0 = face;
endmodule
`,
    check(t) {
      const faces = new Set<number>();
      for (let i = 0; i < 60; i++) {
        t.set("btn", 1); t.run(5 + ((i * 37) % 91)); t.set("btn", 0); t.run(20);
        const f = t.get("hex0");
        t.expect(0, f >= 1 && f <= 6, `A roll landed on ${f}; it should be 1–6.`);
        faces.add(f);
        t.run(200);
        t.expect(2, t.get("hex0") === f, "The face changed while the button was up.");
      }
      t.expect(1, [1, 2, 3, 4, 5, 6].every((f) => faces.has(f)), `Only ${[...faces].sort().join(", ")} turned up in 60 rolls.`);
    },
  },
  {
    slug: "uart-hello",
    title: "Say hello over serial",
    summary: "Send text to the computer over the USB serial port.",
    intro: [
      "A serial port sends a byte one bit at a time on `tx`: a 0 start bit, 8 data bits starting with bit 0, and a 1 stop bit, each lasting `CLK_HZ / BAUD` cycles. The line rests at 1.",
      "The starter's `uart_tx` sends one byte when you pulse `send` and is `busy` until it's done. Write the part that sends `Hello` and a new line (`\\r\\n`) each time button 0 is pressed. On the virtual board the text appears in the serial terminal; on a real board, open the serial monitor.",
    ],
    goals: ["Pressing button 0 sends Hello", "Each byte is framed right (start bit, 8 data bits, stop bit)", "One message per press, and tx rests at 1"],
    hints: ["Keep an index into the message, 0..6, and a flag that says you're sending.", "When `!busy && !send`, pulse `send` with the next character and move the index on."],
    ports: { clk: ["input", 1], btn: ["input", 2], tx: ["output", 1] },
    sim: { hz: 16_000, params: { CLK_HZ: 16_000, BAUD: 1000 } },
    starter: `module uart_tx #(parameter CLK_HZ = 27_000_000, BAUD = 115_200) (
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
  assign tx = busy ? frame[0] : 1'b1;   // rest high
  assign busy = bits != 0;
  always @(posedge clk) begin
    if (!busy && send) begin
      frame <= {1'b1, data, 1'b0};
      bits  <= 10;
      timer <= 0;
    end else if (busy) begin
      if (timer == CYCLES - 1) begin
        timer <= 0;
        frame <= {1'b1, frame[9:1]};
        bits  <= bits - 1;
      end else timer <= timer + 1;
    end
  end
endmodule

module lab #(parameter CLK_HZ = 27_000_000, BAUD = 115_200) (
  input        clk,
  input  [1:0] btn,
  output       tx
);
  reg        send = 0;
  reg  [7:0] char = 0;
  wire       busy;
  uart_tx #(.CLK_HZ(CLK_HZ), .BAUD(BAUD)) out (.clk(clk), .send(send), .data(char), .tx(tx), .busy(busy));

  // On button 0 going down, send "Hello\\r\\n" one character at a time.
endmodule
`,
    check(t) {
      t.run(300);
      t.expect(2, t.get("tx") === 1, "tx should rest at 1 when nothing is being sent.");
      t.expect(2, t.serial === "", `It sent ${JSON.stringify(t.serial)} before the button was pressed.`);
      t.press("btn", 1, 100);
      t.run(16 * 10 * 8 + 600);
      t.expect(0, t.serial.includes("Hello"), t.serial ? `It sent ${JSON.stringify(t.serial)}.` : "Nothing arrived on the serial port.");
      t.expect(1, t.serial !== "" && t.serialErrors === 0, t.serialErrors ? `${t.serialErrors} byte(s) had a bad stop bit: check the frame is {stop 1, data, start 0} and each bit lasts CLK_HZ / BAUD cycles.` : "No bytes arrived.");
      t.expect(2, /^Hello\r?\n?$/.test(t.serial), `One press sent ${JSON.stringify(t.serial)}; it should send "Hello\\r\\n" once.`);
    },
  },
  {
    slug: "final-project",
    title: "Final project: up/down counter",
    summary: "Put it all together: buttons, a decimal display and binary LEDs.",
    intro: [
      "Build a counter from 00 to 99: button 0 counts up, button 1 counts down, and it wraps both ways (99 → 00 and 00 → 99). Show it in decimal on `hex1 hex0` and in binary on the LEDs.",
      "You've built every piece already: edge detection from the stopwatch, decimal digits with a carry, and LEDs from a register. This time there's no starter logic.",
    ],
    goals: ["Button 0 counts up", "Button 1 counts down", "hex1 hex0 show 00–99 and wrap both ways", "The LEDs show the count in binary"],
    hints: ["Keep the count as one 7-bit number and split it for the display: `hex1 = count / 10`, `hex0 = count % 10`.", "Detect each button going from 0 to 1."],
    ports: { clk: ["input", 1], btn: ["input", 2], led: ["output", 6], hex0: ["output", 4], hex1: ["output", 4] },
    starter: `module lab (
  input        clk,
  input  [1:0] btn,       // [0] up, [1] down
  output [5:0] led,       // the count in binary (low 6 bits)
  output [3:0] hex0,      // ones
  output [3:0] hex1       // tens
);
  // Your design here.
  assign led = 0;
  assign hex0 = 0;
  assign hex1 = 0;
endmodule
`,
    check(t) {
      const shown = () => t.get("hex1") * 10 + t.get("hex0");
      t.run(10);
      for (let i = 0; i < 3; i++) t.press("btn", 1);
      t.expect(0, shown() === 3, `Three presses of button 0 show ${shown()}.`);
      t.press("btn", 2);
      t.expect(1, shown() === 2, `Counting down from 3 shows ${shown()}.`);
      for (let i = 0; i < 3; i++) t.press("btn", 2);
      t.expect(2, shown() === 99, `Counting down past 00 shows ${shown()}; it should wrap to 99.`);
      t.press("btn", 1);
      t.expect(2, shown() === 0, `Counting up past 99 shows ${shown()}; it should wrap to 00.`);
      for (let i = 0; i < 12; i++) t.press("btn", 1);
      t.expect(2, t.get("hex1") === 1 && t.get("hex0") === 2, `12 shows as ${t.get("hex1")}${t.get("hex0")}.`);
      t.expect(3, t.get("led") === 12, `At 12 the LEDs show 6'b${bin(t.get("led"), 6)}.`);
    },
  },
];

export const lessonBySlug = (slug: string) => LESSONS.find((l) => l.slug === slug) ?? null;
export const lessonIndex = (slug: string) => LESSONS.findIndex((l) => l.slug === slug);
