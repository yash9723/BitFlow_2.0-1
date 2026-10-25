/**
 * lib/synth/boards.ts — real FPGA boards a design can be built for, and the pin
 * assignment made from its port names, using the same naming rules as the
 * virtual board (components/BoardPanel.tsx):
 *   clk / clock → the board's oscillator     tx / rx → its USB serial port
 *   led*        → its LEDs                   rst* / btn* / key* → its buttons
 *   sw*         → its switches               anything else → GPIO header pins, in order
 * iCE40, ECP5 and Gowin boards are built in the browser (lib/synth/fpga.ts);
 * Xilinx and Intel boards get a vendor project to build locally (lib/synth/export-project.ts).
 * Pins come from each vendor's reference constraints: icestorm icestick.pcf, 1BitSquared
 * icebreaker.pcf, emard/ulx3s ulx3s_v20.lpf, orangecrab-examples orangecrab_r0.2.pcf,
 * apicula tangnano9k/20k.cst + litex-boards, Digilent digilent-xdc, litex-boards terasic_de10lite.
 * Self-check: scripts/bitstream.check.ts.
 */
import { emitConstraints, type ConstraintEntry, type ConstraintFormat } from "./constraints";

export type Family = "ice40" | "ecp5" | "gowin" | "xilinx" | "intel";
export type BoardId =
  | "icestick" | "icebreaker"
  | "ulx3s-12f" | "ulx3s-25f" | "ulx3s-45f" | "ulx3s-85f" | "orangecrab-25f"
  | "tangnano9k" | "tangnano20k"
  | "basys3" | "arty-a7-35t" | "nexys-a7-100t" | "de10-lite";

/** `io`: the pin's I/O standard when it isn't the board's default; `pull`: its pull resistor. */
interface Pin { pin: string; label: string; io?: string; pull?: "UP" | "DOWN" }

export interface Board {
  name: string;
  family: Family;
  /** ice40/ecp5/gowin: nextpnr device arguments. xilinx/intel: unused. */
  nextpnr: string[];
  /** ice40/ecp5: the chip database file nextpnr reads; gowin: the chip (gowin_pack -d); xilinx/intel: the part. */
  chip: string;
  /** ecp5: the Project Trellis device directory ecppack reads. */
  trellis?: string;
  /** The chip's tile grid (icestorm), for the floorplan; iCE40 only. */
  grid?: { width: number; height: number };
  /** Compressed download the first time (tools + chip database), shown to the user. */
  downloadMb: number;
  clockMhz: number;
  /** Default I/O standard of the board's pins. */
  io: string;
  clock: Pin;
  uartRx?: Pin;              // into the FPGA
  uartTx?: Pin;              // out of the FPGA
  leds: Pin[];
  ledsActiveLow?: boolean;
  /** An active-low button goes to a port named like rst_n, an active-high one to rst / btn0. */
  buttons: (Pin & { activeLow: boolean })[];
  switches?: Pin[];
  gpio: Pin[];
  /** Extra lines for the constraints file (e.g. Xilinx configuration voltage, Quartus device). */
  extraConstraints?: string[];
  /** openFPGALoader's name for the board (-b), for programming it. */
  loader: string;
  notes?: string;
}

const pmod = (header: string, pins: (number | string)[], numbers = [1, 2, 3, 4, 7, 8, 9, 10]) =>
  pins.map((pin, i) => ({ pin: String(pin), label: `${header} pin ${numbers[i]}` }));
const list = (pins: (number | string)[], label: (i: number) => string, extra: Partial<Pin> = {}) =>
  pins.map((pin, i) => ({ pin: String(pin), label: label(i), ...extra }));

const ICE40 = { family: "ice40" as const, io: "LVCMOS33", switches: [] };

