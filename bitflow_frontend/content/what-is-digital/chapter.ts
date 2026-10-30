import { draw, p, ul } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "what-is-digital",
  title: "What Is Digital?",
  summary: "Why computers use only two levels, what a bit is, and how switches turn into logic. Start here if this is all new.",
  icon: "01",
  difficulty: "foundations",
  order: 1,
  estimatedMinutes: 20,
  sections: [
    {
      id: "signals",
      heading: "Smooth signals and stepped signals",
      blocks: [
        p("A **signal** is a quantity that carries information, and in electronics it is usually a voltage on a wire. A microphone turns your voice into a voltage that rises and falls smoothly. Every tiny change in that voltage means something. This is an **analog** signal: it can take any value in a range."),
        p("A **digital** signal only cares which of two ranges the voltage is in. We call the ranges **low** and **high**, and write them as **0** and **1**. Whether the wire is at 3.1 V or 3.2 V makes no difference, because both are simply high."),
        p("Think of a dimmer knob against a light switch. The knob has endless positions, and it is hard to set it to exactly the same brightness twice. The switch is on or off, and anybody can read it correctly from across the room."),
        { kind: "callout", tone: "note", text: "The physical world is analog: sound, temperature, light. Digital systems measure it, turn it into numbers, work on the numbers, and turn the result back. Chapter 19 covers those conversions." },
      ],
    },
    {
      id: "two-levels",
      heading: "Why only two levels",
      blocks: [
        p("A real wire is noisy. Nearby wires, heat and the power supply all push its voltage around. If we stored meaning in the exact voltage, that noise would damage the information. With two widely separated ranges, a small push changes nothing."),
        p("Each logic family publishes what counts as low and high. These are the typical figures for classic 5 V TTL chips:"),
        { kind: "table", headers: ["", "Low (0)", "High (1)"], rows: [["A gate's **output** is guaranteed to be", "at most 0.4 V", "at least 2.4 V"], ["A gate's **input** will accept", "up to 0.8 V", "from 2.0 V"]], caption: "An input voltage between 0.8 V and 2.0 V has no defined meaning. Circuits are designed so that wires only pass through this range while switching." },
        p("Notice the outputs are stricter than the inputs. That gap is the **noise margin**: how much noise a signal can pick up on its way from one gate to the next and still be read correctly."),
        { kind: "formula", text: "high margin = 2.4 − 2.0 = 0.4 V     low margin = 0.8 − 0.4 = 0.4 V" },
        p("There is one more trick. Every gate drives its output to a clean level again, however messy its input was, as long as the input stayed in range. So noise doesn't build up along a chain of gates. In an analog chain each stage adds its noise to the signal for good, which is why a photocopy of a photocopy looks worse, while a copied file is identical to the original."),
        { kind: "anim", id: "noise-chain" },
        { kind: "practice", question: "A family guarantees outputs of at most 0.2 V for low and at least 3.0 V for high. Its inputs accept up to 0.7 V as low and from 2.2 V as high. What is its low noise margin?", options: ["0.2 V", "0.5 V", "0.7 V", "0.8 V"], correctIndex: 1, explanation: "Low margin = highest accepted low input − highest guaranteed low output = 0.7 − 0.2 = **0.5 V**. The high margin here is 3.0 − 2.2 = 0.8 V, and the two don't have to match." },
      ],
    },
    {
      id: "bits",
      heading: "Bits and how many you need",
      blocks: [
        p("One wire carrying a 0 or 1 holds one **bit** (binary digit). Group bits together and they can stand for more: 4 bits make a **nibble** and 8 bits make a **byte**."),
        p("Every extra bit doubles the number of different patterns, so **n bits give 2ⁿ patterns**."),
        { kind: "table", headers: ["Bits", "Patterns", "Enough for"], rows: [["1", "2", "yes or no"], ["3", "8", "the days of the week"], ["5", "32", "the 26 letters of the alphabet"], ["8", "256", "a byte: English text, one colour channel"], ["10", "1024", "0 to 999, with some patterns left over"], ["16", "65,536", "CD-quality audio samples"]] },
        { kind: "example", title: "How many bits for the alphabet?", problem: "You want a different pattern for each of the 26 capital letters. What is the smallest number of bits that works?", steps: ["4 bits give 2⁴ = 16 patterns, which is too few.", "5 bits give 2⁵ = 32 patterns, which is enough. Six patterns stay unused."], answer: "**5 bits.** In general, the bits needed for N different things is the smallest n with 2ⁿ ≥ N." },
        { kind: "practice", question: "A sensor reports one of 1000 different readings. How many bits does each reading need?", options: ["9", "10", "11", "1000"], correctIndex: 1, explanation: "2⁹ = 512 is too few and 2¹⁰ = 1024 is enough, so **10 bits**." },
      ],
    },
    {
      id: "switches",
      heading: "From switches to logic",
      blocks: [
        p("Here is the key idea of the whole subject: **a transistor is a switch controlled by a voltage**. A 1 on its control pin lets current through, or blocks it, depending on the type. That means the output of one switch can control another, so bits can make decisions about other bits."),
        p("Connect two switches **in series** and current flows only if the first **and** the second are closed. Connect them **in parallel** and current flows if either is closed. Those two wirings are the two most basic operations in logic, called **AND** and **OR**."),
        { kind: "circuit", circuit: draw("series_parallel", (d) => {
            const a = d.sw("a", 40, 70), b = d.sw("b", 40, 190);
            d.led("both", 420, 70, d.gate("and", "series", 220, 60, a, b));
            d.led("either", 420, 190, d.gate("or", "parallel", 220, 180, a, b));
          }), caption: "This circuit is live. Click the switches a and b, and watch the wires and lights.", tryThis: ["Turn on only **a**. Which light comes on, and why not the other?", "Press **Slow motion**, then flip a switch and watch the change travel through the gate.", "Turn on both. Now every wire is green.", "Can you make **both** light up without **either**? Try it, then think about why not."],
          checks: [{ set: { a: 0, b: 0 }, expect: { both: 0, either: 0 } }, { set: { a: 1, b: 0 }, expect: { both: 0, either: 1 } }, { set: { a: 0, b: 1 }, expect: { both: 0, either: 1 } }, { set: { a: 1, b: 1 }, expect: { both: 1, either: 1 } }] },
        p("You can list everything a circuit does in a **truth table**: one row for every combination of inputs. Two inputs make 2² = 4 rows."),
        { kind: "table", headers: ["a", "b", "both (AND)", "either (OR)"], rows: [["0", "0", "0", "0"], ["0", "1", "0", "1"], ["1", "0", "0", "1"], ["1", "1", "1", "1"]] },
        { kind: "callout", tone: "tip", text: "Real chips build these gates from a few transistors each, and Chapter 9 shows how. You don't need that yet. For now a gate is a small box with a truth table." },
      ],
    },
    {
      id: "two-kinds",
      heading: "Circuits that decide and circuits that remember",
      blocks: [
        p("Every digital circuit falls into one of two families."),
        ul("**Combinational** circuits decide. The output depends only on the inputs right now, as in the circuit above. An adder is combinational.", "**Sequential** circuits remember. The output also depends on what happened earlier, because the circuit stores some bits. A counter must remember the last count to know the next one."),
        p("Memory brings up the question of when to store. Most sequential circuits follow a **clock**, a signal that ticks between 0 and 1 forever. The storage parts, called **flip-flops**, take in a new value only at the instant the clock rises, and hold it until the next rise."),
        { kind: "timing", caption: "A flip-flop in action. At each rising edge of **clk**, **q** takes the value **d** had just before the edge, so q follows d one cycle later. Between edges, q doesn't move.", diagram: { title: "A flip-flop following a clock", cycles: 8, period: 10, signals: [
          { name: "clk", dir: "clock", width: 1, values: [] },
          { name: "d", dir: "in", width: 1, values: ["0", "1", "1", "0", "0", "1", "0", "0"] },
          { name: "q", dir: "out", width: 1, values: ["0", "0", "1", "1", "0", "0", "1", "0"] },
        ] } },
        p("The clock's speed is measured in hertz: a 1 GHz clock ticks a billion times a second. Each tick, all the flip-flops in a chip update together, which keeps billions of transistors in step."),
      ],
    },
    {
      id: "layers",
      heading: "How it all stacks up",
      blocks: [
        p("A processor is too big to understand all at once, so engineers build in layers. Each layer uses the one below it and hides the details."),
        { kind: "list", ordered: true, items: ["**Transistors** act as switches.", "**Gates** (AND, OR, NOT) are built from a few transistors.", "**Building blocks** such as adders, multiplexers and flip-flops are built from gates.", "**Units** such as registers, counters, memories and an ALU are built from blocks.", "**A processor** connects those units and follows a list of instructions."] },
        p("This course climbs that stack. Chapters 2 to 4 cover how bits represent numbers and text. Chapters 5 to 8 cover gates and the algebra for simplifying them. Chapters 9 to 12 build combinational blocks. Chapters 13 to 17 add memory and timing, Chapters 18 and 19 cover large memories and the link to the analog world, and Chapter 20 moves from drawing circuits to describing them in Verilog."),
        { kind: "callout", tone: "tip", text: "Each chapter is tagged **Beginner**, **Core** or **GATE**. Sections marked GATE go beyond a first course, so skip them on your first pass and come back when you're preparing for university exams or the GATE paper." },
        { kind: "link", href: "/studio/circuit", label: "Open the circuit editor", text: "Every live circuit in this course has an **Open in the editor** button, so you can take it apart. You can also start from a blank page." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "Which of these is a digital signal?", options: ["The voltage from a microphone", "A wire read only as low or high", "The temperature of a room", "The height of a sound wave"], correctIndex: 1, explanation: "A digital signal is read as one of two ranges. The others can take any value in a range, so they are analog." },
    { id: "q2", question: "Why do digital systems use two levels instead of ten?", options: ["Two levels use less copper", "Wide gaps between levels make them hard to confuse under noise", "Ten levels are impossible to build", "Computers can only count to two"], correctIndex: 1, explanation: "With two widely spaced ranges, noise rarely pushes a signal into the wrong one. More levels would have to sit closer together." },
    { id: "q3", question: "A TTL output is guaranteed at least 2.4 V for high, and a TTL input accepts 2.0 V and above. What is the high noise margin?", options: ["0.4 V", "2.0 V", "2.4 V", "4.4 V"], correctIndex: 0, explanation: "2.4 − 2.0 = 0.4 V of noise can be added before the input stops reading high." },
    { id: "q4", question: "Why doesn't noise build up along a chain of gates?", options: ["Wires filter it out", "Each gate outputs a clean level again", "Noise only affects analog chips", "The clock removes it"], correctIndex: 1, explanation: "As long as its input is within the valid range, a gate drives a fresh, clean output level. This is called regeneration." },
    { id: "q5", question: "How many different patterns can 6 bits make?", options: ["6", "12", "36", "64"], correctIndex: 3, explanation: "n bits give 2ⁿ patterns, and 2⁶ = 64." },
    { id: "q6", question: "How many bits are needed to give each of 200 students a different code?", options: ["7", "8", "9", "200"], correctIndex: 1, explanation: "2⁷ = 128 is too few and 2⁸ = 256 is enough." },
    { id: "q7", question: "Two switches in series behave like which operation?", options: ["AND", "OR", "NOT", "A clock"], correctIndex: 0, explanation: "Current flows only if both are closed, which is the AND of the two." },
    { id: "q8", question: "How many rows does the truth table of a 3-input circuit have?", options: ["3", "6", "8", "9"], correctIndex: 2, explanation: "One row for each input pattern: 2³ = 8." },
    { id: "q9", question: "Which circuit must be sequential?", options: ["An adder", "A circuit that lights up when two inputs differ", "A counter", "A circuit that inverts its input"], correctIndex: 2, explanation: "A counter has to remember its last value. The others depend only on their present inputs." },
    { id: "q10", question: "When does an ordinary flip-flop take in a new value?", options: ["Whenever its input changes", "At the clock's rising edge", "Whenever the clock is low", "Only at power-up"], correctIndex: 1, explanation: "It samples its input at the rising edge and holds the value until the next one." },
  ],
  flashcards: [
    { id: "f1", front: "Analog signal", back: "Can take any value in a range, and every small change carries meaning." },
    { id: "f2", front: "Digital signal", back: "Read as one of two ranges, low (0) or high (1)." },
    { id: "f3", front: "Noise margin", back: "How much noise a signal can pick up and still be read correctly: the gap between what outputs guarantee and what inputs accept." },
    { id: "f4", front: "Bit, nibble, byte", back: "1 binary digit; 4 bits; 8 bits." },
    { id: "f5", front: "Patterns from n bits", back: "2ⁿ" },
    { id: "f6", front: "Transistor (in digital logic)", back: "A switch controlled by a voltage." },
    { id: "f7", front: "Truth table", back: "A list of a circuit's output for every combination of inputs." },
    { id: "f8", front: "Combinational vs sequential", back: "Combinational outputs depend only on present inputs. Sequential outputs also depend on stored state." },
    { id: "f9", front: "Clock", back: "A signal that ticks between 0 and 1, telling flip-flops when to update." },
  ],
  videos: [],
};

export default chapter;
