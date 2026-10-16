// scripts/copy-monaco.mjs — copy Monaco's AMD build (node_modules/monaco-editor/min/vs)
// into public/monaco/vs so the editor loads from our own origin instead of a CDN.
// Runs before `next dev` / `next build` (see package.json). Skips when the copy
// already matches the installed monaco-editor version.

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root    = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir  = join(root, "node_modules", "monaco-editor");
const destDir = join(root, "public", "monaco");
const stamp   = join(destDir, ".version");

const version = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")).version;

if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) process.exit(0);

rmSync(destDir, { recursive: true, force: true });   // no stale files from another version
cpSync(join(pkgDir, "min", "vs"), join(destDir, "vs"), { recursive: true });
writeFileSync(stamp, version);
console.log(`[monaco] copied monaco-editor ${version} -> public/monaco/vs`);
