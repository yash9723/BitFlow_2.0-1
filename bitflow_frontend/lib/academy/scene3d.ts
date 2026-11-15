/**
 * lib/academy/scene3d.ts — what the Academy's 3D animations say at each step (components/academy/anim/scene3d.tsx).
 * The scenes only turn this state into colours and positions, so every claim in a caption is tested here
 * (scripts/academy.check.ts) and nothing about the physics lives in the drawing code.
 */
import { cmosState, dramLeak, dramRefresh, inverterState, lutRead } from "@/lib/academy/anim";

// ── A CMOS inverter, cut open ─────────────────────────────────────────────────
export interface CmosStep { a: 0 | 1 | null; pmosOn: boolean; nmosOn: boolean; y: 0 | 1 | null; caption: string }
export function cmosCutawaySteps(): CmosStep[] {
  const at = (a: 0 | 1) => { const s = cmosState("not", a, 0), v = inverterState(a * 5); return { a, pmosOn: s.pa && v.pmos, nmosOn: s.na && v.nmos, y: s.y as 0 | 1 }; };
  return [
    { a: null, pmosOn: false, nmosOn: false, y: null,
      caption: "A CMOS inverter cut open. On the left an NMOS transistor sits in the p-type silicon. On the right a PMOS transistor sits in an n-type well. Both gates share one input, and both drains share one output." },
    { ...at(0), caption: "Input 0. The low gate voltage lets the PMOS form a channel, so current flows from the supply to the output and it reads 1. The NMOS channel stays closed." },
    { ...at(1), caption: "Input 1. Now the NMOS forms a channel and the PMOS closes, so the output drains to ground and reads 0." },
    { ...at(0), caption: "Back to 0. Only one transistor conducts at a time, so there is never a steady path from supply to ground. That is why a CMOS gate uses almost no power while it holds a value." },
  ];
}

// ── An FPGA's logic blocks and routing ────────────────────────────────────────
export const FABRIC = { cols: 4, rows: 3 };
export const FABRIC_LUT = [0, 0, 0, 1, 0, 1, 1, 1];   // a 3-input majority function
export const FABRIC_INPUTS = [1, 0, 1];
export interface Cell2 { i: number; j: number }
/** The switch boxes a signal passes from block `a`'s lower right corner to block `b`'s upper left corner: along a row of boxes, then down a column. */
export function fabricRoute(a: Cell2, b: Cell2): Cell2[] {
  const out: Cell2[] = [{ i: a.i + 1, j: a.j + 1 }], end = { i: b.i, j: b.j };
  let { i, j } = out[0];
  while (i !== end.i) { i += end.i > i ? 1 : -1; out.push({ i, j }); }
  while (j !== end.j) { j += end.j > j ? 1 : -1; out.push({ i, j }); }
  return out;
}
export const FABRIC_FROM: Cell2 = { i: 0, j: 2 }, FABRIC_TO: Cell2 = { i: 2, j: 0 };
export interface FabricStep { lutUp: boolean; inputs: number[] | null; address: number | null; bit: number | null; ff: boolean; routed: boolean; caption: string }
export function fabricSteps(): FabricStep[] {
  const address = FABRIC_INPUTS.reduce((n, b) => n * 2 + b, 0), bit = lutRead(FABRIC_LUT, FABRIC_INPUTS);
  return [
    { lutUp: false, inputs: null, address: null, bit: null, ff: false, routed: false, caption: "An FPGA is a grid of logic blocks with programmable wiring between them. The blocks are the squares. At each crossing of the wiring channels is a switch box." },
    { lutUp: true, inputs: null, address: null, bit: null, ff: false, routed: false, caption: "Lift one block's look-up table out. A 3-input LUT is 8 memory bits, and these have been loaded with the majority function: the output is 1 when at least two inputs are 1." },
    { lutUp: true, inputs: FABRIC_INPUTS, address: null, bit: null, ff: false, routed: false, caption: `The three inputs arrive: a = ${FABRIC_INPUTS[0]}, b = ${FABRIC_INPUTS[1]}, c = ${FABRIC_INPUTS[2]}.` },
    { lutUp: true, inputs: FABRIC_INPUTS, address, bit, ff: false, routed: false, caption: `The inputs form the address ${address.toString(2).padStart(3, "0")}, which is ${address}. The LUT reads memory bit ${address}, and that bit is ${bit}, so the output is ${bit}. Nothing is calculated: the answer was stored in advance.` },
    { lutUp: true, inputs: FABRIC_INPUTS, address, bit, ff: true, routed: false, caption: `On the clock edge the block's flip-flop captures the LUT's output, ${bit}, and holds it. A block can use the LUT's output directly or the registered one.` },
    { lutUp: true, inputs: FABRIC_INPUTS, address, bit, ff: true, routed: true, caption: "The result leaves the block and travels through switch boxes that were programmed to connect this wire to that one, ending at an input of another block. Changing which switches are on changes the circuit." },
  ];
}

