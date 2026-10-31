/**
 * lib/lab/hardware.ts — "Check on my board": what to send a flashed Board Lab design over USB serial
 * and what must come back, the same expectations the lesson's simulated check uses
 * (scripts/lab.check.ts holds them against the reference solutions).
 * Self-check: scripts/hardware.check.ts.
 */
import { topModule } from "./run";

export type HwStep =
  /** Send this text; exactly `reply` must come back. */
  | { kind: "reply"; send: string; reply: string }
  /** Ask the learner to do something on the board; `reply` must arrive. */
  | { kind: "action"; ask: string; reply: string }
  /** The design has no tx, so the learner looks: `leds` is what the LEDs should show. */
  | { kind: "look"; send: string; ask: string; leds: number };

export const HW_CHECKS: Record<string, HwStep[]> = {
  "uart-hello": [{ kind: "action", ask: "Press button 0 on the board.", reply: "Hello" }],
  "uart-echo": [
    { kind: "reply", send: "Hi!", reply: "Hi!" },
    { kind: "reply", send: "BitFlow", reply: "BitFlow" },
  ],
  "serial-leds": [
    { kind: "look", send: "03", ask: "Reset the board first if any LED was on. Are only LEDs 0 and 3 on?", leds: 0b001001 },
    { kind: "look", send: "3", ask: "Is only LED 0 on now?", leds: 0b000001 },
    { kind: "look", send: "x9\n5", ask: "Are only LEDs 0 and 5 on now? The x, the 9 and the new line should do nothing.", leds: 0b100001 },
  ],
  "serial-calculator": [
    { kind: "reply", send: "3+4\n", reply: "7\r\n" },
    { kind: "reply", send: "9+8\n", reply: "17\r\n" },
    { kind: "reply", send: "0+0\n", reply: "0\r\n" },
  ],
};

/** The baud rate a design runs at on a real board: BAUD in its top module (boardDesign only changes CLK_HZ). */
export function labBaud(code: string): number {
  const top = topModule(code);
  const at = top ? code.search(new RegExp(`\\bmodule\\s+${top}\\b`)) : 0;
  const m = /\bBAUD\s*=\s*([0-9][0-9_]*)/.exec(code.slice(Math.max(at, 0)));
  return m ? Number(m[1].replace(/_/g, "")) : 115_200;
}

/** Text with its line endings and other control characters visible, for messages. */
export const visible = (text: string) => JSON.stringify(text);

export interface ReplyOptions { timeoutMs: number; settleMs: number; sleep?: (ms: number) => Promise<void> }
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const POLL_MS = 20;

/**
 * Wait for `want` to arrive in `read()`. `exact`: once enough has arrived, wait a little longer so
 * extra bytes are caught, then it must match. Otherwise it only has to appear (a button can bounce).
 * Returns null when it's right, else what went wrong.
 */
export async function awaitReply(want: string, exact: boolean, read: () => string, options: ReplyOptions): Promise<string | null> {
  const sleep = options.sleep ?? realSleep;
  const found = () => (exact ? read().length >= want.length : read().includes(want));
  for (let waited = 0; waited < options.timeoutMs && !found(); waited += POLL_MS) await sleep(POLL_MS);
  if (exact) await sleep(options.settleMs);
  const got = read();
  if (exact ? got === want : got.includes(want)) return null;
  return got ? `Expected ${visible(want)} and got ${visible(got)}.` : `Expected ${visible(want)} and nothing came back.`;
}
