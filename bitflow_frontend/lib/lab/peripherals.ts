/**
 * lib/lab/peripherals.ts — the Board Lab's add-on parts, simulated cycle by cycle next to the
 * design (used by both the grader, lib/lab/run.ts Tester, and the live board, LabLesson):
 *   buzz                      1-bit output: a buzzer; its pitch is how often it toggles
 *   servo                     1-bit output: a hobby servo; a 1–2 ms high pulse sets 0–180°
 *   sr_data, sr_clk, sr_latch outputs to a 74HC595 shift register driving 8 LEDs
 *   row[3:0] → col[3:0]       a 4×4 keypad: drive one row low, a pressed key pulls its column low
 * Self-check: scripts/lab.check.ts.
 */

/** 74HC595: shifts sr_data in on sr_clk rising, copies the 8 bits to its outputs on sr_latch rising. */
export class ShiftRegister595 {
  private shift = 0;
  private clk = 0;
  private latch = 0;
  /** Q7..Q0 as a number: the first bit shifted in ends up in Q7. */
  out = 0;
  step(data: number, clk: number, latch: number) {
    if (clk && !this.clk) this.shift = ((this.shift << 1) | (data & 1)) & 0xff;
    if (latch && !this.latch) this.out = this.shift;
    this.clk = clk; this.latch = latch;
  }
}

/** Keys on a 4×4 keypad, numbered row * 4 + col (0 = top left; the faces are 1 2 3 A / 4 5 6 B / 7 8 9 C / * 0 # D). */
export const KEY_FACES = ["1", "2", "3", "A", "4", "5", "6", "B", "7", "8", "9", "C", "*", "0", "#", "D"];

export class Keypad {
  pressed = new Set<number>();
  /** col[3:0] (active low, pulled up) for the row lines the design drives (row r low = scanning r). */
  cols(rows: number): number {
    let cols = 0xf;
    for (const k of this.pressed) {
      const r = k >> 2, c = k & 3;
      if (!((rows >> r) & 1)) cols &= ~(1 << c);
    }
    return cols;
  }
}

/** A servo's angle from its pulse: measures high pulses on the servo line. */
export class ServoMeter {
  private high = 0;
  private last = 0;
  /** The last complete pulse, in cycles (null until one is seen). */
  pulse: number | null = null;
  sample(level: number) {
    if (level) this.high++;
    else if (this.last) { this.pulse = this.high; this.high = 0; }
    this.last = level;
  }
  /** 1 ms → 0°, 2 ms → 180°, clamped; null without a pulse. */
  angle(hz: number): number | null {
    if (this.pulse === null) return null;
    const ms = (this.pulse / hz) * 1000;
    return Math.max(0, Math.min(180, (ms - 1) * 180));
  }
}
