#!/usr/bin/env node
/**
 * scripts/loadtest/loadtest.mjs — an end-to-end load test for a running BitFlow site (Node 18+, no dependencies).
 *
 *   node scripts/loadtest/loadtest.mjs --base https://bitflowvlsi.tech --stage all --accounts 20
 *
 * Stages (run in this order with --stage all):
 *   probe  signed-out POST /api/simulate must answer 401 (checks the sign-in rule is live)
 *   anon   stepped read load on public pages from /sitemap.xml and /api/simulate/health (no accounts)
 *   runs   signed-in Icarus runs (10% Verilator) with unique code each time, stepped number of virtual users
 *   heavy  signed-in Verilator runs at rising concurrency, plus a burst by ONE account that must hit the
 *          per-user heavy budget (HTTP 429) to prove it is live
 *
 * It creates --accounts temporary users named loadtest-<random> (adults, passwords random and kept only in
 * memory) and DELETES them at the end, also on Ctrl-C, on a STOP file, and on automatic abort.
 *
 * Safety: a STOP file in the current directory (touch STOP) or Ctrl-C ends the test at once; the test aborts by
 * itself when more than 5 % of the last 30 s of requests failed with a 5xx or a network error.
 * It only ever talks to --base. Run it from a normal machine; do not run it from the simulator server.
 *
 * Results: a table in the terminal and loadtest-result.json (no passwords, no cookies).
 */

import fs from "node:fs";
import crypto from "node:crypto";

// ───────────────────────────── options ─────────────────────────────
function opts(argv) {
  const o = {
    base: "https://bitflowvlsi.tech", stage: "all", accounts: 20, think: 7,
    stepSeconds: 30, anonRates: [10, 30, 60, 100], vus: null, heavyLevels: [2, 4, 8, 16],
    inflightCap: 400, yes: false, noDelete: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === "--base") o.base = next().replace(/\/+$/, "");
    else if (a === "--stage") o.stage = next();
    else if (a === "--accounts") o.accounts = Number(next());
    else if (a === "--think") o.think = Number(next());
    else if (a === "--step-seconds") o.stepSeconds = Number(next());
    else if (a === "--anon-rates") o.anonRates = next().split(",").map(Number);
    else if (a === "--vus") o.vus = next().split(",").map(Number);
    else if (a === "--heavy-levels") o.heavyLevels = next().split(",").map(Number);
    else if (a === "--yes") o.yes = true;
    else if (a === "--no-delete") o.noDelete = true;
    else if (a === "--help" || a === "-h") { console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]); process.exit(0); }
    else throw new Error(`unknown option ${a}`);
  }
  if (!["all", "probe", "anon", "runs", "heavy"].includes(o.stage)) throw new Error("--stage must be all|probe|anon|runs|heavy");
  if (!(o.accounts >= 1 && o.accounts <= 60)) throw new Error("--accounts must be 1..60");
  return o;
}

// ───────────────────────────── stats ─────────────────────────────
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]);
}

export function summarize(samples, seconds) {
  const lat = samples.filter((s) => s.status > 0).map((s) => s.ms).sort((a, b) => a - b);
  const codes = {};
  for (const s of samples) codes[s.status || "net"] = (codes[s.status || "net"] ?? 0) + 1;
  const bad = samples.filter((s) => s.status === 0 || s.status >= 500).length;
  return {
    requests: samples.length, perSecond: seconds ? +(samples.length / seconds).toFixed(2) : null,
    p50: percentile(lat, 0.5), p95: percentile(lat, 0.95), p99: percentile(lat, 0.99), max: lat.length ? Math.round(lat[lat.length - 1]) : null,
    codes, errorRate: samples.length ? +(bad / samples.length).toFixed(4) : 0,
  };
}

/** True when more than `limit` of the samples in the window are 5xx / network errors (needs >= minSamples). */
export function shouldAbort(recent, limit = 0.05, minSamples = 20) {
  if (recent.length < minSamples) return false;
  return recent.filter((s) => s.status === 0 || s.status >= 500).length / recent.length > limit;
}

