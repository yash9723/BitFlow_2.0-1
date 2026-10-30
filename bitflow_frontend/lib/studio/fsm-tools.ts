/**
 * lib/studio/fsm-tools.ts — what the FSM designer does with a finished machine: merge states
 * that behave the same (partition refinement), run a typed input sequence, and hand a run to
 * the timing-diagram tool. Self-check: scripts/fsm-tools.check.ts.
 */
import type { Values } from "./expr";
import { type FsmModel, MAX_ENUM_BITS, allInputs, step, validate } from "./fsm";
import { MAX_CYCLES, type WaveDiagram, type WaveNote, type WaveSignal } from "./wave";

export interface Minimized {
  model: FsmModel;
  /** Each merge: the state kept and the states folded into it (names). */
  merged: { keep: string; gone: string[] }[];
  /** States no input can reach from reset (names); dropped. */
  unreachable: string[];
  /** The groups after each round: first by outputs, then split until next states agree (names). */
  passes: string[][][];
}

/**
 * Merge equivalent states. Two states are equivalent if, for every input, they give the same
 * outputs and go to equivalent states; refinement starts from "same outputs" and splits a group
 * whenever its members disagree on the group of a next state. Kept states keep their own
 * transitions, redirected, so conditions and priorities still work; a transition to a state that
 * can't be reached was never taken, so dropping it changes nothing.
 */
export function minimizeFsm(m: FsmModel): Minimized | string {
  if (validate(m).some((i) => i.level === "error")) return "Fix the errors first.";
  if (m.inputs.reduce((n, p) => n + p.width, 0) > MAX_ENUM_BITS) return `Minimizing tries every input, so it handles up to ${MAX_ENUM_BITS} input bits.`;
  const combos = allInputs(m.inputs);
  const next = new Map<string, string[]>(), outs = new Map<string, string>();
  const reachable: string[] = [m.reset];
  for (let i = 0; i < reachable.length; i++) {
    const s = reachable[i], rows = combos.map((v) => step(m, s, v));
    next.set(s, rows.map((r) => r.next));
    outs.set(s, rows.map((r) => m.outputs.map((o) => r.outputs[o.name]).join(",")).join("|"));
    for (const r of rows) if (!reachable.includes(r.next)) reachable.push(r.next);
  }
  const kept = m.states.filter((s) => next.has(s.id));
  const nameOf = (id: string) => m.states.find((s) => s.id === id)!.name;
  const groupsBy = (key: (id: string) => string) => {
    const groups = new Map<string, string[]>();
    for (const s of kept) (groups.get(key(s.id)) ?? groups.set(key(s.id), []).get(key(s.id))!).push(s.id);
    return [...groups.values()];
  };

  let groups = groupsBy((id) => outs.get(id)!);
  const passes = [groups];
  for (;;) {
    const blockOf = new Map(groups.flatMap((g, i) => g.map((id) => [id, i] as const)));
    const split = groupsBy((id) => `${blockOf.get(id)}/${next.get(id)!.map((n) => blockOf.get(n)).join(",")}`);
    if (split.length === groups.length) break;
    groups = split;
    passes.push(groups);
  }

  const repOf = new Map<string, string>();
  for (const g of groups) {
    const rep = g.includes(m.reset) ? m.reset : g[0];
    for (const id of g) repOf.set(id, rep);
  }
  const reps = new Set(repOf.values());
  return {
    model: {
      ...m,
      states: m.states.filter((s) => reps.has(s.id)),
      transitions: m.transitions.filter((t) => reps.has(t.from) && repOf.has(t.to)).map((t) => ({ ...t, to: repOf.get(t.to)! })),
    },
    merged: groups.filter((g) => g.length > 1).map((g) => {
      const keep = repOf.get(g[0])!;
      return { keep: nameOf(keep), gone: g.filter((id) => id !== keep).map(nameOf) };
    }),
    unreachable: m.states.filter((s) => !next.has(s.id)).map((s) => s.name),
    passes: passes.map((p) => p.map((g) => g.map(nameOf))),
  };
}

