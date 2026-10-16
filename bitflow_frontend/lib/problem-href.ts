/** URL of a problem's solving page: Arena problems live under their category. */
export function problemHref(p: { slug: string; category: string; learningLevel: string }): string {
  return p.learningLevel === "Arena"
    ? `/arena/${p.category.toLowerCase()}/${p.slug}`
    : `/problems/${p.slug}`;
}
