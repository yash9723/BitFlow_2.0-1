"use client";
/**
 * components/ConstraintsEditor.tsx — edit a design's pin constraints for one board
 * (.pcf / .lpf / .cst / .xdc / .qsf): the text itself, a table with a pin picker per port
 * bit, and the board's pins (used, free, clashing). Checked as you type against the design's
 * ports (lib/synth/constraints.ts); errors stop a build, warnings don't.
 */
import { useMemo, useState } from "react";
import { BOARDS, CONSTRAINT_FORMAT, boardPins, type BoardId, type PinKind, type PortInfo } from "@/lib/synth/boards";
import { parseConstraints, setPin, validateConstraints } from "@/lib/synth/constraints";

const KIND_LABEL: Record<PinKind, string> = {
  clock: "Clock", uart: "USB serial", led: "LEDs", button: "Buttons", switch: "Switches", gpio: "Header pins",
};

export default function ConstraintsEditor({ boardId, text, ports, onChange }: {
  boardId: BoardId; text: string; ports: Record<string, PortInfo>; onChange: (text: string) => void;
}) {
  const board = BOARDS[boardId];
  const format = CONSTRAINT_FORMAT[board.family];
  const pins = useMemo(() => boardPins(board), [board]);
  const { entries, unknown } = useMemo(() => parseConstraints(format, text), [format, text]);
  const issues = useMemo(() => validateConstraints(board, pins, ports, entries), [board, pins, ports, entries]);
  const [selected, setSelected] = useState<number | null>(null);   // index into entries

  const usedBy = new Map<string, string[]>();
  for (const e of entries) usedBy.set(e.pin.toUpperCase(), [...(usedBy.get(e.pin.toUpperCase()) ?? []), e.port]);
  const errorLines = new Set(issues.filter((i) => i.level === "error" && i.line !== undefined).map((i) => i.line));
  const assign = (index: number, pin: string) => onChange(setPin(format, text, entries[index].line, pin));
  const errors = issues.filter((i) => i.level === "error").length;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-[9px] text-dim uppercase tracking-wider">constraints.{format}</span>
          <textarea value={text} onChange={(e) => onChange(e.target.value)} spellCheck={false} rows={Math.min(18, Math.max(8, text.split("\n").length + 1))}
            aria-label={`Pin constraints (.${format})`}
            className="w-full bg-void border border-rim rounded px-2 py-1.5 font-mono text-[11px] leading-[1.5] text-pale focus:border-phosphor/60 outline-none resize-y" />
        </label>

        <div className="space-y-1">
          <span className="text-[9px] text-dim uppercase tracking-wider">Port → pin</span>
          <div className="max-h-[300px] overflow-auto border border-rim rounded">
            <table className="w-full text-[10px]">
              <tbody>
                {entries.map((e, i) => {
                  const known = pins.find((p) => p.pin.toUpperCase() === e.pin.toUpperCase());
                  return (
                    <tr key={`${e.line}-${e.port}`} onClick={() => setSelected(i)}
                      className={`cursor-pointer border-b border-rim/40 last:border-0 ${selected === i ? "bg-phosphor/10" : "hover:bg-white/5"}`}>
                      <td className={`px-2 py-1 ${errorLines.has(e.line) ? "text-danger" : "text-ghost"}`}>{e.port}</td>
                      <td className="px-1 py-0.5">
                        <select value={known?.pin ?? e.pin} onChange={(ev) => assign(i, ev.target.value)} aria-label={`Pin for ${e.port}`}
                          className="bg-void border border-rim rounded px-1 py-0.5 text-[10px] text-bright outline-none focus:border-phosphor/60 max-w-[220px]">
                          {!known && <option value={e.pin}>{e.pin} (not labelled)</option>}
                          {(Object.keys(KIND_LABEL) as PinKind[]).map((kind) => {
                            const group = pins.filter((p) => p.kind === kind);
                            return group.length > 0 && (
                              <optgroup key={kind} label={KIND_LABEL[kind]}>
                                {group.map((p) => <option key={p.pin} value={p.pin}>{p.pin} · {p.label}</option>)}
                              </optgroup>
                            );
                          })}
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {entries.length === 0 && <tr><td className="px-2 py-2 text-dim">No pins placed yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ul className="space-y-0.5 text-[10px]" aria-live="polite">
        {issues.map((i, k) => (
          <li key={k} className={i.level === "error" ? "text-danger" : "text-warn"}>
            {i.line !== undefined && <span className="text-dim">line {i.line + 1}: </span>}{i.message}
          </li>
        ))}
        {unknown.length > 0 && (
          <li className="text-dim">Line{unknown.length > 1 ? "s" : ""} {unknown.slice(0, 6).map((l) => l + 1).join(", ")} {unknown.length > 1 ? "aren't" : "isn't"} a pin placement; passed to the tools as written.</li>
        )}
        {issues.length === 0 && <li className="text-phosphor">Every port bit has its own pin.</li>}
      </ul>

      <div className="space-y-2">
        <div className="text-[9px] text-dim uppercase tracking-wider">
          The board&apos;s pins {selected !== null && entries[selected] ? <>· click one to give it to <span className="text-ghost normal-case">{entries[selected].port}</span></> : "· click a row, then a pin"}
        </div>
        {(Object.keys(KIND_LABEL) as PinKind[]).map((kind) => {
          const group = pins.filter((p) => p.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind} className="flex flex-wrap items-center gap-1">
              <span className="w-24 shrink-0 text-[9px] text-dim">{KIND_LABEL[kind]}</span>
              {group.map((p) => {
                const users = usedBy.get(p.pin.toUpperCase()) ?? [];
                const tone = users.length > 1 ? "border-danger/70 text-danger bg-danger/10"
                  : users.length === 1 ? "border-phosphor/60 text-phosphor bg-phosphor/10" : "border-rim text-dim hover:text-ghost";
                return (
                  <button key={p.pin} type="button" title={`${p.label}${users.length ? ` — ${users.join(", ")}` : " — free"}`}
                    onClick={() => selected !== null && entries[selected] && assign(selected, p.pin)}
                    className={`px-1.5 py-0.5 rounded border text-[9px] leading-none ${tone}`}>
                    {p.pin}{users.length > 0 && <span className="ml-1 opacity-80">{users.join(",")}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {errors > 0 && <p className="text-[10px] text-danger">Fix {errors === 1 ? "the error" : `the ${errors} errors`} above before building.</p>}
    </div>
  );
}
