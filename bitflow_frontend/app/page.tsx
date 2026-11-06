/** app/page.tsx — the landing page (components/HomePage.tsx), with its metadata and canonical URL. */

import HomePage from "@/components/HomePage";
import { HOME_FAQ } from "@/lib/home-faq";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, jsonLd } from "@/lib/site";

export const metadata = {
  title: { absolute: `${SITE_NAME} — ${SITE_TAGLINE}` },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
};

/** The simulator as software, and the page's questions (the same list HomePage shows). */
const SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication", name: SITE_NAME, url: SITE_URL, description: SITE_DESCRIPTION,
      applicationCategory: "EducationalApplication", operatingSystem: "Any (runs in a web browser)",
      browserRequirements: "Requires a modern web browser", isAccessibleForFree: true, inLanguage: "en",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "FAQPage",
      mainEntity: HOME_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(SCHEMA) }} />
      <HomePage />
    </>
  );
}
