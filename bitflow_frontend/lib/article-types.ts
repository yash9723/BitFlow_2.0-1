/** lib/article-types.ts — the shape of an article under /articles (content/articles/<slug>.ts). Sections use the Academy's blocks. */
import type { AcademySection } from "./academy-types";

export interface ArticleFaq { q: string; a: string }
export interface Article {
  slug: string;
  title: string;
  /** One or two sentences: the meta description and the index card. */
  description: string;
  /** Real dates, ISO (YYYY-MM-DD): when it was written and when it last changed substantively. */
  published: string;
  updated?: string;
  readMinutes: number;
  sections: AcademySection[];
  /** Questions answered at the end of the page, shown to readers and given to search engines as FAQPage data. */
  faq?: ArticleFaq[];
  /** Where to go next: other BitFlow pages (paths) with a label. */
  related: { href: string; label: string }[];
}
