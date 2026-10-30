import { draw, p, ul } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "logic-families",
  title: "Logic Families",
  summary: "TTL, CMOS and ECL: what real gates do to voltages, how many others they can drive, how fast they go and how much power they burn.",
  icon: "⏚",
  difficulty: "core",
  order: 9,
  estimatedMinutes: 35,
  prerequisites: ["gates"],
  sections: [
    {
      id: "what",
      heading: "Gates are analog underneath",
      blocks: [
        p("So far a gate has been a perfect box with a truth table. Real gates are built from transistors that draw current, take time, and only roughly reach 0 V or the supply. A **logic family** is a set of chips built the same way, so they share the same voltage levels and can be wired together."),
        p("You choose a family for four things: **noise margin**, **speed**, **fan-out** and **power**. They trade off against one another, so every family is a different compromise."),
        { kind: "table", headers: ["Family", "Built from", "Where you'll see it"], rows: [["TTL (74, 74LS)", "Bipolar transistors", "Older boards, teaching labs"], ["CMOS (74HC, modern chips)", "NMOS and PMOS", "Nearly everything today"], ["ECL", "Bipolar, never fully off", "Very fast, specialist systems"]] },
      ],
    },
    {
      id: "curve",
      heading: "From voltage to bit",
      blocks: [
        p("The clearest picture of a logic gate is its **voltage transfer curve**: output voltage against input voltage. A good gate has long flat regions and a steep drop between them."),
        { kind: "anim", id: "inverter-curve" },
        p("The steep part is why gates clean up noise. A messy input anywhere on the flat part produces the same clean output, as you saw in Chapter 1. Four numbers from a datasheet describe the curve's useful corners."),
        { kind: "table", headers: ["Figure", "Meaning"], rows: [["V_OH (min)", "The lowest voltage a high output is guaranteed to give"], ["V_OL (max)", "The highest voltage a low output is guaranteed to give"], ["V_IH (min)", "The lowest input voltage guaranteed to read as high"], ["V_IL (max)", "The highest input voltage guaranteed to read as low"]] },
        { kind: "formula", text: "NM_H = V_OH − V_IH     NM_L = V_IL − V_OL", note: "The noise margins: how much noise each level can take." },
        { kind: "table", headers: ["Family", "V_OH", "V_OL", "V_IH", "V_IL", "NM_H", "NM_L"], rows: [["TTL (5 V)", "2.4", "0.4", "2.0", "0.8", "0.4", "0.4"], ["74LS (5 V)", "2.7", "0.5", "2.0", "0.8", "0.7", "0.3"], ["74HC CMOS (5 V)", "4.4", "0.1", "3.5", "1.5", "0.9", "1.4"], ["ECL 10K (−5.2 V)", "−0.98", "−1.63", "−1.105", "−1.475", "0.125", "0.155"]], caption: "Typical datasheet values in volts. Always check the datasheet of the part you're using." },
        { kind: "practice", question: "A gate has V_OH = 3.5 V, V_OL = 0.2 V, V_IH = 2.5 V and V_IL = 1.0 V. What is its overall noise margin, the smaller of the two?", options: ["0.8 V", "1.0 V", "1.5 V", "2.5 V"], correctIndex: 0, explanation: "NM_H = 3.5 − 2.5 = 1.0 V and NM_L = 1.0 − 0.2 = 0.8 V. The smaller one limits the gate: **0.8 V**." },
      ],
    },
    {
      id: "speed-load",
      heading: "Speed, fan-out and power",
      blocks: [
        p("**Propagation delay** is measured from the input crossing halfway to the output crossing halfway. A falling output and a rising output usually differ, so datasheets give t_PHL and t_PLH, and the delay is their average."),
        { kind: "formula", text: "t_pd = (t_PHL + t_PLH) / 2" },
        p("**Fan-out** is how many gate inputs one output can drive. In TTL, inputs draw real current, so it's a matter of current budget. Work out both states and take the smaller answer."),
        { kind: "formula", text: "fan-out = min( I_OL / I_IL , I_OH / I_IH )" },
        { kind: "example", title: "Fan-out of standard TTL", problem: "A 7400 output can sink I_OL = 16 mA and source I_OH = 400 µA. An input draws I_IL = 1.6 mA and I_IH = 40 µA. What is its fan-out?", steps: ["Low state: 16 mA ÷ 1.6 mA = 10.", "High state: 400 µA ÷ 40 µA = 10.", "Take the smaller."], answer: "**10**" },
        p("CMOS inputs draw almost no steady current, but each one is a small capacitor. Fan-out there isn't a hard limit, it's a slowdown: every extra input adds capacitance that the output must charge through its transistor's resistance. Try it here."),
        { kind: "anim", id: "load-delay" },
        p("That same capacitance sets the power. Every time a node charges and discharges, it burns energy, even if nothing downstream needed the change."),
        { kind: "formula", text: "P_dynamic = α × C × V² × f", note: "α is the activity factor: how often the node switches, per clock." },
        ul("**Voltage counts twice** in that formula, which is why chips run at about 1 V today rather than 5 V.", "**Static power** is what's left when nothing switches. In CMOS, that's leakage. It was once negligible, but in very small transistors it's a major concern.", "**Speed-power product** multiplies delay by power, to compare families in a single figure. Smaller is better."),
        { kind: "practice", question: "A node of 10 pF switches on every clock cycle (α = 1) at 100 MHz and 1 V. What's its dynamic power?", options: ["0.1 mW", "1 mW", "10 mW", "100 mW"], correctIndex: 1, explanation: "10×10⁻¹² × 1² × 100×10⁶ = 10⁻³ W = **1 mW**." },
      ],
    },
    {
      id: "outputs",
      heading: "Three kinds of output",
      blocks: [
        { kind: "table", headers: ["Output type", "How it drives", "Can outputs be joined?"], rows: [["Totem-pole / push-pull", "Actively high and actively low", "**No.** One high and one low make a short circuit"], ["Open-collector / open-drain", "Actively low only, with a pull-up resistor for high", "Yes: any one output pulling low wins (wired-AND)"], ["Tri-state", "High, low, or disconnected", "Yes, if only one is enabled at a time"]] },
        p("**Tri-state** outputs let many devices share one wire, called a **bus**. Each has an enable, and when it's off the output behaves as if it weren't connected. That third state is written Z, for high impedance."),
        { kind: "circuit", circuit: draw("shared_bus", (d) => {
            const d1 = d.sw("d1", 30, 10), e1 = d.sw("en1", 30, 90), d2 = d.sw("d2", 30, 190), e2 = d.sw("en2", 30, 270);
            d.part("tri", "t1", 210, 50); d.part("tri", "t2", 210, 230);
            d.wire(d1, "t1", "d"); d.wire(e1, "t1", "en"); d.wire(d2, "t2", "d"); d.wire(e2, "t2", "en");
            d.part("bus", "shared", 380, 140, { n: 2 });
            d.wire(d.pin("t1", "y"), "shared", "in0"); d.wire(d.pin("t2", "y"), "shared", "in1");
            d.led("reader", 520, 145, d.pin("shared", "out"));
          }), caption: "Two drivers share one wire. Enable one at a time and the reader sees that driver's data. This simulator shows a bus with nobody driving it as 0, while a real one floats, which is why real buses often have a pull-up or a keeper.", tryThis: ["Turn on **en1** and flip **d1**: the reader follows it.", "Turn **en1** off and **en2** on: now it follows **d2**.", "Never enable both in real hardware. If they disagree, the two outputs fight, and the chips can overheat."],
          checks: [{ set: { d1: 1, en1: 1, d2: 0, en2: 0 }, expect: { reader: 1 } }, { set: { d1: 1, en1: 0, d2: 0, en2: 1 }, expect: { reader: 0 } }, { set: { d1: 0, en1: 0, d2: 1, en2: 1 }, expect: { reader: 1 } }] },
        { kind: "callout", tone: "note", text: "I²C works through open-drain wired-AND. Any device can pull the line low, and it only goes high if nobody is pulling. This is also how several devices on it can detect a collision." },
      ],
    },
    {
      id: "practical",
      heading: "Mixing families and unused inputs",
      blocks: [
        p("To connect two chips, the driver's output levels must satisfy the receiver's input levels: V_OH(driver) must be at least V_IH(receiver), and V_OL(driver) at most V_IL(receiver). Compare the table above and you'll see a classic trap."),
        { kind: "example", title: "Can TTL drive 74HC?", problem: "A TTL gate has V_OH = 2.4 V, and a 74HC input has V_IH = 3.5 V. Will a high get through?", steps: ["2.4 V is below 3.5 V, so a TTL high isn't guaranteed to read as high.", "The low side is fine: 0.4 V is below 1.5 V."], answer: "**Not reliably.** Use a 74HCT input, which has TTL-style thresholds, or a level shifter." },
        { kind: "callout", tone: "warning", text: "Never leave a CMOS input unconnected. It floats at some middle voltage, both transistors can turn on, and the chip wastes power or oscillates. Tie unused inputs high or low. A floating TTL input usually reads as high, but don't rely on that either." },
        { kind: "practice", question: "A 3.3 V CMOS output (V_OH = 3.2 V) drives a 5 V 74HC input (V_IH = 3.5 V). What happens?", options: ["It works, because 3.2 V is high", "A high isn't guaranteed to read correctly", "A low isn't guaranteed to read correctly", "The output is damaged"], correctIndex: 1, explanation: "3.2 V is below the guaranteed 3.5 V, so **a high isn't guaranteed**. It may work on the bench and fail in the field." },
      ],
    },
    {
      id: "gate-numbers",
      heading: "Exam figures",
      level: "gate",
      blocks: [
        p("An n-input CMOS NAND or NOR uses **2n** transistors: n PMOS and n NMOS. An inverter uses 2. The series stack is the slower side, so a NAND's pull-down and a NOR's pull-up limit speed. Since PMOS carries current less well than NMOS, NAND is usually preferred over NOR."),
        p("ECL gets its speed by never letting its transistors saturate, so they switch without having to clear stored charge. The price is steady power draw and small noise margins."),
        { kind: "practice", gate: true, question: "An output has I_OL = 8 mA and I_OH = 400 µA. Each input it drives has I_IL = 0.4 mA and I_IH = 50 µA. What's the fan-out?", options: ["8", "10", "20", "50"], correctIndex: 0, explanation: "Low: 8 ÷ 0.4 = 20. High: 400 ÷ 50 = 8. The smaller limits it: **8**." },
        { kind: "practice", gate: true, question: "A CMOS chip's supply falls from 1.2 V to 0.9 V with the same clock. By how much does its dynamic power fall, roughly?", options: ["25%", "44%", "56%", "75%"], correctIndex: 1, explanation: "Power scales with V². (0.9/1.2)² = 0.5625, so it falls by about **44%**." },
        { kind: "practice", gate: true, question: "A signal passes through 6 gates with t_PHL = 4 ns and t_PLH = 6 ns on average. Roughly how long is the path's delay?", options: ["10 ns", "24 ns", "30 ns", "36 ns"], correctIndex: 2, explanation: "Each gate averages (4 + 6)/2 = 5 ns, so 6 × 5 = **30 ns**." },
        { kind: "practice", gate: true, question: "How many transistors does a static CMOS 3-input NOR gate use?", options: ["3", "4", "6", "9"], correctIndex: 2, explanation: "3 PMOS in series and 3 NMOS in parallel make **6**." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What does V_IH mean?", options: ["The lowest input voltage guaranteed to read high", "The highest input voltage allowed", "The output's high level", "The supply voltage"], correctIndex: 0, explanation: "Above V_IH an input is guaranteed to read as 1." },
    { id: "q2", question: "How do you calculate the low noise margin?", options: ["V_IL − V_OL", "V_OH − V_IH", "V_OL − V_IL", "V_IH − V_IL"], correctIndex: 0, explanation: "It's how far a low output can rise before leaving the valid input range." },
    { id: "q3", question: "Why does a CMOS gate at rest draw almost no power?", options: ["It has no transistors", "There's no path from supply to ground", "Its clock is stopped", "Its outputs are disconnected"], correctIndex: 1, explanation: "One network is off in either state, leaving only tiny leakage." },
    { id: "q4", question: "If the supply voltage halves, dynamic power becomes…", options: ["half", "a quarter", "double", "the same"], correctIndex: 1, explanation: "Dynamic power is proportional to V²." },
    { id: "q5", question: "What happens if two push-pull outputs are tied together and disagree?", options: ["The higher one wins safely", "A short circuit from supply to ground", "The output reads 0", "Nothing"], correctIndex: 1, explanation: "One pulls up and the other pulls down, with almost nothing between them." },
    { id: "q6", question: "What does a tri-state output's third state do?", options: ["Outputs half the supply", "Disconnects from the wire", "Pulls the wire low", "Inverts the data"], correctIndex: 1, explanation: "High impedance means it stops driving, so another device can." },
    { id: "q7", question: "Open-drain outputs joined on one wire give…", options: ["wired-AND", "wired-XOR", "a short circuit", "a clock"], correctIndex: 0, explanation: "The wire is high only if no output pulls it low." },
    { id: "q8", question: "What should you do with an unused CMOS input?", options: ["Leave it floating", "Tie it high or low", "Connect it to an output", "Add a capacitor"], correctIndex: 1, explanation: "A floating input can sit mid-rail and turn both transistors on." },
    { id: "q9", question: "How is fan-out worked out for TTL?", options: ["The larger of the two current ratios", "The smaller of the two current ratios", "The supply divided by the current", "Always 10"], correctIndex: 1, explanation: "Both states must work, so the smaller ratio sets the limit." },
    { id: "q10", question: "Adding more gates to a CMOS output mostly…", options: ["reduces its voltage", "slows it down", "reduces power", "changes its logic"], correctIndex: 1, explanation: "Each input adds capacitance to charge." },
  ],
  flashcards: [
    { id: "f1", front: "Noise margins", back: "NM_H = V_OH − V_IH, and NM_L = V_IL − V_OL." },
    { id: "f2", front: "Propagation delay", back: "The average of t_PHL and t_PLH, measured at the halfway points." },
    { id: "f3", front: "Fan-out", back: "min(I_OL/I_IL, I_OH/I_IH)" },
    { id: "f4", front: "CMOS dynamic power", back: "α × C × V² × f" },
    { id: "f5", front: "CMOS static power", back: "Leakage only: no steady path from supply to ground." },
    { id: "f6", front: "Tri-state", back: "High, low, or disconnected (Z). Lets devices share a bus." },
    { id: "f7", front: "Open-drain", back: "Pulls low or lets go, needs a pull-up, and gives wired-AND." },
    { id: "f8", front: "Transistors in an n-input CMOS NAND", back: "2n" },
    { id: "f9", front: "Why ECL is fast", back: "Its transistors never saturate." },
    { id: "f10", front: "Connecting two families", back: "V_OH ≥ V_IH and V_OL ≤ V_IL, driver against receiver." },
  ],
  videos: [],
};

export default chapter;
