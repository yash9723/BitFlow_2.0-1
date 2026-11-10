/**
 * lib/verilog-lang.ts — what the editor knows about Verilog / SystemVerilog source, without
 * Monaco (lib/verilog-monaco.ts wires it in): an index of modules (ports from
 * lib/studio/tbgen.ts's parser) and declarations, completion items, hover text, definitions,
 * a whitespace-only formatter, and Yosys' parse messages as diagnostics.
 * Self-check: scripts/verilog-lang.check.ts.
 */
import { parseModule, type ModuleInfo } from "./studio/tbgen";

export interface SourceFile { name: string; text: string }
export interface Decl { name: string; kind: string; range: string; file: string; line: number; module: string | null }
export interface ModuleDef { name: string; file: string; line: number; info: ModuleInfo | null }
export interface VerilogIndex { modules: ModuleDef[]; decls: Decl[] }

/** Comments and strings blanked out with spaces, so lines and columns stay where they were. */
export function blank(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"/g, (m) => m.replace(/[^\n]/g, " "));
}
const lineAt = (text: string, index: number) => text.slice(0, index).split("\n").length;
const MODULE = /\bmodule\s+(?:automatic\s+|static\s+)?([A-Za-z_]\w*)/;

// A name in the list is never a direction keyword: in `input a, b, output y` the list stops before `output`.
const NAME = String.raw`(?!(?:input|output|inout)\b)[A-Za-z_]\w*`;
const DECL = new RegExp(String.raw`(?:^|[;(,]\s*|\n\s*)(input|output|inout|wire|reg|logic|integer|genvar|parameter|localparam|bit|byte|int|real|time)\b((?:\s+(?:wire|reg|logic|signed|unsigned|var))*)\s*(\[[^\]]*\]\s*)?((?:${NAME}\s*(?:\[[^\]]*\]\s*)*(?:=[^,;)]*)?\s*,\s*)*${NAME})`, "g");

/** Modules and declarations across the files. */
export function indexVerilog(files: SourceFile[]): VerilogIndex {
  const modules: ModuleDef[] = [], decls: Decl[] = [];
  for (const f of files) {
    const code = blank(f.text);
    const spans: { name: string; from: number; to: number }[] = [];
    for (const m of code.matchAll(new RegExp(MODULE, "g"))) {
      const end = code.indexOf("endmodule", m.index);
      spans.push({ name: m[1], from: m.index!, to: end < 0 ? code.length : end });
      const info = parseModule(f.text, m[1]);
      modules.push({ name: m[1], file: f.name, line: lineAt(code, m.index!), info: typeof info === "string" ? null : info });
    }
    for (const m of code.matchAll(DECL)) {
      const at = m.index! + m[0].indexOf(m[1]);
      const module = spans.find((s) => at >= s.from && at <= s.to)?.name ?? null;
      const kind = (m[1] + m[2]).replace(/\s+/g, " ").trim();
      for (const name of m[4].split(",").map((s) => s.trim().match(/^[A-Za-z_]\w*/)?.[0]).filter((n): n is string => !!n)) {
        if (!decls.some((d) => d.name === name && d.module === module && d.file === f.name)) {
          decls.push({ name, kind, range: (m[3] ?? "").trim(), file: f.name, line: lineAt(code, at), module });
        }
      }
    }
  }
  return { modules, decls };
}

// ── Completion ──────────────────────────────────────────────────────────────

