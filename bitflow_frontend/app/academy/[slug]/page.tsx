import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TopicView from "@/components/academy/TopicView";
import {
  getTopicBySlug,
  getTopicSlugs,
  getNextTopic,
  getPrevTopic,
} from "@/lib/academy-content";
import { DIFFICULTY_LABELS } from "@/lib/academy-meta";
import { SITE_URL, jsonLd, pageMeta } from "@/lib/site";

interface Props {
  params: { slug: string };
}

export function generateStaticParams() {
  return getTopicSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: Props): Metadata {
  const topic = getTopicBySlug(params.slug);
  if (!topic) return { title: "Not found" };
  // The academy layout's title template adds " · BitFlow Academy".
  return pageMeta(`/academy/${topic.slug}`, topic.title, topic.summary);
}

export default function AcademyTopicPage({ params }: Props) {
  const topic = getTopicBySlug(params.slug);
  if (!topic) notFound();

  const url = `${SITE_URL}/academy/${topic.slug}`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "LearningResource", name: topic.title, description: topic.summary, url,
        learningResourceType: "Chapter", educationalLevel: DIFFICULTY_LABELS[topic.difficulty] ?? topic.difficulty,
        timeRequired: `PT${topic.estimatedMinutes}M`, isAccessibleForFree: true, inLanguage: "en", position: topic.order,
        teaches: topic.sections.map((s) => s.heading),
        isPartOf: { "@type": "Course", name: "BitFlow Digital Electronics Academy", url: `${SITE_URL}/academy` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "BitFlow", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Academy", item: `${SITE_URL}/academy` },
          { "@type": "ListItem", position: 3, name: topic.title, item: url },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      <TopicView
        topic={topic}
        prev={getPrevTopic(params.slug)}
        next={getNextTopic(params.slug)}
      />
    </>
  );
}
