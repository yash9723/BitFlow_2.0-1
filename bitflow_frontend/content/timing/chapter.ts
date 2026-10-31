import { cells, draw, p, ul } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

/** The static hazard circuit, shared with scripts/academy.check.ts through the chapter itself. */
export const HAZARD = draw("static_hazard", (d) => {
  const a = d.sw("a", 20, 40), b = d.sw("b", 20, 170), c = d.sw("c", 20, 300);
  const na = d.gate("not", "na", 150, 270, a);
  const t1 = d.gate("and", "t1", 300, 20, a, b), t2 = d.gate("and", "t2", 300, 290, na, c), t3 = d.gate("and", "t3", 300, 160, b, c);
  d.led("y", 640, 150, d.gate("or", "plain", 480, 150, t1, t2));
  d.led("y_fixed", 640, 290, d.gate("or", "covered", 480, 280, t1, t2, t3));
});

const chapter: AcademyTopic = {
  slug: "timing",
  title: "Timing and Hazards",
  summary: "Setup and hold, how fast a circuit can run, glitches and how to remove them, and what happens when signals cross clock domains.",
  icon: "⏱",
  difficulty: "advanced",
  order: 17,
  estimatedMinutes: 45,
  prerequisites: ["sequential", "counters"],
  sections: [
    {
      id: "setup-hold",
      heading: "Setup and hold",
      blocks: [
        p("A flip-flop needs a moment to make its decision. **Setup time** is how long D must be stable before the clock edge. **Hold time** is how long it must stay stable after the edge. **Clock-to-Q** is how long Q takes to change after the edge. Break the window and the flip-flop can misbehave."),
        { kind: "anim", id: "setup-hold" },
      ],
    },
    {
      id: "budget",
      heading: "How fast can it run?",
      blocks: [
        p("Almost every timing question comes down to one path: from one flip-flop, through some logic, to the next flip-flop. The clock period has to cover all of it."),
        { kind: "formula", text: "T_clk ≥ t_clk-q + t_logic + t_setup", note: "The setup check uses the slowest path. f_max = 1 / T_clk(min)." },
        { kind: "formula", text: "t_clk-q + t_logic(min) ≥ t_hold", note: "The hold check uses the fastest path, and the clock period doesn't appear in it." },
        { kind: "anim", id: "timing-budget" },
        { kind: "example", title: "Maximum frequency", problem: "t_clk-q = 2 ns, the slowest logic path is 5 ns and t_setup = 1 ns. What's the fastest clock?", steps: ["Add them up: 2 + 5 + 1 = 8 ns.", "f_max = 1 / 8 ns."], answer: "**125 MHz**" },
        { kind: "callout", tone: "warning", text: "A setup violation can always be fixed by slowing the clock. A **hold violation can't**, because it doesn't depend on the clock period at all. The chip simply fails, at any speed, until you add delay to the short path." },
        p("**Clock skew** means the clock reaches two flip-flops at different times. If it reaches the capturing flip-flop later (positive skew), the setup check gets more time, and the hold check gets less. **Jitter** is variation from one clock edge to the next, and it only ever takes time away."),
        { kind: "formula", text: "T_clk + t_skew ≥ t_clk-q + t_logic + t_setup     t_clk-q + t_logic(min) ≥ t_hold + t_skew" },
        p("If a path is too slow, **pipelining** splits it with a register in the middle. Each half is shorter, so the clock can be faster. The result then takes an extra clock to come out, but a new input can go in every cycle."),
        { kind: "practice", question: "t_clk-q = 1 ns, t_logic = 7 ns, t_setup = 2 ns. Adding a pipeline register splits the logic evenly. What's the new f_max?", options: ["100 MHz", "154 MHz", "200 MHz", "250 MHz"], correctIndex: 1, explanation: "Each stage is 1 + 3.5 + 2 = 6.5 ns, and 1 / 6.5 ns ≈ **154 MHz**, up from 100 MHz." },
        { kind: "practice", question: "A path has t_clk-q = 1 ns and a fastest logic delay of 0.2 ns. If t_hold = 0.5 ns and there's 1 ns of positive skew, does hold pass?", options: ["Yes, with 0.7 ns to spare", "Yes, with 0.2 ns to spare", "No, it fails by 0.3 ns", "No, it fails by 1.3 ns"], correctIndex: 2, explanation: "1 + 0.2 = 1.2 ns is available, and 0.5 + 1 = 1.5 ns is required. It **fails by 0.3 ns**." },
      ],
    },
    {
      id: "hazards",
      heading: "Hazards",
      blocks: [
        p("A **hazard** is a moment when a combinational output glitches because signals reach a gate at different times. A **static-1 hazard** means an output that should stay 1 briefly dips to 0. A **static-0 hazard** is the opposite. A **dynamic hazard** means an output that should change once changes three or more times."),
        { kind: "circuit", slow: true, circuit: HAZARD, caption: "Both outputs compute ab + a'c. **y_fixed** also has the extra term bc. Slow motion is on.", tryThis: ["Turn on **b** and **c**, and then **a**. Both lights are on.", "Now turn **a** off and watch **y**: it flickers off and back on, because the term ab ends before a'c begins.", "**y_fixed** stays on, because bc holds the output up during the change."],
          checks: [{ set: { a: 0, b: 1, c: 1 }, expect: { y: 1, y_fixed: 1 } }, { set: { a: 1 }, expect: { y: 1, y_fixed: 1 } }, { set: { a: 0 }, expect: { y: 1, y_fixed: 1 } }, { set: { a: 1, b: 0, c: 1 }, expect: { y: 0, y_fixed: 0 } }, { set: { a: 0, b: 0, c: 0 }, expect: { y: 0, y_fixed: 0 } }] },
        p("A K-map shows why. A static-1 hazard happens wherever two neighbouring 1s aren't in the same group. Moving between them means leaving one term before the next has started."),
        { kind: "kmap", names: ["a", "b", "c"], cells: cells(3, [1, 3, 6, 7]), output: "y", caption: "Cells 3 and 7 touch, but they sit in different groups. The fix is to add the extra group bc, which covers both. It's redundant logically, and it's exactly the consensus term from Chapter 6.", expect: "a'c + ab" },
        ul("**To remove a static hazard**, add a group covering each pair of neighbouring 1s that aren't already grouped together.", "**To tolerate hazards**, sample only at clock edges. This is why synchronous design is so popular: glitches don't matter as long as everything has settled by the next edge.", "**Where glitches really matter:** anything that responds immediately, such as asynchronous resets, clock inputs and enable pins on latches."),
        { kind: "link", href: "/studio/circuit", label: "Open the circuit editor's Timing panel", text: "Load the Static hazard example, change the gate delays, and see the glitch drawn as a waveform." },
      ],
    },
    {
      id: "metastable",
      heading: "Metastability and clock domains",
      blocks: [
        p("A button press, a serial line, or a signal from a block on another clock can change at any moment, so sooner or later it'll change inside a flip-flop's setup and hold window. Then the flip-flop can hang between 0 and 1. It'll eventually fall one way or the other, but no one can say how long that takes."),
        { kind: "anim", id: "metastable" },
        p("You can't prevent metastability, only make failures very rare. The standard tool is a **two-flip-flop synchronizer**: the first may go metastable, but it has a whole clock period to settle before the second reads it."),
        { kind: "code", text: "reg sync1, sync2;\nalways @(posedge clk) begin\n  sync1 <= async_in;   // may go metastable\n  sync2 <= sync1;      // use this one\nend", caption: "Never use `sync1` in your logic. Each extra flip-flop adds one more clock period of settling time, at the cost of a clock of delay." },
        { kind: "table", headers: ["Crossing a clock domain", "Use"], rows: [["A single, slow control bit", "Two-flip-flop synchronizer"], ["A short pulse", "Stretch it, or use a toggle and synchronize that"], ["A counter or pointer", "Convert to Gray code first, so only one bit changes per step"], ["A data bus", "An asynchronous FIFO, or a handshake"]] },
        { kind: "callout", tone: "warning", text: "Never synchronize each bit of a bus separately. Bits arrive on different clocks, so you can read a value that was never sent. That's why FIFO pointers use the Gray code from Chapter 4." },
      ],
    },
    {
      id: "gate-timing",
      heading: "Exam problems",
      level: "gate",
      blocks: [
        p("Timing questions usually give a small circuit and ask for f_max. Find the longest path between flip-flops, add clock-to-Q and setup, and don't forget paths back into the same flip-flop."),
        { kind: "practice", gate: true, question: "t_clk-q = 3 ns, t_setup = 2 ns, the slowest path has three gates of 4 ns each. What's the highest clock frequency?", options: ["50 MHz", "58.8 MHz", "76.9 MHz", "100 MHz"], correctIndex: 1, explanation: "3 + 12 + 2 = 17 ns, and 1 / 17 ns ≈ **58.8 MHz**." },
        { kind: "practice", gate: true, question: "With 2 ns of positive skew on the path above, what's the new highest frequency?", options: ["58.8 MHz", "66.7 MHz", "76.9 MHz", "100 MHz"], correctIndex: 1, explanation: "17 − 2 = 15 ns, and 1 / 15 ns ≈ **66.7 MHz**, as long as hold still passes." },
        { kind: "practice", gate: true, question: "In F = ab + b'c, for which inputs can a static-1 hazard occur?", options: ["a = c = 1, as b changes", "b = c = 1, as a changes", "a = b = 0, as c changes", "None"], correctIndex: 0, explanation: "With a = c = 1, the output is 1 for both values of b, and moves between the two terms. Adding the consensus term ac removes it." },
        { kind: "practice", gate: true, question: "Which change helps a hold violation?", options: ["Slowing the clock", "Speeding up the clock", "Adding delay on the short path", "Removing a pipeline register"], correctIndex: 2, explanation: "Hold doesn't involve the period, so only **adding delay on the short path** helps." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What is setup time?", options: ["How long D must be stable before the edge", "How long D must be stable after the edge", "How long Q takes to change", "The clock period"], correctIndex: 0, explanation: "D has to be in place before the flip-flop decides." },
    { id: "q2", question: "What is hold time?", options: ["How long D must be stable before the edge", "How long D must be stable after the edge", "The gate delay", "How long a reset lasts"], correctIndex: 1, explanation: "D must stay put briefly after the edge." },
    { id: "q3", question: "The minimum clock period is…", options: ["t_clk-q + t_logic + t_setup", "t_hold + t_setup", "t_clk-q + t_hold", "t_logic only"], correctIndex: 0, explanation: "The signal must leave, cross the logic and arrive in time." },
    { id: "q4", question: "Which path decides setup, and which decides hold?", options: ["Slowest for setup, fastest for hold", "Fastest for setup, slowest for hold", "Slowest for both", "Fastest for both"], correctIndex: 0, explanation: "Setup worries about late data, and hold about data arriving too soon." },
    { id: "q5", question: "Slowing the clock fixes…", options: ["Setup violations only", "Hold violations only", "Both", "Neither"], correctIndex: 0, explanation: "The clock period doesn't appear in the hold check." },
    { id: "q6", question: "What does pipelining do?", options: ["Increases the clock speed and adds latency", "Removes hazards", "Saves flip-flops", "Reduces skew"], correctIndex: 0, explanation: "Shorter stages allow a faster clock, and results take more cycles to emerge." },
    { id: "q7", question: "What is a static-1 hazard?", options: ["An output that should stay 1 dips to 0", "An output stuck at 1", "A clock that's too fast", "A 1 on an unused input"], correctIndex: 0, explanation: "It's a short glitch while the input changes." },
    { id: "q8", question: "How do you remove a static hazard in SOP?", options: ["Add a consensus term", "Remove a gate", "Use a slower gate", "Add a flip-flop to the input"], correctIndex: 0, explanation: "The extra group covers the gap between two terms." },
    { id: "q9", question: "Why use two flip-flops to synchronize an asynchronous input?", options: ["The second gets a settled value almost always", "It removes all metastability", "It doubles the frequency", "It's required by Verilog"], correctIndex: 0, explanation: "The first gets a whole period to settle, which makes failures extremely rare." },
    { id: "q10", question: "Why are FIFO pointers sent in Gray code?", options: ["Only one bit changes per step, so a bad sample is at most one off", "It uses fewer wires", "It's faster to add", "It removes the clock"], correctIndex: 0, explanation: "A pointer read during a change is either the old value or the new one." },
  ],
  flashcards: [
    { id: "f1", front: "Setup check", back: "T_clk ≥ t_clk-q + t_logic(max) + t_setup" },
    { id: "f2", front: "Hold check", back: "t_clk-q + t_logic(min) ≥ t_hold" },
    { id: "f3", front: "f_max", back: "1 / (t_clk-q + t_logic(max) + t_setup)" },
    { id: "f4", front: "Positive skew", back: "Helps setup, hurts hold." },
    { id: "f5", front: "Pipelining", back: "A register mid-path: faster clock, more latency." },
    { id: "f6", front: "Static hazard", back: "An output that should hold steady glitches briefly." },
    { id: "f7", front: "Removing a static hazard", back: "Add a group covering neighbouring 1s in different groups." },
    { id: "f8", front: "Metastability", back: "A flip-flop hanging between 0 and 1 after a setup or hold violation." },
    { id: "f9", front: "Two-flip-flop synchronizer", back: "The first may go metastable. Use only the second." },
    { id: "f10", front: "Crossing with a data bus", back: "Asynchronous FIFO or handshake, never per-bit synchronizers." },
  ],
  videos: [
    { id: "v1", title: "Digital Electronics playlist", url: "https://youtube.com/playlist?list=PLBlnK6fEyqRjMH3mWf6kwqiTbT798eAOm&si=S4pKpxd5N_FIwpUy", channel: "Neso Academy" },
  ],
};

export default chapter;
