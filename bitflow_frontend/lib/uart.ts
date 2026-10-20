/**
 * lib/uart.ts — serial (UART, 8N1) framing for the virtual board's terminal.
 * The board samples once per clock cycle, so "cycles per bit" plays the part
 * of the baud rate (a real 12 MHz board at 115200 baud: 104).
 * Self-check: scripts/gate-sim.check.ts.
 */

/** Turns the design's tx line, sampled once per cycle, into bytes. */
export class UartReceiver {
  private state: "waitIdle" | "idle" | "frame" = "waitIdle";
  private count = 0;
  private bit = 0;
  private value = 0;
  constructor(public cyclesPerBit: number) {}

  /** Feed one sample; returns a byte, "error" for a missing stop bit, or null. */
  sample(line: number): number | "error" | null {
    if (this.state === "waitIdle") { if (line) this.state = "idle"; return null; }
    if (this.state === "idle") {
      if (!line) { this.state = "frame"; this.count = Math.floor(this.cyclesPerBit / 2); this.bit = -1; this.value = 0; }
      return null;
    }
    if (--this.count > 0) return null;
    this.count = this.cyclesPerBit;
    if (this.bit === -1) {                       // middle of the start bit
      if (line) this.state = "idle";             // a glitch, not a start bit
      else this.bit = 0;
      return null;
    }
    if (this.bit < 8) { this.value |= (line ? 1 : 0) << this.bit++; return null; }
    this.state = line ? "idle" : "waitIdle";     // stop bit
    return line ? this.value : "error";
  }
}

/** Drives the design's rx line: queued bytes as 8N1 frames, one bit per cyclesPerBit cycles. */
export class UartTransmitter {
  private bits: number[] = [];
  private held = 0;
  private current = 1;
  constructor(public cyclesPerBit: number) {}

  /** Queue bytes; each frame is start, 8 data bits (LSB first), stop, plus one idle bit. */
  send(bytes: Iterable<number>) {
    for (const b of bytes) this.bits.push(0, ...Array.from({ length: 8 }, (_, i) => (b >> i) & 1), 1, 1);
  }

  get busy() { return this.bits.length > 0 || this.held > 0; }

  /** The line level for the next cycle (idle high). */
  next(): number {
    if (this.held === 0) {
      if (!this.bits.length) return 1;
      this.current = this.bits.shift()!;
      this.held = this.cyclesPerBit;
    }
    this.held--;
    return this.current;
  }
}
