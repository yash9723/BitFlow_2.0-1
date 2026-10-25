/**
 * scripts/vendor-openfpgaloader.mjs — copy YoWASP's WebUSB build of openFPGALoader into
 * public/vendor/openfpgaloader-<version>/ for the /flash page (lib/flash.ts). It must be
 * served from our own origin: its threads start `new Worker("openFPGALoader.mjs")` next to
 * the module, and workers can't come from a CDN. Run when the version in lib/flash.ts changes:
 *   npm i --no-save @yowasp/openfpgaloader@<version>
 *   node scripts/vendor-openfpgaloader.mjs node_modules/@yowasp/openfpgaloader
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [pkg] = process.argv.slice(2);
if (!pkg) throw new Error("usage: node scripts/vendor-openfpgaloader.mjs <package dir>");
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const out = join("public", "vendor", `openfpgaloader-${version}`);
mkdirSync(out, { recursive: true });
copyFileSync(join(pkg, "gen", "bundle.js"), join(out, "openFPGALoader.mjs"));   // the name its worker loads
copyFileSync(join(pkg, "gen", "openFPGALoader.wasm"), join(out, "openFPGALoader.wasm"));
writeFileSync(join(out, "NOTICE.txt"), [
  `@yowasp/openfpgaloader ${version}, unmodified (https://www.npmjs.com/package/@yowasp/openfpgaloader).`,
  "Build scripts and sources: https://github.com/YoWASP/openFPGALoader-web",
  "  YoWASP packaging: ISC license.",
  "  openFPGALoader (https://github.com/trabucayre/openFPGALoader): Apache License 2.0.",
  "  libusb and libftdi, linked in: GNU LGPL 2.1; sources as above.", "",
].join("\n"));
console.log(`wrote ${out}`);
