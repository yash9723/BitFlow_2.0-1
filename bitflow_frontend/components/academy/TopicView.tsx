"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ScrollUnlock from "@/components/ScrollUnlock";
import ArticleSections from "@/components/academy/ArticleSections";
import QuizPanel from "@/components/academy/QuizPanel";
import FlashcardDeck from "@/components/academy/FlashcardDeck";
import VideoList from "@/components/academy/VideoList";
import InteractiveWidget from "@/components/academy/InteractiveWidget";
import type { AcademyTopic } from "@/lib/academy-types";
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_STYLES,
} from "@/lib/academy-content";
import {
  markTopicVisited,
  markTopicCompleted,
  loadAcademyProgress,
} from "@/lib/academy-progress-storage";
import SiteHeader from "@/components/SiteHeader";

type Tab = "learn" | "quiz" | "flashcards" | "videos";

interface Props {
  topic: AcademyTopic;
  prev?: AcademyTopic;
  next?: AcademyTopic;
}

export default function TopicView({ topic, prev, next }: Props) {
  const [tab, setTab] = useState<Tab>("learn");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    markTopicVisited(topic.slug);
    const p = loadAcademyProgress();
    setCompleted(p.completedTopics.includes(topic.slug));
  }, [topic.slug]);

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "learn",       label: "Article" },
    { id: "quiz",        label: "Quiz",        count: topic.quiz.length },
    { id: "flashcards",  label: "Flashcards",  count: topic.flashcards.length },
    { id: "videos",      label: "Videos",      count: topic.videos.length },
  ];

  return (
    <div className="min-h-screen bg-void text-bright">
      <ScrollUnlock />

      <SiteHeader />
      <header className="sticky top-14 z-20 h-12 flex items-center justify-between px-6 bg-surface/90 border-b border-rim backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/academy" className="font-mono text-[10px] text-dim hover:text-ghost shrink-0">
            ← Academy
          </Link>
          <span className="text-rim shrink-0">·</span>
          <span className="font-mono text-[11px] text-ghost truncate">{topic.title}</span>
          {completed && (
            <span className="shrink-0 font-mono text-[8px] text-phosphor border border-phosphor/30 px-1.5 py-0.5 rounded">
              ✓ done
            </span>
          )}
        </div>
      </header>

      <div className="px-6 py-8 border-b border-rim/30 bg-gradient-to-b from-surface/15 to-transparent">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{topic.icon}</span>
            <span
              className={`font-mono text-[8px] px-2 py-0.5 rounded border uppercase tracking-wider ${
                DIFFICULTY_STYLES[topic.difficulty] ?? ""
              }`}
            >
              {DIFFICULTY_LABELS[topic.difficulty]}
            </span>
            <span className="font-mono text-[8px] text-dim">
              ~{topic.estimatedMinutes} min
            </span>
          </div>
          <h1 className="font-display text-[24px] font-bold text-bright mb-2">
            {topic.title}
          </h1>
          <p className="font-mono text-[11px] text-ghost/80 leading-relaxed">
            {topic.summary}
          </p>
        </div>
      </div>

      <div className="sticky top-12 z-[9] bg-void/95 border-b border-rim/40 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`font-mono text-[10px] px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-info text-info"
                  : "border-transparent text-dim hover:text-ghost"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1.5 text-[8px] opacity-60">({t.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {tab === "learn" && (
          <div className="space-y-8">
            {topic.interactive && (
              <InteractiveWidget id={topic.interactive} />
            )}
            <ArticleSections sections={topic.sections} />
            {topic.extraInteractives?.map((id) => (
              <InteractiveWidget key={id} id={id} />
            ))}
          </div>
        )}
        {tab === "quiz" && (
          <QuizPanel
            questions={topic.quiz}
            onComplete={(score, total) => {
              if (score >= Math.ceil(total * 0.7)) {
                markTopicCompleted(topic.slug, score);
                setCompleted(true);
              }
            }}
          />
        )}
        {tab === "flashcards" && <FlashcardDeck cards={topic.flashcards} />}
        {tab === "videos" && <VideoList videos={topic.videos} />}
      </main>

      <nav className="max-w-3xl mx-auto px-6 py-6 flex justify-between border-t border-rim/30">
        {prev ? (
          <Link
            href={`/academy/${prev.slug}`}
            className="font-mono text-[10px] text-dim hover:text-info transition-colors"
          >
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/academy/${next.slug}`}
            className="font-mono text-[10px] text-dim hover:text-info transition-colors"
          >
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
