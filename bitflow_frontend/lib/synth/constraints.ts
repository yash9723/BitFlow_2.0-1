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
