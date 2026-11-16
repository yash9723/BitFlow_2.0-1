// Questions a guest problem page answers, built only from what that page already shows (statement,
// constraints, examples, category, tags). Never hints, the solution, starter code or tests.
// A problem with no constraints and no examples gets no FAQ: nothing specific to say.

export type ProblemFaqInput = {
  title: string;
  statement: string;          // markdown headings already stripped
  category: string;
  tags: string[];
  constraints: string[];
  examples: { input?: string; output?: string; explanation?: string }[];
};

export type Faq = { q: string; a: string }[];

/** The statement's opening, cut at a sentence end near `max` characters. */
function opening(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return end > 80 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

export function problemFaq(p: ProblemFaqInput): Faq {
  if (p.constraints.length === 0 && p.examples.length === 0) return [];
  const faq: Faq = [{ q: `What does the ${p.title} problem ask you to build?`, a: opening(p.statement) }];

  if (p.constraints.length > 0) {
    faq.push({ q: `What constraints does ${p.title} have?`, a: p.constraints.join("; ") });
  }
  const ex = p.examples.find((e) => e.input != null && e.output != null);
  if (ex) {
    const why = ex.explanation ? ` ${ex.explanation}` : "";
    faq.push({ q: `What is an example input and output for ${p.title}?`, a: `Input ${ex.input} gives output ${ex.output}.${why}` });
  }
  const topics = [p.category, ...p.tags.filter((t) => t.toLowerCase() !== p.category.toLowerCase())].slice(0, 5);
  faq.push({ q: `Which Verilog concepts does ${p.title} practise?`, a: `${topics.join(", ")}.` });
  return faq;
}
