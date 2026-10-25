/**
 * lib/synth/export-project.ts — a ready-to-build project for boards whose bitstream needs
 * the vendor's tools: Vivado (Xilinx, non-project batch mode) or Quartus (Intel). The zip
 * holds the design, the pin constraints from lib/synth/boards.ts, build and program
 * scripts, and a README. Self-check: scripts/bitstream.check.ts.
 */
import JSZip from "jszip";
import { BOARDS, type BoardId } from "./boards";
import { sdcClock } from "./constraints";

/** File name → contents, before zipping (exported for the self-check). */
export function projectFiles(boardId: BoardId, top: string, design: string, constraints: string, clockPort: string | null): Record<string, string> {
  const board = BOARDS[boardId];
  const src = `src/${top}.sv`;
  const loader = `openFPGALoader -b ${board.loader}`;
  if (board.family === "xilinx") {
    return {
      [src]: design,
      [`${top}.xdc`]: constraints,
      "build.tcl": [
        `# Build ${top} for the ${board.name}: vivado -mode batch -source build.tcl`,
        `read_verilog -sv ${src}`,
        `read_xdc ${top}.xdc`,
        `synth_design -top ${top} -part ${board.chip}`,
        "opt_design", "place_design", "route_design",
        "report_utilization -file utilization.rpt",
        "report_timing_summary -file timing.rpt",
        `write_bitstream -force ${top}.bit`, "",
      ].join("\n"),
      "program.tcl": [
        `# Program the board over USB: vivado -mode batch -source program.tcl`,
        "open_hw_manager", "connect_hw_server", "open_hw_target",
        "current_hw_device [lindex [get_hw_devices] 0]",
        `set_property PROGRAM.FILE ${top}.bit [current_hw_device]`,
        "program_hw_devices [current_hw_device]", "close_hw_manager", "",
      ].join("\n"),
      "README.md": readme(board.name, top, [
        "Build (Vivado 2020.1 or later on your PATH):", "", "    vivado -mode batch -source build.tcl", "",
        "Program the board (until power-off):", "", "    vivado -mode batch -source program.tcl", "",
        `or with openFPGALoader: \`${loader} ${top}.bit\`.`,
      ]),
    };
  }
  return {
    [src]: design,
    [`${top}.qpf`]: `PROJECT_REVISION = "${top}"\n`,
    [`${top}.qsf`]: [
      constraints.trimEnd(),
      `set_global_assignment -name TOP_LEVEL_ENTITY ${top}`,
      `set_global_assignment -name SYSTEMVERILOG_FILE ${src}`,
      `set_global_assignment -name SDC_FILE ${top}.sdc`,
      "set_global_assignment -name PROJECT_OUTPUT_DIRECTORY output_files", "",
    ].join("\n"),
    [`${top}.sdc`]: clockPort ? sdcClock(clockPort, board.clockMhz) : "",
    "build.sh": `#!/bin/sh\n# Build ${top} for the ${board.name} (Quartus Prime Lite on your PATH)\nquartus_sh --flow compile ${top}\n`,
    "build.bat": `@rem Build ${top} for the ${board.name} (Quartus Prime Lite on your PATH)\r\nquartus_sh --flow compile ${top}\r\n`,
    "program.sh": `#!/bin/sh\n# Program the board over its USB-Blaster (until power-off)\nquartus_pgm -c USB-Blaster -m JTAG -o "p;output_files/${top}.sof"\n`,
    "README.md": readme(board.name, top, [
      "Build (Quartus Prime Lite 18.1 or later on your PATH):", "", "    sh build.sh        (or build.bat on Windows)", "",
      "Program the board (until power-off):", "", "    sh program.sh", "",
      `or open output_files/${top}.sof in the Quartus Programmer.`,
    ]),
  };
}

const readme = (boardName: string, top: string, steps: string[]) => [
  `# ${top} for the ${boardName}`, "",
  "Exported from BitFlow (bitflowvlsi.tech). The pins were assigned from the port names;",
  "edit the constraints file to move them.", "", ...steps, "",
].join("\n");

export async function exportProject(boardId: BoardId, top: string, design: string, constraints: string, clockPort: string | null): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(`${top}-${boardId}`)!;
  for (const [name, text] of Object.entries(projectFiles(boardId, top, design, constraints, clockPort)))
    folder.file(name, text, name.endsWith(".sh") ? { unixPermissions: 0o755 } : {});
  return zip.generateAsync({ type: "blob", platform: "UNIX" });
}
