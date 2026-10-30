/**
 * scripts/lessons.check.ts — self-check for lib/lessons.ts and the lesson certificate tracks
 * (npx tsx scripts/lessons.check.ts).
 */
import assert from "node:assert/strict";
import { LESSONS } from "../lib/lab/lessons";
import { ACADEMY_TOPICS } from "../lib/academy-content";
import { quizPassed } from "../lib/academy-progress-storage";
import { counts, lessonKey, lessonProblem, lessonSlugs, parseLessonKey, MAX_DRAFT_CHARS } from "../lib/lessons";

const lab = LESSONS[0].slug, chapter = ACADEMY_TOPICS[0];

// Keys round-trip, and only real lessons parse.
assert.deepEqual(parseLessonKey(lessonKey("lab", lab)), { kind: "lab", slug: lab, title: LESSONS[0].title });
assert.equal(parseLessonKey(`lab:no-such-lesson`), null);
assert.equal(parseLessonKey(`quiz:${lab}`), null);
assert.equal(parseLessonKey(lab), null, "a problem slug is not a lesson key");
assert.equal(parseLessonKey(`lab:${lab}:extra`), null);
assert.equal(lessonSlugs("lab").length, LESSONS.length);

// What the API accepts.
assert.equal(lessonProblem({ kind: "lab", slug: lab, done: true }), null);
assert.equal(lessonProblem({ kind: "academy", slug: chapter.slug, quizScore: 3 }), null);
assert.ok(lessonProblem(null));
assert.ok(lessonProblem({ kind: "video", slug: lab }));
assert.ok(lessonProblem({ kind: "lab", slug: "nope" }));
assert.ok(lessonProblem({ kind: "lab", slug: lab, quizScore: -1 }));
assert.ok(lessonProblem({ kind: "lab", slug: lab, quizScore: 1.5 }));
assert.ok(lessonProblem({ kind: "lab", slug: lab, draft: 5 }));
assert.ok(lessonProblem({ kind: "lab", slug: lab, draft: "x".repeat(MAX_DRAFT_CHARS + 1) }));
assert.equal(lessonProblem({ kind: "lab", slug: lab, draft: null }), null, "null clears a draft");

// A pass is at least 80% of the questions.
assert.equal(quizPassed(8, 10), true);
assert.equal(quizPassed(7, 10), false);
assert.equal(quizPassed(5, 6), true);
assert.equal(quizPassed(4, 6), false);
assert.equal(quizPassed(0, 0), false);

// A chapter needs a passing quiz; a Lab lesson doesn't have one.
const total = chapter.quiz.length;
assert.equal(counts("academy", chapter.slug, total), true);
assert.equal(counts("academy", chapter.slug, 0), false);
assert.equal(counts("academy", chapter.slug, null), false);
assert.equal(counts("academy", "no-such-chapter", 100), false);
assert.equal(counts("lab", lab, null), true);

console.log(`lessons: all checks passed (${LESSONS.length} Lab lessons, ${ACADEMY_TOPICS.length} Academy chapters)`);
