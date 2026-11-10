/** scripts/engagement.check.ts — streaks and freezes (lib/daily.ts), the week boundary (lib/xp.ts) and daily quests (lib/quests.ts). */
import assert from "node:assert/strict";
import { currentStreak, daysBetween, MAX_FREEZES, nextStreak } from "../lib/daily";
import { weekStart } from "../lib/xp";
import { QUESTS, questsFor } from "../lib/quests";

const s = (lastDailyBonus: string | null, dailyStreak: number, streakFreezes = 0) => ({ lastDailyBonus, dailyStreak, streakFreezes });

// ── Streaks and freezes ──
assert.equal(daysBetween("2026-02-27", "2026-03-01"), 2, "across month end");
assert.deepEqual(nextStreak(s(null, 0), "2026-03-01"), { streak: 1, freezes: 0 }, "first claim");
assert.deepEqual(nextStreak(s("2026-03-01", 3), "2026-03-02"), { streak: 4, freezes: 0 }, "next day continues");
assert.deepEqual(nextStreak(s("2026-03-01", 3), "2026-03-03"), { streak: 1, freezes: 0 }, "a missed day with no freeze resets");
assert.deepEqual(nextStreak(s("2026-03-01", 3, 1), "2026-03-03"), { streak: 4, freezes: 0 }, "a freeze covers one missed day");
assert.deepEqual(nextStreak(s("2026-03-01", 3, 1), "2026-03-04"), { streak: 1, freezes: 1 }, "two missed days, one freeze: reset");
assert.deepEqual(nextStreak(s("2026-03-01", 3, 2), "2026-03-04"), { streak: 4, freezes: 0 }, "two freezes cover two days");
assert.deepEqual(nextStreak(s("2026-03-01", 6), "2026-03-02"), { streak: 7, freezes: 1 }, "day 7 earns a freeze");
assert.deepEqual(nextStreak(s("2026-03-01", 13, MAX_FREEZES), "2026-03-02"), { streak: 14, freezes: MAX_FREEZES }, "freezes are capped");
assert.equal(currentStreak(s("2026-03-01", 5), "2026-03-01"), 5, "claimed today");
assert.equal(currentStreak(s("2026-03-01", 5), "2026-03-02"), 5, "not yet claimed today");
assert.equal(currentStreak(s("2026-03-01", 5), "2026-03-03"), 0, "lapsed");
assert.equal(currentStreak(s("2026-03-01", 5, 1), "2026-03-03"), 5, "kept alive by a freeze");
assert.equal(currentStreak(s("2026-03-01", 5, 1), "2026-03-04"), 0, "beyond the freezes");
assert.equal(currentStreak({ lastDailyBonus: "2026-03-01", dailyStreak: 5 }, "2026-03-02"), 5, "rows without the freeze field");

// ── Week starts Monday 00:00 UTC ──
assert.equal(weekStart(new Date("2026-11-09T12:00:00Z")).toISOString(), "2026-11-09T00:00:00.000Z", "Monday");
assert.equal(weekStart(new Date("2026-11-15T23:59:59Z")).toISOString(), "2026-11-09T00:00:00.000Z", "Sunday night");
assert.equal(weekStart(new Date("2026-11-16T00:00:00Z")).toISOString(), "2026-11-16T00:00:00.000Z", "next Monday");

// ── Quests ──
const ev = (source: string, amount = 10) => ({ source, amount });
for (let i = 0; i < 60; i++) {
  const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  const qs = questsFor(day);
  assert.equal(qs.length, 3, `three quests on ${day}`);
  assert.equal(new Set(qs.map((q) => q.id)).size, 3, `distinct on ${day}`);
  assert.ok(qs.filter((q) => q.id.startsWith("solve")).length <= 1, `one solve-N quest on ${day}`);
  assert.deepEqual(questsFor(day).map((q) => q.id), qs.map((q) => q.id), "same every call");
}
const Q = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
const evs = [ev("problem:a", 30), ev("problem:b", 40), ev("lesson:lab:blinky", 50), ev("lesson:challenge:mux", 20), ev("daily:2026-03-01", 50), ev("quest:2026-03-01:solve1", 20)];
assert.equal(Q.solve2.count(evs, "2026-03-01"), 2);
assert.equal(Q.lesson.count(evs, "2026-03-01"), 1, "challenges don't count as lessons");
assert.equal(Q.challenge.count(evs, "2026-03-01"), 1);
assert.equal(Q.daily.count(evs, "2026-03-01"), 1);
assert.equal(Q.daily.count(evs, "2026-03-02"), 0, "yesterday's daily doesn't count");
assert.equal(Q.earn100.count(evs, "2026-03-01"), 190, "quest XP doesn't count toward Earn 100 XP");

console.log("engagement: all checks passed");
