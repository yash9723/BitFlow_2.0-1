import { p } from "@/lib/academy/draw";
import type { Article } from "@/lib/article-types";

const article: Article = {
  slug: "fsm-in-verilog",
  title: "How to write a finite state machine (FSM) in Verilog",
  description: "Moore and Mealy state machines in Verilog: the three-block template, a complete 1011 sequence detector in both styles, state encoding, and the mistakes that create latches.",
  published: "2026-11-15",
  readMinutes: 9,
  sections: [
    {
      id: "short-answer",
      heading: "The short answer",
      blocks: [
        p("A finite state machine (FSM) in Verilog is a **state register** plus **next-state logic** plus **output logic**. Write the register in a clocked block with nonblocking assignments (`<=`), and the two pieces of logic in combinational blocks with blocking assignments (`=`). Give every signal a default at the top of each combinational block so no latch is inferred."),
        { kind: "list", items: [
          "**Moore** machine: outputs depend only on the current state. They change only at a clock edge.",
          "**Mealy** machine: outputs depend on the current state *and* the inputs. They can react in the same cycle, and usually need fewer states.",
        ] },
      ],
    },
    {
      id: "template",
      heading: "The three-block template",
      blocks: [
        p("Most teams write FSMs the same way, because it maps one-to-one onto the hardware and is easy to review:"),
        { kind: "code", text: "localparam [1:0] IDLE = 2'd0, RUN = 2'd1, DONE = 2'd2;\nreg [1:0] state, next;\n\n// 1. State register: the only clocked block\nalways @(posedge clk) begin\n  if (rst) state <= IDLE;\n  else     state <= next;\nend\n\n// 2. Next-state logic: combinational\nalways @(*) begin\n  next = state;               // default: stay put (prevents a latch)\n  case (state)\n    IDLE: if (start) next = RUN;\n    RUN:  if (finish) next = DONE;\n    DONE: next = IDLE;\n    default: next = IDLE;     // recover from unused encodings\n  endcase\nend\n\n// 3. Output logic: combinational (Moore: depends on state only)\nalways @(*) begin\n  busy = (state == RUN);\nend", caption: "A three-state Moore machine in the three-block style" },
        p("You can merge blocks 2 and 3, or put the outputs in `assign` statements. What matters is the split between the one clocked block and the combinational logic around it."),
      ],
    },
    {
      id: "moore-1011",
      heading: "Example: a 1011 sequence detector (Moore)",
      blocks: [
        p("The classic interview and lab exercise: a serial input `x` arrives one bit per clock, and the output `y` goes to 1 when the last four bits were 1, 0, 1, 1. Overlaps count, so in `1011011` the detector fires twice."),
        p("A Moore machine needs one state per prefix of the pattern it has matched so far, plus a state that means \"just matched\", where the output is 1:"),
        { kind: "table", headers: ["State", "Meaning", "x = 0 →", "x = 1 →", "y"], rows: [
          ["S0", "nothing matched", "S0", "S1", "0"],
          ["S1", "seen 1", "S10", "S1", "0"],
          ["S10", "seen 10", "S0", "S101", "0"],
          ["S101", "seen 101", "S10", "S1011", "0"],
          ["S1011", "seen 1011", "S10", "S1", "1"],
        ] },
        p("The transitions out of S1011 are where overlap lives: after `1011`, a 0 leaves `10` as a useful prefix, and a 1 leaves `1`."),
        { kind: "code", text: "module seq1011_moore (input clk, input rst, input x, output y);\n  localparam [2:0] S0 = 3'd0, S1 = 3'd1, S10 = 3'd2, S101 = 3'd3, S1011 = 3'd4;\n  reg [2:0] state, next;\n\n  always @(posedge clk)\n    if (rst) state <= S0;\n    else     state <= next;\n\n  always @(*) begin\n    next = S0;\n    case (state)\n      S0:    next = x ? S1    : S0;\n      S1:    next = x ? S1    : S10;\n      S10:   next = x ? S101  : S0;\n      S101:  next = x ? S1011 : S10;\n      S1011: next = x ? S1    : S10;\n      default: next = S0;\n    endcase\n  end\n\n  assign y = (state == S1011);\nendmodule" },
        { kind: "link", href: "/problems/seq-detect-1011-moore", label: "Try it: 1011 detector (Moore)", text: "Write this machine yourself and BitFlow grades it against hidden tests, including overlapping patterns." },
      ],
    },
    {
      id: "mealy-1011",
      heading: "The same detector as a Mealy machine",
      blocks: [
        p("A Mealy machine can raise `y` during the clock cycle in which the final 1 arrives, so it does not need the \"just matched\" state. Four states are enough:"),
        { kind: "code", text: "module seq1011_mealy (input clk, input rst, input x, output y);\n  localparam [1:0] S0 = 2'd0, S1 = 2'd1, S10 = 2'd2, S101 = 2'd3;\n  reg [1:0] state, next;\n\n  always @(posedge clk)\n    if (rst) state <= S0;\n    else     state <= next;\n\n  always @(*) begin\n    next = S0;\n    case (state)\n      S0:   next = x ? S1 : S0;\n      S1:   next = x ? S1 : S10;\n      S10:  next = x ? S101 : S0;\n      S101: next = x ? S1 : S10;   // on x = 1 we have just matched 1011\n    endcase\n  end\n\n  assign y = (state == S101) && x;   // output depends on the input too\nendmodule" },
        { kind: "table", headers: ["", "Moore", "Mealy"], rows: [
          ["States for 1011", "5", "4"],
          ["Output reacts", "One clock after the last bit", "In the same cycle as the last bit"],
          ["Glitches on the output", "None from input changes", "Possible, since inputs feed the output directly"],
          ["Typical fix", "None needed", "Register the output if it leaves the block"],
        ] },
        { kind: "link", href: "/problems/seq-detect-1011-mealy", label: "Try it: 1011 detector (Mealy)", text: "The Mealy version of the same problem, graded on BitFlow." },
      ],
    },
    {
      id: "encoding",
      heading: "State encoding: binary, one-hot or Gray",
      blocks: [
        { kind: "table", headers: ["Encoding", "Flip-flops for N states", "Good for"], rows: [
          ["Binary", "⌈log₂ N⌉", "ASICs and small machines, where flip-flops are the cost"],
          ["One-hot", "N", "FPGAs, which have flip-flops to spare; next-state logic is simple and fast"],
          ["Gray", "⌈log₂ N⌉", "Machines that step through states in order; only one bit changes per step"],
        ] },
        p("Write the states as `localparam` names and let the synthesis tool re-encode them if it wants to; most FPGA tools pick one-hot automatically. If you choose one-hot by hand, check for exactly one bit set, and decide what happens if a glitch ever leaves the machine in an illegal state."),
        { kind: "link", href: "/problems/one-hot-fsm-1011", label: "Try it: one-hot 1011 detector", text: "Hand-code the detector with one flip-flop per state." },
      ],
    },
    {
      id: "mistakes",
      heading: "Mistakes that break FSMs",
      blocks: [
        { kind: "list", items: [
          "**No default in the combinational block.** If some path through the `case` does not assign `next` (or an output), synthesis infers a latch. Assign a default first, then override.",
          "**Blocking assignments in the state register.** Use `<=` in the clocked block, or simulation and hardware can disagree.",
          "**Missing `default:` in the case.** With a 3-bit register and 5 states, 3 encodings are unused. A `default` sends the machine somewhere safe if it ever lands there.",
          "**Incomplete sensitivity list.** Write `always @(*)`, not a hand-made list that forgets an input.",
          "**Asynchronous inputs straight into the next-state logic.** A button or a signal from another clock domain must go through a synchroniser first, or the machine can jump to a state no transition leads to.",
        ] },
        { kind: "callout", tone: "tip", text: "Draw the machine first. BitFlow's FSM designer lets you draw states and transitions, step the machine clock by clock, and export the Verilog with a self-checking testbench." },
      ],
    },
  ],
  faq: [
    { q: "What is the difference between a Moore and a Mealy machine?", a: "In a Moore machine the outputs depend only on the current state, so they change only at clock edges. In a Mealy machine the outputs depend on the current state and the current inputs, so they can respond in the same cycle and the machine usually needs fewer states." },
    { q: "How many always blocks should an FSM in Verilog have?", a: "One clocked block for the state register, plus combinational logic for the next state and the outputs. Two or three always blocks are both common; the essential rule is that only the state register is clocked." },
    { q: "Why does my Verilog FSM infer a latch?", a: "A combinational always block left a signal unassigned on some path, for example a case without a default or an if without an else. Assign every output and the next state a default value at the top of the block." },
    { q: "Should I use one-hot or binary state encoding?", a: "One-hot is usually faster and is the common choice on FPGAs, which have plenty of flip-flops. Binary uses the fewest flip-flops and suits ASICs and small machines. Most synthesis tools can re-encode the states for you." },
  ],
  related: [
    { href: "/studio/fsm", label: "FSM designer: draw a machine and get its Verilog" },
    { href: "/academy/fsms", label: "Academy: Finite State Machines" },
    { href: "/problems/vending-machine-fsm", label: "Problem: vending machine FSM" },
    { href: "/problems/traffic-light-controller", label: "Problem: traffic light controller" },
  ],
};
export default article;
