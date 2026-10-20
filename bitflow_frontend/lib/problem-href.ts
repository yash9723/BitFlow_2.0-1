/** Where a problem is solved: Arena problems live under /arena/<category>/, the rest under /problems/. */
export function problemHref(q: { slug: string; learningLevel: string; category: string }): string {
  return q.learningLevel === "Arena" ? `/arena/${q.category.toLowerCase()}/${q.slug}` : `/problems/${q.slug}`;
}
