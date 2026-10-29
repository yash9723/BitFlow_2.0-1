/**
 * scripts/check-bundle-leaks.ts — after `next build`, fail if the files a browser can download
 * (.next/static) hold anything that must stay on the server: hidden testbenches, reference
 * solutions, server-only code, source maps, private keys, or the values of server secrets
 * set in this environment. Run: npm run check-leaks
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", ".next", "static");

const PATTERNS: [string, RegExp][] = [
  ["hidden testbench module", /\bmodule\s+\w*_hidden\b/],
  ["hidden testbench source", /hiddenTestbench\s*:\s*["'`]\s*`timescale/],
  ["reference solution source", /referenceSolution\s*:\s*["'`]\s*(`timescale|module\b)/],
  ["Board Lab reference solution", /lab-solution/],
  ["server-only Prisma client", /PrismaClient/],
  ["source map reference", /sourceMappingURL=/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
// Server secrets: their values (when set here, e.g. in CI or the local stack) must not be shipped.
const SECRETS = ["JWT_SECRET", "ADMIN_SECRET", "DATABASE_URL", "BACKEND_URL", "CRON_SECRET", "ANTHROPIC_API_KEY"]
  .map((k) => [k, process.env[k] ?? ""] as const)
  .filter(([, v]) => v.length >= 8);

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

const problems: string[] = [];
let scanned = 0;
for (const file of files(ROOT)) {
  if (file.endsWith(".map")) { problems.push(`${file}: source map shipped`); continue; }
  if (!/\.(js|css|json|txt|html)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  scanned++;
  for (const [what, re] of PATTERNS) if (re.test(text)) problems.push(`${file}: ${what}`);
  for (const [name, value] of SECRETS) if (text.includes(value)) problems.push(`${file}: value of ${name}`);
}

if (scanned === 0) {
  console.error(`check-leaks: nothing to scan in ${ROOT}; run next build first.`);
  process.exit(1);
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`check-leaks: ${scanned} client files clean (${SECRETS.length} secret values checked)`);
