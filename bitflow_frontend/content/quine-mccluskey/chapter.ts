import { cells, p } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const FN = cells(4, [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]);

const chapter: AcademyTopic = {
  slug: "quine-mccluskey",
  title: "The Quine-McCluskey Method",
  summary: "K-maps stop working at about five variables. This is the same idea as a step-by-step procedure a computer can follow.",
  icon: "QM",
  difficulty: "advanced",
  order: 8,
  estimatedMinutes: 30,
  prerequisites: ["karnaugh-maps"],
  sections: [
    {
      id: "why",
      heading: "Why another method",
      blocks: [
        p("K-maps depend on your eye spotting rectangles. That's fine up to four variables and awkward at five, and past six you can't draw it at all. It's also no use to a computer. The **Quine-McCluskey method**, or tabular method, does the same job by a fixed procedure, so it works for any number of variables and it's guaranteed to find every prime implicant."),
        p("It has two stages. **Find all the prime implicants** by merging terms repeatedly, then **choose the fewest primes** that cover every minterm."),
      ],
    },
    {
      id: "merge",
      heading: "Stage 1: merge until nothing merges",
      blocks: [
        p("The merging rule is the one behind every K-map group: two terms that differ in exactly one bit combine, and that bit disappears. xy + xy' = x. We write the vanished bit as a dash, so 0010 and 0110 merge into 0-10."),
        { kind: "list", ordered: true, items: ["Write each minterm in binary and sort them into groups by how many 1s they have.", "Compare each term with those in the next group. Two terms whose bits differ in just one place merge, so write the merged term in the next column and tick both.", "Repeat on the new column. Dashes must line up: 0-10 can merge with 0-11 but not with 01-0.", "Any term that never got ticked is a **prime implicant**."] },
        { kind: "callout", tone: "tip", text: "Sorting by the count of 1s saves work. Two terms that differ in one bit must have counts that differ by exactly one, so you only ever compare neighbouring groups." },
        { kind: "anim", id: "qm-merge" },
        { kind: "example", title: "Is this a valid merge?", problem: "Can 01-1 and 11-1 merge? Can 01-1 and 0-11?", steps: ["01-1 and 11-1 have their dash in the same place and differ only in the first bit. They merge into -1-1.", "01-1 and 0-11 have their dashes in different places, so they can't merge."], answer: "**Yes** for the first, and **no** for the second." },
        { kind: "practice", question: "What do 1001 and 1011 merge into?", options: ["1001", "10-1", "1-01", "They can't merge"], correctIndex: 1, explanation: "They differ only in the third bit, so that bit becomes a dash: **10-1**." },
        { kind: "practice", question: "A term with 2 dashes in a 4-variable function covers how many minterms?", options: ["2", "3", "4", "8"], correctIndex: 2, explanation: "Each dash can be 0 or 1, so 2² = **4** minterms. It's the same as a group of 4 on a K-map." },
      ],
    },
    {
      id: "chart",
      heading: "Stage 2: the prime implicant chart",
      blocks: [
        p("Now you have every prime, but you may not need them all. Draw a chart with the primes as rows and the minterms as columns, and mark which prime covers which minterm."),
        { kind: "list", ordered: true, items: ["Find columns with only one mark. That row is an **essential** prime, so take it.", "Cross off every minterm those primes cover.", "Choose from the remaining primes to cover what's left, as cheaply as you can."] },
        { kind: "qm", names: ["a", "b", "c", "d"], cells: FN },
        { kind: "kmap", names: ["a", "b", "c", "d"], cells: FN, output: "F", caption: "The same function on a K-map, to compare. Six primes reduce to three terms: b'c' and cd' are essential, and a'bd picks up the last two cells, 5 and 7, in one term.", expect: "b'c' + cd' + a'bd" },
      ],
    },
    {
      id: "dont-cares",
      heading: "Don't-cares",
      blocks: [
        p("Don't-cares are handled in one simple way, and it matches the K-map rule. Include them in **stage 1**, so they can make groups bigger. Leave them out of **stage 2**, since they don't need to be covered."),
        { kind: "callout", tone: "warning", text: "A common exam slip is to keep don't-care columns in the chart. That can make a prime look essential when it isn't." },
        { kind: "practice", question: "Why are don't-cares left out of the chart's columns?", options: ["They have too many bits", "They needn't be covered", "They can't merge", "They are always 0"], correctIndex: 1, explanation: "The chart decides what must be covered, and a don't-care **needn't be covered**." },
      ],
    },
    {
      id: "gate-petrick",
      heading: "Cyclic charts and Petrick's method",
      level: "gate",
      blocks: [
        p("Sometimes no column has a single mark, so there are no essential primes. The function Σm(0, 1, 2, 5, 6, 7) from the last chapter is like this. You can pick a prime and continue, but that doesn't guarantee the best answer."),
        p("**Petrick's method** does. Write the requirement as logic, with one variable per prime. Each column says \"at least one of the primes that cover me\", so it's an OR, and all columns must hold, so they're ANDed. Multiply it out, and each product term is one valid cover. Pick the cheapest."),
        { kind: "example", title: "Petrick on a small chart", problem: "Prime P covers minterms 1 and 2. Q covers 2 and 3. R covers 1 and 3. Find the smallest covers.", steps: ["Minterm 1 needs (P + R). Minterm 2 needs (P + Q). Minterm 3 needs (Q + R).", "Multiply: (P + R)(P + Q)(Q + R).", "(P + R)(P + Q) = P + QR, by the distributive law.", "(P + QR)(Q + R) = PQ + PR + QR."], answer: "Any **two** of the three primes will do: PQ, PR or QR." },
        { kind: "simplify", title: "The algebra behind that example", steps: [
          { expr: "(P + R)(P + Q)(Q + R)", law: "every minterm must be covered" },
          { expr: "(P + QR)(Q + R)", law: "distributive: (x + y)(x + z) = x + yz" },
          { expr: "PQ + PR + QR", law: "multiply out; QRQ and QRR are both QR" },
        ] },
        p("The method's cost is its limit. A function of n variables can have roughly 3ⁿ/n primes, so the chart can grow enormous. Finding the true minimum is NP-hard, which is why synthesis tools use heuristics such as **Espresso**, which find very good answers without promising the best one."),
        { kind: "practice", gate: true, question: "A 4-variable function's prime implicant is written -1-0. What term is it?", options: ["bd'", "b'd", "ac'", "bd"], correctIndex: 0, explanation: "Reading abcd: a is a dash, b is 1, c is a dash, d is 0. That's **bd'**." },
        { kind: "practice", gate: true, question: "Which stage of Quine-McCluskey includes the don't-care terms?", options: ["Only the merging", "Only the chart", "Both", "Neither"], correctIndex: 0, explanation: "They take part in **merging**, and are left out of the chart." },
        { kind: "link", href: "/studio/logic", label: "See the working for your own function", text: "The truth table tool shows every Quine-McCluskey pass and the chart for any function up to 6 variables." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What advantage does Quine-McCluskey have over K-maps?", options: ["It always uses fewer gates", "It's a fixed procedure that works for any number of variables", "It doesn't need minterms", "It's faster by hand"], correctIndex: 1, explanation: "It doesn't rely on spotting patterns, so a computer can run it at any size." },
    { id: "q2", question: "Why sort terms by their number of 1s?", options: ["Only neighbouring groups can differ by one bit", "It's alphabetical", "To remove don't-cares", "To find the essential primes"], correctIndex: 0, explanation: "A one-bit difference changes the count of 1s by exactly one." },
    { id: "q3", question: "What do 0101 and 0111 merge into?", options: ["01-1", "0-01", "-101", "They can't merge"], correctIndex: 0, explanation: "They differ only in the third bit." },
    { id: "q4", question: "Can 1-01 and 10-1 merge?", options: ["Yes, into 1--1", "Yes, into 1-0-", "No, the dashes are in different places", "No, they have the same count of 1s"], correctIndex: 2, explanation: "Dashes must line up." },
    { id: "q5", question: "A term that never merges is…", options: ["discarded", "a prime implicant", "a don't-care", "an error"], correctIndex: 1, explanation: "It can't get any bigger, which is the definition of a prime." },
    { id: "q6", question: "In the chart, a column with exactly one mark tells you…", options: ["that minterm is a don't-care", "that row is an essential prime", "the function is cyclic", "the chart is wrong"], correctIndex: 1, explanation: "That prime is the only way to cover the minterm." },
    { id: "q7", question: "What does the term 1--0 cover?", options: ["1000, 1010, 1100, 1110", "1000, 1001", "0000, 1000", "1110 only"], correctIndex: 0, explanation: "The two dashes take all four combinations." },
    { id: "q8", question: "Where do don't-cares belong?", options: ["Only in merging", "Only in the chart", "In both", "In neither"], correctIndex: 0, explanation: "They help merging but don't need to be covered." },
    { id: "q9", question: "What is Petrick's method for?", options: ["Finding minterms", "Sorting by 1s", "Finding every minimal cover of a chart", "Drawing K-maps"], correctIndex: 2, explanation: "It turns the covering problem into a logic expression and multiplies it out." },
    { id: "q10", question: "Why do real tools use heuristics like Espresso?", options: ["Exact minimisation can blow up at large sizes", "Quine-McCluskey gives wrong answers", "Heuristics find every prime", "Chips don't need minimisation"], correctIndex: 0, explanation: "Exact minimisation is NP-hard, and the number of primes can be huge." },
  ],
  flashcards: [
    { id: "f1", front: "Merging rule", back: "Two terms that differ in exactly one bit merge, and that bit becomes a dash." },
    { id: "f2", front: "Dashes when merging", back: "They must be in the same places." },
    { id: "f3", front: "Why group by count of 1s", back: "Only neighbouring groups can differ in one bit." },
    { id: "f4", front: "Prime implicant, in the table", back: "A term that never got ticked." },
    { id: "f5", front: "Minterms covered by a term with k dashes", back: "2ᵏ" },
    { id: "f6", front: "Essential prime, in the chart", back: "The only mark in some column." },
    { id: "f7", front: "Don't-cares", back: "Include them when merging, and leave them out of the chart." },
    { id: "f8", front: "Cyclic chart", back: "No essential primes. Use Petrick's method for the true minimum." },
    { id: "f9", front: "Petrick's method", back: "AND together, per minterm, the OR of primes covering it, then multiply out." },
    { id: "f10", front: "Espresso", back: "A heuristic minimiser: fast, very good, not guaranteed minimal." },
  ],
  videos: [],
};

export default chapter;
