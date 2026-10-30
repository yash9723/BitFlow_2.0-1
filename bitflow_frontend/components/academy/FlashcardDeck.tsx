"use client";

import { useState } from "react";
import type { AcademyFlashcard } from "@/lib/academy-types";

interface Props {
  cards: AcademyFlashcard[];
}

export default function FlashcardDeck({ cards }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (cards.length === 0) return null;

  const card = cards[index];

  const next = () => {
    setFlipped(false);
    setIndex((i) => (i + 1) % cards.length);
  };

  const prev = () => {
    setFlipped(false);
    setIndex((i) => (i - 1 + cards.length) % cards.length);
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setFlipped(!flipped)}
        className="w-full min-h-[160px] rounded-lg border border-rim/60 bg-shaft/80 p-6 flex items-center justify-center text-center transition-all duration-300 hover:border-info/40 active:scale-[0.99]"
        style={{
          transform: flipped ? "rotateY(0deg)" : undefined,
        }}
      >
        <div>
          <p className="text-[11px] text-dim uppercase tracking-wider mb-3">
            {flipped ? "Answer" : "Question"} — tap to flip
          </p>
          <p className="text-[16px] text-bright leading-relaxed">
            {flipped ? card.back : card.front}
          </p>
        </div>
      </button>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={prev}
          className="text-[13px] px-4 py-1.5 rounded border border-rim/50 text-ghost hover:border-rim"
        >
          ← Prev
        </button>
        <span className="text-[12px] text-dim tabular-nums">
          {index + 1} / {cards.length}
        </span>
        <button
          type="button"
          onClick={next}
          className="text-[13px] px-4 py-1.5 rounded border border-rim/50 text-ghost hover:border-rim"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