const ulx3s = (size: "12" | "25" | "45" | "85"): Board => ({
  loader: "ulx3s",
  name: `Radiona ULX3S (ECP5 LFE5U-${size}F)`,
  family: "ecp5",
  nextpnr: [`--${size}k`, "--package", "CABGA381"],
  chip: `chipdb-${size === "12" ? "25" : size}k.bin`,
  trellis: `LFE5U-${size}F`,
  downloadMb: 15,
  clockMhz: 25,
  io: "LVCMOS33",
  clock:  { pin: "G2", label: "25 MHz oscillator" },
  uartRx: { pin: "M1", label: "USB serial RX (ftdi_txd)", pull: "UP" },
  uartTx: { pin: "L4", label: "USB serial TX (ftdi_rxd)", pull: "UP" },
  leds: list(["B2", "C2", "C1", "D2", "D1", "E2", "E1", "H3"], (i) => `LED D${i}`),
  buttons: [
    { pin: "D6", label: "PWR button (active low)", activeLow: true, pull: "UP" },
    ...list(["R1", "T1", "R18", "V1", "U1", "H16"], (i) => ["FIRE1", "FIRE2", "UP", "DOWN", "LEFT", "RIGHT"][i] + " button",
      { pull: "DOWN" }).map((p) => ({ ...p, activeLow: false })),
  ],
  switches: list(["E8", "D8", "D7", "E7"], (i) => `DIP switch ${i + 1}`, { pull: "DOWN" }),
  // GP/GN 0-10 and 14-27; 11-13 are shared with the ESP32.
  gpio: [
    ...["B11", "A10", "A9", "B9", "A7", "C8", "C6", "A6", "A4", "A2", "C4"].map((p, i) => ({ pin: p, label: `GP${i}` })),
    ...["C11", "A11", "B10", "C10", "A8", "B8", "C7", "B6", "A5", "B1", "B4"].map((p, i) => ({ pin: p, label: `GN${i}` })),
    ...["U18", "N17", "N16", "L16", "H18", "F17", "D18", "C18", "B15", "B17", "C16", "D14", "B13", "D13"].map((p, i) => ({ pin: p, label: `GP${i + 14}` })),
    ...["U17", "P16", "M17", "L17", "H17", "G18", "E17", "D17", "C15", "C17", "D16", "E14", "C13", "E13"].map((p, i) => ({ pin: p, label: `GN${i + 14}` })),
  ],
});

