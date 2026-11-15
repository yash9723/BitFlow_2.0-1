/**
 * lib/ai-budget.ts — what the AI costs, and a daily spend guard (app/api/ai/chat/route.ts).
 *
 * Every answer is recorded in AiUsage with an estimated cost in paise. The guard sums today's (IST) spend:
 *   below AI_DAILY_SOFT_INR  everything as normal
 *   above it                 every request uses the Lite model, and the tutor agent is skipped
 *   above AI_DAILY_HARD_INR  the AI rests until tomorrow
 * The Google Cloud free-trial credit has no hard stop of its own, so this is it.
 *
 * Prices are USD per million tokens, an estimate to keep spend in check, not an invoice: check Vertex AI pricing and
 * override with AI_PRICES_JSON, e.g. {"gemini-3.8-flash":{"in":0.5,"out":3}}. Unknown models use the "default" row.
 */
import { prisma } from "@/lib/prisma";

export interface TokenUsage { input: number; output: number; cached?: number }
interface Price { in: number; out: number }

// ponytail: conservative guesses (they over- rather than under-estimate); set AI_PRICES_JSON from the pricing page.
const DEFAULT_PRICES: Record<string, Price> = {
  "gemini-3.8-flash":      { in: 0.5, out: 3 },
  "gemini-3.5-flash-lite": { in: 0.1, out: 0.4 },
  default:                 { in: 0.5, out: 3 },
};
const CACHED_SHARE = 0.1; // cached input tokens bill at about a tenth of the input price

const num = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

function prices(): Record<string, Price> {
  try { return { ...DEFAULT_PRICES, ...JSON.parse(process.env.AI_PRICES_JSON || "{}") }; } catch { return DEFAULT_PRICES; }
}

/** Estimated cost of one answer in paise (₹1 = 100 paise), rounded up. */
export function costPaise(model: string, u: TokenUsage): number {
  const p = prices()[model] ?? prices().default;
  const cached = Math.min(u.cached ?? 0, u.input);
  const usd = ((u.input - cached) * p.in + cached * p.in * CACHED_SHARE + u.output * p.out) / 1e6;
  return Math.max(0, Math.ceil(usd * num(process.env.USD_INR, 88) * 100 - 1e-9)); // the epsilon stops float noise (440.0000001) rounding up
}

export type BudgetState = "ok" | "lite" | "paused";

/** Which side of today's thresholds a spend (paise) is on. */
export function budgetState(spentPaise: number): BudgetState {
  if (spentPaise >= num(process.env.AI_DAILY_HARD_INR, 400) * 100) return "paused";
  if (spentPaise >= num(process.env.AI_DAILY_SOFT_INR, 250) * 100) return "lite";
  return "ok";
}

/** Midnight IST, as a UTC Date: the budget day starts when Indian students' day does. */
export function istDayStart(now = new Date()): Date {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 330 * 60_000);
}

// Summing the table on every request would be wasteful; a minute's lag is fine for a daily cap.
let memo: { day: number; at: number; paise: number } | null = null;

export async function spentTodayPaise(now = new Date()): Promise<number> {
  const day = istDayStart(now).getTime();
  if (memo && memo.day === day && now.getTime() - memo.at < 60_000) return memo.paise;
  try {
    const agg = await prisma.aiUsage.aggregate({ _sum: { paise: true }, where: { createdAt: { gte: new Date(day) } } });
    memo = { day, at: now.getTime(), paise: agg._sum.paise ?? 0 };
    return memo.paise;
  } catch (err) {
    // No table yet (a preview build skips the schema push) or the database blipped: let the request through.
    // The request-count caps in the chat route still hold, so this can't run away.
    console.warn("[ai] spend unknown, budget not applied:", err instanceof Error ? err.message : err);
    return 0;
  }
}

/** One row per answer. Never throws: losing a usage row must not lose the student's answer. */
export async function recordUsage(row: {
  userId: string; kind: string; provider: string; model: string; usage: TokenUsage | null; latencyMs: number;
}): Promise<void> {
  const u = row.usage ?? { input: 0, output: 0 };
  const paise = costPaise(row.model, u);
  if (memo) memo.paise += paise;
  try {
    await prisma.aiUsage.create({ data: {
      userId: row.userId, kind: row.kind, provider: row.provider, model: row.model,
      inputTokens: u.input, outputTokens: u.output, cachedTokens: u.cached ?? 0, paise, latencyMs: row.latencyMs,
    } });
  } catch (err) {
    console.warn("[ai] usage not recorded:", err instanceof Error ? err.message : err);
  }
}
