/**
 * lib/lab/run.ts — the Board Lab's engine: lesson parameters, grading a design on the gate
 * simulator, and wrapping it for a real board. Used by components/lab/LabLesson.tsx and
 * scripts/lab.check.ts. Self-check: scripts/lab.check.ts.
 */
import { GateSim, toNumber, type BoardNetlist } from "../gate-sim";
import { UartReceiver, UartTransmitter } from "../uart";
import { BOARDS, type BoardId } from "../synth/boards";

export type Dir = "input" | "output";
/** The ports a lesson's module has: name → [direction, width]. */
export type LabPorts = Record<string, [Dir, number]>;

export interface LabLesson {
  slug: string;
  title: string;
  summary: string;
  /** Paragraphs; `backticks` become code. */
  intro: string[];
  goals: string[];
  hints: string[];
  starter: string;
  ports: LabPorts;
  /** Simulated clock rate (Hz) and the parameter values it needs; default 1000 Hz, CLK_HZ = 1000. */
  sim?: { hz: number; params?: Record<string, number> };
  /** LED colours on the 3D board (LED 0 first), when they mean something. */
  ledColors?: string[];
  /** Drives the design and calls t.expect(goal, ok, message). */
  check: (t: Tester) => void;
}

export const simHz = (l: LabLesson) => l.sim?.hz ?? 1000;
export const simParams = (l: LabLesson) => l.sim?.params ?? { CLK_HZ: simHz(l) };
/** Cycles of the simulated clock per serial bit (lessons with BAUD set it to CLK_HZ / 16). */
export const UART_CYCLES = 16;

/** Set `parameter NAME = <number>` declarations to new values (the simulated clock, a board's clock). */
export function withParams(code: string, params: Record<string, number>): string {
  let out = code;
  for (const [name, value] of Object.entries(params)) {
    out = out.replace(new RegExp(`(\\b(?:parameter|localparam)\\b[^;]*?\\b${name}\\s*=\\s*)[0-9_]+`, "g"), `$1${value}`);
  }
  return out;
}

/** Runs a design on the gate simulator for a lesson's check. */
export class Tester {
  readonly sim: GateSim;
  cycle = 0;
  /** Text the design sent on tx. */
  serial = "";
  serialErrors = 0;
  private toDesign = new UartTransmitter(UART_CYCLES);
  private fromDesign = new UartReceiver(UART_CYCLES);
  private failed = new Map<number, string>();
  private seen = new Set<number>();

  constructor(net: BoardNetlist) {
    this.sim = new GateSim(net);
    for (const [name, p] of Object.entries(this.sim.ports)) if (p.direction === "input") this.sim.set(name, p.bits.map(() => (name === "rx" ? 1 : 0)));
  }
  has = (port: string) => port in this.sim.ports;
  set(port: string, value: number) {
    const w = this.sim.ports[port]?.bits.length ?? 0;
    this.sim.set(port, Array.from({ length: w }, (_, i) => Math.floor(value / 2 ** i) % 2));
  }
  get = (port: string) => toNumber(this.sim.get(port));
  /** Send text into rx, a bit every UART_CYCLES cycles. */
  send = (text: string) => this.toDesign.send(new TextEncoder().encode(text));
  /** n clock cycles; each() sees the design after every one. */
  run(n: number, each?: (cycle: number) => void) {
    const clk = this.has("clk"), rx = this.has("rx"), tx = this.has("tx");
    for (let i = 0; i < n; i++) {
      if (rx) this.sim.set("rx", [this.toDesign.next()]);
      if (clk) { this.sim.set("clk", [1]); this.sim.set("clk", [0]); }
      this.cycle++;
      if (tx) {
        const r = this.fromDesign.sample(this.sim.get("tx")[0]);
        if (r === "error") this.serialErrors++;
        else if (r !== null) this.serial += String.fromCharCode(r);
      }
      each?.(this.cycle);
    }
  }
  /** Hold a button down for `cycles`, then release it for as long. */
  press(port: string, value = 1, cycles = 50) { this.set(port, value); this.run(cycles); this.set(port, 0); this.run(cycles); }
  /** Record a goal's result; its first failure message is the one shown. */
  expect(goal: number, ok: boolean, message: string) {
    this.seen.add(goal);
    if (!ok && !this.failed.has(goal)) this.failed.set(goal, message);
  }
  results(goals: number) {
    // A goal the check never reached was skipped because an earlier one failed.
    return Array.from({ length: goals }, (_, g) => ({ ok: this.seen.has(g) && !this.failed.has(g), message: this.failed.get(g) ?? (this.seen.has(g) ? null : "Fix the goals above first.") }));
  }
}

