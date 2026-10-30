import { cells, draw, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const clockIn = (x: number, expect: Record<string, number>): { set: Record<string, number>; expect: Record<string, number> }[] => [{ set: { x }, expect: {} }, { set: { clk: 1 }, expect }, { set: { clk: 0 }, expect: {} }];

const chapter: AcademyTopic = {
  slug: "fsms",
  title: "Finite State Machines",
  summary: "Moore and Mealy machines, the design recipe from words to gates, sequence detectors and state reduction.",
  icon: "◎",
  difficulty: "advanced",
  order: 16,
  estimatedMinutes: 45,
  prerequisites: ["sequential", "counters"],
  interactive: "fsm-explorer",
  sections: [
    {
      id: "what",
      heading: "What a state machine is",
      blocks: [
        p("A counter steps through a fixed sequence. A **finite state machine** (FSM) chooses its next step based on inputs, which makes it the control logic of nearly every digital system: vending machines, traffic lights, communication protocols and the control unit of a processor."),
        p("Every FSM has three parts: **state registers** remembering where it is, **next-state logic** deciding where to go, and **output logic**. The state tells you what the machine needs to remember about the past, and nothing more."),
      ],
    },
    {
      id: "types",
      heading: "Moore and Mealy",
      blocks: [
        p("The two kinds of FSM differ only in where outputs come from."),
        { kind: "table", headers: ["", "Moore", "Mealy"], rows: [["Outputs depend on", "State only", "State and current inputs"], ["In the diagram", "Written in the circle", "Written on the arrow"], ["States needed", "Often more", "Often fewer"], ["Output timing", "Changes just after the clock edge", "Can change as soon as an input does"], ["Risk", "Output is a cycle later", "Input glitches reach the output"]] },
        { kind: "anim", id: "fsm-detector" },
        { kind: "callout", tone: "tip", text: "Overlap matters when detecting sequences. After 1 0 1, the last 1 can start the next match, so the machine returns to S1, not S0. Try feeding 1 0 1 0 1." },
        { kind: "practice", question: "How many states does a Moore machine need at minimum to detect a 4-bit pattern like 1011?", options: ["3", "4", "5", "16"], correctIndex: 2, explanation: "One for each number of bits matched so far, 0 to 4, gives **5**. A Mealy machine can do it in 4." },
      ],
    },
    {
      id: "design",
      heading: "From words to gates",
      blocks: [
        p("Every FSM design follows the same six steps. Here's a small one from start to finish: **output 1 once the input has been 1 for two clocks in a row, and stay 1 until it goes 0**."),
        { kind: "list", ordered: true, items: ["**Draw the state diagram.** S0: no 1s yet. S1: one 1. S2: two or more, where the output is 1.", "**Write the state table.** Any 0 goes back to S0. A 1 moves S0 to S1, S1 to S2, and S2 stays.", "**Reduce the states**, if any are equivalent. These aren't.", "**Encode them.** Using 2 flip-flops: S0 = 00, S1 = 01, S2 = 10. Pattern 11 is unused, so it's a don't-care.", "**Find the next-state equations** with K-maps.", "**Find the outputs and draw the circuit.**"] },
        { kind: "table", headers: ["Now", "q1 q0", "x = 0: next", "x = 1: next", "Output y"], rows: [["S0", "0 0", "0 0", "0 1", "0"], ["S1", "0 1", "0 0", "1 0", "0"], ["S2", "1 0", "0 0", "1 0", "1"]] },
        { kind: "kmap", names: ["q1", "q0", "x"], cells: cells(3, [3, 5], [6, 7]), output: "D1", caption: "D1 is 1 when going to S2. Don't-cares for the unused 11 make it short.", expect: "q0·x + q1·x" },
        { kind: "kmap", names: ["q1", "q0", "x"], cells: cells(3, [1], [6, 7]), output: "D0", caption: "D0 is 1 only when going from S0 to S1.", expect: "q1'·q0'·x" },
        { kind: "formula", text: "D1 = x(q1 + q0)     D0 = x q1' q0'     y = q1" },
        { kind: "circuit", slow: true, circuit: draw("two_in_a_row", (d) => {
            const x = d.sw("x", 20, 50), clk = d.clock("clk", 20, 340);
            d.part("dff", "f1", 450, 30); d.part("dff", "f0", 450, 210);
            const q1 = d.pin("f1", "q"), q0 = d.pin("f0", "q");
            const any = d.gate("or", "any", 170, 10, q1, q0);
            d.wire(d.gate("and", "d1", 320, 30, x, any), "f1", "d"); d.wire(clk, "f1", "clk");
            const none = d.gate("nor", "none", 170, 170, q1, q0);
            d.wire(d.gate("and", "d0", 320, 210, x, none), "f0", "d"); d.wire(clk, "f0", "clk");
            d.led("y", 630, 40, q1);
          }), caption: "The finished machine: exactly those equations, in slow motion. Set **x**, then press **Clock edge**.", tryThis: ["Set x = 1 and clock twice. y comes on at the second edge and stays on.", "Set x = 0 and clock once. y goes off.", "Set x = 1, clock once, set x = 0, clock again. y never came on, because the 1s weren't in a row."],
          checks: [...clockIn(1, { y: 0 }), ...clockIn(1, { y: 1 }), ...clockIn(1, { y: 1 }), ...clockIn(0, { y: 0 }), ...clockIn(1, { y: 0 }), ...clockIn(0, { y: 0 }), ...clockIn(1, { y: 0 }), ...clockIn(1, { y: 1 })] },
        { kind: "link", href: "/studio/fsm", label: "Open the FSM designer", text: "Draw a state diagram, run it on an input sequence, minimise it, and generate Verilog." },
        { kind: "link", href: "/studio/challenges/detect-101", label: "Challenge: 101 sequence detector", text: "Follow the six steps for the machine in the animation above, in the circuit editor." },
      ],
    },
    {
      id: "encoding",
      heading: "Encoding the states",
      blocks: [
        p("Which pattern each state gets doesn't change what the machine does, but it does change how big and fast the logic is."),
        { kind: "table", headers: ["Encoding", "Flip-flops for N states", "Good for"], rows: [["Binary", "⌈log₂ N⌉", "Fewest flip-flops, typical in ASICs"], ["One-hot", "N", "Simple, fast logic, typical in FPGAs"], ["Gray", "⌈log₂ N⌉", "Sequences where only one bit should change per step"]] },
        { kind: "practice", question: "A machine has 9 states. How many flip-flops does it need in binary encoding, and in one-hot?", options: ["3 and 8", "4 and 9", "4 and 4", "9 and 9"], correctIndex: 1, explanation: "2³ = 8 is too few, so 4 in binary, and one per state means **9** in one-hot." },
      ],
    },
    {
      id: "reduce",
      heading: "Removing redundant states",
      blocks: [
        p("Two states are **equivalent** if they give the same outputs for every possible input sequence, so one can replace the other. You don't have to try every sequence. Use **partition refinement**: start by grouping by output, and split groups until they stop splitting."),
        { kind: "anim", id: "state-minimize" },
        { kind: "callout", tone: "note", text: "Reducing states doesn't always cut flip-flops. Going from 7 states to 4 here does (3 to 2), but going from 8 to 5 wouldn't (both need 3). It may still simplify the logic." },
      ],
    },
    {
      id: "verilog",
      heading: "FSMs in Verilog",
      blocks: [
        p("The standard style splits an FSM into three parts: the state register, the next-state logic and the output logic. It reads directly from a state table, and the synthesis tool chooses the encoding if you let it."),
        { kind: "code", text: "localparam S0 = 2'd0, S1 = 2'd1, S2 = 2'd2;\nreg [1:0] state, next;\n\nalways @(posedge clk or posedge rst)      // state register\n  if (rst) state <= S0;\n  else     state <= next;\n\nalways @(*) begin                         // next-state logic\n  next = S0;                              // default: no latches\n  case (state)\n    S0: if (x) next = S1;\n    S1: if (x) next = S2;\n    S2: if (x) next = S2;\n  endcase\nend\n\nassign y = (state == S2);                 // Moore output", caption: "The chapter's machine in Verilog. The default assignment matters: leaving `next` unset on any path would create an unwanted latch." },
        { kind: "link", href: "/studio/challenges/traffic-light", label: "Challenge: traffic light", text: "A classic FSM that also has timing. Build it in the circuit editor, and earn XP." },
      ],
    },
    {
      id: "gate-fsm",
      heading: "Exam points",
      level: "gate",
      blocks: [
        p("Converting between the two kinds is routine. To go from Moore to Mealy, move each state's output onto the arrows that enter it. To go from Mealy to Moore, split any state that's entered with different outputs. So the Moore form has at most (states × outputs) states."),
        { kind: "practice", gate: true, question: "How many flip-flops does a machine with 17 states need in binary encoding?", options: ["4", "5", "16", "17"], correctIndex: 1, explanation: "2⁴ = 16 is too few, and 2⁵ = 32 is enough: **5**." },
        { kind: "practice", gate: true, question: "A Mealy detector for a pattern of length n, with overlaps, needs how many states?", options: ["n − 1", "n", "n + 1", "2ⁿ"], correctIndex: 1, explanation: "One per number of bits matched, from 0 to n − 1, gives **n**. The match itself shows on the arrow, so it needs no state." },
        { kind: "practice", gate: true, question: "How many states does the machine in the animation reduce to?", options: ["3", "4", "5", "7"], correctIndex: 1, explanation: "A stays alone, B and C merge, D and E merge, and F and G merge: **4**." },
        { kind: "practice", gate: true, question: "Which is true of a Moore machine?", options: ["Its outputs can change between clock edges with no state change", "Its outputs change only when the state changes", "It needs no flip-flops", "It has no next-state logic"], correctIndex: 1, explanation: "Its outputs depend only on the state, so they **change only when the state changes**." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What do a Moore machine's outputs depend on?", options: ["Inputs only", "State only", "State and inputs", "The clock only"], correctIndex: 1, explanation: "That's the definition of Moore." },
    { id: "q2", question: "What do a Mealy machine's outputs depend on?", options: ["Inputs only", "State only", "State and inputs", "The clock only"], correctIndex: 2, explanation: "Outputs can change as soon as an input does." },
    { id: "q3", question: "Where is the output written in a Mealy state diagram?", options: ["In the circle", "On the arrow", "Beside the clock", "It isn't written"], correctIndex: 1, explanation: "Because it depends on the transition taken." },
    { id: "q4", question: "Which usually needs fewer states for the same job?", options: ["Moore", "Mealy", "They're always equal", "Neither"], correctIndex: 1, explanation: "Mealy can put outputs on arrows and so needn't dedicate a state to them." },
    { id: "q5", question: "How many flip-flops does a 5-state machine need in binary?", options: ["2", "3", "4", "5"], correctIndex: 1, explanation: "2² = 4 is too few, and 2³ = 8 is enough." },
    { id: "q6", question: "How many flip-flops does a 5-state machine need in one-hot?", options: ["2", "3", "4", "5"], correctIndex: 3, explanation: "One per state." },
    { id: "q7", question: "When are two states equivalent?", options: ["When they have the same name", "When they produce the same outputs for every input sequence", "When they have the same next state on 0", "When they're next to each other"], correctIndex: 1, explanation: "Then one can replace the other without any visible difference." },
    { id: "q8", question: "In partition refinement, what's the first grouping based on?", options: ["State names", "Outputs", "Next states", "Encoding"], correctIndex: 1, explanation: "States with different outputs can't be equivalent." },
    { id: "q9", question: "Why give `next` a default value in a Verilog FSM?", options: ["To reset the machine", "To avoid creating a latch", "To speed up simulation", "To choose an encoding"], correctIndex: 1, explanation: "Otherwise, a path that doesn't assign `next` implies memory." },
    { id: "q10", question: "After detecting 101 with overlaps allowed, where does a detector go next on input 0?", options: ["Back to the start", "To the state meaning it has seen 10", "To the state meaning it has seen 1", "It stops"], correctIndex: 1, explanation: "The last 1 of 101 followed by 0 is already 10 of a new match." },
  ],
  flashcards: [
    { id: "f1", front: "FSM parts", back: "State registers, next-state logic, output logic." },
    { id: "f2", front: "Moore", back: "Output depends on state only." },
    { id: "f3", front: "Mealy", back: "Output depends on state and inputs." },
    { id: "f4", front: "Six design steps", back: "Diagram, state table, reduce, encode, next-state logic, output logic." },
    { id: "f5", front: "Binary flip-flops for N states", back: "⌈log₂ N⌉" },
    { id: "f6", front: "One-hot flip-flops for N states", back: "N" },
    { id: "f7", front: "Equivalent states", back: "Same outputs for every input sequence." },
    { id: "f8", front: "Partition refinement", back: "Group by output, then split by where states go, until stable." },
    { id: "f9", front: "Sequence detector states, n-bit pattern", back: "Moore n + 1, Mealy n." },
    { id: "f10", front: "Moore to Mealy", back: "Move each state's output onto the arrows entering it." },
  ],
  videos: [
    { id: "v1", title: "Digital Electronics playlist", url: "https://youtube.com/playlist?list=PLBlnK6fEyqRjMH3mWf6kwqiTbT798eAOm&si=S4pKpxd5N_FIwpUy", channel: "Neso Academy" },
  ],
};

export default chapter;