export const KEYWORDS = [
  "module", "endmodule", "input", "output", "inout", "wire", "reg", "logic", "parameter", "localparam", "assign", "always",
  "always_ff", "always_comb", "always_latch", "initial", "begin", "end", "if", "else", "case", "casez", "casex", "endcase",
  "default", "for", "while", "repeat", "forever", "function", "endfunction", "task", "endtask", "generate", "endgenerate",
  "genvar", "integer", "posedge", "negedge", "or", "and", "not", "signed", "unsigned", "typedef", "enum", "struct", "packed",
  "unique", "priority", "automatic", "return", "assert", "assume", "cover", "property", "endproperty", "disable", "iff",
  "fork", "join", "wait", "bit", "byte", "int", "string", "interface", "endinterface", "modport", "package", "endpackage", "import",
];
export const SYSTEM_TASKS = [
  "$display", "$write", "$strobe", "$monitor", "$finish", "$stop", "$time", "$realtime", "$random", "$urandom", "$urandom_range",
  "$readmemh", "$readmemb", "$writememh", "$dumpfile", "$dumpvars", "$signed", "$unsigned", "$clog2", "$bits", "$size",
  "$countones", "$onehot", "$onehot0", "$isunknown", "$fopen", "$fclose", "$fwrite", "$fdisplay", "$sformatf", "$error",
  "$fatal", "$warning", "$info", "$past", "$rose", "$fell", "$stable",
];
/** Snippets in Monaco's syntax (${1:name}, $0); \t is one indent. */
export const SNIPPETS: { label: string; detail: string; body: string }[] = [
  { label: "module", detail: "module with ports", body: "module ${1:name} (\n\tinput  wire ${2:clk},\n\tinput  wire ${3:rst},\n\t$0\n);\n\nendmodule" },
  { label: "always_ff", detail: "clocked block with reset", body: "always_ff @(posedge ${1:clk}) begin\n\tif (${2:rst}) begin\n\t\t$3\n\tend else begin\n\t\t$0\n\tend\nend" },
  { label: "always @(posedge)", detail: "clocked block (Verilog)", body: "always @(posedge ${1:clk}) begin\n\t$0\nend" },
  { label: "always_comb", detail: "combinational block", body: "always_comb begin\n\t$0\nend" },
  { label: "always @(*)", detail: "combinational block (Verilog)", body: "always @(*) begin\n\t$0\nend" },
  { label: "case", detail: "case with default", body: "case (${1:sel})\n\t${2:2'd0}: $3;\n\tdefault: $0;\nendcase" },
  { label: "if-else", detail: "if / else", body: "if (${1:cond}) begin\n\t$2\nend else begin\n\t$0\nend" },
  { label: "for", detail: "for loop", body: "for (${1:i} = 0; $1 < ${2:N}; $1 = $1 + 1) begin\n\t$0\nend" },
  { label: "fsm", detail: "state machine: states, register, next-state logic",
    body: "typedef enum logic [1:0] { ${1:IDLE}, ${2:RUN}, ${3:DONE} } state_t;\nstate_t state, next;\n\nalways_ff @(posedge ${4:clk}) begin\n\tif (${5:rst}) state <= $1;\n\telse state <= next;\nend\n\nalways_comb begin\n\tnext = state;\n\tcase (state)\n\t\t$1: $0;\n\t\tdefault: next = $1;\n\tendcase\nend" },
  { label: "clock", detail: "testbench clock", body: "initial begin\n\t${1:clk} = 0;\n\tforever #${2:5} $1 = ~$1;\nend" },
  { label: "initial", detail: "initial block", body: "initial begin\n\t$0\nend" },
  { label: "function", detail: "function", body: "function automatic ${1:logic [7:0]} ${2:name}(input ${3:logic [7:0] x});\n\t$0\nendfunction" },
  { label: "generate for", detail: "generate loop", body: "genvar ${1:i};\ngenerate\n\tfor ($1 = 0; $1 < ${2:N}; $1 = $1 + 1) begin : ${3:g}\n\t\t$0\n\tend\nendgenerate" },
];

/** An instantiation of the module with every named port connected to a placeholder. */
export function instanceSnippet(m: ModuleDef): string {
  const info = m.info;
  if (!info) return `${m.name} \${1:u_${m.name}} (\n\t$0\n);`;
  let n = 1;
  const params = info.params.length ? ` #(\n${info.params.map((p) => `\t.${p.name}(\${${++n}:${p.value.replace(/[$}\\]/g, "")}})`).join(",\n")}\n)` : "";
  const width = Math.max(...info.ports.map((p) => p.name.length), 1);
  const ports = info.ports.map((p) => `\t.${p.name.padEnd(width)} (\${${++n}:${p.name}})`).join(",\n");
  return `${m.name}${params} \${1:u_${m.name}} (\n${ports}\n);`;
}

