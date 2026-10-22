/**
 * lib/synth/yosys.ts — Yosys scripts and output parsers, ported one-for-one from
 * api/routes/synthesize.py so synthesis can run in the browser (lib/synth/worker.ts)
 * with results identical to the server's. Both sides run Yosys 0.52.
 * Keep the two in step; scripts/synth-parity.check.ts compares them.
 */

export const MAX_SCHEMATIC_CELLS = 300;
const MAX_WARNINGS = 30;
const MAX_BOARD_CELLS = 20_000;

export const SYNTH_SCRIPT = `read_verilog -sv design.v
hierarchy -auto-top
proc
opt -nodffe -nosdff
memory -nomap
opt -nodffe -nosdff
write_json netlist.json
tee -q -o stat.json stat -json
check
fsm_detect
fsm_extract
tee -q -o fsm.txt fsm_info
`;

export const METRICS_SCRIPT = `read_verilog -sv design.v
synth -auto-top -flatten -noabc
abc -g AND,NAND,OR,NOR,XOR,XNOR,MUX
opt_clean
tee -q -o stat.json stat -json
tee -q -o ltp.txt ltp -noff
`;

export const BOARD_SCRIPT = `read_verilog -sv design.v
synth -auto-top -flatten -noabc -nordff
dffunmap
abc -g AND,NAND,OR,NOR,XOR,XNOR,MUX
opt_clean
write_json board.json
`;

// ── /synthesize ─────────────────────────────────────────────────────────────

type Json = any; // Yosys JSON, read defensively like the Python side

const PARAM_DECL = /\b(?:localparam|parameter)\b([^;]*);/g;
const PARAM_PAIR = /([A-Za-z_]\w*)\s*=\s*([^,;]+)/g;
const NUMBER     = /^\s*(?:\d*\s*'\s*[sS]?([bBoOdDhH])\s*([0-9a-fA-F_]+)|(\d+))\s*$/;
const BASES: Record<string, number> = { b: 2, o: 8, d: 10, h: 16 };

/** value -> name for localparams/parameters with a constant value (unique values only). */
export function paramNames(source: string): Map<number, string> {
  const byValue = new Map<number, string[]>();
  for (const [, rawDecl] of source.replace(/\/\/.*/g, "").matchAll(PARAM_DECL)) {
    const decl = rawDecl.replace(/\[[^\]]*\]/g, "");
    for (const [, name, value] of decl.matchAll(PARAM_PAIR)) {
      const m = NUMBER.exec(value);
      if (!m) continue;
      const n = m[3] ? parseInt(m[3], 10) : parseInt(m[2].replace(/_/g, ""), BASES[m[1].toLowerCase()]);
      byValue.set(n, [...(byValue.get(n) ?? []), name]);
    }
  }
  return new Map([...byValue].filter(([, names]) => names.length === 1).map(([v, names]) => [v, names[0]]));
}

export interface FsmState { id: number; code: number | null; name: string | null; reset: boolean }
export interface Fsm {
  module: string; stateReg: string; states: FsmState[]; reset: string | null;
  transitions: { from: number; to: number; conditions: string[] }[];
}

