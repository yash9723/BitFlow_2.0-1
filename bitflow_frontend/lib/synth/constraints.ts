/**
 * lib/synth/constraints.ts — pin constraint files in each toolchain's format, from
 * the assignments lib/synth/boards.ts makes: .pcf (iCE40, nextpnr), .lpf (ECP5),
 * .cst (Gowin), .xdc (Xilinx Vivado), .qsf pin lines (Intel Quartus).
 * Self-check: scripts/bitstream.check.ts.
 */
import type { Assignment, Board } from "./boards";

export type ConstraintFormat = "pcf" | "lpf" | "cst" | "xdc" | "qsf";

const ns = (mhz: number) => (1000 / mhz).toFixed(3);

export function emitConstraints(format: ConstraintFormat, assignments: Assignment[], board: Board): string {
  const clock = assignments.find((a) => a.kind === "clock");
  const lines: string[] = [];
  switch (format) {
    case "pcf":
      for (const a of assignments) lines.push(`set_io ${a.port} ${a.pin}`);
      break;
    case "lpf":
      for (const a of assignments) {
        lines.push(`LOCATE COMP "${a.port}" SITE "${a.pin}";`);
        lines.push(`IOBUF PORT "${a.port}" IO_TYPE=${a.io}${a.pull ? ` PULLMODE=${a.pull}` : ""};`);
      }
      if (clock) lines.push(`FREQUENCY PORT "${clock.port}" ${board.clockMhz} MHZ;`);
      break;
    case "cst":
      for (const a of assignments) {
        lines.push(`IO_LOC "${a.port}" ${a.pin};`);
        lines.push(`IO_PORT "${a.port}" IO_TYPE=${a.io}${a.pull ? ` PULL_MODE=${a.pull}` : ""};`);
      }
      break;
    case "xdc":
      lines.push(...(board.extraConstraints ?? []));
      for (const a of assignments) {
        const pull = a.pull ? ` ${a.pull === "UP" ? "PULLUP" : "PULLDOWN"} true` : "";
        lines.push(`set_property -dict { PACKAGE_PIN ${a.pin} IOSTANDARD ${a.io}${pull} } [get_ports {${a.port}}];`);
      }
      if (clock) {
        const period = ns(board.clockMhz);
        lines.push(`create_clock -add -name sys_clk_pin -period ${period} -waveform {0 ${(Number(period) / 2).toFixed(3)}} [get_ports {${clock.port}}];`);
      }
      break;
    case "qsf":
      lines.push(...(board.extraConstraints ?? []));
      for (const a of assignments) {
        lines.push(`set_location_assignment PIN_${a.pin} -to "${a.port}"`);
        lines.push(`set_instance_assignment -name IO_STANDARD "${a.io}" -to "${a.port}"`);
      }
      break;
  }
  return lines.join("\n") + "\n";
}

/** The clock constraint Quartus reads from an .sdc file (the .qsf only places pins). */
export const sdcClock = (port: string, mhz: number) => `create_clock -name ${port} -period ${ns(mhz)} [get_ports {${port}}]\n`;

// ── Reading constraints someone wrote or edited (components/ConstraintsEditor.tsx) ──

/** One placed port bit; `line` is the (0-based) line that places it. */
export interface ConstraintEntry { port: string; pin: string; io?: string; pull?: "UP" | "DOWN"; line: number }
export interface Issue { level: "error" | "warning"; message: string; line?: number }