// ───────────────────────────── plumbing ─────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let stopping = false, stopReason = "";
const stop = (why) => { if (!stopping) { stopping = true; stopReason = why; console.log(`\n!! stopping: ${why}`); } };
process.on("SIGINT", () => stop("Ctrl-C"));
process.on("SIGTERM", () => stop("SIGTERM"));
const recent = [];   // samples of the last 30 s across all stages, for the auto-abort
function note(sample) { recent.push(sample); const cut = Date.now() - 30_000; while (recent.length && recent[0].at < cut) recent.shift(); }
setInterval(() => {
  if (fs.existsSync("STOP")) stop("STOP file found");
  if (shouldAbort(recent)) stop("more than 5% server errors in the last 30 s");
}, 2000).unref();

async function hit(base, path, init = {}, cookie = "") {
  const t0 = performance.now();
  let status = 0, body = "", setCookie = [];
  try {
    const res = await fetch(base + path, {
      ...init, redirect: "manual", signal: AbortSignal.timeout(60_000),
      headers: { "user-agent": "bitflow-loadtest", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
    });
    status = res.status;
    body = await res.text();
    setCookie = res.headers.getSetCookie?.() ?? [];
  } catch { /* network error or timeout: status stays 0 */ }
  const sample = { status, ms: performance.now() - t0, at: Date.now() };
  note(sample);
  return { ...sample, body, setCookie };
}

const json = (o) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(o) });
const rid = () => crypto.randomBytes(5).toString("hex");

function runBody(i, sim = "icarus") {
  const tag = `${rid()}_${i}`;
  return {
    design_v: `// ${tag}\nmodule top(input clk, input rst, output reg [7:0] q); always @(posedge clk) if (rst) q<=0; else q<=q+1; endmodule`,
    testbench_v: `// ${tag}\nmodule tb; reg clk=0, rst=1; wire [7:0] q; top d(clk,rst,q); always #5 clk=~clk; integer n; initial begin #12 rst=0; for(n=0;n<200;n=n+1) @(posedge clk); $display("q=%0d", q); $finish; end endmodule`,
    simulator: sim, lint: false, timeout: 30,
  };
}

// ───────────────────────────── accounts ─────────────────────────────
async function createAccounts(base, n) {
  const out = [];
  console.log(`creating ${n} temporary accounts (register limit is 5 a minute per IP, so this takes about ${Math.ceil(n / 5)} min)...`);
  while (out.length < n && !stopping) {
    const form = await hit(base, "/api/auth/register");
    let formToken;
    try { formToken = JSON.parse(form.body).formToken; } catch { /* handled below */ }
    if (!formToken) { console.log(`  could not get a sign-up token (HTTP ${form.status}); stopping account creation`); break; }
    await sleep(3200);   // the server refuses sign-ups faster than 3 s after the token was issued
    const username = `loadtest-${rid()}`, password = crypto.randomBytes(15).toString("base64url");
    const r = await hit(base, "/api/auth/register", json({
      username, password, role: "STUDENT", consent: true, birthYear: 1995, birthMonth: 6, formToken, website: "",
    }));
    if (r.status === 429) { console.log("  register limit hit, waiting 65 s"); await sleep(65_000); continue; }
    const cookie = r.setCookie.map((c) => c.split(";")[0]).find((c) => c.startsWith("bitflow_session="));
    if (r.status !== 200 || !cookie) { console.log(`  register failed (HTTP ${r.status}): ${r.body.slice(0, 120)}`); break; }
    out.push({ username, password, cookie });
    process.stdout.write(`\r  ${out.length}/${n}`);
  }
  console.log("");
  return out;
}

async function deleteAccounts(base, accounts) {
  if (!accounts.length) return;
  console.log(`deleting ${accounts.length} temporary accounts...`);
  const failed = [];
  for (const a of accounts) {
    const r = await hit(base, "/api/profile", { ...json({ password: a.password, confirm: "delete" }), method: "DELETE" }, a.cookie);
    if (r.status !== 200) { failed.push(a.username); await sleep(500); }
  }
  if (failed.length) console.log(`!! could not delete: ${failed.join(", ")}  (delete them from the profile page, or tell Claude)`);
  else console.log("all temporary accounts deleted");
}

