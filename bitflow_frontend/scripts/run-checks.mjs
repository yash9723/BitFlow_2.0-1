/**
 * scripts/run-checks.mjs — run every scripts/*.check.ts and report which failed.
 *   npm run check              all of them (what CI runs)
 *   npm run check -- pair wave only the checks whose file name contains one of the words
 * A new *.check.ts file is picked up here without touching package.json or CI.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
// Needs a live backend and a private reference file as its argument: run by hand.
const MANUAL = new Set(["synth-parity.check.ts"]);
const words = process.argv.slice(2);

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".check.ts") && !MANUAL.has(f))
  .filter((f) => words.length === 0 || words.some((w) => f.includes(w)))
  .sort();
if (files.length === 0) {
  console.error(`No check matches: ${words.join(" ")}`);
  process.exit(1);
}

const failed = [];
for (const file of files) {
  console.log(`\n── ${file}`);
  const { status } = spawnSync(process.execPath, ["--import", "tsx", join(dir, file)], { stdio: "inherit", cwd: join(dir, "..") });
  if (status !== 0) failed.push(file);
}

console.log(`\n${files.length - failed.length}/${files.length} checks passed.`);
if (failed.length) {
  console.error(`Failed: ${failed.join(", ")}`);
  process.exit(1);
}
