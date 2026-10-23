/**
 * lib/palette.ts — ranking for the command palette (components/CommandPalette.tsx):
 * fuzzy subsequence matching that prefers whole substrings, word starts and runs of
 * consecutive letters. Self-check: scripts/palette.check.ts.
 */

export interface PaletteItem {
  id: string;
  title: string;
  group: string;
  /** Extra words that match but aren't shown (category, tags). */
  keywords?: string;
  hint?: string;
  href?: string;
}

/** How well `query` matches `text` (higher is better), or -1 if its letters don't all appear in order. */
export function score(query: string, text: string): number {
  const q = query.toLowerCase().replace(/\s+/g, " ").trim(), t = text.toLowerCase();
  if (!q) return 0;
  const at = t.indexOf(q);
  const wordStart = at === 0 || (at > 0 && /\W/.test(t[at - 1]));
  if (at >= 0 && wordStart) return 1200 - at * 2 - (t.length - q.length) * 0.1;
  if (q.length >= 2 && t.split(/[^a-z0-9]+/).filter(Boolean).map((w) => w[0]).join("").startsWith(q.replace(/ /g, ""))) return 1100;   // initials: "ce" = Circuit Editor
  if (at >= 0) return 1000 - at * 2 - (t.length - q.length) * 0.1;
  // Every query word must appear as a subsequence; score each letter by where it lands
  let total = 0;
  for (const word of q.split(" ")) {
    let i = 0, s = 0, run = 0;
    for (const ch of word) {
      const j = t.indexOf(ch, i);
      if (j < 0) return -1;
      run = j === i && i > 0 ? run + 1 : 0;
      s += 1 + run * 3 + (j === 0 || /[\s\-_/:.]/.test(t[j - 1]) ? 4 : 0) - Math.min(3, (j - i) * 0.2);
      i = j + 1;
    }
    total += s;
  }
  return total;
}

/** Items matching `query`, best first (title matches beat keyword matches); the first `limit`, in order, for an empty query. */
export function rank<T extends PaletteItem>(items: T[], query: string, limit = 50): T[] {
  if (!query.trim()) return items.slice(0, limit);
  return items
    .map((item, i) => ({ item, i, s: Math.max(score(query, item.title) * 1.5, score(query, `${item.title} ${item.group} ${item.keywords ?? ""}`)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.item);
}
