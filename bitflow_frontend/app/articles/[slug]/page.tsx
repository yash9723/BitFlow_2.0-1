/**
 * app/articles/[slug]/page.tsx — one article. Public, statically generated; the text, the questions at the end and
 * the structured data (Article, BreadcrumbList, FAQPage) are all server-rendered from content/articles/<slug>.ts.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ArticleSections from "@/components/academy/ArticleSections";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { articleBySlug, articleSlugs } from "@/lib/articles";
import { OPERATOR, SITE_NAME, SITE_URL, jsonLd, pageMeta } from "@/lib/site";

interface Props { params: { slug: string } }

export const generateStaticParams = () => articleSlugs().map((slug) => ({ slug }));

export function generateMetadata({ params }: Props): Metadata {
  const a = articleBySlug(params.slug);
  if (!a) return { title: "Not found" };
  const m = pageMeta(`/articles/${a.slug}`, a.title, a.description);
  return { ...m, openGraph: { ...m.openGraph, type: "article", publishedTime: a.published, ...(a.updated ? { modifiedTime: a.updated } : {}) } };
}

const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function ArticlePage({ params }: Props) {
  const a = articleBySlug(params.slug);
  if (!a) notFound();
  const url = `${SITE_URL}/articles/${a.slug}`;
  const org = { "@type": "Organization", name: SITE_NAME, url: SITE_URL, parentOrganization: { "@type": "Organization", name: OPERATOR } };
  const graph: object[] = [
    {
      "@type": "Article", headline: a.title, description: a.description, url, mainEntityOfPage: url, inLanguage: "en", isAccessibleForFree: true,
      datePublished: a.published, dateModified: a.updated ?? a.published, author: org, publisher: org,
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Articles", item: `${SITE_URL}/articles` },
        { "@type": "ListItem", position: 3, name: a.title, item: url },
      ],
    },
    ...(a.faq?.length ? [{ "@type": "FAQPage", mainEntity: a.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }] : []),
  ];

  return (
    <div className="min-h-screen bg-void text-bright flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({ "@context": "https://schema.org", "@graph": graph }) }} />
      <SiteHeader />
      <main className="flex-1 w-full max-w-3xl mx-auto px-6 py-10 space-y-8 font-display font-normal">
        <nav aria-label="Breadcrumb" className="font-mono text-[11px] text-dim">
          <Link href="/articles" className="hover:text-bright">Articles</Link> <span aria-hidden>/</span> {a.title}
        </nav>
        <header className="space-y-3">
          <h1 className="font-serif text-3xl sm:text-4xl leading-tight">{a.title}</h1>
          <p className="text-[15px] text-ghost leading-relaxed">{a.description}</p>
          <p className="font-mono text-[11px] text-dim">
            By {SITE_NAME} · <time dateTime={a.published}>{date(a.published)}</time>
            {a.updated && <> · updated <time dateTime={a.updated}>{date(a.updated)}</time></>} · {a.readMinutes} min read
          </p>
        </header>

        <ArticleSections sections={a.sections} />

        {a.faq && a.faq.length > 0 && (
          <section aria-labelledby="faq-title" className="space-y-3">
            <h2 id="faq-title" className="font-display text-[19px] font-bold text-bright">Questions</h2>
            <div className="divide-y divide-rim/50 border-y border-rim/50">
              {a.faq.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="cursor-pointer list-none flex items-center justify-between gap-4 text-[14px] text-bright">
                    {f.q}
                    <span aria-hidden className="text-phosphor group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <p className="mt-3 text-[13px] text-ghost leading-relaxed">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="next-title" className="space-y-3">
          <h2 id="next-title" className="font-display text-[19px] font-bold text-bright">Keep going</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {a.related.map((r) => (
              <li key={r.href}><Link href={r.href} className="block rounded-lg border border-rim/60 bg-surface/40 px-4 py-3 text-[13px] text-ghost hover:text-bright hover:border-phosphor/40 transition-colors">{r.label} →</Link></li>
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