const MAX_SEQUENCE = 200;

/**
 * Input vectors for a run, one per clock cycle, or what's wrong with the text. A single 1-bit
 * input takes bits ("1011", spaces ignored). Otherwise one token per cycle, with the inputs' values
 * in order and commas between them: "1,0 0,3". A machine with no inputs takes a number of cycles.
 */
export function parseSequence(m: FsmModel, text: string): Values[] | string {
  const t = text.trim();
  if (!t) return "Type the inputs, one cycle after another.";
  if (!m.inputs.length) {
    if (!/^\d+$/.test(t)) return "This machine has no inputs: type how many cycles to run.";
    if (Number(t) > MAX_SEQUENCE) return `Runs go up to ${MAX_SEQUENCE} cycles.`;
    return Array.from({ length: Number(t) }, () => ({}));
  }
  const single = m.inputs.length === 1 && m.inputs[0].width === 1;
  if (single && !/^[01\s]+$/.test(t)) return `Use only 0 and 1 for ${m.inputs[0].name}.`;
  const tokens = single ? t.replace(/\s+/g, "").split("") : t.split(/\s+/);
  if (tokens.length > MAX_SEQUENCE) return `Runs go up to ${MAX_SEQUENCE} cycles.`;
  const out: Values[] = [];
  for (const [i, tok] of tokens.entries()) {
    const parts = tok.split(",");
    if (parts.length !== m.inputs.length) return `Cycle ${i + 1} ("${tok}") needs ${m.inputs.length} value${m.inputs.length === 1 ? "" : "s"}: ${m.inputs.map((p) => p.name).join(", ")}.`;
    const v: Values = {};
    for (const [k, p] of m.inputs.entries()) {
      if (!/^\d+$/.test(parts[k]) || Number(parts[k]) >= 2 ** p.width) return `Cycle ${i + 1}: ${p.name} = "${parts[k]}" doesn't fit in ${p.width} bit${p.width === 1 ? "" : "s"}.`;
      v[p.name] = Number(parts[k]);
    }
    out.push(v);
  }
  return out;
}

export interface TraceStep { state: string; inputs: Values; outputs: Record<string, bigint> }

/**
 * A run from reset as a timing diagram, with the state's name above each cycle. It follows the
 * diagram's timing (lib/studio/wave.ts): cycle 0 holds rst high, so the machine has reset by the
 * time the run's first inputs arrive in cycle 1. Its testbench passes against generateVerilog().
 */
export function traceToDiagram(m: FsmModel, trace: TraceStep[]): WaveDiagram {
  const steps = trace.slice(0, MAX_CYCLES - 1);
  const zeros: Values = Object.fromEntries(m.inputs.map((p) => [p.name, 0]));
  const first = step(m, m.reset, zeros);
  const name = (id: string) => m.states.find((s) => s.id === id)?.name ?? "?";
  const signals: WaveSignal[] = [
    { name: "clk", dir: "clock", width: 1, values: [] },
    { name: "rst", dir: "in", width: 1, values: ["1", ...steps.map(() => "0")] },
    ...m.inputs.map((p): WaveSignal => ({ name: p.name, dir: "in", width: p.width, values: ["0", ...steps.map((s) => String(s.inputs[p.name] ?? 0))] })),
    ...m.outputs.map((o): WaveSignal => ({ name: o.name, dir: "out", width: o.width, values: [String(first.outputs[o.name]), ...steps.map((s) => String(s.outputs[o.name] ?? 0))] })),
  ];
  const notes: WaveNote[] = [{ id: "st0", signal: "clk", cycle: 0.5, text: name(m.reset) }, ...steps.map((s, i) => ({ id: `st${i + 1}`, signal: "clk", cycle: i + 1.5, text: name(s.state) }))];
  return { title: `${m.module}: a run from reset`, cycles: steps.length + 1, period: 10, signals, notes };
}
