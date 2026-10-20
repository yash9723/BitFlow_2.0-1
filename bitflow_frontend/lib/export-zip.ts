/**
 * lib/export-zip.ts — Hardware project ZIP download
 *
 * Packages the current workspace into a single downloadable ZIP archive:
 *   bitflow_project_YYYY-MM-DD.zip
 *     ├── design.v          — RTL design module
 *     ├── tb.v              — Testbench
 *     ├── wave.vcd          — Waveform (only when simulation produced one)
 *     └── metadata.json     — Simulation run metadata
 *
 * Uses JSZip (browser-compatible). Add to package.json:
 *   "jszip": "^3.10.1"
 *
 * Design decisions:
 *   - Lazy-imports JSZip so the ~100KB bundle is only loaded when the
 *     user clicks "Download ZIP" — never on initial page load.
 *   - VCD is decoded from base64 here, not stored in React state, to
 *     avoid keeping a large decoded string in memory between exports.
 *   - metadata.json uses ISO timestamp for maximum compatibility with
 *     EDA tools that might inspect it.
 *
 * TODO: Add Makefile / run_simulation.sh script to the ZIP for offline use.
 * TODO: Add README.md with project description and simulation instructions.
 */

import type { SimulateResponse } from "@/lib/types";

/** Version string embedded in metadata.json. Bump with each BitFlow release. */
const BITFLOW_VERSION = "1.0.0";

export interface ZipExportOptions {
  designCode:    string;
  testbenchCode: string;
  result:        SimulateResponse;
  /** More design files of a multi-file project (lib/project-files.ts). */
  files?:        { name: string; content: string }[];
}

/**
 * Build and trigger a browser download of the project ZIP archive.
 *
 * Async — must be called from a user gesture (button click) to satisfy
 * browser security policies for programmatic downloads.
 *
 * @param options — editor content + last simulation result
 */
export async function exportProjectZip(options: ZipExportOptions): Promise<void> {
  const { designCode, testbenchCode, result, files = [] } = options;

  // ── Lazy-load JSZip ────────────────────────────────────────────────────────
  // Dynamic import keeps it out of the initial bundle.
  const { default: JSZip } = await import("jszip");

  const zip = new JSZip();

  // ── design.v ──────────────────────────────────────────────────────────────
  zip.file("design.v", designCode, { date: new Date() });

  // ── tb.v ──────────────────────────────────────────────────────────────────
  zip.file("tb.v", testbenchCode, { date: new Date() });
  for (const f of files) zip.file(f.name, f.content, { date: new Date() });

  // ── wave.vcd — only when the simulation produced a waveform ───────────────
  if (result.waveform.available && result.waveform.vcd_base64) {
    // Decode base64 → binary string → Uint8Array
    const binary = atob(result.waveform.vcd_base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    zip.file("wave.vcd", bytes, { binary: true, date: new Date() });
  }

  // ── metadata.json ─────────────────────────────────────────────────────────
  const metadata = {
    bitflow_version:    BITFLOW_VERSION,
    exported_at:        new Date().toISOString(),
    simulation: {
      timestamp:        new Date().toISOString(),
      status:           result.status,
      duration_ms:      result.duration_ms,
      workspace_id:     result.workspace_id,
      waveform_present: result.waveform.available,
      waveform_bytes:   result.waveform.size_bytes,
    },
    files: [
      "design.v",
      "tb.v",
      ...(result.waveform.available ? ["wave.vcd"] : []),
    ],
  };
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  // ── Generate and download ──────────────────────────────────────────────────
  const blob = await zip.generateAsync({
    type:               "blob",
    compression:        "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // Filename: bitflow_project_2026-05-25.zip
  const dateStr  = new Date().toISOString().slice(0, 10);
  const filename = `bitflow_project_${dateStr}.zip`;

  triggerDownload(blob, filename);
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser download helper
// ─────────────────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Release the object URL after a short delay so the download can start.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}