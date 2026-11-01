#!/usr/bin/env node
/**
 * scripts/load-test.mjs — a college lab in one go: N students sign up from one address
 * (like a campus NAT), then all of them run simulations at the same moment.
 *
 *   node scripts/load-test.mjs https://staging.example.com [students=60] [runsEach=3]
 *
 * Run it against staging or a local `docker compose up`, never production: it creates real
 * accounts named loadtest_<time>_<n> (delete them from the admin Users tab afterwards).
 * Every request carries X-Forwarded-For: 203.0.113.10 (a documentation address), so a local
 * server with TRUST_PROXY=true sees one shared campus IP; behind Caddy the real IP is used.
 * Reports sign-up results, then the status codes and p50/p95/max latency of the runs.
 * Pass when sign-ups and runs show no 429 or 5xx and p95 stays under about 5 s.
 */

const [base = "http://localhost:3000", studentsArg = "60", runsArg = "3"] = process.argv.slice(2);
const STUDENTS = Number(studentsArg), RUNS = Number(runsArg);
const BASE = base.replace(/\/$/, "");
const stamp = Date.now().toString(36);

const DESIGN = `module and_gate(input a, input b, output y);
  assign y = a & b;
endmodule
`;
const TESTBENCH = `module tb;
  reg a, b; wire y;
  and_gate dut(.a(a), .b(b), .y(y));
  initial begin
    $dumpfile("dump.vcd"); $dumpvars(0, tb);
    a = 0; b = 0; #10 a = 1; #10 b = 1; #10 a = 0; #10;
    $display("y=%b", y);
    $finish;
  end
endmodule
`;

const CAMPUS = { "X-Forwarded-For": "203.0.113.10" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const tally = (codes) => Object.entries(codes.reduce((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {}))
  .map(([c, n]) => `${c}×${n}`).join("  ");

async function signUp(i) {
  const tokenRes = await fetch(`${BASE}/api/auth/register`, { headers: CAMPUS });
  const { formToken } = await tokenRes.json();
  await sleep(3_500);   // the form token must be at least 3 s old (lib/bot-check.ts)
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json", ...CAMPUS },
    body: JSON.stringify({
      username: `loadtest_${stamp}_${i}`, password: `load-test-${stamp}-${i}-pw`, role: "STUDENT",
      formToken, website: "", consent: true, birthYear: 2000, birthMonth: 1, signupSource: "load-test",
    }),
  });
  const cookie = (res.headers.get("set-cookie") ?? "").match(/bitflow_session=[^;]+/)?.[0];
  return { status: res.status, cookie, error: res.ok ? null : (await res.json().catch(() => ({}))).error };
}

async function run(cookie) {
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}/api/simulate`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, ...CAMPUS },
      body: JSON.stringify({ design_v: DESIGN, testbench_v: TESTBENCH }),   // lib/types.ts SimulateRequest
    });
    const data = await res.json().catch(() => ({}));
    // A 200 must also be a finished simulation that printed the expected output.
    const ok = res.ok && data.status === "success" && String(data.stdout ?? "").includes("y=0");
    return { status: res.ok && !ok ? `200-but-${data.status ?? "unknown"}` : res.status, ms: performance.now() - started };
  } catch {
    return { status: "network", ms: performance.now() - started };
  }
}

console.log(`Load test: ${STUDENTS} students × ${RUNS} runs against ${BASE}`);

// Everyone opens the sign-up form within a few seconds of each other, as in a lab.
const signups = await Promise.all(Array.from({ length: STUDENTS }, (_, i) => sleep(i * 50).then(() => signUp(i))));
console.log(`Sign-ups: ${tally(signups.map((s) => s.status))}`);
for (const e of new Set(signups.filter((s) => s.error).map((s) => s.error))) console.log(`  error: ${e}`);
const sessions = signups.map((s) => s.cookie).filter(Boolean);
if (!sessions.length) { console.error("No sessions: nothing to run."); process.exit(1); }

// Then they all press Run together, RUNS times.
const results = [];
const t0 = performance.now();
for (let round = 0; round < RUNS; round++) {
  results.push(...(await Promise.all(sessions.map(run))));
}
const wall = (performance.now() - t0) / 1000;
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
console.log(`Runs:     ${tally(results.map((r) => r.status))}  in ${wall.toFixed(1)} s`);
console.log(`Latency:  p50 ${(pct(ms, 50) / 1000).toFixed(2)} s   p95 ${(pct(ms, 95) / 1000).toFixed(2)} s   max ${(ms.at(-1) / 1000).toFixed(2)} s`);

const bad = [...signups, ...results].some((r) => r.status !== 200);
const slow = pct(ms, 95) > 5_000;
console.log(bad ? "FAIL: some requests were refused or errored." : slow ? "SLOW: p95 is over 5 s; add cores or raise MAX_CONCURRENT_SIMULATIONS." : "PASS");
console.log(`Delete the test accounts afterwards: usernames start with loadtest_${stamp}_`);
process.exit(bad ? 1 : 0);