export const BOARDS: Record<BoardId, Board> = {
  icestick: {
    loader: "ice40_generic",
    ...ICE40,
    name: "Lattice iCEstick (iCE40-HX1K)",
    nextpnr: ["--hx1k", "--package", "tq144"],
    chip: "chipdb-1k.bin",
    grid: { width: 14, height: 18 },
    downloadMb: 11,
    clockMhz: 12,
    clock:  { pin: "21", label: "12 MHz oscillator" },
    uartRx: { pin: "9",  label: "USB serial RX" },
    uartTx: { pin: "8",  label: "USB serial TX" },
    leds: list([99, 98, 97, 96, 95], (i) => `LED D${i + 1}`),
    buttons: [],
    gpio: pmod("PMOD J2", [78, 79, 80, 81, 87, 88, 90, 91]),
  },
  icebreaker: {
    loader: "ice40_generic",
    ...ICE40,
    name: "1BitSquared iCEBreaker (iCE40-UP5K)",
    nextpnr: ["--up5k", "--package", "sg48"],
    chip: "chipdb-5k.bin",
    grid: { width: 26, height: 32 },
    downloadMb: 20,
    clockMhz: 12,
    clock:  { pin: "35", label: "12 MHz oscillator" },
    uartRx: { pin: "6",  label: "USB serial RX" },
    uartTx: { pin: "9",  label: "USB serial TX" },
    // The snap-off PMOD board's LEDs and buttons are active high.
    leds: list([26, 27, 25, 23, 21], (i) => `snap-off LED${i + 1}`),
    buttons: [
      { pin: "10", label: "user button (active low)", activeLow: true },
      ...list([20, 19, 18], (i) => `snap-off BTN${i + 1}`).map((p) => ({ ...p, activeLow: false })),
    ],
    gpio: [...pmod("PMOD 1A", [4, 2, 47, 45, 3, 48, 46, 44]), ...pmod("PMOD 1B", [43, 38, 34, 31, 42, 36, 32, 28])],
    notes: "LEDs and buttons labelled snap-off are on the PMOD board that ships attached (or plugged into PMOD 2).",
  },
  "ulx3s-12f": ulx3s("12"),
  "ulx3s-25f": ulx3s("25"),
  "ulx3s-45f": ulx3s("45"),
  "ulx3s-85f": ulx3s("85"),
  "orangecrab-25f": {
    loader: "orangeCrab",
    name: "OrangeCrab r0.2 (ECP5 LFE5U-25F)",
    family: "ecp5",
    nextpnr: ["--25k", "--package", "CSFBGA285"],
    chip: "chipdb-25k.bin",
    trellis: "LFE5U-25F",
    downloadMb: 14,
    clockMhz: 48,
    io: "LVCMOS33",
    clock: { pin: "A9", label: "48 MHz oscillator" },
    leds: list(["K4", "M3", "J3"], (i) => `RGB LED ${["red", "green", "blue"][i]}`),
    ledsActiveLow: true,
    buttons: [{ pin: "J17", label: "user button (active low)", activeLow: true, io: "SSTL135_I" }],
    // Feather header; V17 (rst_n, reboots into the bootloader) is never assigned.
    gpio: ["N17", "M18", "C10", "C9", "B10", "B9", "C8", "B8", "A8", "H2", "J2", "N15", "R17", "N16", "L4", "N3", "N4", "H4", "G4", "T17"]
      .map((p) => ({ pin: p, label: `Feather pin ${p}` })),
  },
  tangnano9k: {
    loader: "tangnano9k",
    name: "Sipeed Tang Nano 9K (Gowin GW1NR-9)",
    family: "gowin",
    nextpnr: ["--device", "GW1NR-LV9QN88PC6/I5", "--vopt", "family=GW1N-9C"],
    chip: "GW1N-9C",
    downloadMb: 25,
    clockMhz: 27,
    io: "LVCMOS33",
    clock:  { pin: "52", label: "27 MHz oscillator" },
    uartRx: { pin: "18", label: "USB serial RX" },
    uartTx: { pin: "17", label: "USB serial TX" },
    leds: list([10, 11, 13, 14, 15, 16], (i) => `LED ${i}`, { io: "LVCMOS18" }),
    ledsActiveLow: true,
    buttons: list([3, 4], (i) => `S${i + 1} button (active low)`, { io: "LVCMOS18", pull: "UP" }).map((p) => ({ ...p, activeLow: true })),
    // Headers J6 and J7, without the SD card (36-39) and LCD backlight (86) pins.
    gpio: [25, 26, 27, 28, 29, 30, 33, 34, 40, 35, 41, 42, 51, 53, 54, 55, 56, 57, 68, 69,
           63, 85, 84, 83, 82, 81, 80, 79, 77, 76, 75, 74, 73, 72, 71, 70, 48, 49, 31, 32].map((p) => ({ pin: String(p), label: `header pin ${p}` })),
  },
  tangnano20k: {
    loader: "tangnano20k",
    name: "Sipeed Tang Nano 20K (Gowin GW2AR-18)",
    family: "gowin",
    nextpnr: ["--device", "GW2AR-LV18QN88C8/I7", "--vopt", "family=GW2A-18C"],
    chip: "GW2A-18C",
    downloadMb: 26,
    clockMhz: 27,
    io: "LVCMOS33",
    clock:  { pin: "4",  label: "27 MHz oscillator" },
    uartRx: { pin: "70", label: "USB serial RX" },
    uartTx: { pin: "69", label: "USB serial TX" },
    leds: list([15, 16, 17, 18, 19, 20], (i) => `LED ${i}`),
    ledsActiveLow: true,
    buttons: list([88, 87], (i) => `S${i + 1} button`).map((p) => ({ ...p, activeLow: false })),
    // Headers J5 and J6, without the LED, serial and RGB LED (79) pins.
    gpio: [75, 80, 42, 41, 56, 54, 51, 48, 55, 49, 86, 72, 71, 53, 52, 73, 74, 76, 85, 77, 27, 28, 26, 25, 29, 30, 31]
      .map((p) => ({ pin: String(p), label: `header pin ${p}` })),
  },
  basys3: {
    loader: "basys3",
    name: "Digilent Basys 3 (Artix-7 XC7A35T)",
    family: "xilinx",
    nextpnr: [],
    chip: "xc7a35tcpg236-1",
    downloadMb: 0,
    clockMhz: 100,
    io: "LVCMOS33",
    clock:  { pin: "W5",  label: "100 MHz oscillator" },
    uartRx: { pin: "B18", label: "USB serial RX (RsRx)" },
    uartTx: { pin: "A18", label: "USB serial TX (RsTx)" },
    leds: list(["U16", "E19", "U19", "V19", "W18", "U15", "U14", "V14", "V13", "V3", "W3", "U3", "P3", "N3", "P1", "L1"], (i) => `LED LD${i}`),
    buttons: list(["U18", "T18", "W19", "T17", "U17"], (i) => `${["centre", "up", "left", "right", "down"][i]} button (BTN${"CULRD"[i]})`)
      .map((p) => ({ ...p, activeLow: false })),
    switches: list(["V17", "V16", "W16", "W17", "W15", "V15", "W14", "W13", "V2", "T3", "T2", "R3", "W2", "U1", "T1", "R2"], (i) => `switch SW${i}`),
    gpio: [...pmod("Pmod JA", ["J1", "L2", "J2", "G2", "H1", "K2", "H2", "G3"]), ...pmod("Pmod JB", ["A14", "A16", "B15", "B16", "A15", "A17", "C15", "C16"]),
           ...pmod("Pmod JC", ["K17", "M18", "N17", "P18", "L17", "M19", "P17", "R18"])],
    extraConstraints: ["set_property CONFIG_VOLTAGE 3.3 [current_design]", "set_property CFGBVS VCCO [current_design]"],
  },
  "arty-a7-35t": {
    loader: "arty_a7_35t",
    name: "Digilent Arty A7-35T (Artix-7 XC7A35T)",
    family: "xilinx",
    nextpnr: [],
    chip: "xc7a35ticsg324-1L",
    downloadMb: 0,
    clockMhz: 100,
    io: "LVCMOS33",
    clock:  { pin: "E3",  label: "100 MHz oscillator" },
    uartRx: { pin: "A9",  label: "USB serial RX (uart_txd_in)" },
    uartTx: { pin: "D10", label: "USB serial TX (uart_rxd_out)" },
    leds: list(["H5", "J5", "T9", "T10"], (i) => `LED LD${i + 4}`),
    buttons: [
      { pin: "C2", label: "RESET button (active low)", activeLow: true },
      ...list(["D9", "C9", "B9", "B8"], (i) => `button BTN${i}`).map((p) => ({ ...p, activeLow: false })),
    ],
    switches: list(["A8", "C11", "C10", "A10"], (i) => `switch SW${i}`),
    gpio: [...pmod("Pmod JA", ["G13", "B11", "A11", "D12", "D13", "B18", "A18", "K16"]), ...pmod("Pmod JB", ["E15", "E16", "D15", "C15", "J17", "J18", "K15", "J15"]),
           ...pmod("Pmod JC", ["U12", "V12", "V10", "V11", "U14", "V14", "T13", "U13"]), ...pmod("Pmod JD", ["D4", "D3", "F4", "F3", "E2", "D2", "H2", "G2"])],
  },
  "nexys-a7-100t": {
    loader: "nexys_a7_100",
    name: "Digilent Nexys A7-100T (Artix-7 XC7A100T)",
    family: "xilinx",
    nextpnr: [],
    chip: "xc7a100tcsg324-1",
    downloadMb: 0,
    clockMhz: 100,
    io: "LVCMOS33",
    clock:  { pin: "E3", label: "100 MHz oscillator" },
    uartRx: { pin: "C4", label: "USB serial RX (UART_TXD_IN)" },
    uartTx: { pin: "D4", label: "USB serial TX (UART_RXD_OUT)" },
    leds: list(["H17", "K15", "J13", "N14", "R18", "V17", "U17", "U16", "V16", "T15", "U14", "T16", "V15", "V14", "V12", "V11"], (i) => `LED LD${i}`),
    buttons: [
      { pin: "C12", label: "CPU RESET button (active low)", activeLow: true },
      ...list(["N17", "M18", "P17", "M17", "P18"], (i) => `${["centre", "up", "left", "right", "down"][i]} button (BTN${"CULRD"[i]})`)
        .map((p) => ({ ...p, activeLow: false })),
    ],
    switches: ["J15", "L16", "M13", "R15", "R17", "T18", "U18", "R13", "T8", "U8", "R16", "T13", "H6", "U12", "U11", "V10"]
      .map((p, i) => ({ pin: p, label: `switch SW${i}`, ...(i === 8 || i === 9 ? { io: "LVCMOS18" } : {}) })),
    gpio: [...pmod("Pmod JA", ["C17", "D18", "E18", "G17", "D17", "E17", "F18", "G18"]), ...pmod("Pmod JB", ["D14", "F16", "G16", "H14", "E16", "F13", "G13", "H16"]),
           ...pmod("Pmod JC", ["K1", "F6", "J2", "G6", "E7", "J3", "J4", "E6"]), ...pmod("Pmod JD", ["H4", "H1", "G1", "G3", "H2", "G4", "G2", "F3"])],
  },
  "de10-lite": {
    loader: "de10lite",
    name: "Terasic DE10-Lite (Intel MAX 10 10M50)",
    family: "intel",
    nextpnr: [],
    chip: "10M50DAF484C7G",
    downloadMb: 0,
    clockMhz: 50,
    io: "3.3-V LVTTL",
    extraConstraints: ['set_global_assignment -name FAMILY "MAX 10"', "set_global_assignment -name DEVICE 10M50DAF484C7G"],
    clock: { pin: "P11", label: "50 MHz oscillator (MAX10_CLK1_50)" },
    leds: list(["A8", "A9", "A10", "B10", "D13", "C13", "E14", "D14", "A11", "B11"], (i) => `LED LEDR${i}`),
    buttons: list(["B8", "A7"], (i) => `KEY${i} button (active low)`).map((p) => ({ ...p, activeLow: true })),
    switches: list(["C10", "C11", "D12", "C12", "A12", "B12", "A13", "A14", "B14", "F15"], (i) => `switch SW${i}`),
    gpio: ["V10", "W10", "V9", "W9", "V8", "W8", "V7", "W7", "W6", "V5", "W5", "AA15", "AA14", "W13", "W12", "AB13", "AB12", "Y11", "AB11", "W11",
           "AB10", "AA10", "AA9", "Y8", "AA8", "Y7", "AA7", "Y6", "AA6", "Y5", "AA5", "Y4", "AB3", "Y3", "AB2", "AA2"].map((p, i) => ({ pin: p, label: `GPIO header JP1 GPIO_${i}` })),
  },
};

