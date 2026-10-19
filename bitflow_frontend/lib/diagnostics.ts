/**
 * lib/diagnostics.ts — compiler and lint messages → per-file, per-line diagnostics,
 * for squiggles in the editors (components/Editor.tsx).
 *
 * Understands the simulation output (api/sandbox.py):
 *   Verilator lint   %Warning-WIDTHTRUNC: design.v:3:12: Operator ASSIGNW expects …
 *                    %Error: design.v:3:1: syntax error, unexpected endmodule
 *   iverilog         design.v:13: syntax error
 *                    tb.v:10: error: Unknown module type: counter
 *                    design.v:4: warning: implicit definition of wire 'x'.
 * Continuation lines, iverilog notes ("design.v:1:      : It was declared here")
 * and runtime lines (absolute /tmp paths) are ignored. Self-check: scripts/diagnostics.check.ts.
 */

export type Severity = "error" | "warning";
export interface Diagnostic { line: number; column?: number; severity: Severity; message: string }
export interface FileDiagnostics { design: Diagnostic[]; tb: Diagnostic[] }

const VERILATOR = /^%(Error|Warning)(?:-([A-Z0-9_]+))?: (design|tb)\.v:(\d+):(\d+): (.+)$/;
const IVERILOG  = /^(design|tb)\.v:(\d+): (.+)$/;

export function parseDiagnostics(output: string | null | undefined): FileDiagnostics {
  const out: FileDiagnostics = { design: [], tb: [] };
  const seen = new Set<string>();
  const add = (file: "design" | "tb", d: Diagnostic) => {
    const key = `${file}:${d.line}:${d.severity}:${d.message}`;
    if (!seen.has(key)) { seen.add(key); out[file].push(d); }
  };

  for (const raw of (output ?? "").split("\n")) {
    const line = raw.trimEnd();
    let m = VERILATOR.exec(line);
    if (m) {
      add(m[3] as "design" | "tb", {
        line: Number(m[4]), column: Number(m[5]),
        severity: m[1] === "Error" ? "error" : "warning",
        message: m[2] ? `${m[6]} (${m[2]})` : m[6],
      });
      continue;
    }
    m = IVERILOG.exec(line);
    if (!m) continue;
    const text = m[3].trim();
    if (text.startsWith(":")) continue;                         // a note on an earlier error
    const warning = /^warning:/i.test(text);
    if (!warning && !/error|sorry|syntax/i.test(text)) continue;  // runtime text, not a diagnostic
    add(m[1] as "design" | "tb", {
      line: Number(m[2]),
      severity: warning ? "warning" : "error",
      message: text.replace(/^(error|warning|sorry):\s*/i, ""),
    });
  }
  return out;
}
