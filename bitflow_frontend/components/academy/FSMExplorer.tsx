"use client";

import { useState } from "react";

type StateId = "IDLE" | "READ" | "WRITE" | "DONE";

interface Transition {
  from: StateId;
  to: StateId;
  input: string;
  output: string;
}

const STATES: StateId[] = ["IDLE", "READ", "WRITE", "DONE"];

const TRANSITIONS: Transition[] = [
  { from: "IDLE",  to: "READ",  input: "rd=1",  output: "busy=0" },
  { from: "IDLE",  to: "WRITE", input: "wr=1",  output: "busy=0" },
  { from: "READ",  to: "DONE",  input: "ack=1", output: "busy=1" },
  { from: "WRITE", to: "DONE",  input: "ack=1", output: "busy=1" },
  { from: "DONE",  to: "IDLE",  input: "done",  output: "busy=0" },
];

const STATE_POS: Record<StateId, { x: number; y: number }> = {
  IDLE:  { x: 50,  y: 50 },
  READ:  { x: 20,  y: 75 },
  WRITE: { x: 80,  y: 75 },
  DONE:  { x: 50,  y: 20 },
};

const INPUTS = [
  { key: "rd",  label: "Read (rd=1)",  from: "IDLE" as StateId,  to: "READ" as StateId },
  { key: "wr",  label: "Write (wr=1)", from: "IDLE" as StateId,  to: "WRITE" as StateId },
  { key: "ack", label: "Ack (ack=1)",  from: "READ" as StateId,  to: "DONE" as StateId, alsoFrom: "WRITE" as StateId },
  { key: "done",label: "Finish",       from: "DONE" as StateId,  to: "IDLE" as StateId },
];

export default function FSMExplorer() {
  const [state, setState] = useState<StateId>("IDLE");
  const [log, setLog] = useState<string[]>(["FSM reset → IDLE"]);

  const fire = (inputKey: string) => {
    const match = TRANSITIONS.find((t) => t.from === state && t.input.startsWith(inputKey));
    if (!match) {
      setLog((l) => [`✗ No transition from ${state} on ${inputKey}`, ...l.slice(0, 6)]);
      return;
    }
    setState(match.to);
    setLog((l) => [
      `${state} → ${match.to}  [${match.input}]  out: ${match.output}`,
      ...l.slice(0, 6),
    ]);
  };

  const available = INPUTS.filter((inp) => {
    if (inp.from === state) return true;
    if ("alsoFrom" in inp && inp.alsoFrom === state) return true;
    return false;
  });

  return (
    <div className="space-y-4">
      <p className="font-mono text-[10px] text-ghost/80">
        A simple Moore memory-controller FSM. Press valid inputs to walk the state
        diagram — invalid inputs are rejected.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        {/* State diagram */}
        <div className="rounded border border-rim/60 bg-pit/60 p-4 relative min-h-[220px]">
          <svg viewBox="0 0 100 100" className="w-full h-48">
            {TRANSITIONS.map((t, i) => {
              const from = STATE_POS[t.from];
              const to = STATE_POS[t.to];
              const active = state === t.from;
              return (
                <line
                  key={i}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={active ? "#00e87a" : "#22232d"}
                  strokeWidth={active ? 0.8 : 0.4}
                  strokeDasharray={t.from === t.to ? "2 2" : undefined}
                  opacity={active ? 0.6 : 0.3}
                />
              );
            })}
            {STATES.map((s) => {
              const pos = STATE_POS[s];
              const active = state === s;
              return (
                <g key={s}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={active ? 9 : 7}
                    fill={active ? "rgba(0,232,122,0.25)" : "#1a1b22"}
                    stroke={active ? "#00e87a" : "#4a4d60"}
                    strokeWidth={active ? 1.2 : 0.6}
                    className="transition-all duration-300"
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={active ? "#00e87a" : "#9598ac"}
                    fontSize="4"
                    fontFamily="monospace"
                  >
                    {s}
                  </text>
                </g>
              );
            })}
          </svg>
          <p className="font-mono text-[9px] text-dim text-center mt-2">
            Current state: <span className="text-phosphor font-bold">{state}</span>
          </p>
        </div>

        {/* Controls */}
        <div className="rounded border border-rim/60 bg-pit/60 p-4 space-y-3">
          <h4 className="font-mono text-[9px] text-dim uppercase">Inputs</h4>
          {available.length > 0 ? (
            available.map((inp) => (
              <button
                key={inp.key}
                type="button"
                onClick={() => fire(inp.key)}
                className="w-full font-mono text-[10px] px-3 py-2.5 rounded border border-info/40 bg-info/10 text-info hover:bg-info/20 transition-colors text-left"
              >
                {inp.label}
              </button>
            ))
          ) : (
            <p className="font-mono text-[9px] text-dim">
              No valid inputs from {state}. Try reset or another path.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setState("IDLE");
              setLog(["FSM reset → IDLE"]);
            }}
            className="w-full font-mono text-[10px] py-2 rounded border border-rim/50 text-dim hover:text-ghost"
          >
            Reset FSM
          </button>

          <div className="space-y-1 pt-2 border-t border-rim/30">
            {log.map((line, i) => (
              <p
                key={i}
                className={`font-mono text-[8px] ${i === 0 ? "text-phosphor" : "text-dim"}`}
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