// ───────────────────────────── stages ─────────────────────────────
async function stageProbe(o) {
  const r = await hit(o.base, "/api/simulate", json(runBody(0)));
  const ok = r.status === 401;
  console.log(`probe: signed-out POST /api/simulate -> ${r.status} ${ok ? "(correct: sign-in required)" : "(EXPECTED 401)"}`);
  return { signedOutSimulateStatus: r.status, ok };
}

async function publicPaths(o) {
  const r = await hit(o.base, "/sitemap.xml");
  const urls = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const pick = (re, n) => urls.filter((u) => re.test(u)).slice(0, n);
  const paths = ["/", "/api/simulate/health", ...pick(/^\/academy\/[^/]+$/, 6), ...pick(/^\/articles\/[^/]+$/, 4), ...pick(/^\/problems\/[^/]+$/, 8), "/problems", "/articles"];
  return [...new Set(paths)];
}

async function stageAnon(o) {
  const paths = await publicPaths(o);
  console.log(`anon: ${paths.length} public paths, rates ${o.anonRates.join(", ")} req/s, ${o.stepSeconds}s each`);
  const steps = [];
  for (const rate of o.anonRates) {
    if (stopping) break;
    const samples = [], t0 = Date.now();
    let inflight = 0, fired = 0;
    const timer = setInterval(() => {
      const due = Math.floor(((Date.now() - t0) / 1000) * rate) - fired;   // open loop: send on schedule, whatever the answers do
      for (let k = 0; k < due && inflight < o.inflightCap; k++) {
        fired++; inflight++;
        hit(o.base, paths[Math.floor(Math.random() * paths.length)]).then((s) => { samples.push(s); }).finally(() => inflight--);
      }
    }, 50);
    while (Date.now() - t0 < o.stepSeconds * 1000 && !stopping) await sleep(250);
    clearInterval(timer);
    while (inflight > 0) await sleep(100);
    const sum = summarize(samples, (Date.now() - t0) / 1000);
    steps.push({ targetRate: rate, ...sum });
    console.log(`  ${String(rate).padStart(4)} req/s -> ${sum.perSecond}/s  p50 ${sum.p50}  p95 ${sum.p95}  p99 ${sum.p99} ms  codes ${JSON.stringify(sum.codes)}`);
  }
  return steps;
}

async function vuLoop(o, account, until, kind, samples, counters) {
  let n = 0;
  while (Date.now() < until && !stopping) {
    const heavy = kind === "heavy" || (kind === "runs" && Math.random() < 0.1);
    const r = await hit(o.base, "/api/simulate", json(runBody(n++, heavy ? "verilator" : "icarus")), account.cookie);
    samples.push({ ...r, heavy });
    let text = ""; try { text = JSON.parse(r.body).status ?? ""; } catch { /* not JSON */ }
    if (r.status === 200 && text) counters[text] = (counters[text] ?? 0) + 1;
    if (kind === "runs") await sleep((o.think * 1000) * (0.5 + Math.random()));
  }
}

async function stageRuns(o, accounts) {
  const perAccountMax = 28;   // the per-user limit is 30 runs a minute
  const levels = (o.vus ?? [10, 25, 50, 70]).map((v) => Math.min(v, Math.floor((perAccountMax * accounts.length * o.think) / 60)));
  console.log(`runs: ${accounts.length} accounts, virtual users ${[...new Set(levels)].join(", ")} (think ~${o.think}s), ${o.stepSeconds}s each`);
  const steps = [];
  for (const vus of [...new Set(levels)]) {
    if (stopping) break;
    const samples = [], counters = {}, until = Date.now() + o.stepSeconds * 1000, t0 = Date.now();
    await Promise.all(Array.from({ length: vus }, (_, i) => vuLoop(o, accounts[i % accounts.length], until, "runs", samples, counters)));
    const all = summarize(samples, (Date.now() - t0) / 1000);
    const heavy = summarize(samples.filter((s) => s.heavy), (Date.now() - t0) / 1000);
    const light = summarize(samples.filter((s) => !s.heavy), (Date.now() - t0) / 1000);
    steps.push({ virtualUsers: vus, all, light, heavy, simulatorStatus: counters });
    console.log(`  ${String(vus).padStart(3)} VUs -> ${all.perSecond} runs/s  light p50 ${light.p50} p95 ${light.p95} | heavy p50 ${heavy.p50} p95 ${heavy.p95} ms  codes ${JSON.stringify(all.codes)}`);
  }
  return steps;
}