// ── Hover and definitions ───────────────────────────────────────────────────

const signature = (m: ModuleDef) => {
  if (!m.info) return `module ${m.name}`;
  const params = m.info.params.length ? ` #(${m.info.params.map((p) => `${p.name} = ${p.value}`).join(", ")})` : "";
  return `module ${m.name}${params} (\n${m.info.ports.map((p) => `  ${p.dir} ${p.range ? p.range + " " : ""}${p.name}`).join(",\n")}\n)`;
};

/** Markdown for the identifier: its declaration (in the module the cursor is in first), or the module's ports. */
export function hoverFor(index: VerilogIndex, word: string, inModule: string | null): string | null {
  const m = index.modules.find((x) => x.name === word);
  if (m) return `\`\`\`verilog\n${signature(m)}\n\`\`\`\n${m.file}, line ${m.line}`;
  const d = index.decls.find((x) => x.name === word && x.module === inModule) ?? index.decls.find((x) => x.name === word);
  if (!d) return null;
  return `\`\`\`verilog\n${d.kind}${d.range ? " " + d.range : ""} ${d.name}\n\`\`\`\n${d.module ? `in ${d.module}, ` : ""}${d.file} line ${d.line}`;
}

/** Where the identifier is declared (module, or declaration in the same module first). */
export function definitionOf(index: VerilogIndex, word: string, inModule: string | null): { file: string; line: number } | null {
  const m = index.modules.find((x) => x.name === word);
  if (m) return { file: m.file, line: m.line };
  const d = index.decls.find((x) => x.name === word && x.module === inModule) ?? index.decls.find((x) => x.name === word);
  return d ? { file: d.file, line: d.line } : null;
}

/** The module whose text contains `line` (1-based), or null outside any module. */
export function moduleAt(text: string, line: number): string | null {
  const code = blank(text).split("\n");
  let current: string | null = null;
  for (let i = 0; i < Math.min(line, code.length); i++) {
    const m = code[i].match(MODULE);
    if (m) current = m[1];
    if (/\bendmodule\b/.test(code[i]) && i < line - 1) current = null;
  }
  return current;
}

// ── Formatting ──────────────────────────────────────────────────────────────

const OPEN = /\b(begin|case|casez|casex|fork|function|task|generate|interface|package|class|property|covergroup)\b/g;
const CLOSE = /\b(end|endcase|join|join_any|join_none|endfunction|endtask|endgenerate|endinterface|endpackage|endclass|endproperty|endgroup)\b/g;
const LEADING_CLOSE = /^(end|endcase|join|join_any|join_none|endfunction|endtask|endgenerate|endinterface|endpackage|endclass|endproperty|endgroup|endmodule)\b/;
const HEADER = /^(?:else\b(?:\s+if\b.*)?|if\b.*|for\b.*|while\b.*|repeat\b.*|forever\b.*|always(?:_ff|_comb|_latch)?\b.*|initial\b.*)$/;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

/**
 * Re-indent: begin/end-style blocks, module bodies and headers, open brackets, and the one
 * statement after an `if` / `else` / `for` / `always` without `begin` (an `else` lines up with
 * its `if`). Only leading and trailing whitespace changes; block comments keep their own lines.
 */
