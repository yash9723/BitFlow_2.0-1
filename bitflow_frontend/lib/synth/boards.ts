/**
 * lib/synth/boards.ts — real iCE40 boards a design can be built for, and the
 * pin assignment (.pcf) made from its port names, using the same naming rules
 * as the virtual board (components/BoardPanel.tsx):
 *   clk / clock → the 12 MHz oscillator      tx / rx → the USB serial port (FTDI)
 *   led*        → the board's LEDs            rst* / btn* / key* → its buttons
 *   anything else (sw*, seg*, ...) → PMOD header pins, in order
 * Pin numbers come from the boards' reference .pcf files (icestorm's
 * icestick.pcf, 1BitSquared's icebreaker.pcf). Self-check: scripts/bitstream.check.ts.
 */

export type BoardId = "icestick" | "icebreaker";

interface Pin { pin: number; label: string }

export interface Board {
  name: string;
  /** nextpnr device arguments and the chip database file it reads. */
  nextpnr: string[];
  chipdb: string;
  /** Compressed download the first time (mostly the chip database), shown to the user. */
  downloadMb: number;
  clock: Pin;
  uartRx: Pin;               // into the FPGA
  uartTx: Pin;               // out of the FPGA
  leds: Pin[];
  /** An active-low button goes to a port named like rst_n, an active-high one to rst / btn0. */
  buttons: (Pin & { activeLow: boolean })[];
  pmod: Pin[];
  notes: string;
}

const pmod = (header: string, pins: number[], numbers = [1, 2, 3, 4, 7, 8, 9, 10]) =>
  pins.map((pin, i) => ({ pin, label: `${header} pin ${numbers[i]}` }));

export const BOARDS: Record<BoardId, Board> = {
  icestick: {
    name: "Lattice iCEstick (iCE40-HX1K)",
    nextpnr: ["--hx1k", "--package", "tq144"],
    chipdb: "chipdb-1k.bin",
    downloadMb: 11,
    clock:  { pin: 21, label: "12 MHz oscillator" },
    uartRx: { pin: 9,  label: "USB serial RX" },
    uartTx: { pin: 8,  label: "USB serial TX" },
    leds: [99, 98, 97, 96, 95].map((pin, i) => ({ pin, label: `LED D${i + 1}` })),
    buttons: [],
    pmod: pmod("PMOD J2", [78, 79, 80, 81, 87, 88, 90, 91]),
    notes: "The iCEstick has no buttons: button inputs go to PMOD pins, where you can wire a switch.",
  },
  icebreaker: {
    name: "1BitSquared iCEBreaker (iCE40-UP5K)",
    nextpnr: ["--up5k", "--package", "sg48"],
    chipdb: "chipdb-5k.bin",
    downloadMb: 20,
    clock:  { pin: 35, label: "12 MHz oscillator" },
    uartRx: { pin: 6,  label: "USB serial RX" },
    uartTx: { pin: 9,  label: "USB serial TX" },
    // The snap-off PMOD board's LEDs and buttons are active high.
    leds: [26, 27, 25, 23, 21].map((pin, i) => ({ pin, label: `snap-off LED${i + 1}` })),
    buttons: [
      { pin: 10, label: "user button (active low)", activeLow: true },
      ...[20, 19, 18].map((pin, i) => ({ pin, label: `snap-off BTN${i + 1}`, activeLow: false })),
    ],
    pmod: [...pmod("PMOD 1A", [4, 2, 47, 45, 3, 48, 46, 44]), ...pmod("PMOD 1B", [43, 38, 34, 31, 42, 36, 32, 28])],
    notes: "LEDs and buttons labelled snap-off are on the PMOD board that ships attached (or plugged into PMOD 2).",
  },
};

export interface PortInfo { direction: string; width: number }
export interface Assignment { port: string; pin: number; where: string }

const CLOCK  = /^(clk|clock)$/i;
const BUTTON = /^(rst|reset|btn|key|button)/i;
const ACTIVE_LOW = /_n$|^(rstn|resetn|aresetn)$/i;   // rst_n, btn_n, ...; not "btn"

/**
 * A pin for every port bit (LSB first), the .pcf, and an error naming what
 * couldn't be placed. Ports are taken in the order Yosys lists them.
 */
export function pinout(boardId: BoardId, ports: Record<string, PortInfo>) {
  const board = BOARDS[boardId];
  const leds = [...board.leds], buttons = [...board.buttons], pmodPins = [...board.pmod];
  const assignments: Assignment[] = [];
  const unplaced: string[] = [];
  const notes = new Set<string>();
  const place = (name: string, p: Pin | undefined) => {
    if (p) assignments.push({ port: name, pin: p.pin, where: p.label });
    else unplaced.push(name);
  };

  for (const [port, { direction, width }] of Object.entries(ports)) {
    if (width === 1 && direction === "input"  && CLOCK.test(port))  { place(port, board.clock);  continue; }
    if (width === 1 && direction === "input"  && /^rx$/i.test(port)) { place(port, board.uartRx); continue; }
    if (width === 1 && direction === "output" && /^tx$/i.test(port)) { place(port, board.uartTx); continue; }
    for (let i = 0; i < width; i++) {
      let pin: Pin | undefined;
      if (direction === "output" && /^led/i.test(port)) pin = leds.shift();
      if (direction === "input" && BUTTON.test(port)) {
        const k = buttons.findIndex((b) => b.activeLow === ACTIVE_LOW.test(port));
        if (k >= 0) pin = buttons.splice(k, 1)[0];
        if (board.buttons.length === 0) notes.add(board.notes);
      }
      place(width === 1 ? port : `${port}[${i}]`, pin ?? pmodPins.shift());
    }
  }
  if (assignments.some((a) => a.where.startsWith("snap-off"))) notes.add(board.notes);

  return {
    assignments,
    pcf: assignments.map((a) => `set_io ${a.port} ${a.pin}`).join("\n") + "\n",
    error: unplaced.length ? `The ${board.name} has no free pin for: ${unplaced.join(", ")}. Use fewer or narrower ports.` : null,
    notes: [...notes],
  };
}
