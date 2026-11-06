/**
 * app/academy/page.tsx — the Academy hub. Public: the chapter list is server-rendered so search engines and
 * answer engines can read it; progress is kept in the browser (and on the account when signed in).
 */
import AcademyHub from "@/components/academy/AcademyHub";
import { ACADEMY_TOPIC_META } from "@/lib/academy-meta";
import { SITE_URL, jsonLd } from "@/lib/site";

const schema = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "BitFlow Digital Electronics Academy",
  description: "Digital electronics from your first bit to the university and GATE syllabus, with circuits you can click, worked examples and quizzes.",
  url: `${SITE_URL}/academy`,
  isAccessibleForFree: true,
  inLanguage: "en",
  provider: { "@type": "Organization", name: "BitFlow", url: SITE_URL },
  hasCourseInstance: { "@type": "CourseInstance", courseMode: "online" },
  hasPart: ACADEMY_TOPIC_META.map((t, i) => ({
    "@type": "LearningResource", position: i + 1, name: t.title, description: t.summary, url: `${SITE_URL}/academy/${t.slug}`,
  })),
};

export default function AcademyPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      <AcademyHub />
    </>
  );
}