export function formatVerilog(text: string, indent = "    "): string {
  const normal = text.replace(/\r\n?/g, "\n");
  const src = normal.split("\n");
  const code = blank(normal).split("\n");
  const out: string[] = [];
  let depth = 0, parens = 0, pending = 0;
  let inComment = false;
  let header: { depth: number } | null = null;              // inside `module name ( ... );`
  const lastIf = new Map<number, { level: number; pending: number }>();   // per block depth
  for (let i = 0; i < src.length; i++) {
    const raw = src[i].replace(/\s+$/, "");
    const wasInComment = inComment;
    // Block comments, from the original text (blank() hides them); a "/*" inside a line comment doesn't count.
    const scan = raw.replace(/\/\/.*$/, "");
    for (const m of scan.matchAll(/\/\*|\*\//g)) inComment = m[0] === "/*";
    if (wasInComment) { out.push(raw); continue; }
    const c = code[i].trim();
    if (!raw.trim()) { out.push(""); continue; }

    const block = depth + parens;
    let level = block + pending;
    if (header) level = header.depth + (c.startsWith(")") ? 0 : 1);
    else if (LEADING_CLOSE.test(c)) level = Math.max(0, block - 1);
    else if (/^[)\]}]/.test(c)) level = Math.max(0, block - 1);
    else if (/^else\b/.test(c) && lastIf.has(block)) { ({ level, pending } = lastIf.get(block)!); }
    if (/^`(else|elsif|endif)\b/.test(c)) level = Math.max(0, level - 1);
    out.push(indent.repeat(Math.max(0, level)) + raw.trim());
    if (/^(else\s+)?if\b/.test(c) && !header) lastIf.set(block, { level, pending: level - block });

    // Blocks and brackets this line opens or closes.
    if (MODULE.test(c)) { header = { depth }; depth++; }
    if (/\bendmodule\b/.test(c)) { depth = Math.max(0, depth - 1); lastIf.clear(); }
    const closes = count(c, CLOSE);
    depth = Math.max(0, depth + count(c, OPEN) - closes);
    if (closes) for (const k of [...lastIf.keys()]) if (k > depth + parens) lastIf.delete(k);
    if (/^`(ifdef|ifndef)\b/.test(c)) depth++;
    if (/^`endif\b/.test(c)) depth = Math.max(0, depth - 1);
    const open = count(c, /[(\[{]/g) - count(c, /[)\]}]/g);
    if (header) {
      if (/;\s*$/.test(c) && parens + open <= 0) { header = null; parens = 0; }
      else parens = Math.max(0, parens + open);
    } else parens = Math.max(0, parens + open);

    // One-statement bodies: `if (x)` then `y <= 0;` on the next line.
    const statement = c.replace(/\/\/.*$/, "").trim();
    if (!header && HEADER.test(statement) && !/\bbegin\b/.test(statement) && !/;\s*$/.test(statement)) pending = level - (depth + parens) + 1;
    else if (!/^`/.test(statement)) pending = 0;
  }
  return out.join("\n");
}

// ── References, rename and signature help (across files) ─────────────────────

export interface Loc { file: string; line: number; column: number; length: number }

