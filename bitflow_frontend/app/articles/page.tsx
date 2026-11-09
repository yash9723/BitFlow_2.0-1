/**
 * app/articles/page.tsx — /articles: plain-language explainers on Verilog, FPGAs and digital design. Public and static.
 */
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { ARTICLES } from "@/lib/articles";
import { SITE_URL, jsonLd, pageMeta } from "@/lib/site";

const DESCRIPTION = "Plain-language explainers on Verilog, VHDL, FPGAs, blocking and nonblocking assignments, combinational and sequential logic, and how to simulate a design.";
export const metadata = pageMeta("/articles", "Articles: Verilog, FPGAs and digital design", DESCRIPTION);

export default function ArticlesPage() {
  const schema = {
    "@context": "https://schema.org", "@type": "CollectionPage", name: "BitFlow articles", description: DESCRIPTION, url: `${SITE_URL}/articles`,
    hasPart: ARTICLES.map((a) => ({ "@type": "Article", headline: a.title, url: `${SITE_URL}/articles/${a.slug}`, datePublished: a.published })),
  };
  return (
    <div className="min-h-screen bg-void text-bright flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      <SiteHeader />
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-10 space-y-8">
        <header className="space-y-2">
          <h1 className="font-serif text-3xl leading-tight">Articles</h1>
          <p className="text-[14px] text-ghost max-w-2xl">Short explainers on Verilog, FPGAs and digital design. The animated ones step through real code, and each links on to the Academy chapter and the tools.</p>
        </header>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ARTICLES.map((a) => (
            <li key={a.slug}>
              <Link href={`/articles/${a.slug}`} className="group block h-full border border-rim rounded-xl p-5 bg-pit hover:border-phosphor/50 transition-colors">
                <span className="block font-serif text-lg text-bright group-hover:text-phosphor transition-colors">{a.title}</span>
                <span className="block mt-2 text-[13px] text-ghost leading-relaxed">{a.description}</span>
                <span className="block mt-3 font-mono text-[11px] text-dim">{a.readMinutes} min read</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter />
    </div>
  );
}
