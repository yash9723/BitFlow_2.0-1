/**
 * lib/project-files.ts — Sandbox projects with more than one design file.
 * design.v stays the first file; extra Verilog files (alu.v, regfile.v, ...) are
 * appended to it before a run, synthesis or the board, so every tool keeps
 * taking a single design. Compiler messages about the combined design.v are
 * mapped back to the file and line they came from. Data files (rom.hex, ...)
 * go to the simulator as extra input files for $readmemh.
 * Self-check: scripts/diagnostics.check.ts.
 */

export interface ProjectFile { name: string; content: string }

export const CODE_FILE = /\.(v|sv|vh|svh)$/i;
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;          // what the simulator accepts (api/models.py)
const RESERVED = new Set(["design.v", "tb.v", "a.out", "wave.vcd", "design.vhd", "tb.vhd", "test_tb.py", "results.xml",
                          "bf_dump.v", "cmds.f", "sim.vvp", "bf_guard.py"]);
export const MAX_DATA_FILES = 4;                             // the simulator's limit

/** Why a new file name can't be used, or null. */
export function fileNameProblem(name: string, files: ProjectFile[]): string | null {
  if (!NAME.test(name)) return "Use letters, digits, _ . and - only (up to 64 characters).";
  if (RESERVED.has(name.toLowerCase()) || files.some((f) => f.name.toLowerCase() === name.toLowerCase())) return `${name} already exists.`;
  if (/\.(py|pyc|pth|so)$/i.test(name)) return "Python and library files can't be added.";
  if (!CODE_FILE.test(name) && files.filter((f) => !CODE_FILE.test(f.name)).length >= MAX_DATA_FILES) {
    return `At most ${MAX_DATA_FILES} data files.`;
  }
  return null;
}

const withNewline = (s: string) => (s.endsWith("\n") ? s : s + "\n");
const lineCount = (s: string) => s.split("\n").length - 1;   // of text ending in a newline

/**
 * design.v followed by every extra code file, and `locate`, which turns a line
 * of the combined text back into its file and line.
 */
export function combineDesign(main: string, files: ProjectFile[]) {
  const parts: { name: string; start: number }[] = [{ name: "design.v", start: 1 }];
  let code = withNewline(main);
  for (const f of files.filter((f) => CODE_FILE.test(f.name))) {
    parts.push({ name: f.name, start: lineCount(code) + 1 });
    code += withNewline(f.content);
  }
  const locate = (line: number) => {
    const p = [...parts].reverse().find((q) => line >= q.start) ?? parts[0];
    return { file: p.name, line: line - p.start + 1 };
  };
  return { code, locate, multi: parts.length > 1 };
}

/** Data files for the simulator's `files`, or undefined when there are none. */
export function dataFiles(files: ProjectFile[]): Record<string, string> | undefined {
  const data = files.filter((f) => !CODE_FILE.test(f.name));
  return data.length ? Object.fromEntries(data.map((f) => [f.name, f.content])) : undefined;
}

/** Rewrite "design.v:57" in compiler output to "alu.v:3" (also "design.v:57:12"). */
export function relabelOutput(text: string | null | undefined, locate: (line: number) => { file: string; line: number }) {
  return text?.replace(/\bdesign\.v:(\d+)/g, (_, n) => { const at = locate(Number(n)); return `${at.file}:${at.line}`; }) ?? text;
}
