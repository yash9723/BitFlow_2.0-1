import { pageMeta } from "@/lib/site";

// The Academy is public so its chapters can be found and read without an account. Only saving progress to an
// account needs sign-in, and that is handled where it happens (lib/lesson-sync.ts quietly does nothing for guests).
export const metadata = {
  ...pageMeta("/academy", "Academy",
    "Digital electronics from your first bit to the university and GATE syllabus, with circuits you can click, worked examples and quizzes."),
  // A string title in a layout drops the root template for its pages, so give the chapters their own.
  title: { default: "Academy · BitFlow", template: "%s · BitFlow Academy" },
};

export default function AcademyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