const COMMENT: Record<ConstraintFormat, RegExp> = { pcf: /#.*$/, lpf: /(#|\/\/).*$/, cst: /\/\/.*$/, xdc: /#.*$/, qsf: /#.*$/ };
const unquote = (s: string) => s.replace(/^[{"]|[}"]$/g, "");
const xdcPort = (line: string) => line.match(/\[get_ports\s+(\{[^}]*\}|"[^"]*"|\S+?)\s*\]/)?.[1];

/** The pin placements in a constraints file, and the lines that are neither placements nor known statements. */
export function parseConstraints(format: ConstraintFormat, text: string): { entries: ConstraintEntry[]; unknown: number[] } {
  const entries: ConstraintEntry[] = [];
  const attrs = new Map<string, { io?: string; pull?: "UP" | "DOWN" }>();
  const unknown: number[] = [];
  const attr = (port: string, a: { io?: string; pull?: "UP" | "DOWN" }) => attrs.set(port, { ...attrs.get(port), ...a });
  const pullOf = (v?: string) => (v?.toUpperCase() === "UP" ? "UP" : v?.toUpperCase() === "DOWN" ? "DOWN" : undefined);

  text.split("\n").forEach((raw, line) => {
    const s = raw.replace(COMMENT[format], "").trim();
    if (!s) return;
    let m: RegExpMatchArray | null;
    switch (format) {
      case "pcf": {
        const words = s.split(/\s+/);
        if (words[0] !== "set_io") { unknown.push(line); return; }
        const pos: string[] = [];
        let pull: "UP" | undefined;
        for (let i = 1; i < words.length; i++) {
          if (words[i] === "-pullup") { if (words[i + 1] === "yes") pull = "UP"; i++; }
          else if (words[i] === "-pullup_resistor") i++;
          else if (!words[i].startsWith("-")) pos.push(words[i]);
        }
        if (pos.length !== 2) { unknown.push(line); return; }
        entries.push({ port: pos[0], pin: pos[1], line, ...(pull ? { pull } : {}) });
        return;
      }
      case "lpf":
        if ((m = s.match(/^LOCATE\s+COMP\s+"([^"]+)"\s+SITE\s+"([^"]+)"/i))) entries.push({ port: m[1], pin: m[2], line });
        else if ((m = s.match(/^IOBUF\s+PORT\s+"([^"]+)"(.*)$/i))) attr(m[1], { io: m[2].match(/IO_TYPE=(\w+)/i)?.[1], pull: pullOf(m[2].match(/PULLMODE=(\w+)/i)?.[1]) });
        return;
      case "cst":
        if ((m = s.match(/^IO_LOC\s+"([^"]+)"\s+([^;\s,]+)/i))) entries.push({ port: m[1], pin: m[2], line });
        else if ((m = s.match(/^IO_PORT\s+"([^"]+)"(.*)$/i))) attr(m[1], { io: m[2].match(/IO_TYPE=(\w+)/i)?.[1], pull: pullOf(m[2].match(/PULL_MODE=(\w+)/i)?.[1]) });
        else if (!/^(CLOCK_LOC|INS_LOC|GRP_LOC|IO_GROUP)\b/i.test(s)) unknown.push(line);
        return;
      case "xdc": {
        const port = xdcPort(s);
        if (!port || !/^set_property\b/.test(s)) return;
        const pin = s.match(/PACKAGE_PIN\s+(\w+)/)?.[1];
        if (pin) entries.push({ port: unquote(port), pin, line });
        attr(unquote(port), { io: s.match(/IOSTANDARD\s+(\w+)/)?.[1], pull: /PULLUP\s+(true|1)/i.test(s) ? "UP" : /PULLDOWN\s+(true|1)/i.test(s) ? "DOWN" : undefined });
        return;
      }
      case "qsf":
        if ((m = s.match(/^set_location_assignment\s+PIN_(\w+)\s+-to\s+("[^"]+"|\S+)/))) entries.push({ port: unquote(m[2]), pin: m[1], line });
        else if ((m = s.match(/-name\s+IO_STANDARD\s+"([^"]+)"\s+-to\s+("[^"]+"|\S+)/))) attr(unquote(m[2]), { io: m[1] });
        return;
    }
  });
  for (const e of entries) {
    const a = attrs.get(e.port);
    if (a?.io) e.io = a.io;
    if (a?.pull) e.pull = a.pull;
  }
  return { entries, unknown };
}

/** The same constraints with the pin on `line` changed to `pin` (everything else, comments too, kept). */
export function setPin(format: ConstraintFormat, text: string, line: number, pin: string): string {
  const lines = text.split("\n");
  const l = lines[line] ?? "";
  lines[line] = {
    pcf: () => {   // the last word before any comment
      const at = l.indexOf("#"), code = at < 0 ? l : l.slice(0, at);
      return code.replace(/\S+(\s*)$/, `${pin}$1`) + (at < 0 ? "" : l.slice(at));
    },
    lpf: () => l.replace(/(SITE\s+")[^"]*(")/i, `$1${pin}$2`),
    cst: () => l.replace(/^(\s*IO_LOC\s+"[^"]+"\s+)[^;\s,]+/i, `$1${pin}`),
    xdc: () => l.replace(/(PACKAGE_PIN\s+)\w+/, `$1${pin}`),
    qsf: () => l.replace(/(PIN_)\w+/, `$1${pin}`),
  }[format]();
  return lines.join("\n");
}

/** Port bits a design has (led[0], led[1], ... for a bus), with their directions. */
export function portBits(ports: Record<string, { direction: string; width: number }>) {
  return Object.entries(ports).flatMap(([name, p]) =>
    p.width === 1 ? [{ bit: name, direction: p.direction }] : Array.from({ length: p.width }, (_, i) => ({ bit: `${name}[${i}]`, direction: p.direction })));
}

/**
 * What's wrong with these placements for this board and design: errors stop a build (a port bit
 * without a pin, a pin used twice, a constraint for a port that doesn't exist); warnings don't
 * (a pin the board doesn't label, an output on a button, the clock away from the oscillator).
 */
export function validateConstraints(
  board: Board, pins: { pin: string; label: string; kind: string }[],
  ports: Record<string, { direction: string; width: number }>, entries: ConstraintEntry[],
): Issue[] {
  const issues: Issue[] = [];
  const bits = new Map(portBits(ports).map((b) => [b.bit, b.direction]));
  const known = new Map(pins.map((p) => [p.pin.toUpperCase(), p]));
  const byPort = new Map<string, ConstraintEntry>();
  const byPin = new Map<string, ConstraintEntry>();
  for (const e of entries) {
    if (!bits.has(e.port)) { issues.push({ level: "error", line: e.line, message: `${e.port} isn't a port of the design.` }); continue; }
    if (byPort.has(e.port)) issues.push({ level: "error", line: e.line, message: `${e.port} is placed twice (lines ${byPort.get(e.port)!.line + 1} and ${e.line + 1}).` });
    byPort.set(e.port, e);
    const other = byPin.get(e.pin.toUpperCase());
    if (other) issues.push({ level: "error", line: e.line, message: `Pin ${e.pin} is used by both ${other.port} and ${e.port}.` });
    byPin.set(e.pin.toUpperCase(), e);
    const p = known.get(e.pin.toUpperCase());
    const dir = bits.get(e.port);
    if (!p) issues.push({ level: "warning", line: e.line, message: `Pin ${e.pin} (${e.port}) isn't one of the ${board.name}'s labelled pins: check the board's schematic.` });
    else if (dir === "input" && p.kind === "led") issues.push({ level: "warning", line: e.line, message: `${e.port} is an input on ${p.label}.` });
    else if (dir === "output" && (p.kind === "button" || p.kind === "switch" || p.kind === "clock"))
      issues.push({ level: "warning", line: e.line, message: `${e.port} is an output driving ${p.label}: that pin is driven by the board.` });
  }
  const missing = [...bits.keys()].filter((b) => !byPort.has(b));
  if (missing.length) issues.push({ level: "error", message: `No pin for ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ` and ${missing.length - 8} more` : ""}.` });
  for (const name of ["clk", "clock"]) {
    const e = byPort.get(name);
    if (e && e.pin.toUpperCase() !== board.clock.pin.toUpperCase())
      issues.push({ level: "warning", line: e.line, message: `${name} isn't on the board's ${board.clockMhz} MHz oscillator (pin ${board.clock.pin}).` });
  }
  return issues;
}
