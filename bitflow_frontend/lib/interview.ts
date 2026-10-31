/**
 * lib/interview.ts — interview prep: topic lists over existing problems, and the rules of a mock
 * interview (one easy, one medium and one hard problem in 45 minutes).
 *
 * No "asked at company X" tags: we have no evidence for such claims.
 * A mock's results come from the learner's SUBMIT rows inside its window, as contests do
 * (lib/contests.ts), so a Submit after time simply doesn't count. Self-check: scripts/interview.check.ts.
 */

export const MOCK_MINUTES = 45;

export interface InterviewProblem {
  slug: string; title: string; difficulty: string; category: string; tags: string[];
  learningLevel: string; problemType: string; unlockAfter: string | null;
}

export type Tier = "Easy" | "Medium" | "Hard";
const TIERS: Record<string, Tier> = {
  easy: "Easy", beginner: "Easy", medium: "Medium", intermediate: "Medium", hard: "Hard", advanced: "Hard",
};
/** Learning Path problems use beginner/intermediate/advanced, Arena Easy/Medium/Hard/Expert. */
export const tierOf = (difficulty: string): Tier | null => TIERS[difficulty.toLowerCase()] ?? null;

const hasTag = (p: InterviewProblem, re: RegExp) => p.tags.some((t) => re.test(t));

/** Tagged for interviews, or anywhere in the Arena. Find-the-bug problems stay locked behind their original. */
export const isInterviewProblem = (p: InterviewProblem) =>
  !p.unlockAfter && (p.learningLevel === "Arena" || p.tags.includes("interview"));

/** Fits a timed mock: a design to write, not a capstone, and no Fmax target (those need many place-and-route runs). */
export const fitsMock = (p: InterviewProblem) =>
  isInterviewProblem(p) && p.problemType === "design" && !p.tags.includes("capstone")
  && !(p.learningLevel === "Arena" && p.category === "Pipeline") && tierOf(p.difficulty) !== null;

export const TOPICS: { id: string; title: string; blurb: string; match: (p: InterviewProblem) => boolean }[] = [
  { id: "fsm", title: "State machines", blurb: "Sequence detectors, Moore and Mealy, encoding, control logic.",
    match: (p) => p.category === "FSM" || hasTag(p, /^(fsm|moore|mealy|one-hot)$/i) },
  { id: "arithmetic", title: "Arithmetic", blurb: "Adders, comparators, shifters, counting bits, multipliers.",
    match: (p) => p.category === "Arithmetic" || hasTag(p, /adder|arithmetic|multiplier|comparator|shifter|population|clz|double-dabble|majority/i) },
  { id: "timing", title: "Timing and CDC", blurb: "Clock crossings, metastability, dividers, pipelining and Fmax.",
    match: (p) => p.category === "Pipeline" || p.category === "pipeline" || hasTag(p, /^(cdc|metastability|synchronizer|clock-divider)$/i) },
  { id: "memory", title: "Memories", blurb: "FIFOs, SRAM behaviour, register files, cache replacement.",
    match: (p) => /^memory$/i.test(p.category) || hasTag(p, /^(fifo|sram|register-file)$/i) },
  { id: "protocols", title: "Protocols", blurb: "Valid/ready, UART, SPI, I2C, APB.",
    match: (p) => p.category === "Protocol" || p.category === "interface" || hasTag(p, /^(uart|spi|i2c|apb|protocol|valid-ready)$/i) },
  { id: "verification", title: "Verification", blurb: "Write the testbench or the proof that catches the bugs.",
    match: (p) => p.category === "Verification" || p.category === "Formal" },
];

/** A starting set across the topics, chosen by BitFlow. Not a claim about what any employer asks. */
export const TOP_25 = [
  "gray-code-converter", "priority-encoder", "barrel-shifter-4bit", "population-count", "magnitude-comparator",
  "spot-the-latch", "dff-sync-reset", "blocking-vs-nonblocking", "edge-detector", "mod-n-counter",
  "universal-shift-register", "divide-by-3-50-duty", "serial-adder", "register-file-8x8", "fifo-sync",
  "async-fifo-cdc", "seq-detect-1011-moore", "seq-detect-1011-mealy", "one-hot-fsm-1011", "traffic-light-controller",
  "binary-divisibility-by-3", "uart-receiver-8n1", "spi-master-controller", "round-robin-arbiter", "valid-ready-skid-buffer",
];

/** One problem per tier, preferring ones this learner hasn't solved. */
export function pickMockProblems(pool: InterviewProblem[], solved: Set<string>, random: () => number = Math.random): string[] {
  const fit = pool.filter(fitsMock);
  return (["Easy", "Medium", "Hard"] as Tier[]).flatMap((tier) => {
    const all = fit.filter((p) => tierOf(p.difficulty) === tier);
    const fresh = all.filter((p) => !solved.has(p.slug));
    const from = fresh.length ? fresh : all;
    return from.length ? [from[Math.floor(random() * from.length)].slug] : [];
  });
}

/** When a mock stops counting: its time limit, or earlier if the learner ended it. */
export const mockClosesAt = (m: { endsAt: Date; finishedAt: Date | null }) =>
  m.finishedAt && m.finishedAt < m.endsAt ? m.finishedAt : m.endsAt;

export interface MockSubmission { slug: string; accepted: boolean; createdAt: Date; gateCount: number | null }
export interface MockResult { slug: string; solved: boolean; attempts: number; minutes: number | null; gateCount: number | null }

/** Per problem: Submits up to the first accepted one, when it came, and its gate count. */
export function mockResults(slugs: string[], startedAt: Date, closesAt: Date, subs: MockSubmission[]): MockResult[] {
  const inWindow = subs.filter((s) => s.createdAt >= startedAt && s.createdAt < closesAt)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return slugs.map((slug) => {
    const r: MockResult = { slug, solved: false, attempts: 0, minutes: null, gateCount: null };
    for (const s of inWindow) {
      if (s.slug !== slug || r.solved) continue;
      r.attempts++;
      if (s.accepted) {
        r.solved = true;
        r.minutes = Math.ceil((s.createdAt.getTime() - startedAt.getTime()) / 60_000);
        r.gateCount = s.gateCount;
      }
    }
    return r;
  });
}
