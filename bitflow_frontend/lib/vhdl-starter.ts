/**
 * lib/vhdl-starter.ts — VHDL starter for a problem whose starter is a Verilog module.
 *
 * A VHDL answer is graded by converting it to Verilog (GHDL) and running the same
 * hidden Verilog tests, so its entity must match the Verilog module: same name,
 * same ports, same widths. This builds that entity from the Verilog ANSI header.
 * Returns null when it can't be done faithfully (several modules, parameters,
 * non-ANSI ports, widths that aren't plain numbers): those problems stay Verilog-only.
 */

interface Port { dir: "in" | "out" | "inout"; name: string; hi: number | null; lo: number }

const DIRS: Record<string, Port["dir"]> = { input: "in", output: "out", inout: "inout" };

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Ports of the single ANSI-style module in `verilog`, or null. */
export function ansiPorts(verilog: string): { name: string; ports: Port[] } | null {
  const src = stripComments(verilog);
  const modules = [...src.matchAll(/\bmodule\s+([A-Za-z_]\w*)\s*(#?)\s*\(/g)];
  if (modules.length !== 1 || modules[0][2] === "#" || /\bparameter\b/.test(src)) return null;
  const start = modules[0].index! + modules[0][0].length;
  const end = src.indexOf(")", start);
  const header = src.slice(start, end);
  if (end < 0 || !header.trim()) return null;

  const ports: Port[] = [];
  let dir: Port["dir"] | null = null, hi: number | null = null, lo = 0;
  for (const raw of header.split(",")) {
    const tokens = raw.trim().replace(/\[\s*(\d+)\s*:\s*(\d+)\s*\]/, " [$1:$2] ").split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    if (DIRS[tokens[0]]) {                          // a new declaration resets type and width
      dir = DIRS[tokens[0]]; hi = null; lo = 0;
      tokens.shift();
      while (["wire", "reg", "logic", "signed", "unsigned"].includes(tokens[0])) tokens.shift();
      const range = tokens[0]?.match(/^\[(\d+):(\d+)\]$/);
      if (range) { hi = Number(range[1]); lo = Number(range[2]); tokens.shift(); }
    }
    if (!dir || tokens.length !== 1 || !/^[A-Za-z_]\w*$/.test(tokens[0]) || (hi !== null && hi < lo)) return null;
    ports.push({ dir, name: tokens[0], hi, lo });
  }
  return { name: modules[0][1], ports };
}

// VHDL-2008 reserved words: a Verilog port called `in` or `out` can't keep its name in VHDL.
const VHDL_RESERVED = new Set((
  "abs access after alias all and architecture array assert assume assume_guarantee attribute begin block body " +
  "buffer bus case component configuration constant context cover default disconnect downto else elsif end entity " +
  "exit fairness file for force function generate generic group guarded if impure in inertial inout is label library " +
  "linkage literal loop map mod nand new next nor not null of on open or others out package parameter port postponed " +
  "procedure process property protected pure range record register reject release rem report restrict " +
  "restrict_guarantee return rol ror select sequence severity shared signal sla sll sra srl strong subtype then to " +
  "transport type unaffected units until use variable vmode vprop vunit wait when while with xnor xor"
).split(" "));

/** Usable unchanged as a VHDL name: letter first, no leading/trailing/double underscore, not reserved. */
export function vhdlName(name: string): boolean {
  return /^[A-Za-z](?:_?[A-Za-z0-9])*$/.test(name) && !VHDL_RESERVED.has(name.toLowerCase());
}

/** VHDL entity + empty architecture with the same interface, or null (see above). */
export function vhdlStarter(verilogStarter: string): string | null {
  const m = ansiPorts(verilogStarter);
  if (!m) return null;
  // The grader matches ports by name, so every name must be legal (and distinct) in case-insensitive VHDL.
  const names = [m.name, ...m.ports.map((p) => p.name)];
  if (!names.every(vhdlName) || new Set(names.map((n) => n.toLowerCase())).size !== names.length) return null;
  const width = Math.max(...m.ports.map((p) => p.name.length));
  const decls = m.ports.map((p, i) => {
    const type = p.hi === null ? "std_logic" : `std_logic_vector(${p.hi} downto ${p.lo})`;
    return `        ${p.name.padEnd(width)} : ${p.dir.padEnd(5)} ${type}${i < m.ports.length - 1 ? ";" : ""}`;
  });
  return `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- Same ports as the Verilog module: your design is converted to Verilog (GHDL)
-- and graded by the same hidden tests.
entity ${m.name} is
    port (
${decls.join("\n")}
    );
end entity;

architecture rtl of ${m.name} is
begin
    -- TODO: describe the hardware
end architecture;
`;
}
