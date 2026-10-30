import { draw, p, ul } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "sequential",
  title: "Latches and Flip-Flops",
  summary: "How a circuit remembers: a bit stored in a loop, the difference between level and edge, and the four flip-flop types.",
  icon: "↻",
  difficulty: "core",
  order: 13,
  estimatedMinutes: 40,
  prerequisites: ["gates", "boolean-algebra"],
  interactive: "flip-flop-toggle",
  sections: [
    {
      id: "memory",
      heading: "Memory from feedback",
      blocks: [
        p("Every circuit so far forgets instantly: change the inputs and the old output is gone. To remember, a circuit needs an output that feeds back into its own input. Two NOT gates in a loop can hold a bit forever, as long as there's power. The only trouble is that you can't change it. Replace the NOTs with NORs, and you get a way in."),
      ],
    },
    {
      id: "sr",
      heading: "The SR latch",
      blocks: [
        p("The **SR latch** has two inputs: S (set) makes the stored bit 1, and R (reset) makes it 0. With both at 0, the loop holds whatever it had."),
        { kind: "anim", id: "sr-latch" },
        { kind: "table", headers: ["S", "R", "Next Q", "What happens"], rows: [["0", "0", "Q", "Hold"], ["1", "0", "1", "Set"], ["0", "1", "0", "Reset"], ["1", "1", "—", "Forbidden: Q and Q' stop being opposites"]] },
        { kind: "callout", tone: "warning", text: "Try S = R = 1, then press **Release both**. Both gates change together, and the result depends on which gate is faster, so the outcome is unpredictable. Designs must never do this." },
        p("A NAND version works the same way with active-low inputs, so its forbidden input is S' = R' = 0."),
      ],
    },
    {
      id: "edge",
      heading: "Level and edge",
      blocks: [
        p("A **D latch** removes the forbidden input by adding a data line D and an enable. While the enable is high, Q copies D. When it goes low, Q holds its last value. It's called **transparent**, because the input passes straight through while enabled."),
        p("That transparency is a problem. If a latch's output feeds back through logic to its own input, the signal can run round the loop many times while the clock is high. What we want is a device that changes only at one instant: a **flip-flop**, which responds to a clock **edge**."),
        { kind: "anim", id: "latch-vs-ff" },
        p("A flip-flop can be built from two latches back to back, called **master and slave**. While the clock is low, the master follows D and the slave holds. When the clock rises, the master freezes and the slave copies it. So the output only changes at the rising edge, and there's never a straight path from input to output."),
        { kind: "timing", caption: "A rising-edge D flip-flop. Q takes the value D had just before each rising edge. Glitches on D between edges don't matter.", diagram: { title: "D flip-flop", cycles: 8, period: 10, signals: [
          { name: "clk", dir: "clock", width: 1, values: [] },
          { name: "d", dir: "in", width: 1, values: ["1", "0", "0", "1", "1", "0", "1", "0"] },
          { name: "q", dir: "out", width: 1, values: ["0", "1", "0", "0", "1", "1", "0", "1"] },
        ] } },
      ],
    },
    {
      id: "types",
      heading: "The four flip-flop types",
      blocks: [
        p("Each type differs only in how its inputs decide the next state. Q⁺ means the value of Q after the next clock edge."),
        { kind: "table", headers: ["Type", "Next state", "Used for"], rows: [["D", "Q⁺ = D", "Storing data. Nearly everything in modern design"], ["T", "Q⁺ = T ⊕ Q", "Toggling, so counters"], ["JK", "Q⁺ = JQ' + K'Q", "General purpose; J = K = 1 toggles"], ["SR", "Q⁺ = S + R'Q, with SR = 0", "Mostly historic"]] },
        { kind: "circuit", circuit: draw("ff_types", (d) => {
            const clk = d.clock("clk", 30, 330), dd = d.sw("d", 30, 10), t = d.sw("t", 30, 110), j = d.sw("j", 30, 200), k = d.sw("k", 30, 270);
            d.part("dff", "ffd", 240, 10); d.part("tff", "fft", 240, 120); d.part("jkff", "ffjk", 240, 230);
            d.wire(dd, "ffd", "d"); d.wire(clk, "ffd", "clk");
            d.wire(t, "fft", "t"); d.wire(clk, "fft", "clk");
            d.wire(j, "ffjk", "j"); d.wire(k, "ffjk", "k"); d.wire(clk, "ffjk", "clk");
            d.led("q_d", 420, 20, d.pin("ffd", "q")); d.led("q_t", 420, 130, d.pin("fft", "q")); d.led("q_jk", 420, 250, d.pin("ffjk", "q"));
          }), caption: "Three flip-flops on one clock. Set the inputs, then press **Clock edge**.", tryThis: ["Turn on **t**, and press Clock edge a few times. q_t toggles each time.", "Set **j** and **k** both on: q_jk toggles too. Now try only j, then only k.", "Change **d** without clocking. q_d doesn't move until the edge."],
          checks: [
            { set: { d: 1, t: 1, j: 1, k: 0, clk: 1 }, expect: { q_d: 1, q_t: 1, q_jk: 1 } }, { set: { clk: 0 }, expect: { q_d: 1, q_t: 1, q_jk: 1 } },
            { set: { d: 0, j: 1, k: 1 }, expect: { q_d: 1, q_jk: 1 } }, { set: { clk: 1 }, expect: { q_d: 0, q_t: 0, q_jk: 0 } }, { set: { clk: 0 }, expect: { q_d: 0 } },
            { set: { j: 0, k: 1, t: 0, clk: 1 }, expect: { q_jk: 0, q_t: 0 } },
          ] },
        p("To design with flip-flops you need the reverse question: to go from this Q to that Q⁺, what must the inputs be? That's the **excitation table**, and an X means either value works."),
        { kind: "table", headers: ["Q", "Q⁺", "D", "T", "J", "K", "S", "R"], rows: [["0", "0", "0", "0", "0", "X", "0", "X"], ["0", "1", "1", "1", "1", "X", "1", "0"], ["1", "0", "0", "1", "X", "1", "0", "1"], ["1", "1", "1", "0", "X", "0", "X", "0"]] },
        { kind: "callout", tone: "tip", text: "All those X's are why JK flip-flops give small logic, and they feed K-maps as don't-cares. D is simplest to think about, since D is just the next state." },
        { kind: "practice", question: "A JK flip-flop has Q = 1, J = 1 and K = 1. What's Q after three clock edges?", options: ["0", "1", "It's undefined", "It depends on delay"], correctIndex: 0, explanation: "J = K = 1 toggles every edge: 1 → 0 → 1 → **0**." },
      ],
    },
    {
      id: "convert",
      heading: "Converting between types",
      blocks: [
        p("To turn a flip-flop of type X into type Y, work out what X's inputs must be, given what Y's inputs ask for. The method is the same each time."),
        { kind: "list", ordered: true, items: ["Write Y's characteristic table: Y's inputs and Q, giving Q⁺.", "Using X's excitation table, add the X input that produces each Q to Q⁺ change.", "Minimise X's input as a function of Y's inputs and Q."] },
        { kind: "table", headers: ["To make", "From", "Connect"], rows: [["D", "JK", "J = D, K = D'"], ["T", "JK", "J = T, K = T"], ["T", "D", "D = T ⊕ Q"], ["JK", "D", "D = JQ' + K'Q"], ["D", "T", "T = D ⊕ Q"]] },
        { kind: "circuit", circuit: draw("d_from_jk", (d) => {
            const dd = d.sw("d", 30, 40), clk = d.clock("clk", 30, 200);
            const nd = d.gate("not", "inv", 170, 120, dd);
            d.part("jkff", "ff", 330, 60);
            d.wire(dd, "ff", "j"); d.wire(nd, "ff", "k"); d.wire(clk, "ff", "clk");
            d.led("q", 500, 80, d.pin("ff", "q"));
          }), caption: "A D flip-flop made from a JK and an inverter: J and K can never be equal, so it always loads D.",
          checks: [{ set: { d: 1, clk: 1 }, expect: { q: 1 } }, { set: { clk: 0, d: 0 }, expect: { q: 1 } }, { set: { clk: 1 }, expect: { q: 0 } }] },
        { kind: "link", href: "/studio/challenges/jk-from-d", label: "Challenge: JK flip-flop from D", text: "Build the conversion in the table in the circuit editor, and earn XP." },
        { kind: "link", href: "/studio/challenges/t-from-d", label: "Challenge: T flip-flop from D", text: "A shorter one, and a good place to start." },
      ],
    },
    {
      id: "control",
      heading: "Reset, enable and Verilog",
      blocks: [
        ul("**Asynchronous reset** forces Q to 0 immediately, whatever the clock is doing.", "**Synchronous reset** does it at the next clock edge, so it's just more logic in front of D.", "**Clock enable** holds the value unless enabled, which is a MUX in front of D. The clock itself is left alone, because gating a clock with ordinary logic can create glitches that clock flip-flops by accident."),
        { kind: "code", text: "// A D flip-flop with asynchronous reset\nalways @(posedge clk or posedge rst)\n  if (rst) q <= 1'b0;\n  else     q <= d;", caption: "Use `<=` (nonblocking) for flip-flops, so that every flip-flop in the design sees the old values at the edge. Chapter 20 explains why." },
        p("Flip-flops have timing rules too. D must be stable for a short **setup time** before the edge and a **hold time** after it, and Q changes a little after the edge. Chapter 17 is about what happens when those rules are broken."),
      ],
    },
    {
      id: "gate-ff",
      heading: "Exam points",
      level: "gate",
      blocks: [
        p("**Race-around:** in a level-triggered JK latch with J = K = 1, the output toggles repeatedly for as long as the clock stays high. Master-slave and edge-triggered flip-flops solve this, because the output changes only once per cycle."),
        p("A T flip-flop with T = 1 divides its clock by 2. Chain n of them and you divide by 2ⁿ."),
        { kind: "practice", gate: true, question: "What's the next-state equation of a flip-flop made by connecting J = K = T?", options: ["Q⁺ = T", "Q⁺ = T ⊕ Q", "Q⁺ = TQ", "Q⁺ = T + Q"], correctIndex: 1, explanation: "Substitute into JQ' + K'Q: TQ' + T'Q = **T ⊕ Q**." },
        { kind: "practice", gate: true, question: "To change Q from 1 to 0 in a JK flip-flop, what must J and K be?", options: ["J = 0, K = 0", "J = 1, K = X", "J = X, K = 1", "J = 1, K = 1 only"], correctIndex: 2, explanation: "K = 1 clears or toggles a 1, and J doesn't matter: **J = X, K = 1**." },
        { kind: "practice", gate: true, question: "A 1 MHz clock drives a chain of 4 toggling flip-flops. What frequency comes out of the last?", options: ["250 kHz", "125 kHz", "62.5 kHz", "31.25 kHz"], correctIndex: 2, explanation: "Each stage divides by 2, so 1 MHz ÷ 2⁴ = **62.5 kHz**." },
        { kind: "practice", gate: true, question: "To make a T flip-flop from a D flip-flop, D should be…", options: ["T", "T'", "T ⊕ Q", "TQ"], correctIndex: 2, explanation: "Q⁺ = D must equal T ⊕ Q, so **D = T ⊕ Q**." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What gives a latch its memory?", options: ["A capacitor", "Feedback from output to input", "A clock", "Extra inputs"], correctIndex: 1, explanation: "Each gate's output holds the other gate's input in place." },
    { id: "q2", question: "In a NOR SR latch, what do S = 0 and R = 0 do?", options: ["Set", "Reset", "Hold", "Forbidden"], correctIndex: 2, explanation: "With both inputs low, the loop keeps its value." },
    { id: "q3", question: "Why is S = R = 1 forbidden?", options: ["It damages the chip", "Q and Q' stop being opposites, and releasing both is unpredictable", "It draws too much current", "It stops the clock"], correctIndex: 1, explanation: "Both outputs go to 0, and the release can go either way." },
    { id: "q4", question: "How does a D latch behave while its enable is high?", options: ["It holds", "Q copies D", "Q toggles", "Q is 0"], correctIndex: 1, explanation: "It's transparent while enabled." },
    { id: "q5", question: "When does a rising-edge flip-flop change its output?", options: ["While the clock is high", "While the clock is low", "Just after the clock rises", "Whenever D changes"], correctIndex: 2, explanation: "It samples D at the edge and updates just after." },
    { id: "q6", question: "A master-slave flip-flop is made of…", options: ["Two latches", "Two inverters", "A latch and a MUX", "Four NOT gates"], correctIndex: 0, explanation: "The master follows while the clock is low, and the slave copies when it rises." },
    { id: "q7", question: "What's the next state of a T flip-flop?", options: ["T", "Q", "T ⊕ Q", "T + Q"], correctIndex: 2, explanation: "It toggles if T = 1 and holds if T = 0." },
    { id: "q8", question: "What is the next state of a JK flip-flop with J = 1, K = 1?", options: ["0", "1", "Q", "Q'"], correctIndex: 3, explanation: "J = K = 1 toggles." },
    { id: "q9", question: "To go from Q = 0 to Q⁺ = 1, what must a JK flip-flop's inputs be?", options: ["J = 1, K = X", "J = X, K = 1", "J = 0, K = 0", "J = 0, K = 1"], correctIndex: 0, explanation: "J = 1 sets it, and K doesn't matter." },
    { id: "q10", question: "Why not gate a clock with an ordinary AND gate?", options: ["The clock would slow down", "Glitches could clock flip-flops by accident", "AND gates can't drive clocks", "It uses too much power"], correctIndex: 1, explanation: "Use a clock enable, or a proper clock-gating cell." },
  ],
  flashcards: [
    { id: "f1", front: "SR latch: S = R = 0", back: "Hold." },
    { id: "f2", front: "Latch or flip-flop", back: "A latch responds to a level, and a flip-flop to an edge." },
    { id: "f3", front: "D next state", back: "Q⁺ = D" },
    { id: "f4", front: "T next state", back: "Q⁺ = T ⊕ Q" },
    { id: "f5", front: "JK next state", back: "Q⁺ = JQ' + K'Q" },
    { id: "f6", front: "SR next state", back: "Q⁺ = S + R'Q, with SR = 0" },
    { id: "f7", front: "JK excitation", back: "0→0: 0X, 0→1: 1X, 1→0: X1, 1→1: X0" },
    { id: "f8", front: "Race-around", back: "A JK latch with J = K = 1 toggling repeatedly while the clock is high." },
    { id: "f9", front: "Asynchronous reset", back: "Acts immediately, ignoring the clock." },
    { id: "f10", front: "Setup and hold", back: "D must be stable just before and just after the edge." },
  ],
  videos: [
    { id: "v1", title: "Digital Electronics playlist", url: "https://youtube.com/playlist?list=PLBlnK6fEyqRjMH3mWf6kwqiTbT798eAOm&si=S4pKpxd5N_FIwpUy", channel: "Neso Academy" },
  ],
};

export default chapter;
