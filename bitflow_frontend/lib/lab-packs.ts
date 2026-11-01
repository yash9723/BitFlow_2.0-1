/**
 * lib/lab-packs.ts — ready-made semesters of lab assignments for a class: one assignment
 * per experiment, due a week apart (app/api/classes/[id]/packs). Built from the experiments
 * most Indian university digital electronics, HDL and VLSI labs share; a teacher can delete
 * or edit any of them afterwards. Every slug is checked by scripts/lab-packs.check.ts.
 */

export interface LabExperiment {
  title: string;
  slugs: string[];
}

export interface LabPack {
  id: string;
  title: string;
  /** Who it is for, e.g. the semester and course. */
  audience: string;
  experiments: LabExperiment[];
}

export const LAB_PACKS: LabPack[] = [
  {
    id: "digital-electronics",
    title: "Digital electronics lab",
    audience: "3rd or 4th semester ECE/EEE: gates to counters, 10 experiments",
    experiments: [
      { title: "Exp 1: Logic gates", slugs: ["inverter", "and-gate", "or-gate", "nand-gate", "nor-gate", "xor-gate", "xnor-gate"] },
      { title: "Exp 2: Boolean functions and K-maps", slugs: ["chip-7458", "majority-of-three", "kmap-3var", "kmap-4var", "kmap-dont-cares"] },
      { title: "Exp 3: Adders and subtractors", slugs: ["half-adder", "full-adder", "ripple-carry-adder-4bit", "adder-subtractor"] },
      { title: "Exp 4: Multiplexers and demultiplexers", slugs: ["mux-2to1", "mux-4to1", "mux-8to1", "demux-1to4"] },
      { title: "Exp 5: Decoders and encoders", slugs: ["decoder-2to4", "decoder-3to8", "octal-encoder", "priority-encoder", "seven-seg-decoder"] },
      { title: "Exp 6: Comparators, code converters and parity", slugs: ["magnitude-comparator", "gray-code-converter", "even-parity-generator", "parity-error-detector"] },
      { title: "Exp 7: Latches and flip-flops", slugs: ["sr-latch", "d-latch", "sr-flip-flop", "jk-flip-flop", "d-flip-flop", "t-flip-flop"] },
      { title: "Exp 8: Shift registers", slugs: ["shift-reg-siso", "shift-reg-sipo", "shift-reg-piso", "shift-reg-pipo", "universal-shift-register"] },
      { title: "Exp 9: Counters", slugs: ["up-counter-async", "4-bit-counter", "up-down-counter", "mod-n-counter", "bcd-decade-counter"] },
      { title: "Exp 10: Ring and Johnson counters, sequence detector", slugs: ["ring-counter", "johnson-counter", "seq-detect-1011-moore"] },
    ],
  },
  {
    id: "verilog-hdl",
    title: "Verilog HDL lab",
    audience: "5th or 6th semester HDL or digital system design: 8 experiments",
    experiments: [
      { title: "Exp 1: Modelling styles", slugs: ["half-adder", "full-adder", "mux-4to1", "decoder-3to8"] },
      { title: "Exp 2: Combinational building blocks", slugs: ["priority-encoder", "barrel-shifter-4bit", "magnitude-comparator", "seven-seg-decoder"] },
      { title: "Exp 3: Arithmetic and the ALU", slugs: ["adder-subtractor", "rv-alu", "shift-add-multiplier"] },
      { title: "Exp 4: Flip-flops and registers", slugs: ["dff-sync-reset", "d-ff-async", "dff-enable", "blocking-vs-nonblocking", "register-file-8x8"] },
      { title: "Exp 5: Counters and clock dividers", slugs: ["up-down-counter-load", "bcd-counter-00-99", "parameterized-clock-divider", "lfsr-8bit"] },
      { title: "Exp 6: Finite state machines", slugs: ["seq-detect-1011-moore", "seq-detect-1011-mealy", "traffic-light-controller", "vending-machine-fsm"] },
      { title: "Exp 7: Memories", slugs: ["sram-write-first", "rom-readmemh", "stack-lifo-4", "fifo-sync"] },
      { title: "Exp 8: Interfaces", slugs: ["button-debouncer", "configurable-pwm", "uart-transmitter-8n1", "uart-receiver-8n1"] },
    ],
  },
  {
    id: "vlsi-design",
    title: "VLSI design lab",
    audience: "7th semester or M.Tech VLSI: SystemVerilog, protocols and a RISC-V CPU, 6 experiments",
    experiments: [
      { title: "Exp 1: SystemVerilog for design", slugs: ["sv-priority-encoder", "sv-updown-counter", "sv-enum-detector", "sv-register-file"] },
      { title: "Exp 2: Arithmetic datapaths", slugs: ["shift-add-multiplier", "restoring-divider", "gcd-calculator", "pipelined-multiplier-3stage"] },
      { title: "Exp 3: Memories and clock domain crossing", slugs: ["sram-true-dual-port", "fifo-threshold-flags", "async-fifo-cdc"] },
      { title: "Exp 4: Serial protocols", slugs: ["spi-master-controller", "i2c-start-stop-detector", "uart-receiver-8n1"] },
      { title: "Exp 5: Arbitration and handshakes", slugs: ["round-robin-arbiter", "sv-req-ack-handshake", "edge-detector"] },
      { title: "Exp 6: A RISC-V processor", slugs: ["rv-alu", "rv-regfile", "rv-immgen", "rv-branch", "rv-datapath", "rv-cpu"] },
    ],
  },
];

export const labPack = (id: unknown) => LAB_PACKS.find((p) => p.id === id);

/** Due dates for a pack's experiments: the first at `firstDue`, then every `everyDays` days. */
export function packDueDates(firstDue: Date, count: number, everyDays = 7): Date[] {
  return Array.from({ length: count }, (_, i) => new Date(firstDue.getTime() + i * everyDays * 86_400_000));
}