/** Whether a board's bitstream is built here, or exported as a project for the vendor's tools. */
export const buildsInBrowser = (b: Board) => b.family === "ice40" || b.family === "ecp5" || b.family === "gowin";

export const CONSTRAINT_FORMAT: Record<Family, ConstraintFormat> = { ice40: "pcf", ecp5: "lpf", gowin: "cst", xilinx: "xdc", intel: "qsf" };

export interface PortInfo { direction: string; width: number }
export type PinKind = "clock" | "uart" | "led" | "button" | "switch" | "gpio";
export interface Assignment { port: string; pin: string; where: string; kind: PinKind; io: string; pull?: "UP" | "DOWN" }

/** Every labelled pin of a board and what it is (the constraints editor's pin picker and checks). */
export function boardPins(b: Board): (Pin & { kind: PinKind })[] {
  const tag = (kind: PinKind) => (p: Pin) => ({ pin: p.pin, label: p.label, io: p.io, pull: p.pull, kind });
  return [
    tag("clock")(b.clock), ...[b.uartRx, b.uartTx].filter((p): p is Pin => !!p).map(tag("uart")),
    ...b.leds.map(tag("led")), ...b.buttons.map(tag("button")), ...(b.switches ?? []).map(tag("switch")), ...b.gpio.map(tag("gpio")),
  ];
}

