/** app/page.tsx — the landing page (components/HomePage.tsx), with its metadata and canonical URL. */

import HomePage from "@/components/HomePage";
import { ACADEMY_TOPIC_META } from "@/lib/academy-meta";
import { HOME_FAQ } from "@/lib/home-faq";
import { type HomeFacts, homePath } from "@/lib/home-path";
import { LESSONS } from "@/lib/lab/lessons";
import { prisma } from "@/lib/prisma";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, jsonLd } from "@/lib/site";

// The counts on the page are read from the product, at most an hour old.
export const revalidate = 3600;

export const metadata = {
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

/** Counts shown on the page. The problem count needs the database; without it the page just leaves that number out. */
async function readFacts(): Promise<HomeFacts> {
  let problems: number | null = null;
  try { problems = (await prisma.question.count({ where: { archived: false } })) || null; } catch { /* no database (a build, a test) */ }
  return { chapters: ACADEMY_TOPIC_META.length, lessons: LESSONS.length, problems };
}

/** The simulator as software, the learning path and the page's questions (the same lists HomePage shows). */
const schemaFor = (facts: HomeFacts) => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication", name: SITE_NAME, url: SITE_URL, description: SITE_DESCRIPTION,
      applicationCategory: "EducationalApplication", operatingSystem: "Any (runs in a web browser)",
      browserRequirements: "Requires a modern web browser", isAccessibleForFree: true, inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "ItemList", name: "BitFlow learning path", itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: homePath(facts).map((st, i) => ({ "@type": "ListItem", position: i + 1, name: st.title, description: st.body, url: `${SITE_URL}${st.href}` })),
    },
    {
      "@type": "FAQPage",
      mainEntity: HOME_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
});

export default async function Page() {
  const facts = await readFacts();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schemaFor(facts)) }} />
      <HomePage facts={facts} />
    </>
  );
}
