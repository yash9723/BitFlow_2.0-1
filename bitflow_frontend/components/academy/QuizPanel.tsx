"use client";

import { useState } from "react";
import type { AcademyQuizQuestion } from "@/lib/academy-types";
import { quizPassed } from "@/lib/academy-progress-storage";

interface Props {
  questions: AcademyQuizQuestion[];
  onComplete?: (score: number, total: number) => void;
}

export default function QuizPanel({ questions, onComplete }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = questions.reduce((acc, q) => {
    return acc + (answers[q.id] === q.correctIndex ? 1 : 0);
  }, 0);

  const handleSubmit = () => {
    setSubmitted(true);
    onComplete?.(score, questions.length);
  };

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  return (
    <div className="space-y-4">
      {questions.map((q, qi) => {
        const chosen = answers[q.id];
        const isCorrect = chosen === q.correctIndex;

        return (
          <div
            key={q.id}
            className="rounded border border-rim/50 bg-pit/40 p-4 space-y-3"
          >
            <p className="font-mono text-[11px] text-bright">
              <span className="text-dim mr-2">Q{qi + 1}.</span>
              {q.question}
            </p>
            <div className="space-y-1.5">
              {q.options.map((opt, oi) => {
                let style = "border-rim/40 bg-surface/30 text-ghost hover:border-rim";
                if (submitted) {
                  if (oi === q.correctIndex)
                    style = "border-phosphor/50 bg-phosphor/10 text-phosphor";
                  else if (oi === chosen)
                    style = "border-danger/50 bg-danger/10 text-danger";
                } else if (chosen === oi) {
                  style = "border-info/50 bg-info/10 text-info";
                }

                return (
                  <button
                    key={oi}
                    type="button"
                    disabled={submitted}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    className={`w-full text-left font-mono text-[10px] px-3 py-2 rounded border transition-colors ${style}`}
                  >
                    <span className="text-dim mr-2">
                      {String.fromCharCode(65 + oi)}.
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {submitted && (
              <p
                className={`font-mono text-[9px] pt-1 ${
                  isCorrect ? "text-phosphor" : "text-warn"
                }`}
              >
                {isCorrect ? "✓ Correct — " : "✗ "}
                {q.explanation}
              </p>
            )}
          </div>
        );
      })}

      {!submitted ? (
        <button
          type="button"
          disabled={!allAnswered}
          onClick={handleSubmit}
          className="font-mono text-[11px] px-6 py-2.5 rounded border border-phosphor/50 bg-phosphor/10 text-phosphor hover:bg-phosphor/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Check Answers
        </button>
      ) : (
        <div className="rounded border border-phosphor/30 bg-phosphor/5 px-4 py-3">
          <p className="font-mono text-[12px] text-phosphor font-bold">
            Score: {score} / {questions.length}
            {score === questions.length
              ? " — Perfect!"
              : quizPassed(score, questions.length)
              ? " — Well done!"
              : " — Review the article and try again."}
          </p>
        </div>
      )}
    </div>
  );
}