/** Assignments (for the table and the flow) from hand-written placements. */
export function assignmentsFrom(b: Board, entries: ConstraintEntry[]): Assignment[] {
  const known = new Map(boardPins(b).map((p) => [p.pin.toUpperCase(), p]));
  return entries.map((e) => {
    const p = known.get(e.pin.toUpperCase());
    const pull = e.pull ?? p?.pull;
    return { port: e.port, pin: e.pin, where: p?.label ?? "pin not labelled on this board", kind: p?.kind ?? "gpio", io: e.io ?? p?.io ?? b.io, ...(pull ? { pull } : {}) };
  });
}

const CLOCK  = /^(clk|clock)$/i;
const BUTTON = /^(rst|reset|btn|key|button)/i;
const ACTIVE_LOW = /_n$|^(rstn|resetn|aresetn)$/i;   // rst_n, btn_n, ...; not "btn"

/**
 * A pin for every port bit (LSB first), the constraints file in the board's format,
 * and an error naming what couldn't be placed. Ports are taken in the order Yosys lists them.
 */
export function pinout(boardId: BoardId, ports: Record<string, PortInfo>) {
  const board = BOARDS[boardId];
  const leds = [...board.leds], buttons = [...board.buttons], switches = [...(board.switches ?? [])], gpio = [...board.gpio];
  const assignments: Assignment[] = [];
  const unplaced: string[] = [];
  const notes = new Set<string>();
  const place = (name: string, p: Pin | undefined, kind: PinKind) => {
    if (p) assignments.push({ port: name, pin: p.pin, where: p.label, kind, io: p.io ?? board.io, ...(p.pull ? { pull: p.pull } : {}) });
    else unplaced.push(name);
  };

  for (const [port, { direction, width }] of Object.entries(ports)) {
    if (width === 1 && direction === "input" && CLOCK.test(port)) { place(port, board.clock, "clock"); continue; }
    const serial = width === 1 && ((direction === "input" && /^rx$/i.test(port)) || (direction === "output" && /^tx$/i.test(port)));
    if (serial && board.uartRx && board.uartTx) { place(port, direction === "input" ? board.uartRx : board.uartTx, "uart"); continue; }
    if (serial) notes.add(`The ${board.name} has no USB serial port: tx / rx go to GPIO pins, where you can wire a 3.3 V USB-serial adapter.`);
    for (let i = 0; i < width; i++) {
      let pin: Pin | undefined, kind: PinKind = "gpio";
      if (direction === "output" && /^led/i.test(port) && (pin = leds.shift())) kind = "led";
      if (direction === "input" && BUTTON.test(port)) {
        const k = buttons.findIndex((b) => b.activeLow === ACTIVE_LOW.test(port));
        if (k >= 0) { pin = buttons.splice(k, 1)[0]; kind = "button"; }
        else if (board.buttons.length === 0) notes.add(`The ${board.name} has no buttons: button inputs go to GPIO pins, where you can wire a switch.`);
      }
      if (direction === "input" && /^sw/i.test(port) && (pin = switches.shift())) kind = "switch";
      if (!pin) pin = gpio.shift();
      place(width === 1 ? port : `${port}[${i}]`, pin, kind);
    }
  }
  if (board.notes && assignments.some((a) => a.where.startsWith("snap-off"))) notes.add(board.notes);
  if (board.ledsActiveLow && assignments.some((a) => a.kind === "led")) notes.add("This board's LEDs are active low: an LED lights when its output is 0.");

  return {
    assignments,
    format: CONSTRAINT_FORMAT[board.family],
    constraints: emitConstraints(CONSTRAINT_FORMAT[board.family], assignments, board),
    error: unplaced.length ? `The ${board.name} has no free pin for: ${unplaced.join(", ")}. Use fewer or narrower ports.` : null,
    notes: [...notes],
  };
}
