/**
 * lib/asic-path.ts — an OpenSTA critical path (api/routes/asic.py parse_path) as a chain of cells,
 * for the ASIC panel's schematic. OpenSTA lists the path pin by pin ("_20_/CLK", "_20_/Q",
 * "_31_/A", "_31_/X", …); here each instance becomes one box with the time spent in it, and
 * each hop between boxes carries its net. Ports (no "/") are boxes of their own.
 * Self-check: scripts/asic-path.check.ts.
 */

export interface PathStage { pin: string; cell: string; edge: "rise" | "fall"; delay: number; arrival: number; net: string | null }

export interface PathCell {
  instance: string;        // "_31_", or the port name
  cell: string;            // "nand2_1", "dfxtp_1", "input port", "output port"
  pins: string[];          // pin names on this cell, in path order ("A", "X")
  delay: number;           // ns spent on this cell's pins (input wire + cell delay)
  arrival: number;         // ns at the last pin
  net: string | null;      // the net leaving this cell along the path
  port: boolean;
}

export function pathCells(stages: PathStage[]): PathCell[] {
  const out: PathCell[] = [];
  for (const s of stages) {
    const slash = s.pin.lastIndexOf("/");
    const instance = slash < 0 ? s.pin : s.pin.slice(0, slash);
    const pin = slash < 0 ? s.pin : s.pin.slice(slash + 1);
    const last = out[out.length - 1];
    if (last && last.instance === instance) {
      last.pins.push(pin);
      last.delay += s.delay;
      last.arrival = s.arrival;
      last.net = s.net ?? last.net;
    } else {
      out.push({ instance, cell: s.cell, pins: [pin], delay: s.delay, arrival: s.arrival, net: s.net, port: slash < 0 });
    }
  }
  for (const c of out) c.delay = Math.round(c.delay * 1000) / 1000;
  return out;
}

/** Index of the cell that costs the most time (the first one on a tie), or -1 for an empty path. */
export const slowestCell = (cells: PathCell[]) =>
  cells.reduce((best, c, i) => (best < 0 || c.delay > cells[best].delay ? i : best), -1);
