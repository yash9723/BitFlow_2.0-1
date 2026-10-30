import { draw, p, ul } from "@/lib/academy/draw";
import type { AcademyTopic } from "@/lib/academy-types";

const chapter: AcademyTopic = {
  slug: "boolean-algebra",
  title: "Boolean Algebra",
  summary: "The algebra of 0s and 1s: laws, De Morgan's theorem, and turning any truth table into an expression you can simplify.",
  icon: "∧",
  difficulty: "foundations",
  order: 6,
  estimatedMinutes: 35,
  prerequisites: ["gates"],
  interactive: "boolean-algebra-builder",
  sections: [
    {
      id: "why",
      heading: "Why an algebra for logic",
      blocks: [
        p("Every gate costs chip area, power and delay, so we want the fewest gates that do the job. **Boolean algebra** lets you rewrite a logic expression into a simpler one that behaves identically. It works like school algebra, except that variables are only ever 0 or 1."),
        p("For example, a·b + a·b' needs two ANDs, an OR and a NOT. But whatever b is, one of those two terms matches, so the whole thing is just a. No gates at all."),
        { kind: "circuit", circuit: draw("same_function", (d) => {
            const a = d.sw("a", 30, 60), b = d.sw("b", 30, 230);
            const nb = d.gate("not", "inv", 170, 230, b);
            const t1 = d.gate("and", "t1", 320, 40, a, b), t2 = d.gate("and", "t2", 320, 180, a, nb);
            d.led("long_form", 620, 110, d.gate("or", "sum", 470, 110, t1, t2));
            d.led("just_a", 620, 10, a);
          }), caption: "The two lights are always equal: a·b + a·b' and plain a are the same function.", tryThis: ["Try all four input combinations. The lights never disagree.", "Flip **b** and notice that neither light changes. b doesn't matter."],
          checks: [{ set: { a: 0, b: 0 }, expect: { long_form: 0, just_a: 0 } }, { set: { a: 0, b: 1 }, expect: { long_form: 0, just_a: 0 } }, { set: { a: 1, b: 0 }, expect: { long_form: 1, just_a: 1 } }, { set: { a: 1, b: 1 }, expect: { long_form: 1, just_a: 1 } }] },
        p("A quick note on writing. AND is written like multiplication (ab or a·b), OR like addition (a + b), and NOT with a prime (a'). AND binds tighter than OR, as with × and +, so ab + c means (ab) + c."),
      ],
    },
    {
      id: "laws",
      heading: "The laws",
      blocks: [
        p("You can prove each of these by checking every row of its truth table, since there are so few. Each law comes in a pair: swap AND with OR and 0 with 1, and you get the other half. That's the **principle of duality**, and it means you only have to learn half of them."),
        { kind: "table", headers: ["Law", "AND form", "OR form"], rows: [
          ["Identity", "a·1 = a", "a + 0 = a"], ["Null", "a·0 = 0", "a + 1 = 1"], ["Idempotent", "a·a = a", "a + a = a"], ["Complement", "a·a' = 0", "a + a' = 1"],
          ["Involution", "(a')' = a", ""], ["Commutative", "ab = ba", "a + b = b + a"], ["Associative", "(ab)c = a(bc)", "(a + b) + c = a + (b + c)"],
          ["Distributive", "a(b + c) = ab + ac", "a + bc = (a + b)(a + c)"], ["Absorption", "a(a + b) = a", "a + ab = a"], ["De Morgan", "(ab)' = a' + b'", "(a + b)' = a'b'"],
        ] },
        { kind: "callout", tone: "warning", text: "Two of these have no equivalent in ordinary algebra, so watch for them: a + 1 = 1, and a + bc = (a + b)(a + c). Yes, OR distributes over AND." },
      ],
    },
    {
      id: "de-morgan",
      heading: "De Morgan's theorem, as a picture",
      blocks: [
        p("De Morgan's theorem is the one you'll use most. To invert a whole expression, **invert each variable and swap AND with OR**. \"Not both\" means the same as \"not the first, or not the second\"."),
        { kind: "anim", id: "venn" },
        p("Try the **Not equal** preset. A common mistake is to break the bar without swapping the operator, and (AB)' is not A'B'. The two pictures show the difference at once."),
        { kind: "practice", question: "What is (a + b'c)' by De Morgan?", options: ["a'(b + c')", "a' + b + c'", "a'b + c'", "a'bc'"], correctIndex: 0, explanation: "Invert the top-level OR first: a' · (b'c)'. Then invert the inner AND: (b'c)' = b + c'. The result is **a'(b + c')**." },
      ],
    },
    {
      id: "simplify",
      heading: "Simplifying step by step",
      blocks: [
        p("There's no single recipe, but these moves cover most problems: factor out what terms share, use a + a' = 1 and a + a'b = a + b, and multiply out only when you must. Press Play and read each law as it's used."),
        { kind: "simplify", title: "Simplify A'B + AB + AB'", steps: [
          { expr: "A'B + AB + AB'", law: "the starting point" },
          { expr: "B(A' + A) + AB'", law: "factor B out of the first two terms" },
          { expr: "B + AB'", law: "complement: A' + A = 1" },
          { expr: "B + A", law: "absorption: x + x'y = x + y" },
        ] },
        { kind: "simplify", title: "Invert (AB + C)'", steps: [
          { expr: "(AB + C)'", law: "the starting point" },
          { expr: "(AB)'C'", law: "De Morgan on the OR" },
          { expr: "(A' + B')C'", law: "De Morgan on the AND" },
          { expr: "A'C' + B'C'", law: "distribute" },
        ] },
        { kind: "practice", question: "Simplify (a + b)(a + b').", options: ["a", "b", "1", "a + b"], correctIndex: 0, explanation: "Multiply out: aa + ab' + ab + bb'. That is a + a(b + b') + 0 = **a**. Or use the distributive law directly: a + bb' = a." },
        { kind: "practice", question: "Simplify a + a'b + a'b'.", options: ["a", "1", "a + b", "b"], correctIndex: 1, explanation: "a'b + a'b' = a'(b + b') = a'. Then a + a' = **1**. The function is always 1." },
        { kind: "link", href: "/studio/boolean", label: "Open the Boolean algebra tool", text: "Type any expression to get its truth table and minimal form, or check that two expressions are equal." },
      ],
    },
    {
      id: "forms",
      heading: "From truth table to expression",
      blocks: [
        p("Algebra is half the story. Often you start from a truth table, describing what you want, and need an expression. There's a mechanical way that always works."),
        p("A **minterm** is an AND of all the variables, each inverted or not, that is 1 on exactly one row. For the row A=0, B=1, C=0 the minterm is A'BC'. Number the rows by their binary value, and that one is m₂."),
        { kind: "table", headers: ["Row", "A", "B", "C", "F", "Minterm", "Maxterm"], rows: [
          ["0", "0", "0", "0", "0", "A'B'C'", "A + B + C"], ["1", "0", "0", "1", "**1**", "**A'B'C**", "A + B + C'"], ["2", "0", "1", "0", "**1**", "**A'BC'**", "A + B' + C"], ["3", "0", "1", "1", "0", "A'BC", "A + B' + C'"],
          ["4", "1", "0", "0", "0", "AB'C'", "A' + B + C"], ["5", "1", "0", "1", "0", "AB'C", "A' + B + C'"], ["6", "1", "1", "0", "**1**", "**ABC'**", "A' + B' + C"], ["7", "1", "1", "1", "0", "ABC", "A' + B' + C'"],
        ] },
        ul("**Sum of products (SOP):** OR together the minterms of the rows where F = 1. F = A'B'C + A'BC' + ABC', written F = Σm(1, 2, 6).", "**Product of sums (POS):** AND together the maxterms of the rows where F = 0. A **maxterm** is an OR that is 0 on exactly one row. F = ΠM(0, 3, 4, 5, 7)."),
        { kind: "callout", tone: "tip", text: "Going between the two is quick: the numbers in Σ and Π together list every row exactly once. In a maxterm, a variable is inverted where its bit is 1, the opposite of a minterm." },
        { kind: "simplify", title: "Now simplify Σm(1, 2, 6)", steps: [
          { expr: "A'B'C + A'BC' + ABC'", law: "the sum of minterms" },
          { expr: "A'B'C + BC'(A' + A)", law: "factor BC' out of the last two" },
          { expr: "A'B'C + BC'", law: "complement: A' + A = 1" },
        ] },
        p("Spotting which minterms to combine gets hard by eye, and the next chapter's K-maps turn it into a picture."),
        { kind: "link", href: "/studio/logic", label: "Try it in the truth table tool", text: "Fill in a truth table and get the minimal SOP and POS, then generate the circuit." },
      ],
    },
    {
      id: "gate-counting",
      heading: "Consensus, and counting functions",
      level: "gate",
      blocks: [
        p("The **consensus theorem** removes a term you might not suspect is redundant: AB + A'C + BC = AB + A'C. The term BC adds nothing, because when B and C are both 1, either A or A' must also be 1."),
        { kind: "simplify", title: "Proof of the consensus theorem", steps: [
          { expr: "AB + A'C + BC", law: "the starting point" },
          { expr: "AB + A'C + BC(A + A')", law: "multiply BC by 1 = A + A'" },
          { expr: "AB + A'C + ABC + A'BC", law: "distribute" },
          { expr: "AB(1 + C) + A'C(1 + B)", law: "factor" },
          { expr: "AB + A'C", law: "null: 1 + x = 1" },
        ] },
        p("A truth table with n inputs has 2ⁿ rows, and each row's output can be 0 or 1, so there are **2^(2ⁿ) different Boolean functions** of n variables. For n = 2 that's 16, and for n = 3 it's 256."),
        p("A function is **self-dual** if swapping AND with OR and 0 with 1 gives the same function. Equivalently, inverting all the inputs inverts the output. Half of each truth table then fixes the other half, so there are 2^(2ⁿ⁻¹) of them. Majority is the classic example."),
        { kind: "practice", gate: true, question: "How many different Boolean functions of 3 variables are there?", options: ["8", "16", "64", "256"], correctIndex: 3, explanation: "There are 2³ = 8 rows, each with 2 choices, so 2⁸ = **256**." },
        { kind: "practice", gate: true, question: "Which is equal to XY + X'Z + YZ?", options: ["XY + YZ", "XY + X'Z", "X'Z + YZ", "X + Z"], correctIndex: 1, explanation: "YZ is the consensus of XY and X'Z, so it can be dropped: **XY + X'Z**." },
        { kind: "practice", gate: true, question: "How many self-dual functions of 3 variables are there?", options: ["4", "8", "16", "256"], correctIndex: 2, explanation: "2^(2³⁻¹) = 2⁴ = **16**. Four of the eight rows are free to choose, and the other four follow." },
      ],
    },
  ],
  quiz: [
    { id: "q1", question: "What is a + 1?", options: ["a", "a'", "0", "1"], correctIndex: 3, explanation: "OR with 1 is always 1. This is the null law." },
    { id: "q2", question: "What is a·a'?", options: ["0", "1", "a", "a'"], correctIndex: 0, explanation: "A variable and its inverse are never both 1." },
    { id: "q3", question: "What is (ab)' by De Morgan?", options: ["a'b'", "a' + b'", "a + b", "ab"], correctIndex: 1, explanation: "Invert each variable and swap AND for OR." },
    { id: "q4", question: "What is a + ab?", options: ["a", "b", "ab", "a + b"], correctIndex: 0, explanation: "Absorption: if a is 1 the sum is 1, and if a is 0 both terms are 0." },
    { id: "q5", question: "What is a + a'b?", options: ["a", "b", "a + b", "ab"], correctIndex: 2, explanation: "(a + a')(a + b) = 1·(a + b)." },
    { id: "q6", question: "What is the dual of a + 0 = a?", options: ["a·1 = a", "a·0 = 0", "a + 1 = 1", "a' + 1 = a"], correctIndex: 0, explanation: "Swap + with · and 0 with 1." },
    { id: "q7", question: "Which minterm is m₅ for variables A, B, C?", options: ["A'BC'", "AB'C", "ABC'", "A'B'C"], correctIndex: 1, explanation: "5 is 101, so A = 1, B = 0, C = 1." },
    { id: "q8", question: "Which maxterm is M₃ for variables A, B, C?", options: ["A'BC", "A + B' + C'", "A' + B + C", "ABC"], correctIndex: 1, explanation: "3 is 011. A maxterm inverts the variables whose bit is 1." },
    { id: "q9", question: "If F = Σm(0, 3, 5) of 3 variables, then F = …", options: ["ΠM(0, 3, 5)", "ΠM(1, 2, 4, 6, 7)", "Σm(1, 2, 4, 6, 7)", "ΠM(1, 2, 4)"], correctIndex: 1, explanation: "The Π list holds every row missing from the Σ list." },
    { id: "q10", question: "Which is a correct distributive law in Boolean algebra?", options: ["a + bc = (a + b)(a + c)", "a + bc = ab + ac", "a(b + c) = ab · ac", "(a + b)' = a' + b'"], correctIndex: 0, explanation: "OR distributes over AND, unlike in ordinary algebra." },
  ],
  flashcards: [
    { id: "f1", front: "De Morgan", back: "(ab)' = a' + b', and (a + b)' = a'b'." },
    { id: "f2", front: "Absorption", back: "a + ab = a, and a(a + b) = a." },
    { id: "f3", front: "a + a'b", back: "a + b" },
    { id: "f4", front: "Duality", back: "Swap AND with OR and 0 with 1: a true law stays true." },
    { id: "f5", front: "Minterm", back: "An AND of all the variables, 1 on exactly one row." },
    { id: "f6", front: "Maxterm", back: "An OR of all the variables, 0 on exactly one row." },
    { id: "f7", front: "SOP from a truth table", back: "OR the minterms of the rows where the output is 1." },
    { id: "f8", front: "POS from a truth table", back: "AND the maxterms of the rows where the output is 0." },
    { id: "f9", front: "Consensus", back: "AB + A'C + BC = AB + A'C" },
    { id: "f10", front: "Functions of n variables", back: "2^(2ⁿ)" },
  ],
  videos: [
    { id: "v1", title: "Digital Electronics playlist", url: "https://youtube.com/playlist?list=PLBlnK6fEyqRjMH3mWf6kwqiTbT798eAOm&si=S4pKpxd5N_FIwpUy", channel: "Neso Academy" },
  ],
};

export default chapter;