// ── A DRAM array ──────────────────────────────────────────────────────────────
export const MEM = { rows: 4, cols: 4 };
export const MEM_DATA = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0];   // row-major, 4 × 4
export const MEM_ROW = 1, MEM_LEAK = 0.15;
const leakTimes = (q: number[], n: number) => { let c = q; for (let k = 0; k < n; k++) c = dramLeak(c, MEM_LEAK); return c; };
const readOf = (q: number[]) => q.map((v) => (v >= 0.5 ? 1 : 0));
export interface MemStep { row: number | null; senseRow: number[] | null; charge: number[]; lost: number; caption: string }
export function memorySteps(): MemStep[] {
  const full = MEM_DATA.map(Number), lostIn = (q: number[]) => readOf(q).filter((b, i) => b !== MEM_DATA[i]).length;
  const aged = leakTimes(full, 3), long = leakTimes(full, 6);
  const rowBits = MEM_DATA.slice(MEM_ROW * MEM.cols, (MEM_ROW + 1) * MEM.cols);
  return [
    { row: null, senseRow: null, charge: full, lost: 0, caption: "A DRAM array. Each cell is one transistor and one tiny capacitor, and a full capacitor means 1. Word lines run along the rows and bit lines run down the columns." },
    { row: MEM_ROW, senseRow: null, charge: full, lost: 0, caption: `The address picks row ${MEM_ROW}. Its word line goes high and switches on the access transistor in every cell of that row, joining each capacitor to its bit line.` },
    { row: MEM_ROW, senseRow: rowBits, charge: full, lost: 0, caption: `Each bit line moves a little towards its cell's charge, and a sense amplifier turns that into a full 0 or 1: here ${rowBits.join("")}. Reading drains the capacitors a little, so the amplifier writes the value back.` },
    { row: null, senseRow: null, charge: aged, lost: lostIn(aged), caption: `Time passes. Charge leaks away from every capacitor. After a while each 1 has fallen to about ${Math.round(aged[0] * 100)}% but is still above the halfway line, so it still reads as 1.` },
    { row: null, senseRow: null, charge: dramRefresh(aged), lost: lostIn(dramRefresh(aged)), caption: "Refresh: each row is read and written back at full charge before anything falls below halfway. Real DRAM does this for every row, about every 64 ms." },
    { row: null, senseRow: null, charge: long, lost: lostIn(long), caption: `Without refresh, the charge keeps leaking. Now each 1 is at about ${Math.round(long[0] * 100)}%, below halfway, so it reads as 0: ${lostIn(long)} bits are lost, and a refresh can't bring them back.` },
  ];
}

// ── The layers of a chip ──────────────────────────────────────────────────────
export interface Layer { id: string; name: string; role: string }
/** Bottom to top. */
export const LAYERS: Layer[] = [
  { id: "wafer", name: "Silicon wafer", role: "The base: a slice of silicon, lightly doped so it is p-type or n-type." },
  { id: "diffusion", name: "Wells and diffusions", role: "Regions doped the other way form the sources and drains of the transistors." },
  { id: "gate", name: "Gate oxide and polysilicon", role: "A thin insulator, then the gate on top of it that switches each transistor." },
  { id: "contacts", name: "Contacts", role: "Small metal plugs that reach up from the transistors to the first wiring layer." },
  { id: "metal1", name: "Metal 1", role: "The first wiring layer, with the thinnest wires. It joins nearby transistors into gates." },
  { id: "mid", name: "Vias and middle metal", role: "Alternating via and wire layers carry signals across the chip. Vias are plugs between wire layers." },
  { id: "top", name: "Top metal", role: "Thicker wires near the top carry power, ground and the clock over long distances." },
  { id: "passivation", name: "Passivation", role: "A protective insulating coat, with openings where the pads connect to the outside." },
];
export interface LayerStep { visible: number; gap: number; focus: number; caption: string }
export function layerSteps(): LayerStep[] {
  const build = LAYERS.map((l, i): LayerStep => ({ visible: i + 1, gap: 1, focus: i, caption: `${i + 1} of ${LAYERS.length}: ${l.name}. ${l.role}` }));
  return [...build, { visible: LAYERS.length, gap: 0, focus: -1, caption: "Pressed together, the layers are a chip well under a millimetre thick. The transistors are all in the bottom layers, and every layer above them is wiring and insulation. Each layer is made by the same repeating steps: deposit, pattern with light, etch." }];
}
