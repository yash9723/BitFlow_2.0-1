import { cells, p, ul } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "karnaugh-maps",
  title: "Karnaugh Maps",
  summary: "Simplify logic by eye: draw the truth table so neighbours differ by one variable, then circle the groups.",
  icon: "⊞",
  difficulty: "core",
  order: 7,
  estimatedMinutes: 40,
  prerequisites: ["boolean-algebra", "codes"],
  sections: [
    {
      id: "idea",
      heading: "The idea",
      blocks: [
        p("In the last chapter, A'BC' + ABC' simplified to BC'. That worked because the two terms differ in exactly one variable, and x + x' = 1 removes it. Simplifying is mostly about finding such pairs, but in a truth table they can sit far apart."),
        p("A **Karnaugh map** (K-map) is a truth table redrawn so that terms differing in one variable are always next to each other. Then you can see the simplifications. It relies on the Gray code from Chapter 4: rows and columns count 00, 01, 11, 10, not 00, 01, 10, 11."),
        { kind: "kmap", names: ["a", "b"], cells: cells(2, [1, 3]), output: "F", caption: "The smallest K-map. Each small number in a corner is the row of the truth table. The two 1s touch, and within that group a changes while b stays 1, so a drops out and F = b.", expect: "b" },
      ],
    },
    {
      id: "neighbours",
      heading: "Who counts as a neighbour",
      blocks: [
        p("Two cells are neighbours if they differ in one variable, and that includes cells at opposite edges. The map wraps around, as if it were rolled into a tube, both left to right and top to bottom."),
        { kind: "anim", id: "kmap-neighbours" },
        { kind: "callout", tone: "note", text: "Each cell in an n-variable map has exactly n neighbours, one for each variable you could flip. On a 4-variable map, the four corners touch through the wrap-around, so they can form a single group." },
      ],
    },
    {
      id: "rules",
      heading: "The rules for grouping",
      blocks: [
        { kind: "list", ordered: true, items: ["Circle only 1s (for SOP).", "A group is a rectangle, and it may wrap around the edges.", "Its size must be a power of 2: 1, 2, 4, 8 or 16.", "Make each group as **large** as possible, because a bigger group means a simpler term.", "Use as **few** groups as possible, because each group is one more term.", "Groups may overlap, and every 1 must be in at least one group."] },
        p("To read a group, look at which variables stay the same across all its cells. Those stay in the term, inverted if they stay 0. Any variable that changes drops out. A group of 2ᵏ cells removes k variables."),
        { kind: "kmap", editable: true, names: ["a", "b", "c"], cells: cells(3, [0, 2, 5, 7]), output: "F", caption: "A 3-variable map you can edit. Press **Play** to see the groups form. Notice that a'c' wraps around the left and right edges.", expect: "a'c' + ac" },
        { kind: "callout", tone: "tip", text: "Try making the whole map 1s, or a checkerboard. A checkerboard is XOR: no two 1s touch, so nothing simplifies at all." },
      ],
    },
    {
      id: "four",
      heading: "Four variables",
      blocks: [
        p("With four variables, the map is a 4 × 4 grid and groups of 8 become possible. This function has eleven 1s, yet the answer has only three terms."),
        { kind: "kmap", names: ["a", "b", "c", "d"], cells: cells(4, [0, 1, 2, 4, 5, 6, 8, 9, 12, 13, 14]), output: "F", caption: "Press **Play**. The group of eight gives c' on its own, because only c stays constant across it.", expect: "c' + a'd' + bd'" },
        { kind: "kmap", names: ["a", "b", "c", "d"], cells: cells(4, [0, 2, 5, 7, 8, 10, 13, 15]), output: "F", caption: "The four corners form one group, b'd'. The middle four form bd. Together, F is 1 exactly when b and d are equal: it's an XNOR of b and d, and a and c don't matter.", expect: "b'd' + bd" },
        { kind: "example", title: "Reading a group", problem: "A group covers minterms 0, 2, 8 and 10 of a 4-variable map. What term is it?", steps: ["Write them in binary: 0000, 0010, 1000, 1010.", "a changes, so it drops out.", "b is always 0, so b' stays.", "c changes, so it drops out.", "d is always 0, so d' stays."], answer: "**b'd'**" },
        { kind: "practice", question: "How many literals does a group of 4 cells on a 4-variable map leave in its term?", options: ["1", "2", "3", "4"], correctIndex: 1, explanation: "A group of 2ᵏ cells removes k variables. 4 = 2², so 2 variables go and **2** remain." },
      ],
    },
    {
      id: "dont-care",
      heading: "Don't-cares",
      blocks: [
        p("Sometimes certain inputs can't happen, or their output doesn't matter. In BCD, the patterns 10 to 15 never occur. Mark these cells **X**, for don't-care. You can include an X in a group if it makes the group bigger, and ignore it if it doesn't."),
        p("Here's a circuit that takes a BCD digit and outputs 1 if it's 5 or more. Compare the answers with and without don't-cares."),
        { kind: "kmap", names: ["a", "b", "c", "d"], cells: cells(4, [5, 6, 7, 8, 9], [10, 11, 12, 13, 14, 15]), output: "F", caption: "Using don't-cares: three short terms.", expect: "bd + bc + a" },
        { kind: "kmap", names: ["a", "b", "c", "d"], cells: cells(4, [5, 6, 7, 8, 9]), output: "F", caption: "The same function if patterns 10 to 15 must output 0: nine literals rather than five.", expect: "a'bd + a'bc + ab'c'" },
        { kind: "callout", tone: "warning", text: "Don't-cares must really be impossible. If a stray 1101 does reach this circuit, its output is whatever the chosen groups happen to make it." },
      ],
    },
    {
      id: "pos",
      heading: "Grouping the zeros: POS",
      blocks: [
        p("To get a product of sums, group the 0s instead. Each group gives a sum term, with the variables read inverted: a variable that stays 1 appears as x', and one that stays 0 appears as x."),
        { kind: "kmap", form: "pos", names: ["a", "b", "c", "d"], cells: cells(4, [0, 1, 2, 4, 5, 6, 8, 9, 12, 13, 14]), output: "F", caption: "The same function as the first 4-variable map above, as a product of sums. Here the groups circle the 0s. Which form is cheaper varies from function to function, so try both.", expect: "(c' + d')(a' + b + c')" },
      ],
    },
    {
      id: "primes",
      heading: "Prime and essential",
      blocks: [
        p("Two terms make precise what \"as large as possible\" means, and you'll need them for exams and for the next chapter."),
        ul("A **prime implicant** is a group that can't be made any bigger.", "An **essential prime implicant** is a prime that's the only one covering some 1. It must appear in every minimal answer."),
        p("So the method is: find all the primes, take the essential ones, then pick as few of the others as you need to cover what's left."),
        { kind: "kmap", names: ["a", "b", "c", "d"], cells: cells(4, [0, 2, 4, 5, 7, 8, 10, 13, 15]), output: "F", caption: "This map has 4 primes: b'd', bd, a'c'd' and a'bc'. The first two are essential. They leave only cell 4 uncovered, and either of the other two can take it, so **a minimal answer isn't always unique**. Press **Play** and read why each group is chosen.", expect: "b'd' + a'c'd' + bd" },
        { kind: "kmap", names: ["a", "b", "c"], cells: cells(3, [0, 1, 2, 5, 6, 7]), output: "F", caption: "A cyclic map: 6 primes and none are essential. Every 1 can be covered in two ways, so this one has two different minimal answers of three terms each.", expect: "a'b' + bc' + ac" },
      ],
    },
    {
      id: "gate-more",
      heading: "Five variables, and exam counting",
      level: "gate",
      blocks: [
        p("A 5-variable map is drawn as two 4-variable maps, one for a = 0 and one for a = 1. Imagine one stacked on the other: a cell is also a neighbour of the same cell on the other sheet. A group that appears in the same place on both sheets loses a."),
        { kind: "kmap", names: ["a", "b", "c", "d", "e"], cells: cells(5, [0, 2, 8, 10, 16, 18, 24, 26, 5, 7, 21, 23]), output: "F", caption: "Both groups repeat on the two sheets, so a drops out of both terms.", expect: "c'e' + b'ce" },
        { kind: "practice", gate: true, question: "For F(a, b, c, d) = Σm(0, 2, 4, 5, 7, 8, 10, 13, 15), how many essential prime implicants are there?", options: ["1", "2", "3", "4"], correctIndex: 1, explanation: "b'd' is the only prime covering 2 and 10, and bd is the only prime covering 7 and 13. Cell 4 can go either of two ways, so neither of those is essential. That makes **2**." },
        { kind: "practice", gate: true, question: "What is the minimal SOP of F(a, b, c, d) = Σm(1, 3, 7, 11, 15)?", options: ["a'b'd + cd", "a'd + cd", "b'd + cd", "d"], correctIndex: 0, explanation: "3, 7, 11, 15 form cd. Minterm 1 can pair only with 3, giving a'b'd. Together: **a'b'd + cd**." },
        { kind: "practice", gate: true, question: "How many cells are in the largest possible group that isn't the whole map, on a 5-variable map?", options: ["8", "16", "24", "31"], correctIndex: 1, explanation: "Group sizes are powers of 2. The whole map is 32 cells, so the next size down is **16**: half the map, one variable fixed." },
        { kind: "link", href: "/studio/logic", label: "Open the truth table tool", text: "It handles up to 6 variables, with don't-cares, and it builds the circuit from your K-map." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "Why do K-map rows and columns count 00, 01, 11, 10?", options: ["It saves space", "So neighbours differ in one variable", "It's alphabetical", "So there are fewer cells"], correctIndex: 1, explanation: "Gray order makes adjacent cells differ in exactly one variable, which is what grouping relies on." },
    { id: "q2", question: "Which group size is not allowed?", options: ["2", "4", "6", "8"], correctIndex: 2, explanation: "Group sizes must be powers of 2." },
    { id: "q3", question: "On a 4-variable map, which cells are neighbours of cell 0?", options: ["1, 2, 3, 4", "1, 2, 4, 8", "1, 3, 5, 7", "4, 8, 12, 15"], correctIndex: 1, explanation: "Flip each of the four bits of 0000 to get 1, 2, 4 and 8." },
    { id: "q4", question: "A group of 8 on a 4-variable map leaves how many literals?", options: ["0", "1", "2", "3"], correctIndex: 1, explanation: "8 = 2³ removes 3 of the 4 variables." },
    { id: "q5", question: "Which statement about grouping is true?", options: ["Groups can't overlap", "Groups must not wrap around", "Larger groups give simpler terms", "Every group must contain a don't-care"], correctIndex: 2, explanation: "Each doubling removes one more variable." },
    { id: "q6", question: "What may you do with a don't-care cell?", options: ["You must cover it", "You must not cover it", "Cover it only if it helps", "Treat it as 0 always"], correctIndex: 2, explanation: "Use it if it makes a group larger, and otherwise ignore it." },
    { id: "q7", question: "To get a POS form from a K-map, you group…", options: ["the 1s", "the 0s", "the don't-cares only", "the corners"], correctIndex: 1, explanation: "Group the 0s and read each group as a sum term with inverted sense." },
    { id: "q8", question: "What is an essential prime implicant?", options: ["The largest group", "A prime that's the only cover for some 1", "Any group of 4", "A group that includes a don't-care"], correctIndex: 1, explanation: "It's the only way to cover at least one 1, so it must be in every minimal answer." },
    { id: "q9", question: "A group covers 0101, 0111, 1101, 1111. What's its term?", options: ["bd", "ab", "a'bd", "cd"], correctIndex: 0, explanation: "b and d stay 1, while a and c change." },
    { id: "q10", question: "A K-map shows a checkerboard of 1s. Which function could it be?", options: ["AND", "OR", "XOR", "A constant"], correctIndex: 2, explanation: "In XOR no two 1s touch, so nothing simplifies." },
  ],
  flashcards: [
    { id: "f1", front: "K-map order", back: "Gray code: 00, 01, 11, 10." },
    { id: "f2", front: "Valid group", back: "A rectangle of 2ᵏ cells, which may wrap around the edges." },
    { id: "f3", front: "Variables removed by a group of 2ᵏ", back: "k" },
    { id: "f4", front: "Reading a group", back: "Keep what stays constant, inverted if it stays 0. Drop what changes." },
    { id: "f5", front: "Don't-care", back: "Can be included in a group if it helps, and needn't be covered." },
    { id: "f6", front: "POS from a K-map", back: "Group the 0s. A variable that stays 1 appears inverted." },
    { id: "f7", front: "Prime implicant", back: "A group that can't be made larger." },
    { id: "f8", front: "Essential prime implicant", back: "A prime that's the only cover for some 1." },
    { id: "f9", front: "Neighbours of a cell, n variables", back: "n" },
    { id: "f10", front: "Five-variable map", back: "Two 4-variable sheets. Matching cells on the two sheets are neighbours." },
  ],
  videos: [],
};

export default chapter;