export type GoalResult = { ok: boolean; message: string | null };

/** A lesson's goals for a netlist: missing or wrong-width ports first, then the lesson's check. */
export function grade(lesson: LabLesson, net: BoardNetlist): GoalResult[] {
  const fail = (message: string) => lesson.goals.map(() => ({ ok: false, message }));
  for (const [name, [dir, width]] of Object.entries(lesson.ports)) {
    const p = net.ports[name];
    if (!p) return fail(`Your module needs ${dir === "input" ? "an input" : "an output"} ${width > 1 ? `${name}[${width - 1}:0]` : name}.`);
    if (p.direction !== dir || p.bits.length !== width) return fail(`${name} should be ${dir === "input" ? "an input" : "an output"} ${width} bit${width > 1 ? "s" : ""} wide.`);
  }
  try {
    const t = new Tester(net);
    lesson.check(t);
    return t.results(lesson.goals.length);
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** The design's top module: the last one that no other module instantiates. */
export function topModule(code: string): string | null {
  const names = [...code.matchAll(/\bmodule\s+(\w+)/g)].map((m) => m[1]);
  const used = (n: string) => new RegExp(`^\\s*${n}\\s*(#\\s*\\(|\\w+\\s*\\()`, "m").test(code);
  return names.filter((n) => !used(n)).at(-1) ?? null;
}

/**
 * The design wrapped for a real board: its clock parameter set to the board's oscillator,
 * buttons and LEDs inverted where the board's are active low (lessons are written active high).
 */
export function boardDesign(code: string, ports: LabPorts, boardId: BoardId): string {
  const board = BOARDS[boardId];
  const top = topModule(code);
  if (!top) throw new Error("Couldn't find your module.");
  const btnLow = board.buttons.length > 0 && board.buttons.every((b) => b.activeLow);
  const range = (w: number) => (w > 1 ? `[${w - 1}:0] ` : "");
  const decl: string[] = [], conn: string[] = [], body: string[] = [];
  for (const [name, [dir, w]] of Object.entries(ports)) {
    if (dir === "input" && name.startsWith("btn") && btnLow) {
      decl.push(`input ${range(w)}${name}_n`); conn.push(`.${name}(~${name}_n)`);
    } else if (dir === "output" && name.startsWith("led") && board.ledsActiveLow) {
      decl.push(`output ${range(w)}${name}`); body.push(`wire ${range(w)}${name}_on;`, `assign ${name} = ~${name}_on;`); conn.push(`.${name}(${name}_on)`);
    } else {
      decl.push(`${dir} ${range(w)}${name}`); conn.push(`.${name}(${name})`);
    }
  }
  const clocked = withParams(code, { CLK_HZ: Math.round(board.clockMhz * 1e6) });
  return `${clocked}\n\n// BitFlow Board Lab: ${board.name} wiring\nmodule board_top(${decl.join(", ")});\n  ${body.join("\n  ")}\n  ${top} design(${conn.join(", ")});\nendmodule\n`;
}

/** What the real board lacks for a lesson's ports (those go to header pins). */
export function missingParts(ports: LabPorts, boardId: BoardId): string[] {
  const b = BOARDS[boardId], names = Object.keys(ports), out: string[] = [];
  if (names.includes("sw") && !(b.switches?.length)) out.push("switches");
  if (names.some((n) => /^(hex|seg)/.test(n))) out.push("a 7-segment display");
  if (names.includes("rgb")) out.push("an RGB LED");
  if (names.includes("btn") && b.buttons.length < (ports.btn?.[1] ?? 0)) out.push("enough buttons");
  if (names.includes("tx") && !b.uartTx) out.push("a USB serial port");
  return out;
}
