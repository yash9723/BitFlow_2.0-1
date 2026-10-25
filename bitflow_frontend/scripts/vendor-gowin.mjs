/**
 * scripts/vendor-gowin.mjs — cut the Gowin chip databases the boards use out of YoWASP's
 * nextpnr-himbaechel-gowin resource tar (181 MB, every chip) into public/fpga/gowin-<version>/:
 *   chipdb-<chip>.tar.gz  the tar's directory entries + that chip's database
 *   python.tar.gz         the python/ directory entry + the apicula wheel gowin_pack installs
 * lib/synth/fpga-worker.ts joins one chip and python into the tar the runtime expects.
 * Run when the version in lib/synth/fpga-worker.ts changes:
 *   npm i --no-save @yowasp/nextpnr-himbaechel-gowin@<version>
 *   node scripts/vendor-gowin.mjs node_modules/@yowasp/nextpnr-himbaechel-gowin GW1N-9C GW2A-18C
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const [pkg, ...chips] = process.argv.slice(2);
if (!pkg || chips.length === 0) throw new Error("usage: node scripts/vendor-gowin.mjs <package dir> <chip>...");
const version = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version;
const parts = readdirSync(join(pkg, "gen")).filter((f) => /-resources\.\d+\.tar$/.test(f)).sort();
const tar = Buffer.concat(parts.map((f) => readFileSync(join(pkg, "gen", f))));

// Every tar entry: [name, start, end) with the header and the data padded to 512 bytes.
const entries = [];
for (let at = 0; at + 512 <= tar.length; ) {
  const name = tar.toString("utf8", at, at + 100).replace(/\0.*$/s, "");
  if (!name) break;
  const size = parseInt(tar.toString("utf8", at + 124, at + 136).replace(/\0.*$/s, "").trim() || "0", 8);
  const end = at + 512 + Math.ceil(size / 512) * 512;
  entries.push({ name, start: at, end });
  at = end;
}
const span = (pred) => Buffer.concat(entries.filter((e) => pred(e.name)).map((e) => tar.subarray(e.start, e.end)));

const out = join("public", "fpga", `gowin-${version}`);
mkdirSync(out, { recursive: true });
for (const chip of chips) {
  const file = `himbaechel/gowin/chipdb-${chip}.bin`;
  if (!entries.some((e) => e.name === file)) throw new Error(`no chip database for ${chip}`);
  writeFileSync(join(out, `chipdb-${chip}.tar.gz`), gzipSync(span((n) => /^himbaechel(\/gowin)?\/?$/.test(n) || n === file), { level: 9 }));
}
writeFileSync(join(out, "python.tar.gz"), gzipSync(span((n) => n.startsWith("python")), { level: 9 }));
console.log(`wrote ${out}: ${chips.map((c) => `chipdb-${c}.tar.gz`).join(", ")}, python.tar.gz`);