async function stageHeavy(o, accounts) {
  console.log(`heavy: Verilator at concurrency ${o.heavyLevels.join(", ")}, ${o.stepSeconds}s each, then a one-account burst`);
  const steps = [];
  for (const conc of o.heavyLevels) {
    if (stopping) break;
    const samples = [], counters = {}, until = Date.now() + o.stepSeconds * 1000, t0 = Date.now();
    await Promise.all(Array.from({ length: conc }, (_, i) => vuLoop(o, accounts[i % accounts.length], until, "heavy", samples, counters)));
    const s = summarize(samples, (Date.now() - t0) / 1000);
    steps.push({ concurrency: conc, ...s, simulatorStatus: counters });
    console.log(`  ${String(conc).padStart(3)} concurrent -> ${s.perSecond} runs/s  p50 ${s.p50}  p95 ${s.p95} ms  codes ${JSON.stringify(s.codes)}`);
  }
  // one account, 16 Verilator runs at once: the shared budget (12 a minute) must answer some with 429
  let budget = null;
  if (!stopping) {
    const burst = await Promise.all(Array.from({ length: 16 }, (_, i) => hit(o.base, "/api/simulate", json(runBody(1000 + i, "verilator")), accounts[0].cookie)));
    const codes = {};
    for (const b of burst) codes[b.status] = (codes[b.status] ?? 0) + 1;
    budget = { burst: 16, codes, budgetLive: (codes[429] ?? 0) > 0 };
    console.log(`  one-account burst of 16 Verilator runs -> ${JSON.stringify(codes)} ${budget.budgetLive ? "(per-user heavy budget is live)" : "(no 429: the budget did not trigger)"}`);
  }
  return { steps, budget };
}

// ───────────────────────────── main ─────────────────────────────
async function main() {
  const o = opts(process.argv.slice(2));
  const need = o.stage === "all" || o.stage === "runs" || o.stage === "heavy";
  console.log(`BitFlow load test -> ${o.base}  (stage ${o.stage}${need ? `, ${o.accounts} temporary accounts` : ""})`);
  console.log("Stop it any time with Ctrl-C, or `touch STOP` in this folder. Temporary accounts are deleted at the end.\n");
  if (!o.yes) { console.log("Add --yes to confirm you want to run this against the site above."); process.exit(2); }

  const result = { startedAt: new Date().toISOString(), base: o.base, options: { ...o }, stages: {} };
  let accounts = [];
  try {
    if (o.stage === "all" || o.stage === "probe") result.stages.probe = await stageProbe(o);
    if (o.stage === "all" || o.stage === "anon") result.stages.anon = await stageAnon(o);
    if (need && !stopping) accounts = await createAccounts(o.base, o.accounts);
    if ((o.stage === "all" || o.stage === "runs") && accounts.length && !stopping) result.stages.runs = await stageRuns(o, accounts);
    if ((o.stage === "all" || o.stage === "heavy") && accounts.length && !stopping) result.stages.heavy = await stageHeavy(o, accounts);
  } finally {
    result.stoppedEarly = stopping ? stopReason : null;
    result.finishedAt = new Date().toISOString();
    result.recentErrorRate = summarize(recent, 30).errorRate;
    if (!o.noDelete) { stopping = false; await deleteAccounts(o.base, accounts); }
    fs.writeFileSync("loadtest-result.json", JSON.stringify(result, null, 2));
    console.log("\nwrote loadtest-result.json  (send it, or paste the table above, to Claude)");
  }
}

import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });
