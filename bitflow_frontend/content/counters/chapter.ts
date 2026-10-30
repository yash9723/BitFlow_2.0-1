import { cells, draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const pulse = (expect: Record<string, number>) => [{ set: { clk: 1 }, expect }, { set: { clk: 0 }, expect: {} }];

const chapter: AcademyTopic = {
  slug: "counters",
  title: "Counters",
  summary: "Ripple and synchronous counters, designing any count sequence with K-maps, and ring and Johnson counters.",
  icon: "⏲",
  difficulty: "core",
  order: 15,
  estimatedMinutes: 40,
  prerequisites: ["sequential", "karnaugh-maps"],
  sections: [
    {
      id: "ripple",
      heading: "Ripple counters",
      blocks: [
        p("A toggling flip-flop divides its clock by 2. Chain them, with each one's output clocking the next, and the chain counts in binary. That's a **ripple counter**, or asynchronous counter, because only the first stage sees the real clock. It takes almost no logic, but it comes at a price."),
        { kind: "timing", caption: "Each output runs at half the speed of the one before, and read together they count: q2 q1 q0 = 000, 001, 010, 011 and so on.", diagram: { title: "Binary count", cycles: 8, period: 10, signals: [
          { name: "clk", dir: "clock", width: 1, values: [] },
          { name: "q0", dir: "out", width: 1, values: ["0", "1", "0", "1", "0", "1", "0", "1"] },
          { name: "q1", dir: "out", width: 1, values: ["0", "0", "1", "1", "0", "0", "1", "1"] },
          { name: "q2", dir: "out", width: 1, values: ["0", "0", "0", "0", "1", "1", "1", "1"] },
        ] } },
        p("The price is delay. Each stage waits for the one before, so going from 0111 to 1000 passes through wrong values on the way."),
        { kind: "anim", id: "ripple-vs-sync" },
        { kind: "formula", text: "f_max (ripple) = 1 / (n × t_pd)", note: "The whole chain must settle before the next clock edge, if you need to read a correct value." },
        { kind: "practice", question: "A 5-bit ripple counter uses flip-flops with a 10 ns delay. What's the highest clock frequency at which it can always be read correctly?", options: ["10 MHz", "20 MHz", "50 MHz", "100 MHz"], correctIndex: 1, explanation: "5 × 10 ns = 50 ns to settle, so 1 / 50 ns = **20 MHz**." },
      ],
    },
    {
      id: "sync",
      heading: "Synchronous counters",
      blocks: [
        p("In a **synchronous counter**, all flip-flops share one clock, and logic decides which should toggle. Look at counting in binary: a bit toggles exactly when all the bits below it are 1. So T₀ = 1, T₁ = q₀, and T₂ = q₁q₀."),
        { kind: "circuit", slow: true, circuit: draw("sync_counter", (d) => {
            const clk = d.clock("clk", 20, 360);
            d.part("const1", "one", 20, 30);
            d.part("tff", "f0", 170, 20); d.part("tff", "f1", 170, 150); d.part("tff", "f2", 390, 280);
            const q0 = d.pin("f0", "q"), q1 = d.pin("f1", "q");
            d.wire(d.pin("one", "out"), "f0", "t"); d.wire(clk, "f0", "clk");
            d.wire(q0, "f1", "t"); d.wire(clk, "f1", "clk");
            d.wire(d.gate("and", "both", 320, 150, q1, q0), "f2", "t"); d.wire(clk, "f2", "clk");
            d.part("merge", "out", 560, 150, { w: 3 });
            d.wire(q0, "out", "b0"); d.wire(q1, "out", "b1"); d.wire(d.pin("f2", "q"), "out", "b2");
            d.display("count", 3, 660, 160, d.pin("out", "out"));
          }), caption: "A 3-bit synchronous counter, in slow motion. Press **Clock edge**.", tryThis: ["Clock it up to 3, then once more, and watch all the outputs change together on the way to 4."],
          checks: [...pulse({ count: 1 }), ...pulse({ count: 2 }), ...pulse({ count: 3 }), ...pulse({ count: 4 }), ...pulse({ count: 5 }), ...pulse({ count: 6 }), ...pulse({ count: 7 }), ...pulse({ count: 0 })] },
        p("Now every flip-flop changes at the same time, so there are no wrong values, and the limit is one flip-flop delay plus the logic in front of it."),
        { kind: "formula", text: "f_max (synchronous) = 1 / (t_pd + t_logic + t_setup)" },
        { kind: "callout", tone: "tip", text: "Nearly all counters in chips are synchronous. Use a ripple counter only where nothing reads the middle bits, such as a simple clock divider." },
      ],
    },
    {
      id: "design",
      heading: "Designing any count sequence",
      blocks: [
        p("Binary isn't the only sequence. To design a counter for any sequence, follow one recipe. Here's a **mod-5** counter, counting 0, 1, 2, 3, 4 and back to 0, built from D flip-flops."),
        { kind: "table", headers: ["Now: q2 q1 q0", "Next: q2 q1 q0", "So D2 D1 D0 ="], rows: [["0 0 0", "0 0 1", "0 0 1"], ["0 0 1", "0 1 0", "0 1 0"], ["0 1 0", "0 1 1", "0 1 1"], ["0 1 1", "1 0 0", "1 0 0"], ["1 0 0", "0 0 0", "0 0 0"], ["1 0 1, 1 1 0, 1 1 1", "never used", "X X X"]], caption: "With D flip-flops, the input is simply the next state. States 5, 6 and 7 never occur, so they're don't-cares." },
        p("Each D input now gets its own K-map, with q2, q1 and q0 as variables."),
        { kind: "kmap", names: ["q2", "q1", "q0"], cells: cells(3, [0, 2], [5, 6, 7]), output: "D0", caption: "D0 is 1 in states 0 and 2.", expect: "q2'·q0'" },
        { kind: "kmap", names: ["q2", "q1", "q0"], cells: cells(3, [1, 2], [5, 6, 7]), output: "D1", caption: "D1 is 1 in states 1 and 2, which is an XOR of q1 and q0.", expect: "q1'·q0 + q1·q0'" },
        { kind: "kmap", names: ["q2", "q1", "q0"], cells: cells(3, [3], [5, 6, 7]), output: "D2", caption: "D2 is 1 only in state 3, and the don't-cares shrink it to two literals.", expect: "q1·q0" },
        { kind: "circuit", circuit: draw("mod5_counter", (d) => {
            const clk = d.clock("clk", 20, 400);
            d.part("dff", "f0", 340, 20); d.part("dff", "f1", 340, 170); d.part("dff", "f2", 340, 320);
            const q0 = d.pin("f0", "q"), q1 = d.pin("f1", "q"), q2 = d.pin("f2", "q");
            d.wire(d.gate("nor", "d0", 190, 20, q2, q0), "f0", "d"); d.wire(clk, "f0", "clk");
            d.wire(d.gate("xor", "d1", 190, 170, q1, q0), "f1", "d"); d.wire(clk, "f1", "clk");
            d.wire(d.gate("and", "d2", 190, 320, q1, q0), "f2", "d"); d.wire(clk, "f2", "clk");
            d.part("merge", "out", 520, 150, { w: 3 });
            d.wire(q0, "out", "b0"); d.wire(q1, "out", "b1"); d.wire(q2, "out", "b2");
            d.display("count", 3, 630, 170, d.pin("out", "out"));
          }), caption: "The finished mod-5 counter, exactly as those three equations say. D0 = q2'q0' is drawn as a NOR gate.", tryThis: ["Clock it and check that it goes 0, 1, 2, 3, 4, 0."],
          checks: [...pulse({ count: 1 }), ...pulse({ count: 2 }), ...pulse({ count: 3 }), ...pulse({ count: 4 }), ...pulse({ count: 0 }), ...pulse({ count: 1 })] },
        p("One more check: what if the counter powers up in an unused state? Follow the equations. State 5 goes to 2, state 6 goes to 2, and state 7 goes to 4. All return to the sequence, so this counter is **self-starting**. Using don't-cares can sometimes produce a design that gets stuck, so always check."),
        { kind: "link", href: "/studio/challenges/mod6-counter", label: "Challenge: Mod-6 counter", text: "Run the same recipe yourself in the circuit editor, and earn XP." },
      ],
    },
    {
      id: "mod-reset",
      heading: "Quick mod-N, and clock dividers",
      blocks: [
        p("Another way to get mod-N is to use a binary counter and reset it when it reaches N. A **synchronous** reset uses state N − 1 to load 0 at the next edge, which is clean. An **asynchronous** reset waits for state N to appear, and then clears at once, so state N exists for a brief moment. That short pulse is a glitch you must not use for anything."),
        { kind: "table", headers: ["Counter", "Flip-flops", "Output frequency"], rows: [["Mod-2", "1", "f / 2"], ["Mod-10 (decade)", "4", "f / 10"], ["Mod-16", "4", "f / 16"], ["Mod-1000", "10", "f / 1000"]], caption: "A mod-N counter divides its clock by N. The flip-flops needed are the smallest n with 2ⁿ ≥ N." },
        { kind: "practice", question: "How many flip-flops does a mod-60 counter need at least?", options: ["5", "6", "7", "60"], correctIndex: 1, explanation: "2⁵ = 32 is too few and 2⁶ = 64 is enough: **6**." },
        { kind: "practice", question: "A 1 MHz clock goes through a mod-10 counter and then a mod-5 counter. What's the output frequency?", options: ["200 kHz", "100 kHz", "20 kHz", "10 kHz"], correctIndex: 2, explanation: "1 MHz ÷ 10 ÷ 5 = **20 kHz**." },
      ],
    },
    {
      id: "ring",
      heading: "Ring and Johnson counters",
      blocks: [
        p("A shift register with its output fed back to its input is also a counter, and one that needs little or no decoding."),
        { kind: "anim", id: "ring-johnson" },
        { kind: "table", headers: ["Counter", "n flip-flops give", "Decoding"], rows: [["Binary", "2ⁿ states", "Needs an n-input decoder"], ["Ring", "n states", "None: each output is one state"], ["Johnson", "2n states", "One 2-input AND per state"]] },
        { kind: "callout", tone: "warning", text: "A ring or Johnson counter must start in a valid state. A 4-bit Johnson uses only 8 of the 16 patterns, and the other 8 form a separate loop of their own. Start in the wrong one and it stays wrong forever, so real designs add logic to steer back." },
      ],
    },
    {
      id: "gate-counters",
      heading: "Exam counting",
      level: "gate",
      blocks: [
        p("Exam questions often give a counter's circuit and ask for its sequence. Write the flip-flop inputs as equations, start from the reset state, and step: at each row use the current Q values to work out the next. Stop when a state repeats, and the number of states in the loop is its modulus."),
        { kind: "practice", gate: true, question: "How many states does a 5-bit Johnson counter cycle through?", options: ["5", "10", "25", "32"], correctIndex: 1, explanation: "2n = **10**." },
        { kind: "practice", gate: true, question: "How many unused states does a 4-bit ring counter have?", options: ["4", "8", "12", "16"], correctIndex: 2, explanation: "16 patterns, of which 4 are used, leaves **12**." },
        { kind: "practice", gate: true, question: "A synchronous counter has t_pd = 8 ns, logic of 6 ns and t_setup = 2 ns. What's its maximum clock frequency?", options: ["50 MHz", "62.5 MHz", "125 MHz", "500 MHz"], correctIndex: 1, explanation: "8 + 6 + 2 = 16 ns, and 1 / 16 ns = **62.5 MHz**." },
        { kind: "practice", gate: true, question: "A 3-bit counter uses D flip-flops with D2 = q1, D1 = q0, D0 = q2'. Starting from 000, how many states are in its cycle?", options: ["3", "5", "6", "8"], correctIndex: 2, explanation: "It's a 3-bit Johnson counter, with q2' fed back: 000, 001, 011, 111, 110, 100, and back to 000. That's **6**." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "In a ripple counter, what clocks each later stage?", options: ["The main clock", "The output of the stage before", "A separate oscillator", "The reset line"], correctIndex: 1, explanation: "Only the first stage sees the real clock." },
    { id: "q2", question: "Why can a ripple counter's output be wrong for a moment?", options: ["The stages change one after another", "It has no reset", "It uses too few flip-flops", "It uses T flip-flops"], correctIndex: 0, explanation: "A change walks along the chain, passing through wrong values." },
    { id: "q3", question: "In a synchronous binary counter, when does a bit toggle?", options: ["Every clock", "When all lower bits are 1", "When the upper bit is 1", "Only at reset"], correctIndex: 1, explanation: "That's when a carry reaches it." },
    { id: "q4", question: "A 4-bit binary counter has how many states?", options: ["4", "8", "15", "16"], correctIndex: 3, explanation: "2⁴ = 16." },
    { id: "q5", question: "What are the unused states in a counter's K-maps?", options: ["Zeros", "Ones", "Don't-cares", "Forbidden and left out"], correctIndex: 2, explanation: "They never occur, so they can simplify the logic." },
    { id: "q6", question: "What does self-starting mean?", options: ["It needs no clock", "It returns to the sequence from any state", "It resets itself each cycle", "It starts at power-up only"], correctIndex: 1, explanation: "Every unused state must lead back into the sequence." },
    { id: "q7", question: "How many states does a 4-bit ring counter have?", options: ["2", "4", "8", "16"], correctIndex: 1, explanation: "n flip-flops give n states." },
    { id: "q8", question: "How many states does a 4-bit Johnson counter have?", options: ["4", "8", "15", "16"], correctIndex: 1, explanation: "2n states." },
    { id: "q9", question: "With D flip-flops, what is the input for each flip-flop?", options: ["The current state", "The next state", "Always 1", "The clock"], correctIndex: 1, explanation: "Q⁺ = D, so D is simply the next state." },
    { id: "q10", question: "What's the problem with an asynchronous reset for mod-N?", options: ["State N appears briefly as a glitch", "It's too slow", "It can't reach 0", "It needs more flip-flops"], correctIndex: 0, explanation: "The counter has to reach state N for the reset to fire." },
  ],
  flashcards: [
    { id: "f1", front: "Ripple counter", back: "Each flip-flop clocks the next. Simple, but the outputs settle one after another." },
    { id: "f2", front: "Ripple f_max", back: "1 / (n × t_pd)" },
    { id: "f3", front: "Synchronous toggle rule", back: "A bit toggles when all lower bits are 1." },
    { id: "f4", front: "Synchronous f_max", back: "1 / (t_pd + t_logic + t_setup)" },
    { id: "f5", front: "Mod-N flip-flops", back: "The smallest n with 2ⁿ ≥ N." },
    { id: "f6", front: "Counter design recipe", back: "State table, then flip-flop inputs, then K-maps with don't-cares, then check self-starting." },
    { id: "f7", front: "Ring counter", back: "n flip-flops, n states, no decoding." },
    { id: "f8", front: "Johnson counter", back: "Inverted feedback: n flip-flops, 2n states." },
    { id: "f9", front: "Clock divider", back: "A mod-N counter divides its clock by N." },
    { id: "f10", front: "Self-starting", back: "Every unused state leads back into the sequence." },
  ],
  videos: [],
};

export default chapter;
