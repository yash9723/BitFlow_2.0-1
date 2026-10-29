/**
 * app/lab/[slug]/page.tsx — one Board Lab lesson. The text is rendered here (indexable);
 * the editor, 3D board and checks are components/lab/LabLesson.tsx.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LESSONS, lessonBySlug, lessonIndex } from "@/lib/lab/lessons";
import { SITE_URL, jsonLd, pageMeta } from "@/lib/site";
import LabLesson from "@/components/lab/LabLesson";
import { rich } from "@/components/lab/rich";

interface Props { params: { slug: string } }

export const generateStaticParams = () => LESSONS.map((l) => ({ slug: l.slug }));

export function generateMetadata({ params }: Props): Metadata {
  const l = lessonBySlug(params.slug);
  return l ? pageMeta(`/lab/${l.slug}`, `${l.title}: Board Lab`, l.summary) : { title: "Not found" };
}

export default function LabLessonPage({ params }: Props) {
  const lesson = lessonBySlug(params.slug);
  if (!lesson) notFound();
  const i = lessonIndex(lesson.slug);
  const prev = LESSONS[i - 1], next = LESSONS[i + 1];
  const schema = {
    "@context": "https://schema.org", "@type": "LearningResource", name: lesson.title, description: lesson.summary,
    url: `${SITE_URL}/lab/${lesson.slug}`, learningResourceType: "Interactive lesson", educationalLevel: "Beginner",
    isAccessibleForFree: true, inLanguage: "en", position: i + 1,
    isPartOf: { "@type": "Course", name: "BitFlow Board Lab", url: `${SITE_URL}/lab` },
    teaches: lesson.goals,
  };

  return (
    <div className="space-y-5">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      <nav aria-label="Breadcrumb" className="font-mono text-[11px] text-dim">
        <Link href="/lab" className="hover:text-bright">Board Lab</Link> <span aria-hidden>/</span> Lesson {i + 1} of {LESSONS.length}
      </nav>
      <header className="space-y-3 max-w-3xl">
        <h1 className="font-serif text-[26px] sm:text-[30px] text-bright leading-tight">{lesson.title}</h1>
        {lesson.intro.map((p, k) => <p key={k} className="text-[14px] text-ghost leading-relaxed">{rich(p)}</p>)}
      </header>

      <LabLesson slug={lesson.slug} />

      <nav className="flex justify-between gap-4 pt-2 font-mono text-[11px]" aria-label="Lessons">
        {prev ? <Link href={`/lab/${prev.slug}`} className="text-ghost hover:text-bright">← {prev.title}</Link> : <span />}
        {next ? <Link href={`/lab/${next.slug}`} className="text-ghost hover:text-bright text-right">{next.title} →</Link> : <Link href="/lab" className="text-ghost hover:text-bright">All lessons</Link>}
      </nav>
    </div>
  );
}
