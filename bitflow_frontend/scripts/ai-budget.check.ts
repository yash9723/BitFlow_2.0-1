/**
 * scripts/ai-budget.check.ts — the AI spend guard and model router (npx tsx scripts/ai-budget.check.ts):
 * cost estimates, the daily thresholds, the IST day boundary, and which model each kind of request gets.
 * No database or network: only the pure functions.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { budgetState, costPaise, istDayStart } from "../lib/ai-budget";
import { pickModel } from "../lib/ai-providers";

for (const k of ["AI_PRICES_JSON", "USD_INR", "AI_DAILY_SOFT_INR", "AI_DAILY_HARD_INR", "GEMINI_MODEL", "GEMINI_LITE_MODEL"]) delete process.env[k];
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log("ok  ", name); };

ok("cost: input, output and cached tokens priced per million, in paise, rounded up", () => {
  // 1M in at $0.5 + 1M out at $3 = $3.5 × 88 = ₹308 = 30,800 paise
  assert.equal(costPaise("gemini-3.8-flash", { input: 1e6, output: 1e6 }), 30_800);
  // all input cached: a tenth of the input price → $0.05 → ₹4.4
  assert.equal(costPaise("gemini-3.8-flash", { input: 1e6, output: 0, cached: 1e6 }), 440);
  assert.equal(costPaise("gemini-3.8-flash", { input: 1, output: 0 }), 1, "a tiny answer still costs at least a paisa");
  assert.equal(costPaise("gemini-3.8-flash", { input: 0, output: 0 }), 0);
  assert.ok(costPaise("gemini-3.5-flash-lite", { input: 5000, output: 800 }) < costPaise("gemini-3.8-flash", { input: 5000, output: 800 }));
  assert.equal(costPaise("some-new-model", { input: 1e6, output: 0 }), costPaise("gemini-3.8-flash", { input: 1e6, output: 0 }), "unknown models use the default row");
});

ok("prices and the exchange rate can be overridden; a broken override falls back", () => {
  process.env.AI_PRICES_JSON = JSON.stringify({ "gemini-3.8-flash": { in: 1, out: 1 } });
  process.env.USD_INR = "100";
  assert.equal(costPaise("gemini-3.8-flash", { input: 1e6, output: 0 }), 10_000);
  process.env.AI_PRICES_JSON = "{not json";
  assert.equal(costPaise("gemini-3.8-flash", { input: 1e6, output: 0 }), 5_000);
  delete process.env.AI_PRICES_JSON; delete process.env.USD_INR;
});

ok("budget: normal, then Lite past ₹250, paused past ₹400 (and overridable)", () => {
  assert.equal(budgetState(0), "ok");
  assert.equal(budgetState(24_999), "ok");
  assert.equal(budgetState(25_000), "lite");
  assert.equal(budgetState(39_999), "lite");
  assert.equal(budgetState(40_000), "paused");
  process.env.AI_DAILY_SOFT_INR = "10"; process.env.AI_DAILY_HARD_INR = "20";
  assert.equal(budgetState(1_000), "lite");
  assert.equal(budgetState(2_000), "paused");
  process.env.AI_DAILY_SOFT_INR = "nonsense";
  assert.equal(budgetState(1_000), "ok", "a bad value falls back to the default");
  delete process.env.AI_DAILY_SOFT_INR; delete process.env.AI_DAILY_HARD_INR;
});

ok("the budget day starts at midnight IST (18:30 UTC)", () => {
  assert.equal(istDayStart(new Date("2026-11-11T10:00:00Z")).toISOString(), "2026-11-10T18:30:00.000Z");
  assert.equal(istDayStart(new Date("2026-11-11T18:29:59Z")).toISOString(), "2026-11-10T18:30:00.000Z");
  assert.equal(istDayStart(new Date("2026-11-11T18:30:00Z")).toISOString(), "2026-11-11T18:30:00.000Z");
});

ok("router: quick actions use Lite, chats use Flash, past the soft budget everything is Lite and skips the agent", () => {
  assert.deepEqual(pickModel("quick", "ok"),   { model: "gemini-3.5-flash-lite", skipAgent: false });
  assert.deepEqual(pickModel("sandbox", "ok"), { model: "gemini-3.8-flash", skipAgent: false });
  assert.deepEqual(pickModel("tutor", "ok"),   { model: "gemini-3.8-flash", skipAgent: false });
  for (const k of ["quick", "sandbox", "tutor"] as const) assert.deepEqual(pickModel(k, "lite"), { model: "gemini-3.5-flash-lite", skipAgent: true });
  process.env.GEMINI_LITE_MODEL = "lite-x"; process.env.GEMINI_MODEL = "flash-x";
  assert.equal(pickModel("quick", "ok").model, "lite-x");
  assert.equal(pickModel("tutor", "ok").model, "flash-x");
  delete process.env.GEMINI_LITE_MODEL; delete process.env.GEMINI_MODEL;
});

ok("the chat route checks the budget before calling a model and records every answer", () => {
  const route = fs.readFileSync(path.join(__dirname, "..", "app", "api", "ai", "chat", "route.ts"), "utf8");
  assert.ok(route.indexOf('budget === "paused"') < route.indexOf("provider.chat("), "pause before spending");
  assert.ok(/provider\.chat\([\s\S]{0,120}\n\s*await recordUsage\(/.test(route), "a usage row after each answer");
  assert.ok(!/NextResponse\.json\(response\)/.test(route), "token splits and model names stay on the server");
});

console.log(`\nai-budget: ${n} checks passed`);