/** Parse Yosys `fsm_info` output into states + merged transitions. */
export function parseFsmInfo(text: string, names: Map<number, string>): Fsm[] {
  const fsms: Fsm[] = [];
  for (const block of text.split(/\n(?=FSM `)/)) {
    const head = /FSM `[^']*' from module `([^']*)'/.exec(block);
    const reg  = /Information on FSM \S+ \(\\?([^)]*)\)/.exec(block);
    if (!head || !reg) continue;

    const inputs: (string | null)[] = [];
    let sec = /Input signals:\n((?:\s+\d+: .*\n)+)/.exec(block);
    for (const line of sec ? sec[1].split("\n").filter(Boolean) : []) {
      const sig = line.split(":").slice(1).join(":").trim();
      inputs.push(sig.startsWith("\\") ? sig.slice(1) : null);   // null = internal ($...) net
    }

    const states: FsmState[] = [];
    sec = /State encoding:\n((?:\s+\d+: .*\n)+)/.exec(block);
    for (const line of sec ? sec[1].split("\n").filter(Boolean) : []) {
      const m = /^\s*(\d+):\s+\d+'([01xz]+)(\s+<RESET STATE>)?/.exec(line);
      if (!m) continue;
      const code = /^[01]+$/.test(m[2]) ? parseInt(m[2], 2) : null;
      states.push({ id: +m[1], code, name: code !== null ? names.get(code) ?? null : null, reset: !!m[3] });
    }

    const merged = new Map<string, { src: number; dst: number; conds: string[] }>();
    for (const m of block.matchAll(/^\s*\d+:\s+(\d+)\s+\d+'([01-]+)\s+->\s+(\d+)/gm)) {
      const [src, bits, dst] = [+m[1], m[2], +m[3]];
      const terms: string[] = [];
      let hidden = false;
      [...bits].reverse().forEach((ch, i) => {           // bit i belongs to input i
        if (ch === "-") return;
        const name = i < inputs.length ? inputs[i] : null;
        if (name === null) hidden = true;
        else terms.push(`${name}=${ch}`);
      });
      const cond = terms.join(" & ") + (hidden && terms.length ? " & …" : hidden ? "…" : "");
      const key = `${src},${dst}`;
      const entry = merged.get(key) ?? { src, dst, conds: [] };
      merged.set(key, entry);
      if (!entry.conds.includes(cond)) entry.conds.push(cond);
    }

    const reset = factorOutReset(merged, states);
    fsms.push({
      module: head[1].replace(/^\\+/, ""), stateReg: reg[1], states, reset,
      transitions: [...merged.values()].filter((e) => e.conds.length).map((e) => ({ from: e.src, to: e.dst, conditions: e.conds })),
    });
  }
  return fsms;
}

/**
 * A synchronous reset shows up as "rst=1" from every state to the reset state,
 * plus "rst=0 & ..." on every other condition: pull it out and return "rst=1".
 */
function factorOutReset(merged: Map<string, { src: number; dst: number; conds: string[] }>, states: FsmState[]): string | null {
  const reset = states.find((s) => s.reset)?.id;
  if (reset === undefined || states.length < 2) return null;
  let candidates = null as Set<string> | null;
  for (const s of states) {
    const conds = merged.get(`${s.id},${reset}`)?.conds ?? [];
    const single = new Set(conds.filter((c) => !c.includes("&") && !c.includes("…") && c.includes("=")));
    const prev: Set<string> | null = candidates;
    candidates = prev === null ? single : new Set([...prev].filter((c) => single.has(c)));
  }
  if (!candidates || candidates.size === 0) return null;
  const term = [...candidates].sort()[0];
  const [name, value] = term.split("=");
  const inactive = `${name}=${value === "1" ? "0" : "1"}`;
  for (const entry of merged.values()) {
    const cleaned: string[] = [];
    for (const c of entry.conds) {
      if (c === term && entry.dst === reset) continue;
      const c2 = c.split(" & ").filter((p) => p !== inactive).join(" & ");
      if (!cleaned.includes(c2)) cleaned.push(c2);
    }
    entry.conds = cleaned;
  }
  return term;
}

/** Cell counts by type and total flip-flop bits. */
export function summarize(stat: Json, netlist: Json) {
  const design = stat?.design ?? {};
  const cells: Record<string, number> = design.num_cells_by_type ?? {};
  let ffBits = 0, count = 0;
  for (const mod of Object.values<Json>(netlist?.modules ?? {})) {
    for (const cell of Object.values<Json>(mod.cells ?? {})) {
      count++;
      const type: string = cell.type ?? "";
      if (type.includes("dff") || type.includes("dlatch")) {
        const width = cell.parameters?.WIDTH ?? "1";
        ffBits += typeof width === "string" ? parseInt(width, 2) : Number(width);
      }
    }
  }
  return { numCells: (design.num_cells ?? count) as number, cells, ffBits };
}

/** Signals Yosys turned into latches (incomplete assignment in always @*). */
export function latchesFromLog(log: string): string[] {
  return [...new Set([...log.matchAll(/^Latch inferred for signal `[^']*?\.\\?([^'.]+)'/gm)].map((m) => m[1]))].sort();
}

export function warningsFromOutput(output: string): string[] {
  const seen: string[] = [];
  for (const raw of output.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("Warning:") && !seen.includes(line)) seen.push(line);
  }
  return seen.slice(0, MAX_WARNINGS);
}

// ── /metrics ────────────────────────────────────────────────────────────────

const REGISTER_CELL = /DFF|DLATCH|_SR_|_FF_/i;

/** {gates, ffBits, depth} from `stat -json` and `ltp -noff` output. */
export function gateMetrics(stat: Json, ltpText: string) {
  const cells: Record<string, number> = stat?.design?.num_cells_by_type ?? {};
  let ffBits = 0, gates = 0;
  for (const [t, n] of Object.entries(cells)) REGISTER_CELL.test(t) ? (ffBits += n) : (gates += n);
  const depths = [...ltpText.matchAll(/length=(\d+)/g)].map((m) => +m[1]);
  return { gates, ffBits, depth: depths.length ? Math.max(...depths) : 0 };
}

// ── /board ──────────────────────────────────────────────────────────────────

const BOARD_CELLS = new Set([
  "$_BUF_", "$_NOT_", "$_AND_", "$_NAND_", "$_OR_", "$_NOR_", "$_XOR_", "$_XNOR_",
  "$_ANDNOT_", "$_ORNOT_", "$_MUX_", "$_NMUX_", "$_DFF_P_", "$_DFF_N_",
  ...[..."NP"].flatMap((c) => [..."NP"].flatMap((r) => [..."01"].map((v) => `$_DFF_${c}${r}${v}_`))),
  ...[..."NP"].flatMap((c) => [..."NP"].flatMap((s) => [..."NP"].map((r) => `$_DFFSR_${c}${s}${r}_`))),
]);

/** Top module's ports and cells, or an error if the board can't run it. */
export function boardNetlist(netlist: Json) {
  const modules: Json[] = Object.values(netlist?.modules ?? {});
  const top = modules.find((m) => m.attributes?.top) ?? (modules.length === 1 ? modules[0] : null);
  if (!top) return { ok: false as const, error: "No top module found." };
  const cells: Json[] = Object.values<Json>(top.cells ?? {}).filter((c) => c.type !== "$scopeinfo");
  const unsupported = [...new Set(cells.map((c) => c.type as string))].filter((t) => !BOARD_CELLS.has(t)).sort();
  if (unsupported.length) {
    const what = unsupported.some((t) => t.includes("LATCH")) ? "latches" : unsupported.join(", ");
    return { ok: false as const, error: `The board can't simulate ${what}. Use clocked registers and plain logic.` };
  }
  if (cells.length > MAX_BOARD_CELLS) {
    return { ok: false as const, error: `Too large for the board (${cells.length} gates; limit ${MAX_BOARD_CELLS}).` };
  }
  return {
    ok: true as const,
    ports: Object.fromEntries(Object.entries<Json>(top.ports ?? {}).map(([n, p]) => [n, { direction: p.direction, bits: p.bits }])),
    cells: cells.map((c) => ({ type: c.type, conn: c.connections })),
  };
}
