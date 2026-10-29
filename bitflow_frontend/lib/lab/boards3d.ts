/**
 * lib/lab/boards3d.ts — the boards the Board Lab can show (components/lab/Board3D.tsx):
 * the all-parts lab board and boards built in code to their real layout (Tang Nano 9K / 20K,
 * Basys 3), and real boards exported from their own KiCad files (scripts/board-models.mjs →
 * public/models/<id>.glb + .json).
 */
import type { BoardId } from "../synth/boards";

export type ViewId = "lab" | "tangnano9k" | "tangnano20k" | "basys3" | "ulx3s" | "orangecrab" | "icezum" | "tinyfpga-bx" | "fomu";

export interface BoardModelView {
  id: ViewId;
  name: string;
  /** The board this view stands for under "Put it on a real board" (null: none that builds in the browser). */
  flash: BoardId | null;
  /** public/models/<model>.glb and .json, for boards exported from KiCad. */
  model?: string;
  /** Who made it and under what licence (shown under the board). */
  credit?: string;
  /** LED channels shown as one RGB LED (led[0..2] are its red, green, blue). */
  ledsAsRgb?: boolean;
  /** Colour of each LED, LED 0 first; default green. */
  ledColors?: string[];
  /** Parts this view has beyond what lib/lab/run.ts missingParts() knows of the board (e.g. its display). */
  has?: string[];
  /** Shown as a board to look at; its build board, if any, has none of the lab's parts. */
  showcase?: string;
}

export const VIEWS: BoardModelView[] = [
  { id: "lab", name: "Lab board", flash: null },
  { id: "tangnano9k", name: "Tang Nano 9K", flash: "tangnano9k" },
  { id: "tangnano20k", name: "Tang Nano 20K", flash: "tangnano20k" },
  { id: "icezum", name: "Icezum Alhambra", flash: "icezum", model: "icezum",
    credit: "Icezum Alhambra by FPGAwars, from its KiCad design (GPL-3.0)" },
  { id: "ulx3s", name: "ULX3S", flash: "ulx3s-85f", model: "ulx3s",
    ledColors: ["#ff3030", "#ff9a1f", "#2bff6a", "#3d7bff", "#ff3030", "#ff9a1f", "#2bff6a", "#3d7bff"],
    credit: "ULX3S by EMARD and Radiona, from its KiCad design (MIT-style licence)" },
  { id: "orangecrab", name: "OrangeCrab", flash: "orangecrab-25f", model: "orangecrab", ledsAsRgb: true,
    credit: "OrangeCrab r0.2.1 by Greg Davill, from its KiCad design (CERN OHL v1.2)" },
  { id: "tinyfpga-bx", name: "TinyFPGA BX", flash: "tinyfpga-bx", model: "tinyfpga-bx",
    credit: "TinyFPGA BX by Luke Valenty, from its KiCad design (CERN OHL v1.2)" },
  { id: "basys3", name: "Basys 3", flash: null, has: ["switches", "a 7-segment display", "enough buttons"],
    showcase: "The Basys 3 (Xilinx Artix-7) builds with Vivado: export a project from the Sandbox's Bitstream tab." },
  { id: "fomu", name: "Fomu", flash: null, model: "fomu", ledsAsRgb: true,
    showcase: "Fomu fits inside a USB port: an iCE40UP5K with one RGB LED (led[0..2]) and touch pads, programmed with dfu-util.",
    credit: "Fomu by the Tomu project, from its KiCad design (CC BY-SA 4.0)" },
];

/** The view that shows a build board, if one does (all ULX3S sizes look alike). */
export const viewFor = (board: BoardId): ViewId | null =>
  board.startsWith("ulx3s") ? "ulx3s" : board === "orangecrab-25f" ? "orangecrab"
    : (VIEWS.find((v) => v.flash === board)?.id ?? null);

/** Part positions written by scripts/board-models.mjs: metres in the model's frame, [x, z]. */
export interface ModelParts { leds: [number, number][]; rgb: [number, number] | null; buttons: [number, number][]; switches: [number, number][] }
