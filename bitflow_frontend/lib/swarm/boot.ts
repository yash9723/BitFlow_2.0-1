/**
 * lib/swarm/boot.ts — the ~1 s terminal boot that plays before the signal swarm launches
 * (pure: which characters are on screen at time t). Drawn by components/swarm/effects.ts.
 */
import { clamp } from "./motion";

export const BOOT_MS = 950;
/** The box collapses like a CRT switching off over the last stretch. */
export const BOOT_FADE_MS = 150;

const CHARS_PER_MS = 0.14;
const BAR_CELLS = 12;

interface BootLine {
  at: number;
  text: string;
  /** A progress bar appended after the text, filling between `at + 60` and `at + 300`. */
  bar?: boolean;
}

export const BOOT_LINES: BootLine[] = [
  { at: 0, text: "BITFLOW BIOS v2.0" },
  { at: 130, text: "CPU  RV32I @ 48MHz ...... OK" },
  { at: 260, text: "SRAM 64K ................ OK" },
  { at: 390, text: "loading page.bin", bar: true },
  { at: 720, text: "> make page" },
];

export interface BootFrame {
  lines: string[];
  /** Blinking caret after the last line. */
  caret: boolean;
  /** 0 → 1 over the collapse at the end. */
  collapse: number;
  done: boolean;
}

export function bootFrame(t: number): BootFrame {
  const lines: string[] = [];
  for (const l of BOOT_LINES) {
    if (t < l.at) break;
    let text = l.text.slice(0, Math.floor((t - l.at) * CHARS_PER_MS) + 1);
    if (l.bar && text.length === l.text.length) {
      const p = clamp((t - l.at - 60) / 240, 0, 1);
      const filled = Math.round(p * BAR_CELLS);
      text += ` [${"#".repeat(filled)}${".".repeat(BAR_CELLS - filled)}] ${String(Math.round(p * 100)).padStart(3)}%`;
    }
    lines.push(text);
  }
  return {
    lines,
    caret: Math.floor(t / 120) % 2 === 0,
    collapse: clamp((t - (BOOT_MS - BOOT_FADE_MS)) / BOOT_FADE_MS, 0, 1),
    done: t >= BOOT_MS,
  };
}
