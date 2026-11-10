/**
 * lib/share.ts — what a shared design is (app/api/share, /s/[id], /embed/[id], /explore), without the
 * database: checking a share's body, the file names it shows, and parsing its stored extra files.
 * Self-check: scripts/share.check.ts.
 */
import { fileNameProblem, type ProjectFile } from "./project-files";

export const MAX_SOURCE_CHARS = 128 * 1024;   // per file
export const MAX_FILES = 12;                  // extra design files

export type DesignLang = "verilog" | "vhdl";
export type TbLang = "verilog" | "vhdl" | "python";

export interface ShareContent {
  title: string;
  designCode: string;
  testbenchCode: string;
  files: ProjectFile[];
  kind: "sandbox" | "circuit";
  designLang: DesignLang;
  tbLang: TbLang;
  public: boolean;
  /** The owner's saved project it comes from, if any: sharing that project again updates the same link. */
  projectId: string | null;
}

/** "module counter (" → "counter", "entity alu is" → "alu": a title for links shared without one. */
export const firstUnit = (code: string) =>
  code.match(/\bmodule\s+([A-Za-z_]\w*)/)?.[1] ?? code.match(/\bentity\s+([A-Za-z_]\w*)\s+is\b/i)?.[1];

/**
 * A share's body checked: code present and under the size limit, extra files with names the Sandbox
 * allows, known languages. `circuitTitle` names a drawn circuit (kind "circuit"); its JSON is checked by the route.
 */
export function parseShare(body: unknown, circuitTitle?: string): { content: ShareContent } | { error: string; status: number } {
  const b = (body ?? {}) as Record<string, unknown>;
  const { designCode, testbenchCode } = b;
  if (typeof designCode !== "string" || !designCode.trim() || typeof testbenchCode !== "string") {
    return { error: "designCode and testbenchCode are required.", status: 400 };
  }
  if (designCode.length > MAX_SOURCE_CHARS || testbenchCode.length > MAX_SOURCE_CHARS) {
    return { error: "Each file must be under 128 KB to share.", status: 413 };
  }
  const files: ProjectFile[] = [];
  for (const f of Array.isArray(b.files) ? b.files : []) {
    if (typeof f?.name !== "string" || typeof f?.content !== "string" || f.content.length > MAX_SOURCE_CHARS || fileNameProblem(f.name, files)) {
      return { error: "One of the extra files has an invalid name or is over 128 KB.", status: 400 };
    }
    files.push({ name: f.name, content: f.content });
  }
  if (files.length > MAX_FILES) return { error: `At most ${MAX_FILES} extra files can be shared.`, status: 413 };

  const kind = b.kind === "circuit" ? "circuit" : "sandbox";
  const designLang: DesignLang = b.designLanguage === "vhdl" ? "vhdl" : "verilog";
  const tbLang: TbLang = b.testbenchLanguage === "vhdl" ? "vhdl" : b.testbenchLanguage === "python" ? "python" : "verilog";
  if (kind === "circuit" && (designLang !== "verilog" || tbLang !== "verilog")) return { error: "A circuit is shared as Verilog.", status: 400 };
  if (tbLang === "vhdl" && designLang !== "vhdl") return { error: "A VHDL testbench needs a VHDL design.", status: 400 };
  if (files.length && designLang !== "verilog") return { error: "Extra design files are for Verilog projects.", status: 400 };

  const title = (typeof b.title === "string" && b.title.trim() ? b.title.trim() : circuitTitle ?? firstUnit(designCode) ?? "Untitled design").slice(0, 80);
  const projectId = typeof b.projectId === "string" && /^[\w-]{1,64}$/.test(b.projectId) ? b.projectId : null;
  return { content: { title, designCode, testbenchCode, files, kind, designLang, tbLang, public: b.public === true, projectId } };
}

/** The names a share's two main files are shown under, as in the Sandbox. */
export function fileNames(designLang: string, tbLang: string): { design: string; testbench: string } {
  return {
    design: designLang === "vhdl" ? "design.vhd" : "design.v",
    testbench: tbLang === "vhdl" ? "tb.vhd" : tbLang === "python" ? "test_tb.py" : "tb.v",
  };
}

/** The stored extra files (JSON), dropping anything malformed. */
export function parseFiles(json: string | null): ProjectFile[] {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.filter((f) => typeof f?.name === "string" && typeof f?.content === "string") : [];
  } catch {
    return [];
  }
}

/** Can this share run in an embed (Icarus in the viewer's browser)? Verilog design and testbench only. */
export const runsInBrowser = (s: { designLang: string; tbLang: string; kind: string }) =>
  s.kind === "sandbox" && s.designLang === "verilog" && s.tbLang === "verilog";

/** The <iframe> to paste into a page or course site. */
export const embedSnippet = (origin: string, id: string, title: string) =>
  `<iframe src="${origin}/embed/${id}" title="${title.replace(/[<>"&]/g, "")} on BitFlow" width="100%" height="560" style="border:0;border-radius:8px" loading="lazy"></iframe>`;