const posAt = (text: string, index: number) => {
  const before = text.slice(0, index);
  const nl = before.lastIndexOf("\n");
  return { line: before.split("\n").length, column: index - nl };
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function moduleSpans(code: string): { name: string; from: number; to: number }[] {
  return [...code.matchAll(new RegExp(MODULE, "g"))].map((m) => {
    const end = code.indexOf("endmodule", m.index);
    return { name: m[1], from: m.index!, to: end < 0 ? code.length : end + "endmodule".length };
  });
}

/**
 * Every use of `word` meaning the same thing as the one at file:line, sorted by file and position.
 * A module name: everywhere in the project. A signal: inside its module, plus `.word(…)` port
 * connections on instances of that module when it is a port. Comments and strings never match.
 */
export function referencesOf(files: SourceFile[], word: string, file: string, line: number): Loc[] {
  if (!/^[A-Za-z_]\w*$/.test(word)) return [];
  const index = indexVerilog(files);
  const here = files.find((f) => f.name === file);
  if (!here) return [];
  const inModule = moduleAt(here.text, line);
  const decl = index.decls.find((d) => d.name === word && d.module === inModule && d.file === file);
  const isModule = !decl && index.modules.some((m) => m.name === word);
  const out: Loc[] = [];
  const add = (f: SourceFile, code: string, at: number) => out.push({ file: f.name, ...posAt(code, at), length: word.length });
  const re = new RegExp(`\\b${escapeRe(word)}\\b`, "g");

  for (const f of files) {
    const code = blank(f.text);
    if (isModule) { for (const m of code.matchAll(re)) add(f, code, m.index!); continue; }
    if (f.name === file) {
      const span = moduleSpans(code).find((s) => s.name === inModule) ?? { from: 0, to: code.length };
      // `.word` names another module's port (or a hierarchical path), not this module's signal.
      for (const m of code.matchAll(re)) {
        if (m.index! >= span.from && m.index! < span.to && !/\.\s*$/.test(code.slice(Math.max(0, m.index! - 8), m.index!))) add(f, code, m.index!);
      }
    }
    // A port is also named where its module is instantiated: `.word (expr)`.
    if (decl && inModule && /input|output|inout/.test(decl.kind)) {
      const inst = new RegExp(`\\b${escapeRe(inModule)}\\b\\s*(?:#\\s*\\((?:[^()]|\\([^()]*\\))*\\)\\s*)?[A-Za-z_]\\w*\\s*\\(`, "g");
      for (const m of code.matchAll(inst)) {
        if (f.name === file && moduleSpans(code).some((s) => s.name === inModule && m.index! >= s.from && m.index! < s.to)) continue;
        const end = code.indexOf(";", m.index!);
        const body = code.slice(m.index!, end < 0 ? code.length : end);
        for (const p of body.matchAll(new RegExp(`\\.(${escapeRe(word)})\\s*\\(`, "g"))) add(f, code, m.index! + p.index! + 1);
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((l) => { const k = `${l.file}:${l.line}:${l.column}`; return !seen.has(k) && seen.add(k); })
            .sort((a, b) => (a.file === b.file ? a.line - b.line || a.column - b.column : a.file < b.file ? -1 : 1));
}

/**
 * Where a signal gets its value, for "Where is this driven?" on the waveform: `assign name =`, `name <=` / `name =`
 * in a block, or the instance output it is connected to. `scope` is the VCD scope ("tb.dut"): its last instance
 * name picks the module to look in first (the module that instance is of), then the top of the scope, then anywhere.
 */
export function driverOf(files: SourceFile[], name: string, scope: string): Loc | null {
  if (!/^[A-Za-z_]\w*$/.test(name)) return null;
  const index = indexVerilog(files);
  const instances = new Map<string, string>();       // instance name → module
  for (const f of files) {
    for (const m of blank(f.text).matchAll(/\b([A-Za-z_]\w*)\s*(?:#\s*\((?:[^()]|\([^()]*\))*\)\s*)?([A-Za-z_]\w*)\s*\(/g)) {
      if (index.modules.some((x) => x.name === m[1])) instances.set(m[2], m[1]);
    }
  }
  const parts = scope.split(".").filter(Boolean);
  const wanted = [instances.get(parts[parts.length - 1] ?? ""), parts[parts.length - 1], parts[0]].filter((x): x is string => !!x);
  const n = escapeRe(name);
  const patterns = [
    new RegExp(`\\bassign\\s+${n}\\b(?:\\s*\\[[^\\]]*\\])?\\s*=`, "g"),
    new RegExp(`(?:^|[;\\s])${n}(?:\\s*\\[[^\\]]*\\])?\\s*<=`, "g"),
    new RegExp(`(?:^|[;\\s])${n}(?:\\s*\\[[^\\]]*\\])?\\s*=(?!=)`, "g"),
  ];
  const found: (Loc & { module: string | null })[] = [];
  for (const f of files) {
    const code = blank(f.text);
    const spans = moduleSpans(code);
    for (const re of patterns) {
      for (const m of code.matchAll(re)) {
        const at = m.index! + m[0].search(new RegExp(`\\b${n}\\b`));
        const module = spans.find((s) => at >= s.from && at < s.to)?.name ?? null;
        if (/^\s*(input|output|inout|wire|reg|logic|parameter|localparam)\b/.test(code.slice(code.lastIndexOf("\n", at) + 1, at))) continue;  // a declaration's initialiser counts below only if nothing else drives it
        found.push({ file: f.name, ...posAt(code, at), length: name.length, module });
      }
    }
  }
  // Second choice: connected to an instance's port (`.q(name)`), or set where it's declared (`wire x = …`).
  const connected: (Loc & { module: string | null })[] = [];
  for (const f of files) {
    const code = blank(f.text);
    const spans = moduleSpans(code);
    for (const m of code.matchAll(new RegExp(`\\.\\w+\\s*\\(\\s*${n}\\s*\\)|\\b${n}\\s*=(?!=)`, "g"))) {
      const at = m.index! + m[0].search(new RegExp(`\\b${n}\\b`));
      connected.push({ file: f.name, ...posAt(code, at), length: name.length, module: spans.find((s) => at >= s.from && at < s.to)?.name ?? null });
    }
  }
  const strip = (l: Loc) => ({ file: l.file, line: l.line, column: l.column, length: l.length });
  for (const w of wanted) {
    const hit = found.find((l) => l.module === w) ?? connected.find((l) => l.module === w);
    if (hit) return strip(hit);
  }
  const first = found[0] ?? connected[0];
  return first ? strip(first) : null;
}

/** Why `name` can't be a new identifier, or null when it can. */
export function renameProblem(name: string): string | null {
  if (!/^[A-Za-z_]\w*$/.test(name)) return "A name starts with a letter or _ and has only letters, digits and _.";
  if (KEYWORDS.includes(name)) return `'${name}' is a keyword.`;
  return null;
}

/**
 * The instance whose port list the cursor is in (text = the file up to the cursor), and which port
 * it is on: by name after `.name`, else by position (commas at the top level of the list).
 */
export function instanceAt(index: VerilogIndex, textBefore: string): { module: ModuleDef; active: number } | null {
  const code = blank(textBefore);
  const tail = code.slice(code.lastIndexOf(";") + 1);
  const re = /\b([A-Za-z_]\w*)\s*(?:#\s*\((?:[^()]|\([^()]*\))*\)\s*)?([A-Za-z_]\w*)\s*\(/g;
  let hit: { module: ModuleDef; at: number } | null = null;
  for (const m of tail.matchAll(re)) {
    const mod = index.modules.find((x) => x.name === m[1]);
    if (mod?.info) hit = { module: mod, at: m.index! + m[0].length };
  }
  if (!hit) return null;
  const list = tail.slice(hit.at);
  let depth = 0, commas = 0;
  for (const ch of list) {
    if (ch === "(") depth++;
    else if (ch === ")") { if (depth === 0) return null; depth--; }       // the list is closed: not inside it
    else if (ch === "," && depth === 0) commas++;
  }
  const named = /\.([A-Za-z_]\w*)\s*(?:\([^()]*)?$/.exec(list.slice(list.lastIndexOf(",") + 1));
  const byName = named ? hit.module.info!.ports.findIndex((p) => p.name === named[1]) : -1;
  return { module: hit.module, active: byName >= 0 ? byName : Math.min(commas, hit.module.info!.ports.length - 1) };
}

// ── Diagnostics from Yosys ──────────────────────────────────────────────────

export interface LintMessage { line: number; severity: "error" | "warning"; message: string }

/** "design.v:12: ERROR: syntax error, ..." and "design.v:3: Warning: ..." lines. */
export function parseYosysMessages(output: string, file = "design.v"): LintMessage[] {
  const out: LintMessage[] = [];
  const esc = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const m of output.matchAll(new RegExp(`${esc}:(\\d+): (ERROR|Warning): ([^\\n]+)`, "g"))) {
    out.push({ line: Number(m[1]), severity: m[2] === "ERROR" ? "error" : "warning", message: m[3].replace(/`\\(\w+)'/g, "'$1'").trim() });
  }
  return out;
}
