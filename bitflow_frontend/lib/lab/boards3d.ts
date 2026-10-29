/**
 * lib/lab/boards3d.ts — the boards the Board Lab can show (components/lab/Board3D.tsx):
 * the all-parts lab board and a Tang Nano 9K built in code, and real boards exported from
 * their own KiCad files (scripts/board-models.mjs → public/models/<id>.glb + .json).
 */
import type { BoardId } from "../synth/boards";

export type ViewId = "lab" | "tangnano9k" | "ulx3s" | "orangecrab";

export interface BoardModelView {
  id: ViewId;
  name: string;
  /** The board this view stands for under "Put it on a real board" (null: any). */
  flash: BoardId | null;
  /** public/models/<model>.glb and .json, for boards exported from KiCad. */
  model?: string;
  /** Who made it and under what licence (shown under the board). */
  credit?: string;
  /** LED channels shown as one RGB LED (the OrangeCrab's led[0..2] are its red, green, blue). */
  ledsAsRgb?: boolean;
}

export const VIEWS: BoardModelView[] = [
  { id: "lab", name: "Lab board", flash: null },
  { id: "tangnano9k", name: "Tang Nano 9K", flash: "tangnano9k" },
  { id: "ulx3s", name: "ULX3S", flash: "ulx3s-85f", model: "ulx3s",
    credit: "ULX3S by EMARD and Radiona, from its KiCad design (MIT-style licence)" },
  { id: "orangecrab", name: "OrangeCrab", flash: "orangecrab-25f", model: "orangecrab", ledsAsRgb: true,
    credit: "OrangeCrab r0.2.1 by Greg Davill, from its KiCad design (CERN OHL v1.2)" },
];

/** The view that shows a flash board, if one does (all ULX3S sizes look alike). */
export const viewFor = (board: BoardId): ViewId | null =>
  board === "tangnano9k" ? "tangnano9k" : board.startsWith("ulx3s") ? "ulx3s" : board === "orangecrab-25f" ? "orangecrab" : null;

/** Part positions written by scripts/board-models.mjs: metres in the model's frame, [x, z]. */
export interface ModelParts { leds: [number, number][]; rgb: [number, number] | null; buttons: [number, number][]; switches: [number, number][] }
