/**
 * lib/projects.ts — saved Sandbox projects (app/api/projects): what a save may contain, and
 * when a save becomes a new version. Autosaves a couple of minutes apart share one version,
 * so the history holds meaningful steps rather than every keystroke pause.
 * Self-check: scripts/projects.check.ts.
 */
import { fileNameProblem, type ProjectFile } from "./project-files";

export const MAX_PROJECTS = 50;          // per user
export const MAX_VERSIONS = 50;          // per project; the oldest go first
export const COALESCE_MS = 2 * 60_000;   // autosaves this close share a version
const MAX_SOURCE_CHARS = 128 * 1024;     // per file, as share links
const MAX_FILES = 12;
const MAX_TOTAL_CHARS = 512 * 1024;
const MAX_PINS = 30, MAX_PINS_CHARS = 32 * 1024;
const DESIGN_LANGUAGES = ["verilog", "vhdl"], TESTBENCH_LANGUAGES = ["verilog", "vhdl", "python"];

export interface ProjectContent {
  designCode: string; testbenchCode: string; files: string | null;
  designLanguage: string; testbenchLanguage: string; pins: string | null;
}
type Invalid = { error: string; status: number };

/** The content of a save request, checked; or why it can't be saved. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function projectContent(body: any): { content: ProjectContent } | Invalid {
  const { designCode, testbenchCode } = body ?? {};
  if (typeof designCode !== "string" || typeof testbenchCode !== "string") return { error: "designCode and testbenchCode are required.", status: 400 };
  if (designCode.length > MAX_SOURCE_CHARS || testbenchCode.length > MAX_SOURCE_CHARS) return { error: "Each file must be under 128 KB.", status: 413 };
  const designLanguage = body.designLanguage ?? "verilog", testbenchLanguage = body.testbenchLanguage ?? "verilog";
  if (!DESIGN_LANGUAGES.includes(designLanguage) || !TESTBENCH_LANGUAGES.includes(testbenchLanguage)) return { error: "Unknown language.", status: 400 };

  const files: ProjectFile[] = [];
  for (const f of Array.isArray(body.files) ? body.files : []) {
    if (typeof f?.name !== "string" || typeof f?.content !== "string" || f.content.length > MAX_SOURCE_CHARS || fileNameProblem(f.name, files)) {
      return { error: "One of the extra files has an invalid name or is over 128 KB.", status: 400 };
    }
    files.push({ name: f.name, content: f.content });
  }
  if (files.length > MAX_FILES) return { error: `A project can have at most ${MAX_FILES} extra files.`, status: 413 };
  const total = designCode.length + testbenchCode.length + files.reduce((n, f) => n + f.content.length, 0);
  if (total > MAX_TOTAL_CHARS) return { error: "A project must be under 512 KB in all.", status: 413 };

  // Hand-edited pins: {"<board>:<top>": text}.
  let pins: string | null = null;
  if (body.pins && typeof body.pins === "object") {
    const entries = Object.entries(body.pins);
    const ok = entries.length <= MAX_PINS && entries.every(([k, v]) => /^[a-z0-9-]+:[A-Za-z_]\w*$/.test(k) && typeof v === "string" && v.length <= MAX_PINS_CHARS);
    if (!ok) return { error: "The saved pins are invalid or too large.", status: 400 };
    if (entries.length) pins = JSON.stringify(Object.fromEntries(entries));
  }
  return { content: { designCode, testbenchCode, files: files.length ? JSON.stringify(files) : null, designLanguage, testbenchLanguage, pins } };
}

/** A project name from the request, or the design's first module, or "Untitled project". */
export function projectName(raw: unknown, designCode: string): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  return (name || designCode.match(/\bmodule\s+([A-Za-z_]\w*)/)?.[1] || "Untitled project").slice(0, 80);
}

export const sameContent = (a: ProjectContent, b: ProjectContent) =>
  a.designCode === b.designCode && a.testbenchCode === b.testbenchCode && (a.files ?? null) === (b.files ?? null) &&
  a.designLanguage === b.designLanguage && a.testbenchLanguage === b.testbenchLanguage && (a.pins ?? null) === (b.pins ?? null);

/**
 * What saving `next` does to the history: nothing (no change), update the newest version
 * (an unnamed autosave within COALESCE_MS), or add a version.
 */
export function versionAction(latest: (ProjectContent & { createdAt: Date; message: string | null }) | null,
  next: ProjectContent, message: string | null, now = Date.now()): "none" | "update" | "create" {
  if (latest && sameContent(latest, next)) return message && !latest.message ? "update" : "none";
  if (latest && !message && !latest.message && now - latest.createdAt.getTime() < COALESCE_MS) return "update";
  return "create";
}

/** Pick the content fields from a row. */
export const contentOf = (r: ProjectContent): ProjectContent => ({
  designCode: r.designCode, testbenchCode: r.testbenchCode, files: r.files ?? null,
  designLanguage: r.designLanguage, testbenchLanguage: r.testbenchLanguage, pins: r.pins ?? null,
});
